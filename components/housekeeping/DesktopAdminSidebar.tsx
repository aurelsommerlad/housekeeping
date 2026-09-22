'use client';

import { dayOverviewFor } from '@/lib/housekeeping/dayOverview';
import type { HousekeepingApp } from '@/lib/housekeeping/useHousekeepingApp';
import { cn } from '@/lib/cn';

/**
 * Desktop-Admin-Layout (Punkt 11-14), Feinschliff Runde 7 (Punkt 2-5): feste rechte Sidebar -
 * ausschliesslich ab `xl` sichtbar (`hidden xl:flex`), ausschliesslich auf der Aufgabenplanung
 * (`activeNav === 'tasks'`) und ausschliesslich fuer Standortverantwortliche/Team-Leads/Admin
 * (`isManagerHere`) - exakt dieselbe Berechtigungsgrenze wie die bisherige, jetzt hier ersetzte
 * Team-Auslastung in TasksScreen.tsx (`xl:hidden` dort, keine doppelte Teamdarstellung). Team-
 * Daten stammen aus derselben dayOverviewFor()-Funktion wie TasksScreen - keine zweite/abweichende
 * Berechnung, keine neue Datenquelle.
 *
 * Punkt 3 (Feinschliff): die fruehere "HEUTE"-Kennzahlensektion (Reinigungen/Aufgaben/Fertig) ist
 * entfernt - dieselben Zahlen stehen bereits prominent in der Kennzahlenzeile des Hauptbereichs
 * (siehe TasksScreen.tsx#SummaryStat), eine zweite Anzeige hier waere reine Duplikation. Die
 * Sidebar beginnt jetzt direkt mit "TEAM".
 *
 * Punkt 4: die Ueberschrift "TEAM" selbst ist fuer Admin der Link in die bestehende Teamansicht
 * (setActiveNav('team'), keine neue Navigationslogik) statt eines zusaetzlichen, das Wort
 * doppelnden "Team"-Buttons daneben.
 *
 * Punkt 5: kein "OPERATIONS"-Platzhalter mehr - der Operations Monitor existiert in dieser
 * Codebasis noch nicht, ein dauerhaft sichtbares "Noch nicht verfuegbar" waere ein unfertig
 * wirkender UI-Zustand ohne echten Wert. Sobald ein echter Operations Monitor existiert, gehoert
 * hier eine neue Sektion hin, die dessen tatsaechlichen Zustand zeigt (nie erfundene Findings).
 */
export function DesktopAdminSidebar({ app }: { app: HousekeepingApp }) {
  const { state, t, setActiveNav, shortStaffName } = app;
  if (state.activeNav !== 'tasks') return null;

  const { isManagerHere, isAdmin, capacity } = dayOverviewFor(app);
  if (!isManagerHere) return null;

  return (
    <aside className="hidden xl:flex xl:w-72 xl:shrink-0 xl:flex-col xl:gap-5 xl:overflow-y-auto xl:border-l xl:border-line xl:bg-warm-white xl:px-5 xl:py-5 xl:[grid-column:3] xl:[grid-row:3]">
      <section>
        {isAdmin ? (
          <button
            type="button"
            onClick={() => setActiveNav('team')}
            className="text-[11px] font-semibold uppercase tracking-wide text-muted transition-colors hover:text-ink"
          >
            {t('capacity_title_short')}
          </button>
        ) : (
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{t('capacity_title_short')}</p>
        )}
        {capacity.length === 0 ? (
          <p className="mt-2.5 text-[13px] text-muted">{t('team_no_members')}</p>
        ) : (
          <div className="mt-2.5 flex flex-col gap-1.5">
            {capacity.map((entry) => (
              <div key={entry.housekeeperId || 'unassigned'} className="flex items-center justify-between text-[13px]">
                <span className={cn('truncate', entry.housekeeperId ? 'text-ink' : 'text-muted')}>
                  {entry.housekeeperId ? shortStaffName(entry.housekeeperName) : t('unassigned')}
                </span>
                <span className="shrink-0 tabular-nums text-muted">{entry.count}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </aside>
  );
}
