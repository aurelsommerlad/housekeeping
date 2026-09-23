// Housekeeping-relevante Aenderungen an Apaleo-Reservierungen sichtbar machen (Punkt "Buchungs-
// aenderung sichtbar machen"). Apaleo liefert immer nur den AKTUELLEN Stand einer Reservierung -
// um eine Aenderung ueberhaupt erkennen zu koennen, muss Housekeeping selbst einen Vorher-Stand
// (Snapshot) speichern und bei jedem Laden vergleichen (Punkt "Housekeeping muss selbst den
// relevanten Vorzustand speichern"). Es gibt bewusst KEIN zweites, paralleles Change-Tracking im
// Rest der App (gepruft: einzig CleaningCompletionReport ist ein fachlich unabhaengiger Snapshot
// fuer Waescheverbrauch) - dieser Mechanismus hier ist der einzige.
//
// Nur die fuenf housekeeping-relevanten Felder Anreise/Abreise/Einheit/Personenanzahl/Babybett
// werden verglichen (Punkt "nur housekeeping-relevante Aenderungen loggen") - jede andere
// Reservierungsaenderung wird ignoriert. `crib` (Briefing "BABY-Business-Logik" Punkt 9): ein
// nachtraeglich gebuchtes/entferntes Babybett auf einer bereits offenen/laufenden Reinigung nutzt
// bewusst DIESELBE Aenderungs-/Ungesehen-Logik wie Anreise/Abreise/Personen/Einheit, statt ein
// weiteres Farbsystem einzufuehren. Redis housekeeping:booking_change_snapshots (Baseline je
// reservationId) + housekeeping:booking_changes (nur die JEWEILS zuletzt erkannte Aenderung je
// reservationId, kein volles Log noetig, siehe types.ts#BookingChangeRecord).
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

async function changesForUser(redis, user) {
  const all = await redis.hGetAll(CHANGES_HASH_KEY);
  const changes = {};
  for (const [reservationId, raw] of Object.entries(all)) {
    const change = parseJSON(raw, null);
    if (!change) continue;
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
    const now = Date.now();
    const snapshotWrites = [];
    const changeWrites = [];

    for (const r of visible) {
      const current = {
        arrival: dateOnly(r.arrival),
        departure: dateOnly(r.departure),
        unitId: r.unitId || null,
        propertyCode: r.propertyCode,
        // Nur eine bekannte Zahl (>=0) uebernehmen - fehlende/ungueltige Rohdaten (null/undefined)
        // duerfen weder als "0 Gaeste" gespeichert noch mit einer echten spaeteren Zahl als
        // Aenderung erkannt werden (siehe guestsChanged unten).
        guests: typeof r.guests === 'number' ? r.guests : null,
        // Punkt 9: nur eine bekannte Boolean-Angabe uebernehmen (analog zu `guests` oben) - ein
        // fehlender/unbekannter Wert wird weder als "kein Babybett" gespeichert noch faelschlich
        // als Aenderung erkannt (siehe cribChanged unten).
        crib: typeof r.crib === 'boolean' ? r.crib : null,
      };
      const previous = parseJSON(snapshots[r.id], null);
      if (previous) {
        const guestsChanged = previous.guests != null && current.guests != null && previous.guests !== current.guests;
        const cribChanged = previous.crib != null && current.crib != null && previous.crib !== current.crib;
        const changed = previous.arrival !== current.arrival || previous.departure !== current.departure
          || previous.unitId !== current.unitId || guestsChanged || cribChanged;
        if (changed) {
          const change = {
            reservationId: r.id,
            propertyCode: r.propertyCode,
            changedAt: now,
            ...(previous.arrival !== current.arrival ? { arrivalFrom: previous.arrival, arrivalTo: current.arrival } : {}),
            ...(previous.departure !== current.departure ? { departureFrom: previous.departure, departureTo: current.departure } : {}),
            ...(previous.unitId !== current.unitId ? { unitFrom: previous.unitId, unitTo: current.unitId } : {}),
            ...(guestsChanged ? { guestsFrom: previous.guests, guestsTo: current.guests } : {}),
            ...(cribChanged ? { cribFrom: previous.crib, cribTo: current.crib } : {}),
          };
          changeWrites.push([r.id, JSON.stringify(change)]);
        }
      }
      // Baseline nur schreiben, wenn sie fehlt oder sich tatsaechlich geaendert hat - vermeidet
      // unnoetige Schreibzugriffe bei jedem Poll-Zyklus (Punkt 31 "keine unnoetigen Requests").
      if (!previous || previous.arrival !== current.arrival || previous.departure !== current.departure
        || previous.unitId !== current.unitId || previous.guests !== current.guests || previous.crib !== current.crib) {
        snapshotWrites.push([r.id, JSON.stringify(current)]);
      }
    }

    for (const [field, value] of snapshotWrites) await redis.hSet(SNAPSHOT_HASH_KEY, field, value);
    for (const [field, value] of changeWrites) await redis.hSet(CHANGES_HASH_KEY, field, value);

    res.status(200).json({ changes: await changesForUser(redis, user) });
  } catch (err) {
    console.error('[api/booking-changes]', err);
    res.status(500).json({ error: err.message || 'Interner Fehler' });
  }
};
