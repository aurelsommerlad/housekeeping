'use client';

import { useEffect, useState } from 'react';
import { useHousekeepingApp } from '@/lib/housekeeping/useHousekeepingApp';
import { isElevatedHousekeepingUser } from '@/lib/housekeeping/permissions';
import { StaffHeader } from '@/components/housekeeping/StaffHeader';
import { PropertyChips } from '@/components/housekeeping/PropertyChips';
import { StaffNavBar } from '@/components/housekeeping/StaffNavBar';
import { TasksScreen } from '@/components/housekeeping/TasksScreen';
import { RoomsScreen } from '@/components/housekeeping/RoomsScreen';
import { StatsScreen } from '@/components/housekeeping/StatsScreen';
import { TeamScreen } from '@/components/housekeeping/TeamScreen';
import { SettingsScreen } from '@/components/housekeeping/SettingsScreen';
import { RoomDetailSheet } from '@/components/housekeeping/RoomDetailSheet';
import { SettingsSheet } from '@/components/housekeeping/SettingsSheet';
import { ReservationSearchSheet } from '@/components/housekeeping/ReservationSearchSheet';
import { ReportIncidentSheet } from '@/components/housekeeping/ReportIncidentSheet';
import { LoginScreen } from '@/components/housekeeping/LoginScreen';
import { Toast } from '@/components/housekeeping/Toast';

/**
 * Der echte, funktionierende Housekeeping-Betrieb (ersetzt den fruehen Beispieldaten-Prototyp) -
 * dieselbe Business-Logik wie zuvor in app.js (Apaleo-Fetching, Zwangsreinigung, Zuweisung,
 * Timer, Redis-Calls ueber die bestehenden /api/*.js-Routen), nur die Darstellung ist neu.
 *
 * Primaerer Screen ist jetzt "Aufgaben" (TasksScreen, Reinigungsplanung Heute+3) statt der
 * fruehen Zimmerliste (jetzt sekundaer als "Apartments" unter demselben NavId 'rooms'
 * erreichbar, siehe StaffNavBar) - PropertyChips (Einzel-Property-Auswahl fuer die
 * Apartments-Ansicht) wird deshalb nur noch dort gebraucht.
 */
export default function HousekeepingPage() {
  const app = useHousekeepingApp();
  const { state } = app;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

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
      <StaffHeader app={app} onOpenSettings={() => setSettingsOpen(true)} onOpenSearch={() => setSearchOpen(true)} />
      {state.activeNav === 'rooms' ? <PropertyChips app={app} /> : null}

      <main className="flex-1 overflow-y-auto pb-4">
        {state.activeNav === 'tasks' ? <TasksScreen app={app} /> : null}
        {state.activeNav === 'rooms' ? (
          !state.activeProperty ? (
            <div className="px-4 py-10 text-center text-sm text-muted">{app.t('select_property')}</div>
          ) : (
            <RoomsScreen app={app} />
          )
        ) : null}
        {state.activeNav === 'stats' ? <StatsScreen app={app} /> : null}
        {state.activeNav === 'team' ? <TeamScreen app={app} /> : null}
        {state.activeNav === 'settings' && isElevatedHousekeepingUser(state.user, state.properties.map((p) => p.code)) ? (
          <SettingsScreen app={app} />
        ) : null}
      </main>

      <StaffNavBar app={app} />
      <RoomDetailSheet app={app} room={detailRoom} />
      <SettingsSheet app={app} open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <ReservationSearchSheet app={app} open={searchOpen} onClose={() => setSearchOpen(false)} />
      {state.incidentSheetOpen ? <ReportIncidentSheet app={app} /> : null}
      <Toast message={state.toast} />
    </div>
  );
}
