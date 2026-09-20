// Manueller Admin-Override der Abreise-/Anreisezeit EINES Tasks (housekeeping:task_time_overrides,
// Key = Task-ID) - hoechste Prioritaetsstufe vor einem gebuchten Extra (Late Check-out/Early
// Check-in) und der Standardzeit (10:00/16:00), siehe lib/housekeeping/tasks.ts#resolveTasks.
//
// Rechte: NUR Admin darf schreiben (set/remove) - anders als bei "Wichtiger Hinweis" duerfen
// Standortverantwortliche hier ausdruecklich nur LESEN, nicht bearbeiten. Jeder mit Zugriff auf
// das Property (hasPropertyAccess) darf den aktuellen Stand lesen.
//
// Aendert NIEMALS die zugrundeliegende Apaleo-Reservierung oder einen dort gebuchten Service -
// rein ein housekeeping-internes Anzeige-/Planungsfeld unter dem housekeeping:*-Namespace,
// komplett getrennt von Guest-Services-Keys.
const { getRedis, parseJSON } = require('./_redis');
const { requireSession } = require('./_auth');
const { getUserRawById } = require('./_users');
const { hasPropertyAccess, propertyCodeFromTaskId } = require('./_permissions');

const HASH_KEY = 'housekeeping:task_time_overrides';
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

async function allOverridesForUser(redis, user) {
  const all = await redis.hGetAll(HASH_KEY);
  const overrides = {};
  for (const [taskId, raw] of Object.entries(all)) {
    if (!hasPropertyAccess(user, propertyCodeFromTaskId(taskId))) continue;
    overrides[taskId] = parseJSON(raw, null);
  }
  return overrides;
}

module.exports = async (req, res) => {
  try {
    const redis = await getRedis();

    const session = await requireSession(req, res);
    if (!session) return;
    // Immer frisch laden statt der im Session-Cookie gecachten role - siehe api/_permissions.js.
    const user = await getUserRawById(redis, session.userId);
    if (!user) { res.status(401).json({ error: 'Nicht angemeldet.' }); return; }

    if (req.method === 'GET') {
      res.status(200).json({ overrides: await allOverridesForUser(redis, user) });
      return;
    }

    if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

    const { action } = req.body || {};

    if (action === 'set') {
      const { taskId, departureTime, arrivalTime } = req.body;
      if (!taskId) { res.status(400).json({ error: 'taskId ist erforderlich.' }); return; }
      if (user.role !== 'admin') {
        res.status(403).json({ error: 'Nur Admin kann Zeiten manuell aendern.' });
        return;
      }
      if (departureTime !== undefined && !TIME_RE.test(departureTime)) {
        res.status(400).json({ error: 'Ungueltige Abreisezeit (erwartet HH:MM).' });
        return;
      }
      if (arrivalTime !== undefined && !TIME_RE.test(arrivalTime)) {
        res.status(400).json({ error: 'Ungueltige Anreisezeit (erwartet HH:MM).' });
        return;
      }
      if (departureTime === undefined && arrivalTime === undefined) {
        res.status(400).json({ error: 'departureTime oder arrivalTime ist erforderlich.' });
        return;
      }
      const override = {
        taskId,
        ...(departureTime !== undefined ? { departureTime } : {}),
        ...(arrivalTime !== undefined ? { arrivalTime } : {}),
        changedBy: user.id,
        changedByName: user.name || user.username,
        changedAt: Date.now(),
      };
      await redis.hSet(HASH_KEY, taskId, JSON.stringify(override));
      res.status(200).json({ override });
      return;
    }

    if (action === 'remove') {
      const { taskId } = req.body;
      if (!taskId) { res.status(400).json({ error: 'taskId ist erforderlich.' }); return; }
      if (user.role !== 'admin') {
        res.status(403).json({ error: 'Nur Admin kann einen Override zuruecksetzen.' });
        return;
      }
      await redis.hDel(HASH_KEY, taskId);
      res.status(200).json({ ok: true });
      return;
    }

    res.status(400).json({ error: 'Unbekannte action.' });
  } catch (err) {
    console.error('[api/task-time-overrides]', err);
    res.status(500).json({ error: err.message || 'Interner Fehler' });
  }
};
