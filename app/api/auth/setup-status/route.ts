import { NextResponse } from 'next/server';
import { checkSetupStatus } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';

/**
 * Serverseitige Wahrheitsquelle fuer die Ersteinrichtung: liefert AUSSCHLIESSLICH
 * { needsSetup: boolean } - niemals Benutzer-, Passwort- oder sonstige sensible Daten.
 * `needsSetup` ist ausschliesslich davon abhaengig, ob ein User mit role === 'admin'
 * existiert - Seed-/Demo-/Housekeeping-User zaehlen nicht (siehe api/_users.js#hasAnyAdmin).
 */
export async function GET() {
  try {
    const { needsSetup } = await checkSetupStatus();
    return NextResponse.json({ needsSetup });
  } catch (err) {
    console.error('[api/auth/setup-status]', err);
    return NextResponse.json(
      { error: 'Der Setup-Status konnte nicht ermittelt werden.' },
      { status: 500 },
    );
  }
}
