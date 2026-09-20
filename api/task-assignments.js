// Aufgabenbezogene Zuweisungen (Punkt 4/28): Key = deterministische Task-ID (siehe
// lib/housekeeping/tasks.ts#taskId), NICHT mehr Property+Zimmer wie im alten
// housekeeping:assignments-Hash (der unangetastet bleibt, siehe api/assignments.js - eine
// Zuweisung gehoert jetzt zu einem konkreten Auftrag an einem konkreten Datum, nicht mehr
// dauerhaft zum Apartment).
//
// Rechte (Punkt 14/15/16): ein Housekeeper darf sich selbst einen offenen Task zuweisen
// (atomar, Race-Condition-sicher, Punkt 19) und eigene Zuweisungen/Timer/Abschluss verwalten.
// 'assign'/'bulkAssign'/'clearScope' erfordern Admin ODER Standortverantwortlich fuer GENAU das
// Property des jeweiligen Tasks (aus der Task-ID selbst abgeleitet, nicht vom Client behauptet -
// siehe api/_permissions.js).
const { getRedis, parseJSON, migrateLegacyKey } = require('./_redis');
const { requireSession } = require('./_auth');
const { getUserRawById } = require('./_users');
const { hasPropertyAccess, isPropertyManager, propertyCodeFromTaskId, dateFromTaskId } = require('./_permissions');
const { isAcknowledged } = require('./_task-notices');

const HASH_KEY = 'housekeeping:task_assignments';
const LEGACY_HASH_KEY = 'hk:task_assignments';

async function allTaskAssignments(redis) {
  const all = await redis.hGetAll(HASH_KEY);
  const assignments = {};
  for (const [k, v] of Object.entries(all)) assignments[k] = parseJSON(v, null);
  return assignments;
}

// Atomarer Self-Claim (Punkt 19) via HSETNX statt WATCH/MULTI/EXEC: `getRedis()` liefert eine
// EINZIGE, prozessweit geteilte Verbindung (siehe api/_redis.js) - WATCH/MULTI/EXEC ist aber
// PRO VERBINDUNG wirksam, nicht pro Aufruf. Bei mehreren gleichzeitigen claimTask()-Aufrufen auf
// derselben Verbindung wurde ein erfolgreiches EXEC eines Aufrufs den beobachteten Schluessel fuer
// ALLE anderen, noch laufenden Aufrufe auf derselben Verbindung ebenfalls loeschen (WATCH-Zustand
// ist verbindungs-, nicht aufrufbezogen) - dadurch konnten bei echter Nebenlaeufigkeit mehrere
// Anfragen gleichzeitig gewinnen (im Lasttest reproduziert: 8 parallele Claims auf einen frischen
// Task ergaben 8 statt 1 Gewinner). HSETNX ist dagegen ein einzelner, nativ atomarer Redis-Befehl
// ("setze dieses Hash-Feld nur, wenn es noch nicht existiert") - kein WATCH/MULTI/EXEC, keine
// Verbindungsisolation noetig, kein Retry-Loop, und weiterhin kein Lua/EVAL (Upstash-Plankompatibel,
// HSETNX ist ein Kernprotokoll-Befehl wie jeder andere Hash-Befehl auch).
async function claimTask(redis, taskId, record) {
  const created = await redis.hSetNX(HASH_KEY, taskId, JSON.stringify(record));
  return !!created;
}

// Fuer Selbstbedienungs-Aktionen (release/startTimer/stopTimer): erlaubt fuer Admin, fuer
// Standortverantwortliche des betreffenden Property, oder wenn es die eigene Zuweisung ist.
// Reinigungsverlauf (Punkt "Reinigungsverlauf"): haengt an genau demselben TaskAssignment-Datensatz
// an, auf dem status/cleaningStartedAt/elapsedSeconds bereits liegen - kein zweiter, paralleler
// Speicherort. `action` ist ereignisbezogen (started/paused/resumed/completed) statt nur den
// Status zu spiegeln, damit die Verlaufszeile ohne weitere Herleitung den geforderten Text traegt.
function appendHistory(record, action, user) {
  record.history = [...(record.history || []), { action, at: Date.now(), byUserId: user.id, byUserName: user.name || user.username }];
  return record;
}

async function canTouchOwnAssignment(redis, user, taskId) {
  if (user.role === 'admin') return true;
  const propertyCode = propertyCodeFromTaskId(taskId);
  if (isPropertyManager(user, propertyCode)) return true;
  const raw = await redis.hGet(HASH_KEY, taskId);
  if (!raw) return true;
  const existing = parseJSON(raw, null);
  return !existing || existing.housekeeperId === user.id;
}

module.exports = async (req, res) => {
  try {
    const redis = await getRedis();
    await migrateLegacyKey(redis, LEGACY_HASH_KEY, HASH_KEY);

    if (req.method === 'GET') {
      if (!(await requireSession(req, res))) return;
      res.status(200).json({ taskAssignments: await allTaskAssignments(redis) });
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const session = await requireSession(req, res);
    if (!session) return;
    // Immer frisch laden statt der im Session-Cookie gecachten role - managedProperties und
    // Property-Zugriff koennen sich seit dem Login geaendert haben (siehe api/_permissions.js).
    const user = await getUserRawById(redis, session.userId);
    if (!user) {
      res.status(401).json({ error: 'Nicht angemeldet.' });
      return;
    }

    const { action } = req.body || {};

    if (action === 'claim') {
      const { taskId } = req.body;
      if (!taskId) { res.status(400).json({ error: 'taskId ist erforderlich.' }); return; }
      const propertyCode = propertyCodeFromTaskId(taskId);
      if (!hasPropertyAccess(user, propertyCode)) {
        res.status(403).json({ error: 'Kein Zugriff auf dieses Property.' });
        return;
      }
      const record = {
        taskId, housekeeperId: user.id, housekeeperName: user.name || user.username,
        since: Date.now(), status: 'assigned', cleaningStartedAt: null, elapsedSeconds: 0,
      };
      const claimed = await claimTask(redis, taskId, record);
      if (!claimed) {
        res.status(409).json({ error: 'Diese Aufgabe wurde gerade von einem anderen Teammitglied uebernommen.' });
        return;
      }
    } else if (action === 'release') {
      const { taskId } = req.body;
      if (!taskId) { res.status(400).json({ error: 'taskId ist erforderlich.' }); return; }
      const raw = await redis.hGet(HASH_KEY, taskId);
      const existing = raw ? parseJSON(raw, null) : null;
      const propertyCode = propertyCodeFromTaskId(taskId);
      const isOwn = existing && existing.housekeeperId === user.id;
      const allowed = user.role === 'admin' || isPropertyManager(user, propertyCode) || isOwn;
      if (!allowed) { res.status(403).json({ error: 'Diese Aufgabe gehoert einer anderen Person.' }); return; }
      // Punkt 14: eigene Aufgabe nur freigeben, solange die Reinigung noch nicht begonnen wurde.
      if (isOwn && user.role !== 'admin' && existing && existing.status !== 'assigned') {
        res.status(409).json({ error: 'Die Reinigung wurde bereits begonnen und kann nicht mehr freigegeben werden.' });
        return;
      }
      await redis.hDel(HASH_KEY, taskId);
    } else if (action === 'assign') {
      const { taskId, housekeeperId, housekeeperName } = req.body;
      if (!taskId || !housekeeperId) { res.status(400).json({ error: 'taskId und housekeeperId sind erforderlich.' }); return; }
      const propertyCode = propertyCodeFromTaskId(taskId);
      if (!isPropertyManager(user, propertyCode)) {
        res.status(403).json({ error: 'Nur fuer Standortverantwortliche dieses Property.' });
        return;
      }
      await redis.hSet(HASH_KEY, taskId, JSON.stringify({
        taskId, housekeeperId, housekeeperName: housekeeperName || '',
        since: Date.now(), status: 'assigned', cleaningStartedAt: null, elapsedSeconds: 0,
      }));
    } else if (action === 'bulkAssign') {
      const { taskIds, housekeeperId, housekeeperName } = req.body;
      if (!Array.isArray(taskIds) || taskIds.length === 0 || !housekeeperId) {
        res.status(400).json({ error: 'taskIds[] und housekeeperId sind erforderlich.' });
        return;
      }
      const notAllowed = taskIds.find((id) => !isPropertyManager(user, propertyCodeFromTaskId(id)));
      if (notAllowed) {
        res.status(403).json({ error: 'Nur fuer Standortverantwortliche der betroffenen Properties.' });
        return;
      }
      const multi = redis.multi();
      for (const taskId of taskIds) {
        multi.hSet(HASH_KEY, taskId, JSON.stringify({
          taskId, housekeeperId, housekeeperName: housekeeperName || '',
          since: Date.now(), status: 'assigned', cleaningStartedAt: null, elapsedSeconds: 0,
        }));
      }
      await multi.exec();
    } else if (action === 'clearScope') {
      // Punkt 22: bezieht sich auf Tag + Property/Standortfilter, nicht mehr pauschal auf das
      // ganze Property - "date" ist Pflicht, "property" optional (leer/'all' = alle Properties,
      // fuer die der Aufrufer Standortverantwortlich ist).
      const { date, property } = req.body;
      if (!date) { res.status(400).json({ error: 'date ist erforderlich.' }); return; }
      const all = await redis.hGetAll(HASH_KEY);
      const toDelete = Object.keys(all).filter((id) => {
        if (dateFromTaskId(id) !== date) return false;
        const propertyCode = propertyCodeFromTaskId(id);
        if (property && property !== 'all' && propertyCode !== property) return false;
        return isPropertyManager(user, propertyCode);
      });
      if (toDelete.length) await redis.hDel(HASH_KEY, toDelete);
    } else if (action === 'startTimer') {
      const { taskId } = req.body;
      if (!taskId) { res.status(400).json({ error: 'taskId ist erforderlich.' }); return; }
      if (!(await canTouchOwnAssignment(redis, user, taskId))) {
        res.status(403).json({ error: 'Diese Aufgabe gehoert einer anderen Person.' });
        return;
      }
      const propertyCode = propertyCodeFromTaskId(taskId);
      if (!hasPropertyAccess(user, propertyCode)) { res.status(403).json({ error: 'Kein Zugriff auf dieses Property.' }); return; }
      const existingRaw = await redis.hGet(HASH_KEY, taskId);
      const existing = existingRaw
        ? parseJSON(existingRaw, {})
        : { taskId, housekeeperId: user.id, housekeeperName: user.name || user.username, since: Date.now(), status: 'assigned', elapsedSeconds: 0 };
      // Punkt 6: Reinigungsstart serverseitig gesperrt, solange der ZUGEWIESENE Mitarbeiter (nicht
      // notwendigerweise der Aufrufer - z. B. wenn ein Admin fuer jemand anderen startet) einen
      // wichtigen Hinweis in seiner aktuellen Version noch nicht bestaetigt hat. Kein Hinweis
      // vorhanden -> isAcknowledged() liefert true, also keine Aenderung am bisherigen Verhalten.
      if (!(await isAcknowledged(redis, taskId, existing.housekeeperId || user.id))) {
        res.status(409).json({ error: 'Bitte bestaetige zuerst den wichtigen Hinweis.' });
        return;
      }
      // Punkt "Reinigungsverlauf": ein bereits einmal begonnener Task (elapsedSeconds > 0, z. B.
      // nach einer Pause) wird beim erneuten Start als "Fortgesetzt" statt "Reinigung gestartet"
      // protokolliert - reine Ableitung aus dem ohnehin vorhandenen Feld, kein zweiter Zaehler.
      appendHistory(existing, (existing.elapsedSeconds || 0) > 0 ? 'resumed' : 'started', user);
      existing.status = 'in_progress';
      existing.cleaningStartedAt = Date.now();
      await redis.hSet(HASH_KEY, taskId, JSON.stringify(existing));
    } else if (action === 'stopTimer') {
      const { taskId } = req.body;
      if (!taskId) { res.status(400).json({ error: 'taskId ist erforderlich.' }); return; }
      if (!(await canTouchOwnAssignment(redis, user, taskId))) {
        res.status(403).json({ error: 'Diese Aufgabe gehoert einer anderen Person.' });
        return;
      }
      const existingRaw = await redis.hGet(HASH_KEY, taskId);
      const existing = existingRaw ? parseJSON(existingRaw, null) : null;
      if (existing && existing.cleaningStartedAt) {
        existing.elapsedSeconds = (existing.elapsedSeconds || 0) + Math.round((Date.now() - existing.cleaningStartedAt) / 1000);
        existing.cleaningStartedAt = null;
        // Eigener, von "assigned" (noch nie gestartet) unterscheidbarer Status - siehe
        // types.ts#TaskStatus. Vorher fiel eine pausierte Aufgabe optisch mit einer frisch
        // zugewiesenen, noch nie begonnenen zusammen.
        existing.status = 'paused';
        appendHistory(existing, 'paused', user);
        await redis.hSet(HASH_KEY, taskId, JSON.stringify(existing));
      }
    } else if (action === 'complete') {
      // Punkt 23: unser Workflow-Status (hier) und der Apaleo Unit Condition Aufruf (separat vom
      // Client via dem bestehenden, unveraenderten setUnitCondition()) sind bewusst getrennt.
      const { taskId, requiresInspection: needsInspection } = req.body;
      if (!taskId) { res.status(400).json({ error: 'taskId ist erforderlich.' }); return; }
      if (!(await canTouchOwnAssignment(redis, user, taskId))) {
        res.status(403).json({ error: 'Diese Aufgabe gehoert einer anderen Person.' });
        return;
      }
      const existingRaw = await redis.hGet(HASH_KEY, taskId);
      const existing = existingRaw
        ? parseJSON(existingRaw, {})
        : { taskId, housekeeperId: user.id, housekeeperName: user.name || user.username, since: Date.now(), elapsedSeconds: 0 };
      if (existing.cleaningStartedAt) {
        existing.elapsedSeconds = (existing.elapsedSeconds || 0) + Math.round((Date.now() - existing.cleaningStartedAt) / 1000);
        existing.cleaningStartedAt = null;
      }
      existing.status = needsInspection ? 'inspection' : 'completed';
      existing.completedAt = Date.now();
      appendHistory(existing, 'completed', user);
      await redis.hSet(HASH_KEY, taskId, JSON.stringify(existing));
    } else if (action === 'completeInspection') {
      const { taskId } = req.body;
      if (!taskId) { res.status(400).json({ error: 'taskId ist erforderlich.' }); return; }
      const propertyCode = propertyCodeFromTaskId(taskId);
      if (!isPropertyManager(user, propertyCode)) {
        res.status(403).json({ error: 'Nur fuer Standortverantwortliche dieses Property.' });
        return;
      }
      const existingRaw = await redis.hGet(HASH_KEY, taskId);
      const existing = existingRaw ? parseJSON(existingRaw, null) : null;
      if (existing) {
        existing.status = 'completed';
        existing.completedAt = Date.now();
        await redis.hSet(HASH_KEY, taskId, JSON.stringify(existing));
      }
    } else {
      res.status(400).json({ error: 'Unbekannte action.' });
      return;
    }

    res.status(200).json({ taskAssignments: await allTaskAssignments(redis) });
  } catch (err) {
    console.error('[api/task-assignments]', err);
    res.status(500).json({ error: err.message || 'Interner Fehler' });
  }
};
