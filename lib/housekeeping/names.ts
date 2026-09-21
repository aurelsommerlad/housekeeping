/**
 * Kurzanzeige von Mitarbeiternamen (Punkt "Reinigungskräfte standardmäßig nur mit Vornamen
 * anzeigen") - reine Darstellungsschicht, der gespeicherte volle Name (StaffUser.name) bleibt
 * überall unverändert. In der operativen Housekeeping-UI (Task Cards, Zuweisung, Team-
 * Kurzansicht, Reinigungsstatus, "erledigt von") wird nur der Vorname gezeigt; administrative
 * Bereiche (Teamverwaltung/Benutzerprofil) zeigen weiterhin den vollen Namen und rufen diese
 * Funktion bewusst nicht auf.
 */

function firstNameOf(name: string): string {
  const trimmed = name.trim();
  return trimmed.split(/\s+/)[0] || trimmed;
}

/**
 * Baut einmalig eine Kurzname-Zuordnung über ALLE potenziell sichtbaren vollen Namen. Kollidieren
 * mehrere Personen im Vornamen, wird so weit wie nötig disambiguiert (Vorname + Anfangsbuchstabe
 * des Nachnamens, z. B. "Anna S." / "Anna M.") - eindeutige Vornamen bleiben unverändert kurz.
 */
export function buildShortNameMap(fullNames: string[]): Map<string, string> {
  const uniqueNames = Array.from(new Set(fullNames.filter(Boolean)));
  const groups = new Map<string, string[]>();
  for (const name of uniqueNames) {
    const first = firstNameOf(name);
    if (!groups.has(first)) groups.set(first, []);
    groups.get(first)!.push(name);
  }
  const map = new Map<string, string>();
  for (const name of uniqueNames) {
    const first = firstNameOf(name);
    const group = groups.get(first) || [name];
    if (group.length <= 1) {
      map.set(name, first);
      continue;
    }
    const rest = name.trim().split(/\s+/).slice(1).join(' ');
    map.set(name, rest ? `${first} ${rest[0].toUpperCase()}.` : first);
  }
  return map;
}
