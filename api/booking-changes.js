// Housekeeping-relevante Aenderungen an Apaleo-Reservierungen sichtbar machen (Punkt "Buchungs-
// aenderung sichtbar machen"). Apaleo liefert immer nur den AKTUELLEN Stand einer Reservierung -
// um eine Aenderung ueberhaupt erkennen zu koennen, muss Housekeeping selbst einen Vorher-Stand
// (Snapshot) speichern und bei jedem Laden vergleichen (Punkt "Housekeeping muss selbst den
// relevanten Vorzustand speichern"). Es gibt bewusst KEIN zweites, paralleles Change-Tracking im
// Rest der App (gepruft: einzig CleaningCompletionReport ist ein fachlich unabhaengiger Snapshot
// fuer Waescheverbrauch) - dieser Mechanismus hier ist der einzige.
//
// Nur die VIER housekeeping-relevanten Felder Anreise/Abreise/Einheit/Personenanzahl werden
// verglichen (Nutzerfeedback: "Eine Änderung ist nur bei Umbuchung (Datum, Einheit) und Änderung
// Anzahl der Personen relevant. Alle anderen Änderungen sind nicht relevant.") - jede andere
// Reservierungsaenderung wird bewusst ignoriert (ein zwischenzeitlich hier mitgefuehrtes
// Babybett-Feld wurde deshalb wieder entfernt, siehe Git-Historie). Redis
// housekeeping:booking_change_snapshots (Baseline je reservationId) + housekeeping:booking_changes
// (nur die JEWEILS zuletzt erkannte Aenderung je reservationId, kein volles Log noetig, siehe
// types.ts#BookingChangeRecord).
//
// Personenanzahl (Nutzerfeedback-Folgerunde): Erwachsene/Kinder werden GETRENNT verglichen und
// gespeichert (adultsFrom/-To, childrenFrom/-To) statt einer einzigen Gesamtzahl, damit die
// Detailansicht konkrete Deltas wie "2 Erw. · 1 Kind -> 3 Erw. · 1 Kind" zeigen kann, statt nur
// "3 -> 4".
//
// Aufgerufen vom Client nach jedem Laden der Apaleo-Reservierungen fuer den Planungszeitraum
// (siehe useHousekeepingApp.ts#loadPlanningData) - EIN Sync-Request mit den aktuell geladenen,
// fuer den User sichtbaren Reservierungen statt eines eigenen serverseitigen Apaleo-Pollings.
const { getRedis, parseJSON } = require('./_redis');
const { requireSession } = require('./_auth');
const { getUserRawById } = require('./_users');
const { hasPropertyAccess } = require('./_permissions');

const SNAPSHOT_HASH_KEY = 'housekeeping:booking_change_snapshots';
const CHANGES_HASH_KEY = 'housekeeping:booking_changes';
// Punkt "Unit-Wechsel besonders sauber behandeln": dieselbe Redis-Struktur wie
// api/task-assignments.js (bewusst NICHT von dort importiert - eigenstaendige CommonJS-Datei ohne
// gemeinsame Abhaengigkeit, siehe api/_permissions.js fuer dasselbe etablierte Muster einer
// bewusst duplizierten, aber synchron gehaltenen Konstante).
const TASK_ASSIGNMENTS_HASH_KEY = 'housekeeping:task_assignments';

// Tasks werden IMMER frisch aus der aktuellen Apaleo Unit<->Reservierung-Zuordnung abgeleitet
// (siehe lib/housekeeping/tasks.ts#taskId/buildTasks) - ihre ID enthaelt die Einheit. Ein
// Unit-Wechsel erzeugt deshalb automatisch eine ANDERE Task-ID; die alte wird schlicht nicht mehr
// erzeugt (kein doppelter/verwaister sichtbarer Task moeglich, siehe Analyse). Ohne diese Funktion
// wuerde der bereits bestehende Zuweisungs-/Fortschrittsdatensatz (Redis housekeeping:
// task_assignments, Key = Task-ID) unter der alten ID liegen bleiben und nie wieder gelesen -
// eine laufende/pausierte/zugewiesene Reinigung wuerde fuer den Housekeeper kommentarlos
// verschwinden, die neue Einheit startet als "offen". Dieselbe Ambiguitaet wie beim bestehenden
// `orphanedSchedule` in TaskDetailSheet.tsx (Task-TYP laesst sich aus den reinen Buchungsdaten
// allein nicht sicher bestimmen) wird identisch geloest: beide Kandidatentypen (turnover/departure)
// werden versucht. Eine bereits ABGESCHLOSSENE Reinigung bleibt bewusst am alten Task (gueltige
// Historie fuer das damalige Apartment) - nur offene/zugewiesene/laufende/pausierte Zuweisungen
// werden uebernommen. Der alte Redis-Eintrag wird NICHT geloescht (Nutzervorgabe: keine
// Housekeeping-Daten pauschal loeschen) - er wird nach der Migration schlicht nie wieder gelesen,
// da kein Task mehr auf die alte ID verweist.
function migrateAssignmentsOnUnitChange(assignments, propertyCode, reservationId, fromUnitId, fromDate, toUnitId, toDate) {
  if (!fromDate || !toDate) return [];
  const writes = [];
  for (const type of ['turnover', 'departure']) {
    const oldTaskId = `${propertyCode}|${fromUnitId}|${fromDate}|${type}|${reservationId}`;
    const newTaskId = `${propertyCode}|${toUnitId}|${toDate}|${type}|${reservationId}`;
    if (oldTaskId === newTaskId) continue;
    const oldRaw = assignments[oldTaskId];
    if (!oldRaw || assignments[newTaskId]) continue; // nichts zu migrieren, oder Ziel bereits belegt (nie ueberschreiben)
    const oldRecord = parseJSON(oldRaw, null);
    if (!oldRecord || oldRecord.status === 'completed') continue;
    const migrated = { ...oldRecord, taskId: newTaskId };
    writes.push([newTaskId, JSON.stringify(migrated)]);
    assignments[newTaskId] = JSON.stringify(migrated); // verhindert Doppelmigration innerhalb desselben Sync-Laufs
  }
  return writes;
}

// Bugfix (Nutzerfeedback: "Buchung geändert" erschien mit "Anreise 23.09. -> 23.09.", obwohl sich
// sichtbar nichts geaendert hatte): Apaleo liefert Anreise/Abreise als vollstaendige ISO-Datumszeit
// inkl. Uhrzeit (z. B. eine aktualisierte geschaetzte Ankunftszeit) - ein reiner Uhrzeit-Wechsel
// OHNE Tageswechsel wurde bisher durch den direkten String-Vergleich der vollen ISO-Werte
// faelschlich als Aenderung erkannt, obwohl housekeeping-relevant ausschliesslich der KALENDERTAG
// ist (die Uhrzeit selbst wird bereits getrennt ueber LCO/ECI/Zeiten-Override abgebildet, siehe
// lib/housekeeping/tasks.ts). Vergleich/Speicherung erfolgen deshalb ausschliesslich auf Tagesebene
// (yyyy-mm-dd) - macht die Anzeige nebenbei robust: zwei tatsaechlich unterschiedliche Tage werden
// nie mehr als "X -> X" angezeigt.
function dateOnly(iso) {
  return iso ? String(iso).slice(0, 10) : null;
}

// Bugfix (Nutzerfeedback-Folgerunde "Buchung geändert" pruefen): Anreise/Abreise/Einheit wurden
// bisher auch dann als "geaendert" erkannt, wenn EINER der beiden Werte (Vorher ODER Nachher)
// schlicht fehlte (z. B. eine kurzzeitig unvollstaendige Apaleo-Antwort ohne `arrival`, oder eine
// Einheit ohne `unit.id`/`unit.code`) - `null !== '2026-09-23'` ist zwar technisch wahr, aber
// housekeeping-fachlich KEINE echte Umbuchung, sondern fehlende Rohdaten. Ein solcher Datensatz
// wurde bisher trotzdem als Aenderung gespeichert und zeigte z. B. "Anreise 23.09. -> " an. Beide
// Seiten muessen deshalb jetzt bekannt (nicht null) UND unterschiedlich sein - exakt dieselbe
// Absicherung, die die Personenanzahl (`guestsChanged`, jetzt adults/children) schon vorher hatte.
function fieldChanged(previousValue, currentValue) {
  return previousValue != null && currentValue != null && previousValue !== currentValue;
}

// Defensiver Read-Filter (Nutzerfeedback-Folgerunde: "pruefen, ob bereits fehlerhafte Datensaetze
// mit identischen Vorher-/Nachher-Werten existieren"): ein *From/*To-Paar zaehlt nur als ECHTE
// Aenderung, wenn beide Seiten tatsaechlich verschieden sind. Die Schreiblogik unten haengt ein
// Paar ohnehin nur an, wenn es sich geaendert hat - dieser Filter ist zusaetzlich ein Sicherheitsnetz
// GEGEN BEREITS IN REDIS LIEGENDE Alt-Datensaetze (z. B. aus frueheren Versionen dieser Route, vor
// einem der bisherigen Bugfixes) und schuetzt zugleich vor jedem zukuenftigen Regressionsfall,
// OHNE dass dafuer Redis-Daten geloescht/migriert werden muessen (Nutzervorgabe: keine Redis-Daten
// loeschen). Ein Datensatz, der nach diesem Filter kein einziges echtes Aenderungsfeld mehr hat,
// wird beim Lesen vollstaendig unterdrueckt (bleibt aber unangetastet in Redis liegen).
function hasRealChange(change) {
  if (!change) return false;
  const pairs = [
    ['arrivalFrom', 'arrivalTo'], ['departureFrom', 'departureTo'], ['unitFrom', 'unitTo'],
    ['adultsFrom', 'adultsTo'], ['childrenFrom', 'childrenTo'],
  ];
  return pairs.some(([fromKey, toKey]) => {
    if (!(fromKey in change) && !(toKey in change)) return false;
    return change[fromKey] !== change[toKey];
  });
}

async function changesForUser(redis, user) {
  const all = await redis.hGetAll(CHANGES_HASH_KEY);
  const changes = {};
  for (const [reservationId, raw] of Object.entries(all)) {
    const change = parseJSON(raw, null);
    if (!change) continue;
    if (!hasRealChange(change)) continue;
    // Die Property-Zugehoerigkeit ist Teil des mitgesendeten Snapshots (siehe unten), damit auch
    // beim reinen Lesen ohne erneuten Sync gefiltert werden kann.
    if (change.propertyCode && !hasPropertyAccess(user, change.propertyCode)) continue;
    changes[reservationId] = change;
  }
  return changes;
}

module.exports = async (req, res) => {
  try {
    const redis = await getRedis();

    const session = await requireSession(req, res);
    if (!session) return;
    const user = await getUserRawById(redis, session.userId);
    if (!user) { res.status(401).json({ error: 'Nicht angemeldet.' }); return; }

    if (req.method === 'GET') {
      res.status(200).json({ changes: await changesForUser(redis, user) });
      return;
    }

    if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

    const { action, reservations } = req.body || {};
    if (action !== 'sync' || !Array.isArray(reservations)) {
      res.status(400).json({ error: 'action "sync" mit reservations[] ist erforderlich.' });
      return;
    }

    // Nur Reservierungen aus Properties syncen, auf die dieser User tatsaechlich Zugriff hat -
    // ein Client kann ohnehin nur solche laden, aber serverseitig wird dem Payload nicht blind
    // vertraut.
    const visible = reservations.filter((r) => r && r.id && r.propertyCode && hasPropertyAccess(user, r.propertyCode));
    if (visible.length === 0) {
      res.status(200).json({ changes: await changesForUser(redis, user) });
      return;
    }

    const snapshots = await redis.hGetAll(SNAPSHOT_HASH_KEY);
    // Punkt "Unit-Wechsel besonders sauber behandeln": einmal geladen, innerhalb dieses Sync-Laufs
    // fuer alle Reservierungen wiederverwendet (dieselbe Hash-weite Lesestrategie wie bei snapshots
    // oben) - migrateAssignmentsOnUnitChange() haelt sie bei einer tatsaechlichen Migration selbst
    // aktuell (siehe dort).
    const assignments = await redis.hGetAll(TASK_ASSIGNMENTS_HASH_KEY);
    const now = Date.now();
    const snapshotWrites = [];
    const changeWrites = [];
    const assignmentWrites = [];

    for (const r of visible) {
      const current = {
        arrival: dateOnly(r.arrival),
        departure: dateOnly(r.departure),
        unitId: r.unitId || null,
        propertyCode: r.propertyCode,
        // Nur eine bekannte Zahl (>=0) uebernehmen - fehlende/ungueltige Rohdaten (null/undefined)
        // duerfen weder als "0" gespeichert noch mit einer echten spaeteren Zahl als Aenderung
        // erkannt werden (siehe adultsChanged/childrenChanged unten).
        adults: typeof r.adults === 'number' ? r.adults : null,
        children: typeof r.children === 'number' ? r.children : null,
      };
      const previousRaw = parseJSON(snapshots[r.id], null);
      // Bugfix (Nutzerfeedback "jetzt werden alle Buchungen als geändert angezeigt"): ein VOR dem
      // dateOnly()-Fix gespeicherter Snapshot enthaelt arrival/departure noch als volle
      // ISO-Datumszeit - ein direkter Vergleich mit dem jetzt auf Tagesebene normalisierten
      // `current` wuerde deshalb bei JEDER einzigen Reservierung faelschlich einen Unterschied
      // erkennen (unabhaengig davon, ob sich tatsaechlich etwas geaendert hat). `previous` wird
      // deshalb beim Lesen ebenfalls durch dateOnly() normalisiert - bei einem bereits im neuen
      // Format gespeicherten Snapshot wirkungslos, bei einem alten heilt es den Formatwechsel ohne
      // Migrationsschritt sofort aus. Ein Alt-Snapshot aus der Zeit VOR dem adults/children-Split
      // hat noch ein `guests`-Feld statt `adults`/`children` - `previousRaw.adults`/`.children`
      // sind dann schlicht `undefined` (== null), adults/childrenChanged bleiben also false, bis
      // der naechste Sync einen neuen, bereits aufgeteilten Snapshot schreibt (kein Migrations-
      // schritt noetig, exakt dasselbe Prinzip wie beim dateOnly()-Fix oben).
      const previous = previousRaw ? { ...previousRaw, arrival: dateOnly(previousRaw.arrival), departure: dateOnly(previousRaw.departure) } : null;
      if (previous) {
        // Bugfix (Nutzerfeedback-Folgerunde): Anreise/Abreise/Einheit gelten nur dann als
        // geaendert, wenn BEIDE Seiten bekannt UND unterschiedlich sind (siehe fieldChanged()
        // oben) - vorher reichte irgendein Unterschied, auch gegen eine fehlende/leere Seite.
        const arrivalChanged = fieldChanged(previous.arrival, current.arrival);
        const departureChanged = fieldChanged(previous.departure, current.departure);
        const unitChanged = fieldChanged(previous.unitId, current.unitId);
        if (unitChanged) {
          assignmentWrites.push(...migrateAssignmentsOnUnitChange(
            assignments, r.propertyCode, r.id, previous.unitId, previous.departure, current.unitId, current.departure,
          ));
        }
        const adultsChanged = fieldChanged(previous.adults, current.adults);
        const childrenChanged = fieldChanged(previous.children, current.children);
        const guestsChanged = adultsChanged || childrenChanged;
        const changed = arrivalChanged || departureChanged || unitChanged || guestsChanged;
        if (changed) {
          const change = {
            reservationId: r.id,
            propertyCode: r.propertyCode,
            changedAt: now,
            ...(arrivalChanged ? { arrivalFrom: previous.arrival, arrivalTo: current.arrival } : {}),
            ...(departureChanged ? { departureFrom: previous.departure, departureTo: current.departure } : {}),
            ...(unitChanged ? { unitFrom: previous.unitId, unitTo: current.unitId } : {}),
            // Erwachsene UND Kinder werden GEMEINSAM geschrieben, sobald sich EINE der beiden Zahlen
            // geaendert hat (nicht nur das einzelne geaenderte Teilfeld) - die Detailansicht zeigt
            // dadurch immer die vollstaendige Belegung beider Zeitpunkte ("2 Erw. · 1 Kind ->
            // 3 Erw. · 1 Kind"), auch wenn nur die Erwachsenenzahl sich tatsaechlich geaendert hat.
            ...(guestsChanged
              ? {
                adultsFrom: previous.adults, adultsTo: current.adults,
                childrenFrom: previous.children, childrenTo: current.children,
              }
              : {}),
          };
          changeWrites.push([r.id, JSON.stringify(change)]);
        }
      }
      // Baseline nur schreiben, wenn sie fehlt oder sich tatsaechlich geaendert hat - vermeidet
      // unnoetige Schreibzugriffe bei jedem Poll-Zyklus (Punkt 31 "keine unnoetigen Requests").
      if (!previous || previous.arrival !== current.arrival || previous.departure !== current.departure
        || previous.unitId !== current.unitId || previous.adults !== current.adults || previous.children !== current.children) {
        snapshotWrites.push([r.id, JSON.stringify(current)]);
      }
    }

    for (const [field, value] of snapshotWrites) await redis.hSet(SNAPSHOT_HASH_KEY, field, value);
    for (const [field, value] of changeWrites) await redis.hSet(CHANGES_HASH_KEY, field, value);
    for (const [field, value] of assignmentWrites) await redis.hSet(TASK_ASSIGNMENTS_HASH_KEY, field, value);

    res.status(200).json({ changes: await changesForUser(redis, user) });
  } catch (err) {
    console.error('[api/booking-changes]', err);
    res.status(500).json({ error: err.message || 'Interner Fehler' });
  }
};
