/**
 * Zentrale Rechte-Helfer fuer das Rollen-/Standortverantwortlichen-/Team-Modell (Briefing
 * "Team-/Benutzerverwaltung ueberarbeiten"). Drei Rollen ('admin' | 'location_manager' |
 * 'housekeeper', siehe types.ts#Role) - Teamleader ist bewusst KEINE eigene Rolle, sondern eine
 * Eigenschaft einer einzelnen Teammitgliedschaft (siehe getTeamMemberships). Admin hat implizit
 * ueberall alle Rechte.
 *
 * Diese Datei ist die EINZIGE Quelle der Wahrheit fuer diese Pruefungen im Next.js-Client-Code.
 * Die serverseitigen API-Routen (api/*.js, CommonJS) duplizieren dieselbe Logik bewusst separat
 * (siehe api/_permissions.js), da sie nicht direkt TS-Module importieren koennen - beide
 * Implementierungen muessen bei Aenderungen synchron gehalten werden. Client-Sichtbarkeit
 * SPIEGELT dieselbe Logik, ersetzt aber NIE die serverseitige Pruefung.
 */
import type { StaffUser, TeamMembership } from './types';

export function isAdmin(user: StaffUser | null): boolean {
  return user?.role === 'admin';
}

export function isLocationManager(user: StaffUser | null): boolean {
  return user?.role === 'location_manager';
}

export function hasPropertyAccess(user: StaffUser | null, propertyCode: string): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (user.properties === 'alle' || user.properties === 'all') return true;
  return Array.isArray(user.properties) && user.properties.includes(propertyCode);
}

/** Standortverantwortlich fuer GENAU dieses Property - Admin zaehlt ueberall als Standort-
 * verantwortlich, sonst nur, wenn das Property in managedProperties steht UND der User
 * ueberhaupt Zugriff darauf hat (managedProperties MUSS Teilmenge von properties sein, siehe
 * sanitizeManagedProperties - diese Funktion verlaesst sich zusaetzlich selbst nochmal darauf,
 * falls ein Datensatz das je verletzen sollte). Bewusst NICHT auf `role==='location_manager'`
 * geprueft (Admin ist ebenfalls "Property Manager" ueberall, siehe erste Zeile). */
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

/** Briefing "Team-/Benutzerverwaltung ueberarbeiten": liest die Teammitgliedschaften eines Users -
 * bevorzugt das neue `teamMemberships`-Array (mehrere Teams moeglich), synthetisiert es
 * andernfalls aus den aelteren Skalarfeldern `housekeepingTeamId`/`teamRole` (kein destruktiver
 * Migrationsschritt fuer historische Datensaetze noetig). Identische Logik wie api/_users.js/
 * api/_permissions.js (Server-Zwillinge). */
export function getTeamMemberships(user: StaffUser | null): TeamMembership[] {
  if (!user) return [];
  if (Array.isArray(user.teamMemberships)) return user.teamMemberships;
  if (user.housekeepingTeamId) return [{ teamId: user.housekeepingTeamId, isLeader: user.teamRole === 'lead' }];
  return [];
}

/** Team-Verantwortlicher IRGENDEINES Teams (fuer generische UI-Sichtbarkeit, z. B. Navigation) -
 * unabhaengig von isPropertyManager/managedProperties (siehe types.ts#StaffUser-Kommentar: beide
 * Zustaendigkeiten duerfen sich nie vermischen). Admin zaehlt hier bewusst NICHT automatisch als
 * "lead" - Admin-Rechte werden ueberall separat ueber isAdmin() geprueft. */
export function isTeamLead(user: StaffUser | null): boolean {
  return getTeamMemberships(user).some((m) => m.isLeader);
}

/** Team-Verantwortlicher GENAU dieses Teams - fuer Rechtepruefungen (z. B. Einladen/Zuweisen
 * innerhalb eines bestimmten Teams), seit ein User Mitglied mehrerer Teams gleichzeitig sein
 * kann und in jedem davon unabhaengig Teamleader sein oder nicht. */
export function isTeamLeadOf(user: StaffUser | null, teamId: string | null): boolean {
  return !!teamId && getTeamMemberships(user).some((m) => m.teamId === teamId && m.isLeader);
}

/** Ist dieser User Mitglied (irgendeiner Rolle) GENAU dieses Teams? `teamId` kann null sein
 * (Task ohne Team-Zuordnung) - dann immer false, da niemand Mitglied von "keinem Team" ist. */
export function isTeamMemberOf(user: StaffUser | null, teamId: string | null): boolean {
  return !!teamId && getTeamMemberships(user).some((m) => m.teamId === teamId);
}

/** Darf dieser User Personen-Zuweisungen INNERHALB von `teamId` verwalten (zuweisen/umverteilen/
 * freigeben)? Admin ueberall, sonst nur ein Teamleader GENAU dieses Teams - ein normales Mitglied
 * oder der Lead eines ANDEREN Teams darf das nicht (Briefing: "Lead darf keine fremden Teams
 * verwalten"). */
export function canManageTeamAssignments(user: StaffUser | null, teamId: string | null): boolean {
  if (!user || !teamId) return false;
  if (isAdmin(user)) return true;
  return isTeamLeadOf(user, teamId);
}

/** "Elevated" (Briefing "Vorfall melden"/Navigation): admin ODER Standortverantwortlich
 * irgendwo ODER Team Lead - GENAU diese drei Gruppen behalten "Apartments" in der Bottom-
 * Navigation (siehe StaffNavBar.tsx) und bekommen deshalb im Gegenzug "Vorfall melden" ueber die
 * Einstellungen statt eines eigenen Bottom-Nav-Punkts (siehe SettingsScreen.tsx) - dieselbe
 * Bedingung an einer einzigen Stelle, damit beide Seiten (wem die Funktion wo angeboten wird)
 * niemals auseinanderlaufen koennen. */
export function isElevatedHousekeepingUser(user: StaffUser | null, allPropertyCodes: string[]): boolean {
  return isAdmin(user) || managedPropertyCodes(user, allPropertyCodes).length > 0 || isTeamLead(user);
}

// --- Briefing "Authorization zentralisieren" (Punkt 23): benannte Helfer statt verstreuter
// `role === ...`-Bedingungen. Dieselben sieben Funktionen existieren identisch in
// api/_permissions.js (Server-Zwilling, dort die tatsaechlich durchgesetzte Pruefung) - hier nur
// zur konsistenten UI-Sichtbarkeit, ersetzt NIE die serverseitige Pruefung. ------------------

/** Briefing Punkt 19 (konservativ): ausschliesslich Admin darf andere Benutzer administrieren
 * (Rolle aendern, Teamleader ernennen/entfernen, deaktivieren) - siehe api/users.js, dort bereits
 * per requireAdmin durchgesetzt. */
export function canManageUser(actor: StaffUser | null): boolean {
  return isAdmin(actor);
}

/** Briefing Punkt 12: Teams erstellen/umbenennen/Standorte aendern/deaktivieren bleibt admin-only
 * (bereits so in api/housekeeping-teams.js durchgesetzt) - ein Teamleader disponiert nur
 * INNERHALB seines Teams (siehe canAssignTask), verwaltet das Team selbst aber nicht. */
export function canManageTeam(actor: StaffUser | null): boolean {
  return isAdmin(actor);
}

/** Darf `actor` eine Reinigung/Aufgabe fuer `propertyCode` bzw. `teamId` zuweisen/umverteilen/
 * freigeben? Admin ueberall; sonst Standortverantwortlicher dieses Property ODER Teamleader
 * dieses Teams. */
export function canAssignTask(actor: StaffUser | null, propertyCode: string | null, teamId: string | null): boolean {
  if (!actor) return false;
  if (isAdmin(actor)) return true;
  if (propertyCode && isPropertyManager(actor, propertyCode)) return true;
  if (teamId && canManageTeamAssignments(actor, teamId)) return true;
  return false;
}

/** Wer darf ueberhaupt eine Einladung versenden? Admin (jede Rolle), Standortverantwortlicher
 * (nur housekeeper fuer eigene Standorte) oder Teamleader (nur housekeeper ins eigene Team) -
 * die genaue Scoping-Einschraenkung (welche Rolle/Standorte/Team konkret zulaessig sind) erzwingt
 * ausschliesslich der Server (api/invitations.js), diese Funktion entscheidet nur "ueberhaupt
 * ja/nein" fuer die UI (z. B. den "+ Mitarbeiter einladen"-Button anzeigen). */
export function canInviteUser(actor: StaffUser | null): boolean {
  if (!actor) return false;
  if (isAdmin(actor)) return true;
  if (isLocationManager(actor)) return true;
  return isTeamLead(actor);
}

export function canManageProperty(actor: StaffUser | null, propertyCode: string): boolean {
  return isPropertyManager(actor, propertyCode);
}

export function canViewStatistics(actor: StaffUser | null): boolean {
  return isAdmin(actor);
}

export function canOpenApaleo(actor: StaffUser | null): boolean {
  return isAdmin(actor);
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
