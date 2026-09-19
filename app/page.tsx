'use client';

import { useEffect } from 'react';
import { useHousekeepingApp } from '@/lib/housekeeping/useHousekeepingApp';
import { StaffHeader } from '@/components/housekeeping/StaffHeader';
import { PropertyChips } from '@/components/housekeeping/PropertyChips';
import { StaffNavBar } from '@/components/housekeeping/StaffNavBar';
import { RoomsScreen } from '@/components/housekeeping/RoomsScreen';
import { DoubleupScreen } from '@/components/housekeeping/DoubleupScreen';
import { StatsScreen } from '@/components/housekeeping/StatsScreen';
import { RulesScreen } from '@/components/housekeeping/RulesScreen';
import { TeamScreen } from '@/components/housekeeping/TeamScreen';
import { RoomDetailSheet } from '@/components/housekeeping/RoomDetailSheet';
import { LoginScreen } from '@/components/housekeeping/LoginScreen';
import { Toast } from '@/components/housekeeping/Toast';

/**
 * Der echte, funktionierende Housekeeping-Betrieb (ersetzt den fruehen Beispieldaten-Prototyp) -
 * dieselbe Business-Logik wie zuvor in app.js (Apaleo-Fetching, Zwangsreinigung, Zuweisung,
 * Timer, Redis-Calls ueber die bestehenden /api/*.js-Routen), nur die Darstellung ist neu.
 */
export default function HousekeepingPage() {
  const app = useHousekeepingApp();
  const { state } = app;

  // PWA/Offline-Verhalten nur fuer den operativen Housekeeping-Bereich (wie zuvor bei
  // APP_MODE === 'staff' in app.js) - der Adminbereich unter /admin registriert bewusst
  // keinen Service Worker.
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    });
  }, []);

  if (state.authScreen === 'checking') {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-page text-sm text-muted">
        {app.t('checking')}
      </div>
    );
  }

  if (state.authScreen === 'login') {
    return <LoginScreen app={app} />;
  }

  const detailRoom = state.detailRoomKey ? app.rooms().find((r) => r.key === state.detailRoomKey) || null : null;

  return (
    <div className="flex min-h-dvh flex-col bg-page">
      <StaffHeader app={app} />
      <PropertyChips app={app} />

      <main className="flex-1 overflow-y-auto pb-4">
        {!state.activeProperty ? (
          <div className="px-4 py-10 text-center text-sm text-muted">{app.t('select_property')}</div>
        ) : (
          <>
            {state.activeNav === 'rooms' ? <RoomsScreen app={app} /> : null}
            {state.activeNav === 'doubleup' ? <DoubleupScreen app={app} /> : null}
            {state.activeNav === 'stats' ? <StatsScreen app={app} /> : null}
            {state.activeNav === 'rules' ? <RulesScreen app={app} /> : null}
            {state.activeNav === 'team' ? <TeamScreen app={app} /> : null}
          </>
        )}
      </main>

      <StaffNavBar app={app} />
      <RoomDetailSheet app={app} room={detailRoom} />
      <Toast message={state.toast} />
    </div>
  );
}
