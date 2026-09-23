import 'server-only';
import { randomBytes } from 'crypto';
import { NextResponse } from 'next/server';

/**
 * Next-native Auth-Helfer fuer die Route Handler unter app/api/auth/*.
 *
 * WICHTIG: Next.js Route Handler arbeiten mit dem Web-Standard Request/Response, waehrend die
 * bestehenden Vercel Serverless Functions unter /api/*.js Node's klassisches (req, res)-API
 * verwenden (siehe api/_auth.js). Beide APIs sind nicht kompatibel, deshalb gibt es hier einen
 * eigenen, schlanken Cookie-Adapter.
 *
 * Die eigentliche, sicherheitsrelevante Logik (Redis-Zugriff, bcrypt-Hashing, Session-Schema,
 * Setup-Lock, Rollenprüfung) wird NICHT dupliziert, sondern 1:1 aus den bestehenden
 * api/_redis.js, api/_auth.js und api/_users.js wiederverwendet (per require, da es sich um
 * CommonJS-Module handelt). Das Cookie-Schema (Name, Redis-Key-Praefix, TTL) ist identisch zur
 * alten Implementierung, damit Sessions kompatibel bleiben.
 */
const { getRedis, migrateLegacyKey } = require('../../api/_redis');
const {
  SESSION_TTL_SECONDS, COOKIE_NAME, SESSION_PREFIX, LEGACY_SESSION_PREFIX, USER_SESSIONS_PREFIX, SETUP_LOCK_KEY, LEGACY_SETUP_LOCK_KEY,
} = require('../../api/_auth');
const { hasAnyAdmin, getUserRawById, verifyLogin, createUser, sanitizeUser } = require('../../api/_users');

export type SanitizedUser = Record<string, unknown> & { id: string; role: string };

type ActionResult<T> = { ok: true } & T;
type ActionError = { ok: false; status: number; error: string };

async function issueSessionToken(user: { id: string; role: string }): Promise<string> {
  const redis = await getRedis();
  const token = randomBytes(32).toString('hex');
  const record = { userId: user.id, role: user.role, createdAt: Date.now() };
  await redis.set(SESSION_PREFIX + token, JSON.stringify(record), { EX: SESSION_TTL_SECONDS });
  // Haelt api/_auth.js#invalidateUserSessions (Deaktivierung) synchron mit diesem zweiten
  // Session-Ausstellungspfad - siehe dortiger Kommentar.
  await redis.sAdd(USER_SESSIONS_PREFIX + user.id, token).catch(() => {});
  return token;
}

/** Serverseitiger Wahrheitsquelle: existiert bereits mindestens ein User mit role === 'admin'? */
export async function checkSetupStatus(): Promise<{ needsSetup: boolean }> {
  const redis = await getRedis();
  const hasAdmin = await hasAnyAdmin(redis);
  return { needsSetup: !hasAdmin };
}

export async function createFirstAdmin(input: {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}): Promise<ActionResult<{ user: SanitizedUser; token: string }> | ActionError> {
  const redis = await getRedis();
  await migrateLegacyKey(redis, LEGACY_SETUP_LOCK_KEY, SETUP_LOCK_KEY);

  // Atomare Sperre (SET...NX ist eine einzelne, atomare Redis-Operation) - schliesst
  // Rennbedingungen bei zwei nahezu gleichzeitigen Registrierungs-Requests zuverlaessig aus.
  const acquired = await redis.set(SETUP_LOCK_KEY, String(Date.now()), { NX: true });
  if (!acquired) {
    return { ok: false, status: 409, error: 'Es wurde bereits ein Administrator eingerichtet.' };
  }
  if (await hasAnyAdmin(redis)) {
    return { ok: false, status: 409, error: 'Es wurde bereits ein Administrator eingerichtet.' };
  }

  try {
    const user = await createUser(redis, { ...input, role: 'admin', properties: 'alle' });
    const token = await issueSessionToken(user);
    return { ok: true, user: sanitizeUser(user), token };
  } catch (err) {
    // Lock wieder freigeben, damit ein Eingabefehler (z. B. doppelte E-Mail) die
    // Ersteinrichtung nicht dauerhaft blockiert.
    await redis.del(SETUP_LOCK_KEY);
    const message = err instanceof Error ? err.message : 'Registrierung fehlgeschlagen.';
    return { ok: false, status: 400, error: message };
  }
}

export async function loginUser(
  identifier: string,
  password: string,
  scope?: 'admin',
): Promise<ActionResult<{ user: SanitizedUser; token: string }> | ActionError> {
  const redis = await getRedis();
  const user = await verifyLogin(redis, identifier, password);
  if (!user) {
    return { ok: false, status: 401, error: 'E-Mail/Benutzername oder Passwort falsch.' };
  }
  if (scope === 'admin' && user.role !== 'admin') {
    // Serverseitig durchgesetzt: ein Housekeeping-Konto bekommt hier niemals eine Admin-Session.
    return { ok: false, status: 403, error: 'Kein Zugriff auf den Adminbereich.' };
  }
  const token = await issueSessionToken(user);
  return { ok: true, user: sanitizeUser(user), token };
}

export async function logoutSessionToken(token: string | undefined): Promise<void> {
  if (!token) return;
  const redis = await getRedis();
  const raw = await redis.get(SESSION_PREFIX + token).catch(() => null);
  await redis.del(SESSION_PREFIX + token);
  await redis.del(LEGACY_SESSION_PREFIX + token);
  if (raw) {
    try {
      const record = JSON.parse(raw) as { userId?: string };
      if (record.userId) await redis.sRem(USER_SESSIONS_PREFIX + record.userId, token).catch(() => {});
    } catch { /* leere Session-Daten ignorieren, Cookie ist ohnehin bereits geloescht */ }
  }
}

export async function getSessionUser(token: string | undefined): Promise<SanitizedUser | null> {
  if (!token) return null;
  const redis = await getRedis();
  let key = SESSION_PREFIX + token;
  let raw = await redis.get(key);
  if (!raw) {
    // Fallback auf den alten "hk:session:"-Praefix (siehe api/_auth.js#getSession) - eine noch
    // gueltige Session aus der Zeit vor der Namespace-Migration bleibt dadurch angemeldet und
    // wird beim naechsten Zugriff in den neuen Namespace verschoben.
    const legacyKey = LEGACY_SESSION_PREFIX + token;
    raw = await redis.get(legacyKey);
    if (raw) {
      await redis.rename(legacyKey, key).catch(() => {});
    }
  }
  if (!raw) return null;
  let record: { userId: string };
  try {
    record = JSON.parse(raw);
  } catch {
    return null;
  }
  await redis.expire(key, SESSION_TTL_SECONDS);
  const user = await getUserRawById(redis, record.userId);
  if (!user) return null;
  // Zusaetzliche Absicherung (dieser Pfad laedt ohnehin bereits den vollen User-Datensatz, siehe
  // Kommentar oben): eine Deaktivierung wirkt hier sofort, auch fuer ein Session-Token, das
  // invalidateUserSessions() aus irgendeinem Grund nicht erfasst hat (z. B. vor dessen Einfuehrung
  // ausgestellt).
  if ((user as { active?: boolean }).active === false) return null;
  return sanitizeUser(user);
}

export function setSessionCookie(response: NextResponse, token: string) {
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
}

export { COOKIE_NAME };
