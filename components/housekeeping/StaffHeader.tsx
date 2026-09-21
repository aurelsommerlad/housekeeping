'use client';

import type { HousekeepingApp } from '@/lib/housekeeping/useHousekeepingApp';
import { IconPause, IconPlay, IconSearch, IconUser } from '@/components/ui/icons';
import { cn } from '@/lib/cn';

// Punkt 1 (UX-Feinschliff-Anpassungen): der globale "Pause"-Button fuer eine aktive Reinigung
// (frueher hier als CleaningPauseButton) wurde VOLLSTAENDIG entfernt, nicht nur ausgeblendet -
// Pause/Fortsetzen gehoert ausschliesslich zur jeweils gestarteten Reinigung und wird
// ausschliesslich in deren Detailansicht gesteuert (siehe TaskDetailSheet.tsx#PrimaryAction,
// unveraendert: pause_clean/resume_clean nutzen weiterhin dieselben pauseTaskTimer/
// startTaskTimer-Aktionen). Damit ist auch app.activeCleaningTask() (nur von dieser Komponente
// genutzt) entfallen. Der davon komplett unabhaengige "Pause von der Arbeit"-Button
// (toggleBreak/onBreak) bleibt unveraendert bestehen.

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
  const { state, t, toggleBreak } = app;
  const dateLabel = new Intl.DateTimeFormat(LOCALES[state.lang] || 'de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: 'long',
  }).format(new Date());

  return (
    <header className="shrink-0 border-b border-line bg-warm-white pt-[max(env(safe-area-inset-top),0.5rem)] pl-[max(env(safe-area-inset-left),1rem)] pr-[max(env(safe-area-inset-right),1rem)]">
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
          {state.user?.role !== 'admin' ? (
            <button
              type="button"
              onClick={toggleBreak}
              aria-label={state.onBreak ? t('break_end') : t('break_start')}
              className={cn(
                'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12px] font-medium transition-colors',
                state.onBreak ? 'border-status-attention/30 bg-status-attention-bg text-status-attention' : 'border-line bg-warm-white text-muted',
              )}
            >
              {/* Punkt 5: Zustand nie nur ueber Farbe - waehrend der Pause zeigt ein Play- statt
               * Pause-Icon an, dass ein Klick die Pause beendet/die Arbeit fortsetzt (dieselbe
               * Play/Pause-Sprache wie beim Reinigungs-Arbeitsstatus auf der Task Card). */}
              {state.onBreak ? <IconPlay width={13} height={13} aria-hidden="true" /> : <IconPause width={13} height={13} aria-hidden="true" />}
              {state.onBreak ? t('on_break') : t('break_toggle_label')}
            </button>
          ) : null}
          {state.user?.role === 'admin' ? (
            <button
              type="button"
              aria-label={t('search_aria_label')}
              onClick={onOpenSearch}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-line text-muted transition-colors hover:text-ink"
            >
              <IconSearch width={16} height={16} />
            </button>
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
      <p className="truncate pb-2 text-[12px] text-muted">
        {state.user?.name} · {dateLabel}
      </p>
    </header>
  );
}
