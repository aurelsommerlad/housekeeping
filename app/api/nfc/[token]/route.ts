import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { COOKIE_NAME, getSessionUser } from '@/lib/server/auth';
import { hasPropertyAccess } from '@/lib/housekeeping/permissions';
import type { StaffUser } from '@/lib/housekeeping/types';

// Wiederverwendung der bestehenden, CommonJS-basierten NFC-/Redis-Helfer (siehe api/_nfc.js) -
// exakt dasselbe Muster wie lib/server/auth.ts fuer api/_redis.js/_auth.js/_users.js: die
// sicherheitsrelevante Logik (Token-Hashing/-Aufloesung) wird NICHT dupliziert.
const { getRedis } = require('../../../../api/_redis');
const { resolveActiveToken } = require('../../../../api/_nfc');

export const dynamic = 'force-dynamic';

/**
 * NFC-Scan-Aufloesung (Briefing "NFC-Scan", Schritte 1-4): Token validieren, Session pruefen,
 * Property-Zugriff pruefen - liefert ausschliesslich propertyCode/unitId/unitName, NIE
 * Gast-/Reservierungsdaten (die laedt der Client danach ganz normal ueber die bestehenden,
 * bereits property-scoped Apaleo-Endpunkte). Schritt 5 (heutige Aufgabe bestimmen) passiert
 * bewusst NICHT hier, sondern im Client mit der bereits vorhandenen buildTasks/resolveTasks-
 * Logik (lib/housekeeping/tasks.ts) - keine zweite, parallele Task-Ableitung.
 *
 * Sicherheit: "ungueltiger Token" und "deaktivierter Token" ergeben dieselbe 404-Antwort, "nicht
 * eingeloggt" 401, "kein Property-Zugriff" 403 OHNE jede Property-/Unit-Angabe im Body - ein
 * fremder Nutzer, der nur die URL kennt, erfaehrt aus keiner dieser Antworten irgendetwas ueber
 * das dahinterliegende Apartment.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    if (!token) {
      return NextResponse.json({ error: 'invalid' }, { status: 404 });
    }

    const redis = await getRedis();
    const record = await resolveActiveToken(redis, token);
    if (!record) {
      return NextResponse.json({ error: 'invalid' }, { status: 404 });
    }

    const sessionToken = request.cookies.get(COOKIE_NAME)?.value;
    const user = await getSessionUser(sessionToken);
    if (!user) {
      return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
    }

    if (!hasPropertyAccess(user as unknown as StaffUser, record.propertyCode)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }

    return NextResponse.json({
      propertyCode: record.propertyCode as string,
      unitId: record.unitId as string,
      unitName: record.unitName as string,
    });
  } catch (err) {
    console.error('[api/nfc/token]', err);
    return NextResponse.json(
      { error: 'Interner Fehler', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
