import { NextResponse } from 'next/server';
import { loginUser, setSessionCookie } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';

/**
 * Login per E-Mail/Benutzername + Passwort. Mit `scope: "admin"` wird serverseitig
 * durchgesetzt, dass nur ein Konto mit role === 'admin' eine Session bekommt - ein
 * Housekeeping-Konto erhaelt hier unter keinen Umstaenden Zugriff auf /admin.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: 'Ungueltige Anfrage.' }, { status: 400 });
  }

  const { identifier, password, scope } = body;
  if (!identifier || !password) {
    return NextResponse.json({ error: 'Bitte Zugangsdaten eingeben.' }, { status: 400 });
  }

  try {
    const result = await loginUser(identifier, password, scope === 'admin' ? 'admin' : undefined);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    const response = NextResponse.json({ user: result.user });
    setSessionCookie(response, result.token);
    return response;
  } catch (err) {
    console.error('[api/auth/login]', err);
    return NextResponse.json(
      { error: 'Anmeldung fehlgeschlagen.', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
