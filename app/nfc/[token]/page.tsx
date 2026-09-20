'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useHousekeepingApp } from '@/lib/housekeeping/useHousekeepingApp';
import { NfcResolveError, resolveNfcToken, type NfcResolveResult } from '@/lib/housekeeping/api';
import { LoginScreen } from '@/components/housekeeping/LoginScreen';
import { NfcTaskScreen } from '@/components/housekeeping/NfcTaskScreen';

type ResolveState =
  | { status: 'pending' }
  | { status: 'ok'; data: NfcResolveResult }
  | { status: 'error'; code: 'invalid' | 'forbidden' };

/**
 * NFC-Scan-Einstieg (Briefing "NFC-Scan") - EINE Seite fuer beide Faelle (nicht eingeloggt /
 * eingeloggt), damit ein Nutzer den Tag nach dem Login NICHT erneut scannen muss: dieselbe
 * useHousekeepingApp()-Instanz rendert bei fehlender Session zunaechst ganz normal den
 * LoginScreen und danach - ohne Redirect, ohne zwischengespeicherten "Rueckkehr"-Zustand -
 * direkt die aufgeloeste NFC-Aufgabe, weil die Token-Aufloesung erst NACH einer bestehenden
 * Session ueberhaupt versucht wird.
 *
 * Token-Aufloesung + Property-Zugriffspruefung laufen serverseitig in
 * app/api/nfc/[token]/route.ts - diese Seite bekommt bei Erfolg nur propertyCode/unitId/unitName
 * zurueck, nie Gast- oder Reservierungsdaten direkt aus dem Token.
 */
export default function NfcScanPage() {
  const app = useHousekeepingApp();
  const { state, t } = app;
  const params = useParams<{ token: string }>();
  const token = typeof params.token === 'string' ? params.token : '';

  const [resolveState, setResolveState] = useState<ResolveState>({ status: 'pending' });

  useEffect(() => {
    if (state.authScreen !== 'app' || !token) return;
    let cancelled = false;
    resolveNfcToken(token)
      .then((data) => {
        if (!cancelled) setResolveState({ status: 'ok', data });
      })
      .catch((err) => {
        if (cancelled) return;
        const code = err instanceof NfcResolveError && err.code === 'forbidden' ? 'forbidden' : 'invalid';
        setResolveState({ status: 'error', code });
      });
    return () => {
      cancelled = true;
    };
  }, [state.authScreen, token]);

  if (state.authScreen === 'checking') {
    return <div className="flex min-h-dvh items-center justify-center bg-page text-sm text-muted">{t('checking')}</div>;
  }

  if (state.authScreen === 'login') {
    return <LoginScreen app={app} />;
  }

  if (resolveState.status === 'pending') {
    return <div className="flex min-h-dvh items-center justify-center bg-page text-sm text-muted">{t('loading')}</div>;
  }

  if (resolveState.status === 'error') {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-page px-6 text-center">
        <p className="text-sm text-muted">{resolveState.code === 'forbidden' ? t('nfc_no_access') : t('nfc_invalid_token')}</p>
        <Link href="/" className="text-[13px] font-medium text-ink hover:text-sage">{t('nfc_back_to_app')}</Link>
      </div>
    );
  }

  return <NfcTaskScreen app={app} target={resolveState.data} />;
}
