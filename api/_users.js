// Datenzugriff fuer Benutzer (Redis-Hash "housekeeping:users", eindeutiger Namespace getrennt
// von Guest Services - siehe migrateLegacyKey in ./_redis). Wird sowohl von api/users.js (CRUD)
// als auch von api/auth.js (Login/Registrierung/Einladungsannahme) genutzt.
//
// Rollen (Briefing "Team-/Benutzerverwaltung ueberarbeiten"): 'admin' | 'location_manager' |
// 'housekeeper' (Kanon ab dieser Version, siehe types.ts#Role). Aeltere Datensaetze mit den
// frueheren Rollenbezeichnungen 'housekeeping'/'housekeeper' bleiben gueltig - normalizeRole()
// bildet jeden Nicht-'admin'/Nicht-'location_manager'-Wert auf 'housekeeper' ab. Ein bestehender
// 'housekeeping'-User MIT gesetzten managedProperties wird beim naechsten Lesen automatisch (und
// idempotent) zu `role: 'location_manager'` hochgestuft (siehe migrateUserRecord) - dieselbe
// operative Zustaendigkeit bestand vorher bereits, nur der Rollenwert war implizit statt explizit.
// Ebenso werden fruehere Klartext-Passwoerter (aus der alten Seed-User-Loesung) beim naechsten
// erfolgreichen Login transparent auf einen bcrypt-Hash migriert (siehe verifyLogin).
const crypto = require('crypto');
const { parseJSON, migrateLegacyKey } = require('./_redis');
const { hashPassword, verifyPassword } = require('./_auth');

// Punkt 13/17: managedProperties MUSS immer eine Teilmenge von properties sein - wird Zugriff
// entfernt, faellt die Standortverantwortung fuer dieses Property automatisch mit weg. Diese
// Funktion ist die alleinige, serverseitig IMMER durchgesetzte Quelle der Wahrheit dafuer
// (Entsprechung zu lib/housekeeping/permissions.ts#sanitizeManagedProperties auf Client-Seite -
// beide muessen bei Aenderungen synchron gehalten werden).
function sanitizeManagedProperties(properties, managedProperties) {
  if (!Array.isArray(managedProperties) || managedProperties.length === 0) return [];
  if (properties === 'alle' || properties === 'all') return Array.from(new Set(managedProperties));
  const allowed = new Set(Array.isArray(properties) ? properties : []);
  return Array.from(new Set(managedProperties.filter((p) => allowed.has(p))));
}

// Briefing "Team-/Benutzerverwaltung ueberarbeiten": Ersatz fuer die fruehere
// sanitizeTeamMembership(housekeepingTeamId, teamRole) (EIN Team, ein Rollenwert) - ein User kann
// jetzt Mitglied MEHRERER Teams gleichzeitig sein, `isLeader` ist ausschliesslich eine Eigenschaft
// der einzelnen Mitgliedschaft. Dedupliziert nach teamId (letzter Eintrag gewinnt), verwirft
// Eintraege ohne teamId, erzwingt `isLeader` als Boolean - niemals ungeprueft uebernehmen, ein
// Client koennte sonst versuchen, sich selbst per manipuliertem Request zum Teamleader zu machen
// (siehe api/users.js/api/invitations.js fuer die zusaetzliche Rechtepruefung, WER ueberhaupt
// isLeader:true setzen darf).
function sanitizeTeamMemberships(teamMemberships) {
  if (!Array.isArray(teamMemberships)) return [];
  const byTeam = new Map();
  for (const m of teamMemberships) {
    if (!m || !m.teamId) continue;
    byTeam.set(String(m.teamId), { teamId: String(m.teamId), isLeader: m.isLeader === true });
  }
  return Array.from(byTeam.values());
}

// Liest die Teammitgliedschaften eines Users - bevorzugt das neue `teamMemberships`-Array,
// synthetisiert es andernfalls aus den aelteren Skalarfeldern `housekeepingTeamId`/`teamRole`
// (kein destruktiver Migrationsschritt fuer historische Datensaetze noetig). Identische Logik wie
// lib/housekeeping/permissions.ts#getTeamMemberships (dort die Client-Entsprechung).
function getTeamMemberships(user) {
  if (!user) return [];
  if (Array.isArray(user.teamMemberships)) return user.teamMemberships;
  if (user.housekeepingTeamId) return [{ teamId: user.housekeepingTeamId, isLeader: user.teamRole === 'lead' }];
  return [];
}

const HASH_KEY = 'housekeeping:users';
const LEGACY_HASH_KEY = 'hk:users';

function sanitizeUser(u) {
  if (!u) return u;
  const { password, passwordHash, ...rest } = u;
  return rest;
}

function normalizeRole(role) {
  if (role === 'admin') return 'admin';
  if (role === 'location_manager') return 'location_manager';
  return 'housekeeper';
}

// Selbstheilende, idempotente Migration (Briefing Punkt 41 "Datenmigration"): ein VOR dieser
// Version angelegter 'housekeeping'-User mit bereits gesetzten managedProperties war schon immer
// fachlich Standortverantwortlicher (siehe alte StaffUser-Doku, Git-Historie) - lediglich der
// Rollenwert selbst war implizit. Diese Funktion macht ihn explizit, OHNE sonst irgendein Feld zu
// veraendern (properties/managedProperties bleiben exakt wie zuvor - ein Standortverantwortlicher
// mit `properties: 'alle'` sieht also weiterhin alle Standorte, ist aber nur fuer die in
// managedProperties genannten operativ verantwortlich, exakt wie im alten Modell). Greift NICHT
// bei bereits explizit gesetztem 'admin'/'location_manager' und veraendert niemals einen
// 'housekeeper' OHNE managedProperties. Wird bei jedem Laden angewendet (billige Pruefung, siehe
// getAllUsersRaw) - nach der ersten Anwendung ist die Bedingung nie wieder erfuellt.
function migrateUserRecord(u) {
  if (!u) return u;
  if (u.role !== 'admin' && u.role !== 'location_manager' && Array.isArray(u.managedProperties) && u.managedProperties.length > 0) {
    return { ...u, role: 'location_manager' };
  }
  return u;
}

async function getAllUsersRaw(redis) {
  await migrateLegacyKey(redis, LEGACY_HASH_KEY, HASH_KEY);
  const all = await redis.hGetAll(HASH_KEY);
  const users = [];
  for (const [field, raw] of Object.entries(all)) {
    const parsed = parseJSON(raw, null);
    if (!parsed) continue;
    const migrated = migrateUserRecord(parsed);
    if (migrated !== parsed) await redis.hSet(HASH_KEY, field, JSON.stringify(migrated));
    users.push(migrated);
  }
  return users;
}

async function getAllUsers(redis) {
  return (await getAllUsersRaw(redis)).map(sanitizeUser);
}

async function hasAnyAdmin(redis) {
  const all = await getAllUsersRaw(redis);
  return all.some((u) => u.role === 'admin');
}

async function getUserRawByIdentifier(redis, identifier) {
  if (!identifier) return null;
  const id = String(identifier).trim().toLowerCase();
  const all = await getAllUsersRaw(redis);
  return all.find((u) => (u.username && u.username.toLowerCase() === id) || (u.email && u.email.toLowerCase() === id)) || null;
}

async function getUserRawById(redis, userId) {
  if (!userId) return null;
  const all = await getAllUsersRaw(redis);
  return all.find((u) => u.id === userId) || null;
}

// Verifiziert ein Login und migriert transparent alte Klartext-Passwoerter (aus der frueheren
// Seed-User-Loesung) auf bcrypt-Hashes, sobald sie einmal erfolgreich benutzt wurden.
async function verifyLogin(redis, identifier, password) {
  const user = await getUserRawByIdentifier(redis, identifier);
  if (!user) return null;
  // Punkt 17: deaktivierte Benutzer koennen sich nicht mehr anmelden. `active` fehlt bei allen
  // vor dieser Erweiterung angelegten Konten (undefined) - nur eine EXPLIZITE `false` sperrt,
  // damit bestehende Benutzer nicht rueckwirkend ausgesperrt werden.
  if (user.active === false) return null;

  if (user.passwordHash) {
    const ok = await verifyPassword(password, user.passwordHash);
    return ok ? user : null;
  }

  // Legacy-Fallback: frueherer Klartext-Seed-User ohne passwordHash.
  if (user.password && user.password === password) {
    user.passwordHash = await hashPassword(password);
    delete user.password;
    await redis.hSet(HASH_KEY, user.username, JSON.stringify(user));
    return user;
  }

  return null;
}

// Legt einen neuen Benutzer inkl. gehashtem Passwort an (Registrierung / Team-Screen).
async function createUser(redis, { firstName, lastName, email, password, role, properties }) {
  const emailNorm = email ? String(email).trim().toLowerCase() : '';
  if (emailNorm) {
    const all = await getAllUsersRaw(redis);
    if (all.some((u) => u.email && u.email.toLowerCase() === emailNorm)) {
      throw new Error('Diese E-Mail-Adresse wird bereits verwendet.');
    }
  }
  let username = (emailNorm.split('@')[0] || 'user').replace(/[^a-z0-9._-]/g, '') || 'user';
  const all = await getAllUsersRaw(redis);
  if (all.some((u) => u.username === username)) {
    username = username + '-' + crypto.randomBytes(2).toString('hex');
  }
  const name = [firstName, lastName].filter(Boolean).join(' ').trim() || username;
  const record = {
    id: username,
    username,
    email: emailNorm,
    firstName: firstName || '',
    lastName: lastName || '',
    name,
    role: normalizeRole(role),
    properties: properties || 'alle',
    passwordHash: await hashPassword(password),
    createdAt: Date.now(),
    active: true,
    status: 'active',
  };
  await redis.hSet(HASH_KEY, username, JSON.stringify(record));
  return record;
}

// Briefing "Einladungssystem": legt den Account einer ANGENOMMENEN Einladung an. Anders als
// createUser() kommen role/propertyIds/teamMemberships hier NICHT vom Client der Annahme-Anfrage,
// sondern ausschliesslich aus dem bereits serverseitig validierten Invitation-Datensatz (siehe
// api/auth.js#action:'accept-invite') - der neue User selbst kann seine eigene Rolle/Standorte/
// Teamzugehoerigkeit dadurch unter keinen Umstaenden beeinflussen, er waehlt nur Name+Passwort.
async function createUserFromInvitation(redis, { firstName, lastName, email, password, role, propertyIds, teamId, isLeader, lang }) {
  const emailNorm = String(email).trim().toLowerCase();
  const all = await getAllUsersRaw(redis);
  if (all.some((u) => u.email && u.email.toLowerCase() === emailNorm)) {
    throw new Error('Diese E-Mail-Adresse wird bereits verwendet.');
  }
  let username = (emailNorm.split('@')[0] || 'user').replace(/[^a-z0-9._-]/g, '') || 'user';
  if (all.some((u) => u.username === username)) {
    username = username + '-' + crypto.randomBytes(2).toString('hex');
  }
  const name = [firstName, lastName].filter(Boolean).join(' ').trim() || username;
  const normalizedRole = normalizeRole(role);
  const properties = normalizedRole === 'location_manager' ? (propertyIds || []) : (propertyIds && propertyIds.length ? propertyIds : 'alle');
  const record = {
    id: username,
    username,
    email: emailNorm,
    firstName: firstName || '',
    lastName: lastName || '',
    name,
    role: normalizedRole,
    properties,
    managedProperties: normalizedRole === 'location_manager' ? sanitizeManagedProperties(properties, propertyIds || []) : [],
    teamMemberships: teamId ? sanitizeTeamMemberships([{ teamId, isLeader: isLeader === true }]) : [],
    lang: lang || 'de',
    passwordHash: await hashPassword(password),
    createdAt: Date.now(),
    active: true,
    status: 'active',
  };
  await redis.hSet(HASH_KEY, username, JSON.stringify(record));
  return record;
}

// Erstellt oder aktualisiert einen Benutzer (Team-Screen). `input.password` wird, falls gesetzt,
// serverseitig gehasht - es wird nie ein Klartext-Passwort persistiert.
async function upsertUser(redis, input) {
  await migrateLegacyKey(redis, LEGACY_HASH_KEY, HASH_KEY);
  const key = String(input.username || input.email || '').trim().toLowerCase();
  if (!key) throw new Error('username oder email ist erforderlich.');
  const existingRaw = await redis.hGet(HASH_KEY, key);
  const existing = existingRaw ? parseJSON(existingRaw, {}) : {};

  const merged = {
    ...existing,
    ...input,
    username: key,
    id: existing.id || key,
    role: normalizeRole(input.role || existing.role),
  };
  delete merged.password;
  merged.managedProperties = sanitizeManagedProperties(merged.properties, merged.managedProperties);
  // Briefing "Team-/Benutzerverwaltung ueberarbeiten": `teamMemberships[]` ersetzt die fruehere
  // Skalarform - nur uebernehmen, wenn tatsaechlich mitgesendet, sonst bestehende (bzw. aus den
  // Legacy-Feldern synthetisierte) Mitgliedschaften unangetastet lassen.
  merged.teamMemberships = sanitizeTeamMemberships(
    Array.isArray(input.teamMemberships) ? input.teamMemberships : getTeamMemberships(existing),
  );
  delete merged.housekeepingTeamId;
  delete merged.teamRole;

  if (input.password) {
    merged.passwordHash = await hashPassword(input.password);
  } else if (!merged.passwordHash) {
    merged.passwordHash = existing.passwordHash || null;
  }
  // Briefing "Einladungssystem": `status` bleibt informativ konsistent mit `active` fuer bereits
  // aktive Accounts - eine laufende Einladung (`status:'invited'`) wird ausschliesslich ueber
  // api/invitations.js#accept auf 'active' gesetzt, niemals hier (upsertUser dient der
  // Admin-Bearbeitung BESTEHENDER Accounts, nicht der Annahme einer Einladung).
  if (merged.status !== 'invited') merged.status = merged.active === false ? 'inactive' : 'active';

  await redis.hSet(HASH_KEY, key, JSON.stringify(merged));
  return merged;
}

async function deleteUserByUsername(redis, username) {
  await migrateLegacyKey(redis, LEGACY_HASH_KEY, HASH_KEY);
  await redis.hDel(HASH_KEY, String(username).trim().toLowerCase());
}

module.exports = {
  HASH_KEY,
  LEGACY_HASH_KEY,
  sanitizeUser,
  normalizeRole,
  getAllUsers,
  getAllUsersRaw,
  hasAnyAdmin,
  getUserRawByIdentifier,
  getUserRawById,
  verifyLogin,
  createUser,
  createUserFromInvitation,
  upsertUser,
  deleteUserByUsername,
  sanitizeManagedProperties,
  sanitizeTeamMemberships,
  getTeamMemberships,
};
