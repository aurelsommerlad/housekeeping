// Reine Vergleichs-/Normalisierungsfunktionen fuer die Buchungsaenderungs-Erkennung, extrahiert aus
// api/booking-changes.js (einziger Aufrufer), damit sie ohne Redis/Session/Apaleo isoliert
// unittestbar sind (siehe api/_booking-change-compare.test.js). Reines Verhalten unveraendert -
// keine Logikaenderung gegenueber der vorherigen modul-internen Fassung.

// Vergleich/Speicherung erfolgen ausschliesslich auf Tagesebene (yyyy-mm-dd) - housekeeping-relevant
// ist nur der KALENDERTAG (die Uhrzeit wird bereits getrennt ueber LCO/ECI/Zeiten-Override
// abgebildet, siehe lib/housekeeping/tasks.ts). Macht die Anzeige nebenbei robust: zwei tatsaechlich
// unterschiedliche Tage werden nie mehr als "X -> X" angezeigt.
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

// Bugfix (Nutzerfeedback-Folgerunde, live reproduziert: "Buchung geändert" zeigte "17.09. -> 17.09."
// bzw. "22.09. -> 22.09." trotz des Read-Filters unten): der Filter verglich die GESPEICHERTEN
// Rohwerte per `!==`, OHNE sie erneut zu normalisieren. Ein Datensatz aus der Zeit VOR dem
// allerersten dateOnly()-Fix dieser Route enthaelt arrivalFrom/-To bzw. departureFrom/-To noch als
// VOLLE ISO-Datumszeit - unterscheiden sich zwei solche Werte nur in der Uhrzeit (z. B.
// "...T15:00:00Z" vs. "...T18:00:00Z"), ist der rohe String-Vergleich `!==` WAHR, obwohl der
// angezeigte Kalendertag identisch ist ("17.09." vs. "17.09."). Ein seither nie erneut ausgeloester
// Alt-Datensatz blieb dadurch unentdeckt fehlerhaft in Redis liegen und wurde weiterhin angezeigt -
// live reproduziert mit genau diesem Muster. Jedes Feld wird deshalb jetzt VOR dem Vergleich exakt
// so normalisiert, wie es auch angezeigt wird: Datumsfelder ueber dieselbe dateOnly()-Funktion wie
// beim Schreiben, Personenzahlen explizit als Number (falls ein sehr alter Datensatz sie z. B. als
// String enthaelt - Punkt "identische interne Repraesentationen sicherstellen").
function normalizeForCompare(kind, value) {
  if (value === undefined || value === null) return value;
  if (kind === 'date') return dateOnly(value);
  if (kind === 'number') return Number(value);
  return value;
}

// Defensiver Read-Filter (Nutzerfeedback-Folgerunde: "pruefen, ob bereits fehlerhafte Datensaetze
// mit identischen Vorher-/Nachher-Werten existieren"): ein *From/*To-Paar zaehlt nur als ECHTE
// Aenderung, wenn beide Seiten NACH Normalisierung tatsaechlich verschieden sind. Die Schreiblogik
// haengt ein Paar ohnehin nur an, wenn es sich geaendert hat - dieser Filter ist zusaetzlich ein
// Sicherheitsnetz GEGEN BEREITS IN REDIS LIEGENDE Alt-Datensaetze (z. B. aus frueheren Versionen
// dieser Route, vor einem der bisherigen Bugfixes) und schuetzt zugleich vor jedem zukuenftigen
// Regressionsfall, OHNE dass dafuer Redis-Daten geloescht/migriert werden muessen (Nutzervorgabe:
// keine Redis-Daten loeschen). Ein Datensatz, der nach diesem Filter kein einziges echtes
// Aenderungsfeld mehr hat, wird beim Lesen vollstaendig unterdrueckt (bleibt aber unangetastet in
// Redis liegen).
function hasRealChange(change) {
  if (!change) return false;
  const pairs = [
    ['arrivalFrom', 'arrivalTo', 'date'], ['departureFrom', 'departureTo', 'date'], ['unitFrom', 'unitTo', 'string'],
    ['adultsFrom', 'adultsTo', 'number'], ['childrenFrom', 'childrenTo', 'number'],
  ];
  return pairs.some(([fromKey, toKey, kind]) => {
    if (!(fromKey in change) && !(toKey in change)) return false;
    return normalizeForCompare(kind, change[fromKey]) !== normalizeForCompare(kind, change[toKey]);
  });
}

module.exports = { dateOnly, fieldChanged, normalizeForCompare, hasRealChange };
