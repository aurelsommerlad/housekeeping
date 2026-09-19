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
const { getRedis } = require('../../api/_redis');
const { SESSION_TTL_SECONDS, COOKIE_NAME, SESSION_PREFIX } = require('../../api/_auth');
const { hasAnyAdmin, getUserRawById, verifyLogin, createUser, sanitizeUser } = require('../../api/_users');

const SETUP_LOCK_KEY = 'hk:setup_lock';

export type SanitizedUser = Record<string, unknown> & { id: string; role: string };

type ActionResult<T> = { ok: true } & T;
type ActionError = { ok: false; status: number; error: string };

async function issueSessionToken(user: { id: string; role: string }): Promise<string> {
  const redis = await getRedis();
  const token = randomBytes(32).toString('hex');
  const record = { userId: user.id, role: user.role, createdAt: Date.now() };
  await redis.set(SESSION_PREFIX + token, JSON.stringify(record), { EX: SESSION_TTL_SECONDS });
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
  await redis.del(SESSION_PREFIX + token);
}

export async function getSessionUser(token: string | undefined): Promise<SanitizedUser | null> {
  if (!token) return null;
  const redis = await getRedis();
  const key = SESSION_PREFIX + token;
  const raw = await redis.get(key);
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
