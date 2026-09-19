import { NextResponse } from 'next/server';
import { createFirstAdmin, setSessionCookie } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';

function isValidEmail(email: unknown): email is string {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Registriert den ERSTEN Administrator. Serverseitig atomar gegen Mehrfachausfuehrung
 * abgesichert (siehe lib/server/auth.ts#createFirstAdmin, Redis SET...NX) - ein direkter
 * API-Aufruf kann nach erfolgreicher Ersteinrichtung niemals einen weiteren Admin erzeugen.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: 'Ungueltige Anfrage.' }, { status: 400 });
  }

  const { firstName, lastName, email, password, passwordConfirm } = body;

  if (!firstName || !lastName || !email || !password) {
    return NextResponse.json({ error: 'Bitte alle Felder ausfuellen.' }, { status: 400 });
  }
  if (!isValidEmail(email)) {
    return NextResponse.json({ error: 'Ungueltige E-Mail-Adresse.' }, { status: 400 });
  }
  if (String(password).length < 8) {
    return NextResponse.json(
      { error: 'Das Passwort muss mindestens 8 Zeichen lang sein.' },
      { status: 400 },
    );
  }
  if (password !== passwordConfirm) {
    return NextResponse.json({ error: 'Die Passwoerter stimmen nicht ueberein.' }, { status: 400 });
  }

  try {
    const result = await createFirstAdmin({ firstName, lastName, email, password });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    const response = NextResponse.json({ user: result.user });
    setSessionCookie(response, result.token);
    return response;
  } catch (err) {
    console.error('[api/auth/setup]', err);
    return NextResponse.json({ error: 'Registrierung fehlgeschlagen.' }, { status: 500 });
  }
}
