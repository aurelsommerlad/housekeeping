// Serverseitige Rechte-Helfer fuer das Rollen-/Standortverantwortlichen-/Team-Modell (siehe
// lib/housekeeping/permissions.ts fuer die TS/Client-Entsprechung - beide Implementierungen
// muessen bei Aenderungen synchron gehalten werden, da CommonJS-Routen (dieses Verzeichnis)
// TS-Module nicht direkt importieren koennen).
//
// WICHTIG: Diese Pruefungen nutzen IMMER den frisch aus Redis geladenen User-Datensatz
// (getUserRawById), NIEMALS die im Session-Cookie/-Record gecachte `role` - managedProperties/
// teamMemberships aendern sich pro User und duerfen nicht erst nach einem Re-Login wirken.
function isAdmin(user) {
  return !!user && user.role === 'admin';
}

function isLocationManager(user) {
  return !!user && user.role === 'location_manager';
}

function hasPropertyAccess(user, propertyCode) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (user.properties === 'alle' || user.properties === 'all') return true;
  return Array.isArray(user.properties) && user.properties.includes(propertyCode);
}

function isPropertyManager(user, propertyCode) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  return Array.isArray(user.managedProperties) && user.managedProperties.includes(propertyCode) && hasPropertyAccess(user, propertyCode);
}

// Briefing "Team-/Benutzerverwaltung ueberarbeiten": liest die Teammitgliedschaften eines Users -
// bevorzugt das neue `teamMemberships`-Array (mehrere Teams moeglich), synthetisiert es
// andernfalls aus den aelteren Skalarfeldern `housekeepingTeamId`/`teamRole` (kein destruktiver
// Migrationsschritt fuer historische Datensaetze noetig). Identische Logik wie api/_users.js
// (dort fuer das Schreiben/Sanitisieren) und lib/housekeeping/permissions.ts (Client-Zwilling).
function getTeamMemberships(user) {
  if (!user) return [];
  if (Array.isArray(user.teamMemberships)) return user.teamMemberships;
  if (user.housekeepingTeamId) return [{ teamId: user.housekeepingTeamId, isLeader: user.teamRole === 'lead' }];
  return [];
}

// Housekeeping Teams (Reinigungsfirmen) - Server-Zwilling von lib/housekeeping/permissions.ts.
// Bewusst getrennt von isPropertyManager/managedProperties (siehe dortiger Kommentar): eine
// Standortverantwortung ist eine andere Zustaendigkeit als die interne Disposition einer
// Reinigungsfirma innerhalb ihres eigenen Teams. `isTeamLead` (irgendeines Teams, fuer generische
// UI-Sichtbarkeit) und `isTeamLeadOf` (GENAU dieses Teams, fuer Rechtepruefungen) sind bewusst
// getrennt, seit ein User Mitglied MEHRERER Teams gleichzeitig sein kann.
function isTeamLead(user) {
  return getTeamMemberships(user).some((m) => m.isLeader);
}

function isTeamLeadOf(user, teamId) {
  return !!teamId && getTeamMemberships(user).some((m) => m.teamId === teamId && m.isLeader);
}

function isTeamMemberOf(user, teamId) {
  return !!teamId && getTeamMemberships(user).some((m) => m.teamId === teamId);
}

function canManageTeamAssignments(user, teamId) {
  if (!user || !teamId) return false;
  if (user.role === 'admin') return true;
  return isTeamLeadOf(user, teamId);
}

// Briefing "Authorization zentralisieren" (Punkt 23): benannte Helfer statt verstreuter
// `role === ...`-Bedingungen - dieselben sieben Funktionen existieren identisch in
// lib/housekeeping/permissions.ts (Client-Spiegelung, ersetzt aber NIE die serverseitige Pruefung
// hier). Jede Funktion bekommt den bereits frisch geladenen Akteur-Datensatz (nie die
// Session-Cookie-Rolle) uebergeben.
function canManageUser(actor, targetUser) {
  if (!actor) return false;
  if (actor.role === 'admin') return true;
  // Briefing Punkt 19 (konservativ): ausschliesslich Admin darf Benutzer administrieren (Rolle
  // aendern, Teamleader ernennen/entfernen, deaktivieren) - siehe api/users.js, dort bereits per
  // requireAdmin durchgesetzt. Diese Funktion spiegelt dieselbe Regel fuer UI/weitere Routen.
  return false;
}

function canManageTeam(actor, team) {
  if (!actor) return false;
  // Briefing Punkt 12: Teams erstellen/umbenennen/Standorte aendern/deaktivieren bleibt admin-only
  // (bereits so in api/housekeeping-teams.js durchgesetzt) - ein Teamleader disponiert nur
  // INNERHALB seines Teams (siehe canAssignTask), verwaltet das Team selbst aber nicht.
  return actor.role === 'admin';
}

// Darf `actor` eine Reinigung/Aufgabe fuer `propertyCode` (Standortverantwortung) bzw. `teamId`
// (Team-Disposition) zuweisen/umverteilen/freigeben? Admin ueberall; sonst Standortverantwortlicher
// dieses Property ODER Teamleader dieses Teams - identisch zu den bereits bestehenden,
// unveraenderten Einzelpruefungen in api/task-assignments.js, hier nur als benannter
// Sammel-Helfer fuer neuen Code (ersetzt dort NICHTS Bestehendes).
function canAssignTask(actor, propertyCode, teamId) {
  if (!actor) return false;
  if (actor.role === 'admin') return true;
  if (propertyCode && isPropertyManager(actor, propertyCode)) return true;
  if (teamId && canManageTeamAssignments(actor, teamId)) return true;
  return false;
}

function canInviteUser(actor) {
  if (!actor) return false;
  if (actor.role === 'admin') return true;
  if (actor.role === 'location_manager') return true;
  return isTeamLead(actor);
}

function canManageProperty(actor, propertyCode) {
  return isPropertyManager(actor, propertyCode);
}

function canViewStatistics(actor) {
  return isAdmin(actor);
}

function canOpenApaleo(actor) {
  return isAdmin(actor);
}

// Task-IDs sind bewusst deterministisch und strukturiert (siehe lib/housekeeping/tasks.ts#taskId:
// "<propertyCode>|<unitId>|<date>|<type>|<sourceReservationId>") - die Property kann daher direkt
// und faelschungssicher aus der ID selbst gelesen werden, statt einem vom Client separat
// mitgesendeten (und damit manipulierbaren) propertyCode-Feld zu vertrauen.
function propertyCodeFromTaskId(taskId) {
  return String(taskId).split('|')[0];
}

function dateFromTaskId(taskId) {
  return String(taskId).split('|')[2];
}

// Housekeeping Incidents (Vorfall melden): der komplette Task-ID-Aufbau ist deterministisch
// (siehe lib/housekeeping/tasks.ts#taskId: "<propertyCode>|<unitId>|<date>|<type>|
// <sourceReservationId>") - ausser den reinen Anzeigenamen (Property-/Apartmentname) laesst sich
// daraus ALLES faelschungssicher direkt aus der ID lesen, ohne dem Client zu vertrauen. Ein
// Incident wird deshalb serverseitig ausschliesslich anhand dieser geparsten Werte (nie anhand
// eines vom Client separat mitgesendeten propertyCode/unitId/... Feldes) gespeichert.
function unitIdFromTaskId(taskId) {
  return String(taskId).split('|')[1];
}

function taskTypeFromTaskId(taskId) {
  return String(taskId).split('|')[3];
}

function reservationIdFromTaskId(taskId) {
  const value = String(taskId).split('|')[4];
  return value && value !== 'none' ? value : null;
}

module.exports = {
  isAdmin, isLocationManager, hasPropertyAccess, isPropertyManager, propertyCodeFromTaskId, dateFromTaskId,
  getTeamMemberships, isTeamLead, isTeamLeadOf, isTeamMemberOf, canManageTeamAssignments,
  canManageUser, canManageTeam, canAssignTask, canInviteUser, canManageProperty, canViewStatistics, canOpenApaleo,
  unitIdFromTaskId, taskTypeFromTaskId, reservationIdFromTaskId,
};
