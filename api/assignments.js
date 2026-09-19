// Zimmer -> Housekeeper Zuweisungen, property-scoped (Key-Schema "<PropertyCode>_<Zimmernummer>").
// Traegt zusaetzlich den laufenden Reinigungs-Timer (cleaningStartedAt / elapsedSeconds),
// damit er geraeteuebergreifend sichtbar ist.
//
// Zugriffsschutz: 'set' / 'bulkSet' / 'clearProperty' (Zuweisungen an andere vergeben bzw. in
// grossem Stil aufheben) sind Admin-Funktionen. 'startTimer' / 'stopTimer' / 'clear' sind
// Selbstbedienungs-Aktionen einer Reinigungskraft fuer das eigene, zugewiesene Zimmer - ein
// Housekeeping-Konto darf damit aber niemals die Zuweisung einer anderen Person manipulieren.
const { getRedis, parseJSON, migrateLegacyKey } = require('./_redis');
const { requireSession } = require('./_auth');

const HASH_KEY = 'housekeeping:assignments';
const LEGACY_HASH_KEY = 'hk:assignments';
const ADMIN_ONLY_ACTIONS = new Set(['set', 'bulkSet', 'clearProperty']);

async function allAssignments(redis) {
  const all = await redis.hGetAll(HASH_KEY);
  const assignments = {};
  for (const [k, v] of Object.entries(all)) assignments[k] = parseJSON(v, null);
  return assignments;
}

// Fuer Selbstbedienungs-Aktionen: erlaubt, wenn Admin, wenn das Zimmer noch niemandem
// zugewiesen ist (Selbst-Zuweisung beim Start), oder wenn es bereits der eigenen Person gehoert.
async function canTouchAssignment(redis, session, key) {
  if (session.role === 'admin') return true;
  const raw = await redis.hGet(HASH_KEY, key);
  if (!raw) return true;
  const existing = parseJSON(raw, null);
  return !existing || !existing.housekeeperId || existing.housekeeperId === session.userId;
}

module.exports = async (req, res) => {
  try {
    const redis = await getRedis();
    await migrateLegacyKey(redis, LEGACY_HASH_KEY, HASH_KEY);

    if (req.method === 'GET') {
      if (!(await requireSession(req, res))) return;
      res.status(200).json({ assignments: await allAssignments(redis) });
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const session = await requireSession(req, res);
    if (!session) return;

    const { action } = req.body || {};

    if (ADMIN_ONLY_ACTIONS.has(action) && session.role !== 'admin') {
      res.status(403).json({ error: 'Nur fuer Administratoren.' });
      return;
    }

    if (action === 'set') {
      const { key, housekeeperId, housekeeperName } = req.body;
      if (!key || !housekeeperId) {
        res.status(400).json({ error: 'key und housekeeperId sind erforderlich.' });
        return;
      }
      await redis.hSet(
        HASH_KEY,
        key,
        JSON.stringify({ housekeeperId, housekeeperName: housekeeperName || '', since: Date.now(), cleaningStartedAt: null, elapsedSeconds: 0 })
      );
    } else if (action === 'bulkSet') {
      const { keys, housekeeperId, housekeeperName } = req.body;
      if (!Array.isArray(keys) || keys.length === 0 || !housekeeperId) {
        res.status(400).json({ error: 'keys[] und housekeeperId sind erforderlich.' });
        return;
      }
      const multi = redis.multi();
      for (const key of keys) {
        multi.hSet(
          HASH_KEY,
          key,
          JSON.stringify({ housekeeperId, housekeeperName: housekeeperName || '', since: Date.now(), cleaningStartedAt: null, elapsedSeconds: 0 })
        );
      }
      await multi.exec();
    } else if (action === 'clear') {
      const { key } = req.body;
      if (!key) {
        res.status(400).json({ error: 'key ist erforderlich.' });
        return;
      }
      if (!(await canTouchAssignment(redis, session, key))) {
        res.status(403).json({ error: 'Dieses Zimmer ist einer anderen Person zugewiesen.' });
        return;
      }
      await redis.hDel(HASH_KEY, key);
    } else if (action === 'clearProperty') {
      const { property } = req.body;
      if (!property) {
        res.status(400).json({ error: 'property ist erforderlich.' });
        return;
      }
      const all = await redis.hGetAll(HASH_KEY);
      const toDelete = Object.keys(all).filter((k) => k.startsWith(`${property}_`));
      if (toDelete.length) await redis.hDel(HASH_KEY, toDelete);
    } else if (action === 'startTimer') {
      const { key, housekeeperId, housekeeperName } = req.body;
      if (!key) {
        res.status(400).json({ error: 'key ist erforderlich.' });
        return;
      }
      if (!(await canTouchAssignment(redis, session, key))) {
        res.status(403).json({ error: 'Dieses Zimmer ist einer anderen Person zugewiesen.' });
        return;
      }
      const effectiveHkId = session.role === 'admin' ? housekeeperId || session.userId : session.userId;
      const existingRaw = await redis.hGet(HASH_KEY, key);
      const existing = existingRaw
        ? parseJSON(existingRaw, {})
        : { housekeeperId: effectiveHkId, housekeeperName: housekeeperName || '', since: Date.now(), elapsedSeconds: 0 };
      existing.cleaningStartedAt = Date.now();
      await redis.hSet(HASH_KEY, key, JSON.stringify(existing));
    } else if (action === 'stopTimer') {
      const { key } = req.body;
      if (!key) {
        res.status(400).json({ error: 'key ist erforderlich.' });
        return;
      }
      if (!(await canTouchAssignment(redis, session, key))) {
        res.status(403).json({ error: 'Dieses Zimmer ist einer anderen Person zugewiesen.' });
        return;
      }
      const existingRaw = await redis.hGet(HASH_KEY, key);
      const existing = existingRaw ? parseJSON(existingRaw, null) : null;
      if (existing && existing.cleaningStartedAt) {
        existing.elapsedSeconds = (existing.elapsedSeconds || 0) + Math.round((Date.now() - existing.cleaningStartedAt) / 1000);
        existing.cleaningStartedAt = null;
        await redis.hSet(HASH_KEY, key, JSON.stringify(existing));
      }
    } else {
      res.status(400).json({ error: 'Unbekannte action.' });
      return;
    }

    res.status(200).json({ assignments: await allAssignments(redis) });
  } catch (err) {
    console.error('[api/assignments]', err);
    res.status(500).json({ error: err.message || 'Interner Fehler' });
  }
};
