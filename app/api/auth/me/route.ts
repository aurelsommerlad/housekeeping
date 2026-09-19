import { NextRequest, NextResponse } from 'next/server';
import { COOKIE_NAME, getSessionUser } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get(COOKIE_NAME)?.value;
    const user = await getSessionUser(token);
    if (!user) {
      return NextResponse.json({ authenticated: false, user: null });
    }
    return NextResponse.json({ authenticated: true, user });
  } catch (err) {
    console.error('[api/auth/me]', err);
    return NextResponse.json(
      { error: 'Session konnte nicht geprueft werden.', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
