// "Wichtiger Hinweis" pro Reinigungsauftrag - eine vom Apaleo-Reservierungskommentar komplett
// getrennte, interne UNIQUE-PLACES-Housekeeping-Datenquelle (siehe types.ts#TaskNotice). Wird
// NIE in eine Apaleo-Reservierung zurueckgeschrieben und nie von dort ueberschrieben.
//
// Rechte (Punkt 11): admin und Standortverantwortliche (nur fuer ihre managedProperties, aus der
// Task-ID selbst abgeleitet - nie ein vom Client behauptetes Property-Feld) duerfen Hinweise
// erstellen/bearbeiten/entfernen. Jeder mit Zugriff auf das Property (hasPropertyAccess) darf den
// Hinweis lesen und fuer sich selbst bestaetigen. Ohne Property-Zugriff: weder lesbar noch
// bestaetigbar.
const { getRedis, parseJSON, migrateLegacyKey } = require('./_redis');
const { requireSession } = require('./_auth');
const { getUserRawById } = require('./_users');
const { hasPropertyAccess, isPropertyManager, propertyCodeFromTaskId } = require('./_permissions');
const { NOTICES_HASH_KEY, ACKS_HASH_KEY, ackKey, getNotice, clearAcksForTask } = require('./_task-notices');

const LEGACY_NOTICES_KEY = 'hk:task_notices';
const LEGACY_ACKS_KEY = 'hk:task_notice_acks';

module.exports = async (req, res) => {
  try {
    const redis = await getRedis();
    await migrateLegacyKey(redis, LEGACY_NOTICES_KEY, NOTICES_HASH_KEY);
    await migrateLegacyKey(redis, LEGACY_ACKS_KEY, ACKS_HASH_KEY);

    const session = await requireSession(req, res);
    if (!session) return;
    // Immer frisch laden statt der im Session-Cookie gecachten role - managedProperties/Zugriff
    // koennen sich seit dem Login geaendert haben (siehe api/_permissions.js).
    const user = await getUserRawById(redis, session.userId);
    if (!user) { res.status(401).json({ error: 'Nicht angemeldet.' }); return; }

    if (req.method === 'GET') {
      const [noticesRaw, acksRaw] = await Promise.all([redis.hGetAll(NOTICES_HASH_KEY), redis.hGetAll(ACKS_HASH_KEY)]);
      // Punkt 11: "Benutzer ohne Property-Zugriff darf Hinweis nicht lesen" - anders als bei
      // task-assignments (dort implizit ueber die vom Client ohnehin nur sichtbaren Apaleo-Units
      // gefiltert) wird hier serverseitig aktiv gefiltert, da der Hinweistext selbst sensibel sein
      // kann.
      const notices = {};
      for (const [taskId, raw] of Object.entries(noticesRaw)) {
        if (!hasPropertyAccess(user, propertyCodeFromTaskId(taskId))) continue;
        notices[taskId] = parseJSON(raw, null);
      }
      const acks = {};
      for (const [key, raw] of Object.entries(acksRaw)) {
        const taskId = key.split('|')[0];
        if (!hasPropertyAccess(user, propertyCodeFromTaskId(taskId))) continue;
        acks[key] = parseJSON(raw, null);
      }
      res.status(200).json({ notices, acks });
      return;
    }

    if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

    const { action } = req.body || {};

    if (action === 'set') {
      const { taskId, text } = req.body;
      if (!taskId || typeof text !== 'string' || !text.trim()) {
        res.status(400).json({ error: 'taskId und text sind erforderlich.' });
        return;
      }
      const propertyCode = propertyCodeFromTaskId(taskId);
      if (!isPropertyManager(user, propertyCode)) {
        res.status(403).json({ error: 'Nur fuer Admin oder Standortverantwortliche dieses Property.' });
        return;
      }
      const existing = await getNotice(redis, taskId);
      const now = Date.now();
      const notice = {
        id: taskId,
        taskId,
        text: text.trim(),
        version: existing ? existing.version + 1 : 1,
        createdBy: existing ? existing.createdBy : user.id,
        createdAt: existing ? existing.createdAt : now,
        updatedAt: now,
      };
      await redis.hSet(NOTICES_HASH_KEY, taskId, JSON.stringify(notice));
      // Punkt 8: neue Version -> ALLE bisherigen Lesebestaetigungen fuer diesen Task werden
      // ungueltig (aktiv geloescht statt nur "veraltet stehen zu lassen").
      await clearAcksForTask(redis, taskId);
      res.status(200).json({ notice });
      return;
    }

    if (action === 'remove') {
      const { taskId } = req.body;
      if (!taskId) { res.status(400).json({ error: 'taskId ist erforderlich.' }); return; }
      const propertyCode = propertyCodeFromTaskId(taskId);
      if (!isPropertyManager(user, propertyCode)) {
        res.status(403).json({ error: 'Nur fuer Admin oder Standortverantwortliche dieses Property.' });
        return;
      }
      await redis.hDel(NOTICES_HASH_KEY, taskId);
      await clearAcksForTask(redis, taskId);
      res.status(200).json({ ok: true });
      return;
    }

    if (action === 'acknowledge') {
      const { taskId } = req.body;
      if (!taskId) { res.status(400).json({ error: 'taskId ist erforderlich.' }); return; }
      const propertyCode = propertyCodeFromTaskId(taskId);
      if (!hasPropertyAccess(user, propertyCode)) {
        res.status(403).json({ error: 'Kein Zugriff auf dieses Property.' });
        return;
      }
      const notice = await getNotice(redis, taskId);
      if (!notice) { res.status(404).json({ error: 'Kein Hinweis vorhanden.' }); return; }
      const ack = {
        userId: user.id,
        userName: user.name || user.username,
        noticeId: notice.id,
        noticeVersion: notice.version,
        acknowledgedAt: Date.now(),
      };
      await redis.hSet(ACKS_HASH_KEY, ackKey(taskId, user.id), JSON.stringify(ack));
      res.status(200).json({ ack });
      return;
    }

    res.status(400).json({ error: 'Unbekannte action.' });
  } catch (err) {
    console.error('[api/task-notices]', err);
    res.status(500).json({ error: err.message || 'Interner Fehler' });
  }
};
