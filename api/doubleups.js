// Zusatzausstattungs-Status pro Zimmer ("Aufdoppeln"), unabhaengig vom Reinigungszustand.
// 'set' (Zusatzausstattung markieren) ist eine Admin-Funktion; 'clear' (Aufgabe erledigt)
// darf jede angemeldete Person ausloesen.
const { getRedis, parseJSON, migrateLegacyKey } = require('./_redis');
const { requireSession } = require('./_auth');
const { getUserRawById } = require('./_users');

const HASH_KEY = 'housekeeping:doubleups';
const LEGACY_HASH_KEY = 'hk:doubleups';

async function allDoubleups(redis) {
  const all = await redis.hGetAll(HASH_KEY);
  const doubleups = {};
  for (const [k, v] of Object.entries(all)) doubleups[k] = parseJSON(v, null);
  return doubleups;
}

module.exports = async (req, res) => {
  try {
    const redis = await getRedis();
    await migrateLegacyKey(redis, LEGACY_HASH_KEY, HASH_KEY);

    if (req.method === 'GET') {
      if (!(await requireSession(req, res))) return;
      res.status(200).json({ doubleups: await allDoubleups(redis) });
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const session = await requireSession(req, res);
    if (!session) return;

    const { action } = req.body || {};

    if (action === 'set') {
      // Immer frisch laden statt der im Session-Cookie gecachten role (siehe
      // api/_permissions.js-Kopfkommentar) - sonst wirkt ein nachtraeglicher Rollenentzug erst
      // nach einem erneuten Login.
      const user = await getUserRawById(redis, session.userId);
      if (!user || user.role !== 'admin') {
        res.status(403).json({ error: 'Nur für Administratoren.' });
        return;
      }
      const { key, types, note } = req.body;
      if (!key || !Array.isArray(types)) {
        res.status(400).json({ error: 'key und types[] sind erforderlich.' });
        return;
      }
      await redis.hSet(HASH_KEY, key, JSON.stringify({ types, note: note || '', updatedAt: Date.now() }));
    } else if (action === 'clear') {
      const { key } = req.body;
      if (!key) {
        res.status(400).json({ error: 'key ist erforderlich.' });
        return;
      }
      await redis.hDel(HASH_KEY, key);
    } else {
      res.status(400).json({ error: 'Unbekannte action.' });
      return;
    }

    res.status(200).json({ doubleups: await allDoubleups(redis) });
  } catch (err) {
    console.error('[api/doubleups]', err);
    res.status(500).json({ error: err.message || 'Interner Fehler' });
  }
};
