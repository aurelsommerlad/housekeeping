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
// Briefing "Deaktivieren statt loeschen": Redis-SET pro User mit allen von ihm ausgestellten,
// noch nicht abgelaufenen Session-Tokens - vorher gab es KEINEN Weg, eine bereits ausgestellte
// Session vorzeitig (vor Ablauf der 30 Tage) zu invalidieren (siehe invalidateUserSessions unten).
// Nur AB Einfuehrung dieser Funktion ausgestellte Sessions sind darin enthalten.
const USER_SESSIONS_PREFIX = 'housekeeping:user_sessions:';
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
  // Best-effort: ein fehlschlagendes sAdd darf einen erfolgreichen Login niemals verhindern - es
  // wuerde im schlimmsten Fall nur bedeuten, dass invalidateUserSessions() dieses eine Token bei
  // einer spaeteren Deaktivierung nicht mit-erfasst (dasselbe Restrisiko wie bei sehr alten,
  // bereits vor Einfuehrung dieser Funktion ausgestellten Sessions).
  await redis.sAdd(USER_SESSIONS_PREFIX + user.id, token).catch(() => {});
  setSessionCookie(req, res, token, SESSION_TTL_SECONDS);
  return token;
}

async function destroySession(req, res) {
  const cookies = parseCookies(req);
  const token = cookies[COOKIE_NAME];
  if (token) {
    const redis = await getRedis();
    const raw = await redis.get(SESSION_PREFIX + token).catch(() => null);
    await redis.del(SESSION_PREFIX + token);
    await redis.del(LEGACY_SESSION_PREFIX + token);
    const record = raw ? (() => { try { return JSON.parse(raw); } catch { return null; } })() : null;
    if (record && record.userId) await redis.sRem(USER_SESSIONS_PREFIX + record.userId, token).catch(() => {});
  }
  clearSessionCookie(req, res);
}

// Briefing "Deaktivieren statt loeschen" (Punkt 25): "aktive Sessions invalidieren, soweit
// bestehende Infrastruktur dies unterstuetzt" - invalidiert ALLE ueber USER_SESSIONS_PREFIX
// bekannten, noch aktiven Session-Tokens eines Users sofort (z. B. beim Deaktivieren durch einen
// Admin, siehe api/users.js). Loescht dabei ausschliesslich Session-Keys, NIE den User-Datensatz
// selbst (siehe Kopfkommentar "keine Housekeeping-Daten pauschal loeschen").
async function invalidateUserSessions(userId) {
  if (!userId) return;
  const redis = await getRedis();
  const key = USER_SESSIONS_PREFIX + userId;
  const tokens = await redis.sMembers(key).catch(() => []);
  for (const token of tokens) {
    await redis.del(SESSION_PREFIX + token);
    await redis.del(LEGACY_SESSION_PREFIX + token);
  }
  await redis.del(key);
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

// Guard fuer Admin-only API-Routen. Prueft IMMER die frisch aus Redis geladene role, NIE die im
// Session-Cookie/-Record gecachte (siehe api/_permissions.js-Kopfkommentar) - sonst wirkt eine
// nachtraegliche Rollenaenderung (z. B. Admin -> housekeeper) erst nach einem erneuten Login.
// require('./_users') erfolgt bewusst hier innen statt am Dateikopf: _users.js seinerseits
// benoetigt hashPassword/verifyPassword aus dieser Datei, ein Top-Level-require in beide
// Richtungen wuerde einen zirkulaeren Import erzeugen, bei dem eine der beiden Dateien beim
// Laden ein noch unvollstaendiges exports-Objekt der jeweils anderen erhaelt.
async function requireAdmin(req, res) {
  const session = await getSession(req);
  if (!session) {
    res.status(401).json({ error: 'Nicht angemeldet.' });
    return null;
  }
  const { getRedis } = require('./_redis');
  const { getUserRawById } = require('./_users');
  const redis = await getRedis();
  const user = await getUserRawById(redis, session.userId);
  if (!user || user.role !== 'admin') {
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
  invalidateUserSessions,
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
  USER_SESSIONS_PREFIX,
  SETUP_LOCK_KEY,
  LEGACY_SETUP_LOCK_KEY,
};
