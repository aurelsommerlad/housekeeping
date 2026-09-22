// Briefing "Reinigungskarten ueberarbeiten" Punkt 5/6/7/8: zwei GETRENNTE, userbezogene
// Aufmerksamkeits-Zustaende pro Reinigungskarte - "gesehen" (Detailansicht tatsaechlich
// geoeffnet) und "Buchungsaenderung zur Kenntnis genommen" (eigene Bestaetigung fuer GENAU die
// aktuell gueltige Aenderung). Bewusst zwei eigene Redis-Hashes statt eines gemeinsamen Feldes
// (Punkt 8: "gesehen und zur Kenntnis genommen technisch nicht unnoetig vermischen") - identisches
// Muster wie api/task-notices.js (dort: Hinweistext + Lesebestaetigung), hier ohne Textinhalt.
const { getRedis, parseJSON } = require('./_redis');
const { requireSession } = require('./_auth');
const { getUserRawById } = require('./_users');
const { hasPropertyAccess, propertyCodeFromTaskId, reservationIdFromTaskId } = require('./_permissions');
const { SEEN_HASH_KEY, CHANGE_ACKS_HASH_KEY, viewKey } = require('./_task-views');

// Dieselben Hash-Keys wie in api/booking-changes.js/api/_manual-tasks.js-Aequivalenten - bewusst
// hier erneut als Literal (kein gemeinsames Modul fuer einzelne Konstanten, siehe bestehendes
// Muster z. B. MANUAL_TASKS_HASH_KEY in mehreren Dateien).
const BOOKING_CHANGES_HASH_KEY = 'housekeeping:booking_changes';
const MANUAL_TASKS_HASH_KEY = 'housekeeping:manual_tasks';

// Manuelle Aufgaben-IDs tragen (anders als abgeleitete Reinigungs-IDs) keine Property im
// ID-String selbst (siehe lib/housekeeping/types.ts#ManualTask) - der echte propertyCode kommt
// dort aus dem gespeicherten Datensatz, analog zu api/task-schedule-overrides.js#resolveTaskContext.
async function propertyCodeForTask(redis, taskId) {
  if (!String(taskId).startsWith('manual_')) return propertyCodeFromTaskId(taskId);
  const raw = await redis.hGet(MANUAL_TASKS_HASH_KEY, taskId);
  const manualTask = raw ? parseJSON(raw, null) : null;
  return manualTask?.propertyCode || null;
}

module.exports = async (req, res) => {
  try {
    const redis = await getRedis();
    const session = await requireSession(req, res);
    if (!session) return;
    const user = await getUserRawById(redis, session.userId);
    if (!user) { res.status(401).json({ error: 'Nicht angemeldet.' }); return; }

    if (req.method === 'GET') {
      const [seenRaw, acksRaw] = await Promise.all([redis.hGetAll(SEEN_HASH_KEY), redis.hGetAll(CHANGE_ACKS_HASH_KEY)]);
      // Nur die EIGENEN Eintraege dieses Users zurueckgeben (Punkt 5: strikt userbezogen) - ein
      // Task-Key, auf den dieser User keinen Zugriff (mehr) hat, kann clientseitig ohnehin nie in
      // der sichtbaren Aufgabenliste auftauchen, ein zusaetzlicher Property-Filter ist hier anders
      // als bei task-notices.js (dort: sensibler Freitext) nicht noetig.
      const suffix = `|${user.id}`;
      const seen = {};
      for (const [key, raw] of Object.entries(seenRaw)) {
        if (!key.endsWith(suffix)) continue;
        seen[key.slice(0, -suffix.length)] = parseJSON(raw, null);
      }
      const changeAcks = {};
      for (const [key, raw] of Object.entries(acksRaw)) {
        if (!key.endsWith(suffix)) continue;
        changeAcks[key.slice(0, -suffix.length)] = parseJSON(raw, null);
      }
      res.status(200).json({ seen, changeAcks });
      return;
    }

    if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

    const { action, taskId } = req.body || {};
    if (!taskId) { res.status(400).json({ error: 'taskId ist erforderlich.' }); return; }
    const propertyCode = await propertyCodeForTask(redis, taskId);
    if (!propertyCode || !hasPropertyAccess(user, propertyCode)) {
      res.status(403).json({ error: 'Kein Zugriff auf dieses Property.' });
      return;
    }

    if (action === 'markSeen') {
      const seen = { taskId, userId: user.id, at: Date.now() };
      await redis.hSet(SEEN_HASH_KEY, viewKey(taskId, user.id), JSON.stringify(seen));
      res.status(200).json({ seen });
      return;
    }

    if (action === 'acknowledgeChange') {
      // Der zu bestaetigende Zeitstempel kommt IMMER serverseitig aus dem aktuellen
      // BookingChangeRecord (housekeeping:booking_changes, siehe api/booking-changes.js) - nie
      // vom Client uebernommen, damit eine Bestaetigung nicht auf eine erfundene/veraltete
      // Aenderung ausgestellt werden kann.
      const reservationId = reservationIdFromTaskId(taskId);
      const raw = reservationId ? await redis.hGet(BOOKING_CHANGES_HASH_KEY, reservationId) : null;
      const change = raw ? parseJSON(raw, null) : null;
      if (!change) { res.status(404).json({ error: 'Keine Buchungsänderung vorhanden.' }); return; }
      const ack = {
        taskId, userId: user.id, changedAt: change.changedAt, ackedAt: Date.now(),
      };
      await redis.hSet(CHANGE_ACKS_HASH_KEY, viewKey(taskId, user.id), JSON.stringify(ack));
      res.status(200).json({ ack });
      return;
    }

    res.status(400).json({ error: 'Unbekannte action.' });
  } catch (err) {
    console.error('[api/task-views]', err);
    res.status(500).json({ error: err.message || 'Interner Fehler' });
  }
};
