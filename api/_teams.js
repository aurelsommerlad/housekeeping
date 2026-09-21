// Datenzugriff fuer Housekeeping Teams (Reinigungsfirmen) - drei eigene, ausschliesslich unter
// housekeeping:* liegende Redis-Hashes, komplett getrennt von den bestehenden Zuweisungs-Keys
// (api/task-assignments.js) und NIE nach Apaleo geschrieben (siehe Briefing "Housekeeping
// Teams"): die Zuordnung "welches Team reinigt welche Property standardmaessig" ist eine reine
// UNIQUE-PLACES-interne Konfiguration.
//
// - housekeeping:teams               Hash, Key = Team-Id            -> { id, name, active }
// - housekeeping:team_property_defaults  Hash, Key = Property-Code  -> Team-Id (Klartext-String)
// - housekeeping:task_team_overrides Hash, Key = Task-Id            -> TaskTeamOverride
//
// Mitgliedschaft/Rolle einer Person liegt bewusst NICHT hier, sondern weiterhin auf StaffUser
// (housekeepingTeamId/teamRole, siehe api/_users.js) - keine zweite, parallele Personenverwaltung.
const crypto = require('crypto');
const { parseJSON } = require('./_redis');
const { propertyCodeFromTaskId } = require('./_permissions');

const TEAMS_HASH_KEY = 'housekeeping:teams';
const PROPERTY_DEFAULTS_HASH_KEY = 'housekeeping:team_property_defaults';
const TASK_OVERRIDES_HASH_KEY = 'housekeeping:task_team_overrides';

async function getAllTeams(redis) {
  const all = await redis.hGetAll(TEAMS_HASH_KEY);
  return Object.values(all).map((v) => parseJSON(v, null)).filter(Boolean);
}

async function getTeamById(redis, teamId) {
  if (!teamId) return null;
  const raw = await redis.hGet(TEAMS_HASH_KEY, teamId);
  return raw ? parseJSON(raw, null) : null;
}

// Legt ein neues Team an (kein `id` uebergeben) oder aktualisiert ein bestehendes (Punkt "Admin
// kann Reinigungsfirmen anlegen/bearbeiten").
async function upsertTeam(redis, input) {
  const id = input.id || crypto.randomBytes(6).toString('hex');
  const existingRaw = await redis.hGet(TEAMS_HASH_KEY, id);
  const existing = existingRaw ? parseJSON(existingRaw, {}) : {};
  const name = String(input.name || existing.name || '').trim();
  if (!name) throw new Error('Name ist erforderlich.');
  const record = { id, name, active: input.active !== undefined ? !!input.active : (existing.active !== false) };
  await redis.hSet(TEAMS_HASH_KEY, id, JSON.stringify(record));
  return record;
}

async function getPropertyDefaults(redis) {
  return redis.hGetAll(PROPERTY_DEFAULTS_HASH_KEY);
}

// teamId === null loescht den Standard fuer diese Property wieder (Property dann ohne
// Team-Zuordnung, wie vor Einfuehrung dieses Features).
async function setPropertyDefault(redis, propertyCode, teamId) {
  if (!propertyCode) throw new Error('propertyCode ist erforderlich.');
  if (teamId) await redis.hSet(PROPERTY_DEFAULTS_HASH_KEY, propertyCode, teamId);
  else await redis.hDel(PROPERTY_DEFAULTS_HASH_KEY, propertyCode);
}

async function getAllTaskTeamOverrides(redis) {
  const all = await redis.hGetAll(TASK_OVERRIDES_HASH_KEY);
  const overrides = {};
  for (const [k, v] of Object.entries(all)) overrides[k] = parseJSON(v, null);
  return overrides;
}

// teamId === null speichert einen ausdruecklichen "kein Team fuer diesen Task"-Override (siehe
// types.ts#TaskTeamOverride) - unterscheidet sich bewusst von "kein Override vorhanden" (dort
// greift weiterhin der Property-Standard).
async function setTaskTeamOverride(redis, taskId, teamId, teamName, user) {
  const record = {
    taskId, teamId: teamId || null, teamName: teamName || '',
    changedBy: user.id, changedByName: user.name || user.username, changedAt: Date.now(),
  };
  await redis.hSet(TASK_OVERRIDES_HASH_KEY, taskId, JSON.stringify(record));
  return record;
}

// Zentrale, serverseitig durchgesetzte Ableitung: Override (falls vorhanden) VOR dem
// Property-Standard - exakt dieselbe Prioritaet wie lib/housekeeping/tasks.ts#resolveTasks auf
// dem Client, damit eine Aktion niemals gegen ein anderes Team pruefen kann als das, was der
// Nutzer auf der Karte tatsaechlich sieht.
async function resolveAssignedTeamId(redis, taskId) {
  const overrideRaw = await redis.hGet(TASK_OVERRIDES_HASH_KEY, taskId);
  if (overrideRaw) {
    const override = parseJSON(overrideRaw, null);
    if (override) return override.teamId || null;
  }
  const propertyCode = propertyCodeFromTaskId(taskId);
  const defaultTeamId = await redis.hGet(PROPERTY_DEFAULTS_HASH_KEY, propertyCode);
  return defaultTeamId || null;
}

module.exports = {
  TEAMS_HASH_KEY,
  PROPERTY_DEFAULTS_HASH_KEY,
  TASK_OVERRIDES_HASH_KEY,
  getAllTeams,
  getTeamById,
  upsertTeam,
  getPropertyDefaults,
  setPropertyDefault,
  getAllTaskTeamOverrides,
  setTaskTeamOverride,
  resolveAssignedTeamId,
};
