/**
 * Zentrale Rechte-Helfer fuer das Standortverantwortlichen-Modell (Punkt 13-16). Es gibt
 * weiterhin nur zwei Rollen ('admin' | 'housekeeping', siehe types.ts#Role) - "Standort-
 * verantwortlich" ist kein dritter Rollenwert, sondern ergibt sich rein aus
 * `managedProperties` auf einem housekeeping-User. Admin hat implizit ueberall alle Rechte.
 *
 * Diese Datei ist die EINZIGE Quelle der Wahrheit fuer diese Pruefungen im Next.js-Client-Code.
 * Die serverseitigen API-Routen (api/*.js, CommonJS) duplizieren dieselbe, sehr kleine Logik
 * bewusst separat (siehe api/_permissions.js), da sie nicht direkt TS-Module importieren koennen -
 * beide Implementierungen muessen bei Aenderungen synchron gehalten werden.
 */
import type { StaffUser } from './types';

export function isAdmin(user: StaffUser | null): boolean {
  return user?.role === 'admin';
}

export function hasPropertyAccess(user: StaffUser | null, propertyCode: string): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (user.properties === 'alle' || user.properties === 'all') return true;
  return Array.isArray(user.properties) && user.properties.includes(propertyCode);
}

/** Standortverantwortlich fuer GENAU dieses Property - Admin zaehlt ueberall als Standort-
 * verantwortlich, ein housekeeping-User nur, wenn das Property in managedProperties steht UND
 * er ueberhaupt Zugriff darauf hat (managedProperties MUSS Teilmenge von properties sein, siehe
 * sanitizeManagedProperties - diese Funktion verlaesst sich zusaetzlich selbst nochmal darauf,
 * falls ein Datensatz das je verletzen sollte). */
export function isPropertyManager(user: StaffUser | null, propertyCode: string): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  return !!user.managedProperties?.includes(propertyCode) && hasPropertyAccess(user, propertyCode);
}

/** Alle Property-Codes, fuer die dieser User Standortverantwortlicher ist (Admin: alle
 * uebergebenen Codes). Fuer UI-Aggregationen wie die Team-/Kapazitaetsuebersicht. */
export function managedPropertyCodes(user: StaffUser | null, allPropertyCodes: string[]): string[] {
  if (!user) return [];
  if (user.role === 'admin') return allPropertyCodes;
  return (user.managedProperties || []).filter((p) => allPropertyCodes.includes(p));
}

/** Team-Verantwortlicher (Housekeeping Teams) - unabhaengig von isPropertyManager/
 * managedProperties (siehe types.ts#StaffUser-Kommentar: beide Rechte duerfen sich nie
 * vermischen). Admin zaehlt hier bewusst NICHT automatisch als "lead" - Admin-Rechte werden
 * ueberall separat ueber isAdmin() geprueft, nie ueber teamRole. */
export function isTeamLead(user: StaffUser | null): boolean {
  return !!user && user.teamRole === 'lead' && !!user.housekeepingTeamId;
}

/** Ist dieser User Mitglied (irgendeiner Rolle) GENAU dieses Teams? `teamId` kann null sein
 * (Task ohne Team-Zuordnung) - dann immer false, da niemand Mitglied von "keinem Team" ist. */
export function isTeamMemberOf(user: StaffUser | null, teamId: string | null): boolean {
  return !!user && !!teamId && user.housekeepingTeamId === teamId;
}

/** Darf dieser User Personen-Zuweisungen INNERHALB von `teamId` verwalten (zuweisen/umverteilen/
 * freigeben)? Admin ueberall, sonst nur der Team-Verantwortliche GENAU dieses Teams - ein
 * normales Mitglied oder der Lead eines ANDEREN Teams darf das nicht (Briefing: "Lead darf keine
 * fremden Teams verwalten"). */
export function canManageTeamAssignments(user: StaffUser | null, teamId: string | null): boolean {
  if (!user || !teamId) return false;
  if (isAdmin(user)) return true;
  return isTeamLead(user) && user.housekeepingTeamId === teamId;
}

/** managedProperties MUSS immer eine Teilmenge von properties sein (Punkt 13/17) - wird Zugriff
 * entfernt, faellt die Standortverantwortung fuer dieses Property automatisch mit weg. Rein
 * client- oder serverseitig identisch anwendbar (reine Funktion, keine Seiteneffekte). */
export function sanitizeManagedProperties(
  properties: 'alle' | 'all' | string[] | undefined,
  managedProperties: string[] | undefined,
): string[] {
  if (!managedProperties || managedProperties.length === 0) return [];
  if (properties === 'alle' || properties === 'all') return Array.from(new Set(managedProperties));
  const allowed = new Set(Array.isArray(properties) ? properties : []);
  return Array.from(new Set(managedProperties.filter((p) => allowed.has(p))));
}
