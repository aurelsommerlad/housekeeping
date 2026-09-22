// Manueller Admin-Override des GEPLANTEN Housekeeping-Tags EINES Tasks - Reinigung ODER manuelle
// Aufgabe (Briefing "Tag ändern", housekeeping:task_schedule_overrides, Key = Task-ID). Komplett
// analog zu api/task-time-overrides.js, nur fuer das Datum statt die Uhrzeit - siehe
// types.ts#TaskScheduleOverride fuer die Feldbedeutung.
//
// WICHTIG (Briefing Punkt 1/15): `scheduledDate` ist AUSSCHLIESSLICH ein housekeeping-internes
// Planungsfeld. Diese Route ruft niemals Apaleo auf und schreibt niemals in eine Reservierung -
// Anreise/Abreise/Unit/Service/Kommentar einer Buchung bleiben davon vollstaendig unberuehrt.
// Apaleo bleibt Source of Truth fuer die Reservierung, Housekeeping speichert hier nur, an welchem
// Tag die Reinigung/Aufgabe operativ stattfinden soll.
//
// Rechte (Briefing Punkt 4): NUR Admin darf schreiben (set/remove) - Standortverantwortliche,
// Team-Leads und Housekeeper duerfen den aktuellen Stand nur LESEN (identisch zum Muster bei
// task-time-overrides.js). Das UI blendet die Aktion fuer alle anderen Rollen aus, aber die
// eigentliche Absicherung ist diese serverseitige Pruefung hier.
//
// Task-ID-Herkunft (Briefing "vor Implementierung analysieren", Punkt 1-2): eine Apaleo-abgeleitete
// Reinigung hat eine deterministische, Datum-tragende ID
// "<propertyCode>|<unitId>|<date>|<type>|<sourceReservationId>" (siehe lib/housekeeping/tasks.ts
// #taskId) - `date` darin ist und bleibt IMMER das urspruengliche Quelldatum, ein Verschieben
// aendert diese ID nie (sonst wuerde lib/housekeeping/tasks.ts#buildTasks am naechsten Tag
// versehentlich einen zweiten, neuen Task fuer denselben Vorgang erzeugen - siehe Analyse-Notiz
// unten). Eine manuelle Aufgabe hat dagegen eine eigene, datumsfreie ID "manual_<ts>_<rand>" (siehe
// api/manual-tasks.js) - ihre Property laesst sich daher NICHT aus der ID lesen (anders als bei
// einer Reinigung, siehe api/_permissions.js#propertyCodeFromTaskId-Kommentar) und wird stattdessen
// aus dem bestehenden housekeeping:manual_tasks-Datensatz gelesen (derselbe Ansatz wie bei
// BookingChangeRecord.propertyCode in api/booking-changes.js, aus demselben Grund).
//
// Analyse-Notiz (Briefing "vor Implementierung analysieren", Punkt 3-4): buildTasks() erzeugt eine
// Reinigung IMMER unter ihrem Quelldatum (dem Tag, an dem die zugrundeliegende Apaleo-Reservierung
// tatsaechlich ab-/anreist) - unabhaengig davon, ob dafuer ein scheduledDate-Override existiert.
// Ein Override aendert deshalb NIE, OB oder WANN ein Task generiert wird, sondern ausschliesslich,
// unter welchem Tag er in der Planungsansicht GEFILTERT/ANGEZEIGT wird (siehe
// lib/housekeeping/tasks.ts#resolveTasks/scheduledDate und useHousekeepingApp.ts#tasksForDayAll,
// die ab jetzt nach `scheduledDate` statt `date` filtert). Dadurch kann es strukturell NIE zu einer
// Dopplung (derselbe Task an zwei Tagen gleichzeitig sichtbar) kommen: es gibt weiterhin genau EIN
// Task-Objekt pro Reservierung/Tag-Kombination, nur seine Sichtbarkeits-Zuordnung wird verschoben.
//
// Wichtige Konsequenz: das Planungsfenster selbst (Heute+3, siehe useHousekeepingApp.ts
// #loadPlanningData) bleibt unveraendert 4 Tage breit - eine Reinigung kann daher nur INNERHALB
// dieses Fensters verschoben werden (das UI begrenzt die Auswahl entsprechend, siehe
// TaskDetailSheet.tsx). Verschoebe man eine Reinigung ausserhalb des Fensters, wuerde sie mit
// fortschreitendem "heute" irgendwann nicht mehr generiert (ihr Quelldatum faellt aus dem
// rollierenden Fenster), der Override wuerde verwaist zurueckbleiben - dieselbe Fensterbegrenzung
// gilt deshalb bewusst auch fuer manuelle Aufgaben, obwohl sie selbst nicht neu generiert werden.
const { getRedis, parseJSON } = require('./_redis');
const { requireSession } = require('./_auth');
const { getUserRawById } = require('./_users');
const { hasPropertyAccess, propertyCodeFromTaskId, dateFromTaskId } = require('./_permissions');

const HASH_KEY = 'housekeeping:task_schedule_overrides';
const ASSIGNMENTS_HASH_KEY = 'housekeeping:task_assignments';
const MANUAL_TASKS_HASH_KEY = 'housekeeping:manual_tasks';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Eine Apaleo-abgeleitete Reinigungs-ID hat immer genau 5 Pipe-getrennte Teile (siehe
// lib/housekeeping/tasks.ts#taskId) - eine manuelle Aufgaben-ID nie (siehe api/manual-tasks.js).
function isDerivedTaskId(taskId) {
  return String(taskId).split('|').length === 5;
}

/** Ermittelt VERTRAUENSWUERDIG (nie vom Client behauptet) Property, natuerliches Quelldatum und
 * aktuellen Status eines Tasks - fuer eine Reinigung aus der Task-ID selbst + dem bestehenden
 * housekeeping:task_assignments-Datensatz, fuer eine manuelle Aufgabe aus dem bestehenden
 * housekeeping:manual_tasks-Datensatz. `null`, wenn der Task nicht (mehr) existiert. */
async function resolveTaskContext(redis, taskId) {
  if (isDerivedTaskId(taskId)) {
    const propertyCode = propertyCodeFromTaskId(taskId);
    const naturalDate = dateFromTaskId(taskId);
    if (!propertyCode || !DATE_RE.test(naturalDate || '')) return null;
    const raw = await redis.hGet(ASSIGNMENTS_HASH_KEY, taskId);
    const assignment = raw ? parseJSON(raw, null) : null;
    return { kind: 'cleaning', propertyCode, naturalDate, status: assignment?.status || 'open' };
  }
  const raw = await redis.hGet(MANUAL_TASKS_HASH_KEY, taskId);
  const manualTask = raw ? parseJSON(raw, null) : null;
  if (!manualTask) return null;
  return {
    kind: 'manual', propertyCode: manualTask.propertyCode, naturalDate: manualTask.date,
    status: manualTask.status === 'completed' ? 'completed' : 'open',
  };
}

// Briefing Punkt 12: dieselbe Regel wie lib/housekeeping/tasks.ts#canRescheduleTask, hier separat
// gehalten (CommonJS-Route kann das TS-Modul nicht importieren, siehe api/_permissions.js-Kopfnotiz
// zum selben Thema) - beide Implementierungen muessen bei Aenderungen synchron gehalten werden.
function isMovableStatus(status) {
  return status === 'open' || status === 'assigned';
}

async function allOverridesForUser(redis, user) {
  const all = await redis.hGetAll(HASH_KEY);
  const overrides = {};
  for (const [taskId, raw] of Object.entries(all)) {
    const override = parseJSON(raw, null);
    if (!override) continue;
    if (!hasPropertyAccess(user, override.propertyCode)) continue;
    overrides[taskId] = override;
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
      if (user.role !== 'admin') {
        res.status(403).json({ error: 'Nur Admin kann den Reinigungstag ändern.' });
        return;
      }
      const { taskId, scheduledDate, nextArrivalDate } = req.body;
      if (!taskId) { res.status(400).json({ error: 'taskId ist erforderlich.' }); return; }
      if (!scheduledDate || !DATE_RE.test(scheduledDate)) {
        res.status(400).json({ error: 'Ungültiges Datum (erwartet yyyy-mm-dd).' });
        return;
      }
      const context = await resolveTaskContext(redis, taskId);
      if (!context) { res.status(404).json({ error: 'Aufgabe nicht gefunden.' }); return; }
      if (!isMovableStatus(context.status)) {
        res.status(409).json({ error: 'Eine laufende, pausierte oder abgeschlossene Reinigung kann nicht mehr verschoben werden.' });
        return;
      }
      // Briefing Punkt 7 (Hard-Block): `nextArrivalDate` liefert der Client aus den bereits
      // geladenen Apaleo-Daten (task.nextArrivalTime/-followingArrivalDate, siehe
      // lib/housekeeping/tasks.ts#nextArrivalDateForTask) - reiner Plausibilitaets-String-Vergleich
      // (yyyy-mm-dd sortiert lexikografisch korrekt), kein eigener Apaleo-Zugriff dieser Route
      // (siehe Kopfkommentar Punkt 15). Fehlt der Wert (kein bekanntes naechstes Datum), entfaellt
      // die Pruefung.
      if (nextArrivalDate && DATE_RE.test(nextArrivalDate) && scheduledDate > nextArrivalDate) {
        res.status(400).json({ error: 'Die Reinigung kann nicht nach der nächsten Anreise geplant werden.' });
        return;
      }
      const existingRaw = await redis.hGet(HASH_KEY, taskId);
      const existing = existingRaw ? parseJSON(existingRaw, null) : null;
      // Briefing Punkt 1: normalerweise sind Quell- und geplantes Datum identisch - wird wieder
      // exakt auf das natuerliche Quelldatum zurueckgestellt, gibt es nichts mehr zu ueberschreiben,
      // der Override wird komplett entfernt (naechste Verschiebung beginnt wieder frisch, siehe
      // types.ts#TaskScheduleOverride-Kommentar).
      if (scheduledDate === context.naturalDate) {
        if (existing) await redis.hDel(HASH_KEY, taskId);
        res.status(200).json({ override: null });
        return;
      }
      const fromDate = existing?.scheduledDate || context.naturalDate;
      const override = {
        taskId,
        propertyCode: context.propertyCode,
        scheduledDate,
        // Briefing Punkt 3: bleibt ueber beliebig viele weitere Verschiebungen unveraendert.
        originalScheduledDate: existing?.originalScheduledDate || context.naturalDate,
        changedBy: user.id,
        changedByName: user.name || user.username,
        changedAt: Date.now(),
        history: [
          ...(Array.isArray(existing?.history) ? existing.history : []),
          { from: fromDate, to: scheduledDate, changedBy: user.id, changedByName: user.name || user.username, changedAt: Date.now() },
        ],
      };
      await redis.hSet(HASH_KEY, taskId, JSON.stringify(override));
      res.status(200).json({ override });
      return;
    }

    if (action === 'remove') {
      const { taskId } = req.body;
      if (!taskId) { res.status(400).json({ error: 'taskId ist erforderlich.' }); return; }
      if (user.role !== 'admin') {
        res.status(403).json({ error: 'Nur Admin kann den Reinigungstag zurücksetzen.' });
        return;
      }
      await redis.hDel(HASH_KEY, taskId);
      res.status(200).json({ ok: true });
      return;
    }

    res.status(400).json({ error: 'Unbekannte action.' });
  } catch (err) {
    console.error('[api/task-schedule-overrides]', err);
    res.status(500).json({ error: err.message || 'Interner Fehler' });
  }
};
