// Datenzugriff fuer Benutzer (Redis-Hash "hk:users"). Wird sowohl von api/users.js (CRUD)
// als auch von api/auth.js (Login/Registrierung) genutzt.
//
// Rollen: 'admin' und 'housekeeping' (Kanon ab dieser Version). Aeltere Datensaetze mit der
// frueheren Rollenbezeichnung 'housekeeper' bleiben gueltig - ueberall wird nur auf role==='admin'
// geprueft, alles andere zaehlt als Housekeeping. Ebenso werden fruehere Klartext-Passwoerter
// (aus der alten Seed-User-Loesung) beim naechsten erfolgreichen Login transparent auf einen
// bcrypt-Hash migriert (siehe verifyLogin).
const crypto = require('crypto');
const { parseJSON } = require('./_redis');
const { hashPassword, verifyPassword } = require('./_auth');

const HASH_KEY = 'hk:users';

function sanitizeUser(u) {
  if (!u) return u;
  const { password, passwordHash, ...rest } = u;
  return rest;
}

function normalizeRole(role) {
  return role === 'admin' ? 'admin' : 'housekeeping';
}

async function getAllUsersRaw(redis) {
  const all = await redis.hGetAll(HASH_KEY);
  return Object.values(all).map((v) => parseJSON(v, null)).filter(Boolean);
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
  };
  await redis.hSet(HASH_KEY, username, JSON.stringify(record));
  return record;
}

// Erstellt oder aktualisiert einen Benutzer (Team-Screen). `input.password` wird, falls gesetzt,
// serverseitig gehasht - es wird nie ein Klartext-Passwort persistiert.
async function upsertUser(redis, input) {
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

  if (input.password) {
    merged.passwordHash = await hashPassword(input.password);
  } else if (!merged.passwordHash) {
    merged.passwordHash = existing.passwordHash || null;
  }

  await redis.hSet(HASH_KEY, key, JSON.stringify(merged));
  return merged;
}

async function deleteUserByUsername(redis, username) {
  await redis.hDel(HASH_KEY, String(username).trim().toLowerCase());
}

module.exports = {
  HASH_KEY,
  sanitizeUser,
  normalizeRole,
  getAllUsers,
  getAllUsersRaw,
  hasAnyAdmin,
  getUserRawByIdentifier,
  getUserRawById,
  verifyLogin,
  createUser,
  upsertUser,
  deleteUserByUsername,
};
