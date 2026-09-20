// Zentrale Auth-Helfer: Passwort-Hashing (bcrypt) und Session-Verwaltung ueber HttpOnly-Cookies,
// deren eigentliche Sessiondaten serverseitig in Redis liegen (Cookie traegt nur ein
// undurchsichtiges, zufaelliges Token - keine Secrets, keine Rollenangabe im Klartext beim Client).
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { getRedis } = require('./_redis');

// Eindeutiger Housekeeping-Namespace (siehe api/_redis.js#migrateLegacyKey) - Sessions und der
// Setup-Lock trugen frueher den generischen Praefix "hk:*". Sessions sind einzelne, nicht
// enumerierbare Keys pro Token, daher werden sie nicht pauschal migriert, sondern jeweils beim
// naechsten Zugriff mit dem konkret bekannten Token verschoben (siehe getSession unten) -
// bestehende Anmeldungen bleiben dadurch gueltig, statt alle Nutzer auszuloggen.
const SESSION_PREFIX = 'housekeeping:session:';
const LEGACY_SESSION_PREFIX = 'hk:session:';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 Tage, gleitend verlaengert bei Aktivitaet
const COOKIE_NAME = 'hk_session';
const BCRYPT_ROUNDS = 12;
// Einzige Quelle fuer den Ersteinrichtungs-Lock-Key, damit api/auth.js und lib/server/auth.ts
// (Next-native) garantiert denselben Key verwenden.
const SETUP_LOCK_KEY = 'housekeeping:setup_lock';
const LEGACY_SETUP_LOCK_KEY = 'hk:setup_lock';

function hashPassword(plain) {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}
function verifyPassword(plain, hash) {
  if (!hash) return Promise.resolve(false);
  return bcrypt.compare(plain, hash);
}

function parseCookies(req) {
  const header = req.headers.cookie;
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(val);
  }
  return out;
}

function isHttps(req) {
  return req.headers['x-forwarded-proto'] === 'https' || !!(req.socket && req.socket.encrypted);
}

function setSessionCookie(req, res, token, maxAgeSeconds) {
  const attrs = [`${COOKIE_NAME}=${encodeURIComponent(token)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSeconds}`];
  if (isHttps(req)) attrs.push('Secure');
  res.setHeader('Set-Cookie', attrs.join('; '));
}

function clearSessionCookie(req, res) {
  const attrs = [`${COOKIE_NAME}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (isHttps(req)) attrs.push('Secure');
  res.setHeader('Set-Cookie', attrs.join('; '));
}

async function createSession(req, res, user) {
  const redis = await getRedis();
  const token = crypto.randomBytes(32).toString('hex');
  const record = { userId: user.id, role: user.role, createdAt: Date.now() };
  await redis.set(SESSION_PREFIX + token, JSON.stringify(record), { EX: SESSION_TTL_SECONDS });
  setSessionCookie(req, res, token, SESSION_TTL_SECONDS);
  return token;
}

async function destroySession(req, res) {
  const cookies = parseCookies(req);
  const token = cookies[COOKIE_NAME];
  if (token) {
    const redis = await getRedis();
    await redis.del(SESSION_PREFIX + token);
    await redis.del(LEGACY_SESSION_PREFIX + token);
  }
  clearSessionCookie(req, res);
}

// Liefert {userId, role} aus einer gueltigen Session oder null. Verlaengert die Session
// bei Aktivitaet (gleitendes Ablaufdatum), damit aktive Nutzer nicht ausgeloggt werden.
async function getSession(req) {
  const cookies = parseCookies(req);
  const token = cookies[COOKIE_NAME];
  if (!token) return null;
  const redis = await getRedis();
  let key = SESSION_PREFIX + token;
  let raw = await redis.get(key);
  if (!raw) {
    // Faellt auf den alten "hk:session:"-Praefix zurueck, damit eine vor der Namespace-Migration
    // ausgestellte, noch gueltige Session nicht abgemeldet wird - und schiebt sie bei Gebrauch
    // gleich in den neuen Namespace.
    const legacyKey = LEGACY_SESSION_PREFIX + token;
    raw = await redis.get(legacyKey);
    if (raw) {
      await redis.rename(legacyKey, key).catch(() => {});
    }
  }
  if (!raw) return null;
  let record;
  try {
    record = JSON.parse(raw);
  } catch {
    return null;
  }
  await redis.expire(key, SESSION_TTL_SECONDS);
  return record;
}

// Guard fuer API-Routen: erfordert eine gueltige Session. Schreibt bei Fehlen selbst die
// Fehlerantwort - der Aufrufer muss bei null-Rueckgabe nur noch `return`.
async function requireSession(req, res) {
  const session = await getSession(req);
  if (!session) {
    res.status(401).json({ error: 'Nicht angemeldet.' });
    return null;
  }
  return session;
}

// Guard fuer Admin-only API-Routen.
async function requireAdmin(req, res) {
  const session = await getSession(req);
  if (!session) {
    res.status(401).json({ error: 'Nicht angemeldet.' });
    return null;
  }
  if (session.role !== 'admin') {
    res.status(403).json({ error: 'Nur für Administratoren.' });
    return null;
  }
  return session;
}

module.exports = {
  hashPassword,
  verifyPassword,
  createSession,
  destroySession,
  getSession,
  requireSession,
  requireAdmin,
  SESSION_TTL_SECONDS,
  // Exportiert, damit andere Auth-Implementierungen (z. B. Next.js Route Handlers unter
  // app/api/auth/*, die mit dem Web-Request/Response-API statt Node (req,res) arbeiten und
  // daher eigene Cookie-Helfer brauchen) exakt dasselbe Cookie/Redis-Schema verwenden und
  // Sessions zwischen beiden Implementierungen kompatibel bleiben.
  COOKIE_NAME,
  SESSION_PREFIX,
  LEGACY_SESSION_PREFIX,
  SETUP_LOCK_KEY,
  LEGACY_SETUP_LOCK_KEY,
};
