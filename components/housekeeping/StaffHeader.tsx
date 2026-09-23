'use client';

import type { HousekeepingApp } from '@/lib/housekeeping/useHousekeepingApp';
import { IconPause, IconPlay, IconSearch, IconUser } from '@/components/ui/icons';

// Korrektur (UX-Feinschliff Runde 4): der linke "Pause von der Arbeit"-Button (toggleBreak/
// onBreak) ist aus dem Header entfernt, weil er neben dem kontextabhaengigen Reinigungs-Pause-
// Hinweis rechts als zweites, verwechselbares "Pause"-Element wirkte - im Header bleibt
// ausschliesslich der kontextabhaengige CleaningPauseButton. Die zugrunde liegende Pause-von-
// der-Arbeit-Logik (state.onBreak/toggleBreak, breaksApi) selbst wird NICHT geloescht/neu gebaut,
// nur ihr Aufruf hier im Header entfernt.

/**
 * Kontextabhaengiger Reinigungsstatus rechts oben: existiert NUR, wenn app.activeCleaningTask()
 * fuer den eingeloggten Nutzer tatsaechlich eine laufende/pausierte Reinigung liefert - sonst
 * null (offene/zugewiesene/abgeschlossene Reinigungen und jede manuelle Aufgabe zeigen also
 * nichts). Kompakte Labels ("Pause"/"Fortsetzen" statt ganzer Saetze), damit der Header schmal
 * bleibt; Antippen pausiert/setzt GENAU diese eine Reinigung fort - keine zweite, parallele
 * Timer-Implementierung, sondern dieselben startTaskTimer/pauseTaskTimer-Aktionen wie im
 * TaskDetailSheet.
 */
function CleaningPauseButton({ app }: { app: HousekeepingApp }) {
  const { t, activeCleaningTask, startTaskTimer, pauseTaskTimer } = app;
  const task = activeCleaningTask();
  if (!task) return null;

  if (task.status === 'paused') {
    return (
      <button
        type="button"
        onClick={() => startTaskTimer(task.id)}
        className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line bg-warm-white px-3 text-[12px] font-medium text-muted transition-colors"
      >
        <IconPlay width={13} height={13} aria-hidden="true" />
        {t('header_cleaning_resume')}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => pauseTaskTimer(task.id)}
      className="inline-flex h-8 items-center gap-1.5 rounded-full border border-status-progress/30 bg-status-progress-bg px-3 text-[12px] font-medium text-status-progress transition-colors"
    >
      <IconPause width={13} height={13} aria-hidden="true" />
      {t('header_cleaning_pause')}
    </button>
  );
}

const LOCALES: Record<string, string> = { de: 'de-DE', en: 'en-GB', pl: 'pl-PL', ro: 'ro-RO' };

export interface StaffHeaderProps {
  app: HousekeepingApp;
  onOpenSettings: () => void;
  onOpenSearch: () => void;
}

/**
 * Kompakter Header (Refactoring "oberer Bereich"): zeigt die App-Bezeichnung statt der einzelnen
 * aktiven Property (die ergibt an dieser Stelle keinen Sinn mehr, sobald direkt darunter ein
 * eigener Standortfilter folgt - siehe TasksScreen) - der Standort wird ausschliesslich ueber
 * diesen Filter dargestellt. Sprachauswahl lebt jetzt ausschliesslich im Profilmenue
 * (SettingsSheet, ueber den Profil-Button hier), nicht mehr dauerhaft im Header - reine
 * Verlagerung, die Mehrsprachigkeit selbst ist unveraendert. Bewusst zwei schmale Zeilen statt
 * einer grossen, um auf dem Smartphone moeglichst viel Platz fuer den eigentlichen Inhalt
 * (Aufgabenliste) zu lassen - das ist das primaere Ziel dieses Refactorings.
 */
export function StaffHeader({ app, onOpenSettings, onOpenSearch }: StaffHeaderProps) {
  const { state, t } = app;
  const dateLabel = new Intl.DateTimeFormat(LOCALES[state.lang] || 'de-DE', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  }).format(new Date());
  // Briefing "Housekeeping-Dashboard anpassen" Punkt 1: tageszeitabhaengige Begruessung mit
  // Vornamen statt vollem Namen + Datum in einer Zeile - bewusst weiterhin nur zwei kompakte
  // Zeilen, damit der Bereich insgesamt nur wenig hoeher wird als zuvor.
  const hour = new Date().getHours();
  const greetingKey = hour < 12 ? 'greeting_morning' : hour < 18 ? 'greeting_afternoon' : 'greeting_evening';
  const firstName = state.user?.firstName || state.user?.name?.trim().split(/\s+/)[0] || '';

  return (
    // Desktop-Admin-Layout (>= 1280px): der fruehere eigene xl:mx-auto/max-w-Wrapper ist entfallen
    // (Breite/Zentrierung kommt jetzt einmalig vom Grid in app/page.tsx) - Feinschliff Runde 7
    // (Punkt 8): der Header spannt jetzt `xl:[grid-column:2/4]` (Hauptbereich UND Sidebar-Spalte),
    // damit er ueber die gesamte Breite rechts vom Nav-Rail sichtbar bleibt, waehrend die Sidebar
    // selbst erst ab Zeile 3 beginnt (siehe DesktopAdminSidebar.tsx) - so starten Sidebar und
    // Hauptinhalt auf derselben Zeile/Achse. Reine Platzierung, an Inhalt/Klassen des Headers
    // selbst aendert sich nichts.
    <header className="shrink-0 border-b border-line bg-warm-white pt-[max(env(safe-area-inset-top),0.5rem)] pl-[max(env(safe-area-inset-left),1rem)] pr-[max(env(safe-area-inset-right),1rem)] xl:[grid-column:2/4] xl:[grid-row:1]">
      <div className="flex items-center justify-between gap-2 py-2">
        <div className="min-w-0 leading-none">
          {/* Dieselbe Marken-Typografie wie auf Login-/Admin-Einrichtungsseite (siehe
           * LoginScreen.tsx/app/admin/page.tsx): "UNIQUE PLACES" kraeftig/dunkel als eigentlicher
           * Markenname, der Bereichsname darunter klein/tracked/grossgeschrieben als Unterzeile -
           * statt umgekehrt (vorher war "UNIQUE PLACES" die kleine Zeile). */}
          <p className="brand-wordmark truncate font-sans text-sm font-semibold tracking-[0.05em] text-ink">UNIQUE PLACES</p>
          <p className="mt-0.5 truncate text-[10px] font-medium uppercase tracking-[0.18em] text-muted">{t('app_name')}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <CleaningPauseButton app={app} />
          {state.user?.role === 'admin' ? (
            <>
              {/* Mobile/Tablet (unveraendert bis < xl): exakt das bestehende Such-Icon - per
               * `xl:hidden` NUR ab 1280px ausgeblendet, darunter unveraendert sichtbar/funktional. */}
              <button
                type="button"
                aria-label={t('search_aria_label')}
                onClick={onOpenSearch}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-line text-muted transition-colors hover:text-ink xl:hidden"
              >
                <IconSearch width={16} height={16} />
              </button>
              {/* Desktop (Punkt 3): kompaktes, wie ein Suchfeld aussehendes Element statt des
               * Icons - oeffnet dieselbe, bestehende Reservierungssuche (ReservationSearchSheet
               * via onOpenSearch), keine eigene/zweite Such-Implementierung. */}
              <button
                type="button"
                onClick={onOpenSearch}
                className="hidden h-9 w-72 items-center gap-2 rounded-full border border-line bg-warm-white px-3.5 text-[13px] text-muted transition-colors hover:text-ink xl:flex"
              >
                <IconSearch width={15} height={15} className="shrink-0" aria-hidden="true" />
                <span className="truncate">{t('search_desktop_placeholder')}</span>
              </button>
            </>
          ) : null}
          <button
            type="button"
            aria-label={t('profile_title')}
            onClick={onOpenSettings}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-line text-muted transition-colors hover:text-ink"
          >
            <IconUser width={17} height={17} />
          </button>
        </div>
      </div>
      <div className="truncate pb-2 leading-tight">
        <p className="truncate text-[15px] font-semibold text-ink">
          {t(greetingKey)}
          {firstName ? `, ${firstName}` : ''}
        </p>
        <p className="truncate text-[12px] text-muted">{dateLabel}</p>
      </div>
    </header>
  );
}
