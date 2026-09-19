import { NextRequest, NextResponse } from 'next/server';
import { COOKIE_NAME, clearSessionCookie, logoutSessionToken } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  try {
    await logoutSessionToken(token);
  } catch (err) {
    console.error('[api/auth/logout]', err);
  }
  const response = NextResponse.json({ ok: true });
  clearSessionCookie(response);
  return response;
}
