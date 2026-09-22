'use client';

import { dayOverviewFor } from '@/lib/housekeeping/dayOverview';
import { dayHeadingLabel } from '@/lib/housekeeping/dayLabel';
import { countLabel } from '@/lib/housekeeping/pluralLabel';
import type { HousekeepingApp } from '@/lib/housekeeping/useHousekeepingApp';
import { IconCheck, IconSparkles, IconTask } from '@/components/ui/icons';
import { cn } from '@/lib/cn';

/**
 * Desktop-Admin-Layout (Punkt 11-14): feste rechte Sidebar - ausschliesslich ab `xl` sichtbar
 * (`hidden xl:flex`), ausschliesslich auf der Aufgabenplanung (`activeNav === 'tasks'`, siehe
 * app/page.tsx-Kommentar dazu) und ausschliesslich fuer Standortverantwortliche/Team-Leads/Admin
 * (`isManagerHere`) - exakt dieselbe Berechtigungsgrenze wie die bisherige, jetzt hier ersetzte
 * Team-Auslastung in TasksScreen.tsx (Punkt 14: keine doppelte Teamdarstellung, siehe dortiges
 * `xl:hidden`). Kennzahlen/Team stammen aus derselben dayOverviewFor()-Funktion wie TasksScreen -
 * keine zweite/abweichende Berechnung, keine neue Datenquelle. "TEAM" ist fuer Admin ein Link in
 * die bestehende Teamansicht (setActiveNav('team'), keine neue Navigationslogik). Der
 * "OPERATIONS"-Bereich (nur Admin, Punkt 12) ist ein bewusst leerer, ehrlicher Slot: der
 * Operations Monitor selbst existiert in dieser Codebasis noch nicht, es werden also keine
 * erfundenen Findings angezeigt.
 */
export function DesktopAdminSidebar({ app }: { app: HousekeepingApp }) {
  const { state, t, setActiveNav, shortStaffName } = app;
  if (state.activeNav !== 'tasks') return null;

  const { date, cleaningTasks, openManualTasks, doneTasks, isManagerHere, isAdmin, capacity } = dayOverviewFor(app);
  if (!isManagerHere) return null;

  const heading = date ? dayHeadingLabel(t, state.lang, date, state.planningDays) : '';

  return (
    <aside className="hidden xl:flex xl:w-80 xl:shrink-0 xl:flex-col xl:gap-5 xl:overflow-y-auto xl:border-l xl:border-line xl:bg-warm-white xl:px-5 xl:py-5 xl:[grid-column:3] xl:[grid-row:1/-1]">
      <section>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{heading}</p>
        <div className="mt-2.5 flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5 text-[13px] text-ink">
            <IconSparkles width={14} height={14} className="shrink-0 text-type-turnover" aria-hidden="true" />
            {countLabel(t, cleaningTasks.length, 'noun_cleaning_one', 'noun_cleaning_many')}
          </div>
          <div className="flex items-center gap-1.5 text-[13px] text-ink">
            <IconTask width={14} height={14} className="shrink-0 text-type-departure" aria-hidden="true" />
            {countLabel(t, openManualTasks.length, 'noun_task_one', 'noun_task_many')}
          </div>
          <div className="flex items-center gap-1.5 text-[13px] text-ink">
            <IconCheck width={14} height={14} className="shrink-0 text-status-clean" aria-hidden="true" />
            {doneTasks.length} {t('section_done_suffix')}
          </div>
        </div>
      </section>

      <section className="border-t border-line pt-4">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{t('capacity_title_short')}</p>
          {isAdmin ? (
            <button
              type="button"
              onClick={() => setActiveNav('team')}
              className="text-[11px] font-medium text-muted transition-colors hover:text-ink"
            >
              {t('nav_team')}
            </button>
          ) : null}
        </div>
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

      {isAdmin ? (
        <section className="border-t border-line pt-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{t('operations_title')}</p>
          {/* Punkt 12: Operations Monitor ist in dieser Codebasis noch nicht implementiert - bewusst
           * kein erfundener Findings-/"Alles im Plan"-Text, nur ein ehrlicher Platzhalter. */}
          <p className="mt-2.5 text-[13px] text-muted">{t('operations_not_available')}</p>
        </section>
      ) : null}
    </aside>
  );
}
