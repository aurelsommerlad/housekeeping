'use client';

import { useEffect, useState } from 'react';
import { useHousekeepingApp } from '@/lib/housekeeping/useHousekeepingApp';
import { isElevatedHousekeepingUser } from '@/lib/housekeeping/permissions';
import { StaffHeader } from '@/components/housekeeping/StaffHeader';
import { PropertyChips } from '@/components/housekeeping/PropertyChips';
import { StaffNavBar } from '@/components/housekeeping/StaffNavBar';
import { DesktopNavRail } from '@/components/housekeeping/DesktopNavRail';
import { DesktopAdminSidebar } from '@/components/housekeeping/DesktopAdminSidebar';
import { TasksScreen } from '@/components/housekeeping/TasksScreen';
import { RoomsScreen } from '@/components/housekeeping/RoomsScreen';
import { StatsScreen } from '@/components/housekeeping/StatsScreen';
import { TeamScreen } from '@/components/housekeeping/TeamScreen';
import { SettingsScreen } from '@/components/housekeeping/SettingsScreen';
import { RoomDetailSheet } from '@/components/housekeeping/RoomDetailSheet';
import { SettingsSheet } from '@/components/housekeeping/SettingsSheet';
import { ReservationSearchSheet } from '@/components/housekeeping/ReservationSearchSheet';
import { ReportIncidentSheet } from '@/components/housekeeping/ReportIncidentSheet';
import { ReportConsumableSheet } from '@/components/housekeeping/ReportConsumableSheet';
import { ReportMenuSheet } from '@/components/housekeeping/ReportMenuSheet';
import { LinenCompletionSheet } from '@/components/housekeeping/LinenCompletionSheet';
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
    // Desktop-Admin-Layout (>= 1280px, Punkt 1-2): unterhalb `xl` bleibt dies exakt der bisherige
    // `flex flex-col`-Stapel (Header/PropertyChips/main/StaffNavBar untereinander, unveraendert).
    // Ab `xl` wird derselbe Satz direkter Geschwister-Elemente stattdessen zu einem CSS-Grid mit
    // drei Spalten (Navigation/Hauptbereich/Sidebar) und drei Zeilen (Header/PropertyChips/Body) -
    // jedes Element bekommt seine Platzierung ueber eine eigene `xl:[grid-column/row:...]`-Klasse
    // direkt an seiner bestehenden Stelle (siehe StaffHeader.tsx/PropertyChips.tsx), keine neuen
    // Wrapper noetig, die das mobile Flex-Sizing von `<main>` beeinflussen koennten. Eine leere
    // Spalte/Zeile (kein Standortverantwortlicher -> keine Sidebar; keine 'rooms'-Ansicht -> keine
    // PropertyChips) kollabiert automatisch auf 0, `minmax(0,1fr)` fuer den Hauptbereich fuellt den
    // frei werdenden Platz. `xl:max-w-[1800px] xl:mx-auto` verhindert das "endlose Auseinander-
    // ziehen" auf sehr breiten Monitoren (Punkt 18: 1920/2560).
    <div className="flex min-h-dvh flex-col bg-page xl:mx-auto xl:grid xl:h-dvh xl:max-w-[1800px] xl:grid-cols-[auto_minmax(0,1fr)_auto] xl:grid-rows-[auto_auto_1fr] xl:overflow-hidden">
      <DesktopNavRail app={app} />
      <StaffHeader app={app} onOpenSettings={() => setSettingsOpen(true)} onOpenSearch={() => setSearchOpen(true)} />
      {state.activeNav === 'rooms' ? <PropertyChips app={app} /> : null}

      <main className="flex-1 overflow-y-auto pb-4 xl:[grid-column:2] xl:[grid-row:3] xl:min-h-0">
        {state.activeNav === 'tasks' ? <TasksScreen app={app} /> : null}
        {state.activeNav === 'rooms' ? (
          !state.activeProperty ? (
            <div className="px-4 py-10 text-center text-sm text-muted">{app.t('select_property')}</div>
          ) : (
            <RoomsScreen app={app} />
          )
        ) : null}
        {/* Punkt 5: Statistik-Route serverseitig zusaetzlich abgesichert (api/completions.js) -
         * dieser Guard verhindert zusaetzlich, dass ein Nicht-Admin den Screen ueberhaupt clientseitig
         * sieht, falls activeNav jemals ausserhalb der (bereits auf Admin beschraenkten) NavBar
         * gesetzt wird, analog zum bestehenden Guard fuer 'settings' unten. */}
        {state.activeNav === 'stats' && state.user?.role === 'admin' ? <StatsScreen app={app} /> : null}
        {state.activeNav === 'team' ? <TeamScreen app={app} /> : null}
        {state.activeNav === 'settings' && isElevatedHousekeepingUser(state.user, state.properties.map((p) => p.code)) ? (
          <SettingsScreen app={app} />
        ) : null}
      </main>

      {/* Desktop-Admin-Layout Punkt 11 (nur xl, nur activeNav==='tasks', siehe
       * DesktopAdminSidebar.tsx fuer die Berechtigungspruefung) - ersetzt auf Desktop die
       * bisherige, jetzt dort `xl:hidden` geschaltete Team-Auslastung im Hauptbereich. */}
      <DesktopAdminSidebar app={app} />

      <StaffNavBar app={app} />
      <RoomDetailSheet app={app} room={detailRoom} />
      <SettingsSheet app={app} open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <ReservationSearchSheet app={app} open={searchOpen} onClose={() => setSearchOpen(false)} />
      {state.incidentSheetOpen ? <ReportIncidentSheet app={app} /> : null}
      {state.consumableReportOpen ? <ReportConsumableSheet app={app} /> : null}
      {state.linenCompletionTaskId ? <LinenCompletionSheet app={app} /> : null}
      <ReportMenuSheet app={app} />
      <Toast message={state.toast} />
    </div>
  );
}
