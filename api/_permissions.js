// Serverseitige Rechte-Helfer fuer das Standortverantwortlichen-Modell (siehe
// lib/housekeeping/permissions.ts fuer die TS/Client-Entsprechung - beide Implementierungen
// muessen bei Aenderungen synchron gehalten werden, da CommonJS-Routen (dieses Verzeichnis)
// TS-Module nicht direkt importieren koennen).
//
// WICHTIG: Diese Pruefungen nutzen IMMER den frisch aus Redis geladenen User-Datensatz
// (getUserRawById), NIEMALS die im Session-Cookie/-Record gecachte `role` - managedProperties
// aendert sich pro User und darf nicht erst nach einem Re-Login wirken.
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

// Housekeeping Teams (Reinigungsfirmen) - Server-Zwilling von lib/housekeeping/permissions.ts.
// Bewusst getrennt von isPropertyManager/managedProperties (siehe dortiger Kommentar): eine
// Standortverantwortung ist eine andere Zustaendigkeit als die interne Disposition einer
// Reinigungsfirma innerhalb ihres eigenen Teams.
function isTeamLead(user) {
  return !!user && user.teamRole === 'lead' && !!user.housekeepingTeamId;
}

function isTeamMemberOf(user, teamId) {
  return !!user && !!teamId && user.housekeepingTeamId === teamId;
}

function canManageTeamAssignments(user, teamId) {
  if (!user || !teamId) return false;
  if (user.role === 'admin') return true;
  return isTeamLead(user) && user.housekeepingTeamId === teamId;
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

module.exports = {
  hasPropertyAccess, isPropertyManager, propertyCodeFromTaskId, dateFromTaskId,
  isTeamLead, isTeamMemberOf, canManageTeamAssignments,
};
