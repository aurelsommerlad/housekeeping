'use client';

import { useState } from 'react';
import type { HousekeepingApp } from '@/lib/housekeeping/useHousekeepingApp';
import type { StaffUser } from '@/lib/housekeeping/types';
import { allowedProperties } from '@/lib/housekeeping/rooms';
import { getPropertyDisplayName } from '@/lib/housekeeping/api';
import { isPropertyManager, managedPropertyCodes } from '@/lib/housekeeping/permissions';
import { TaskCard } from './TaskCard';
import { TaskDetailSheet } from './TaskDetailSheet';
import { ManualTaskFormSheet } from './ManualTaskFormSheet';
import { MultiSelectBar } from './MultiSelectBar';
import { BulkAssignSheet } from './BulkAssignSheet';
import { BottomSheet } from './BottomSheet';
import { Button } from '@/components/ui/Button';
import {
  IconChecklist, IconCheck, IconCheckSquare, IconChevronDown, IconCircle, IconLayers, IconPause, IconPlay, IconPlus, IconUsers,
} from '@/components/ui/icons';
import { cn } from '@/lib/cn';

const DAY_LABEL_KEYS = ['day_today', 'day_tomorrow'] as const;
const LOCALES: Record<string, string> = { de: 'de-DE', en: 'en-GB', pl: 'pl-PL', ro: 'ro-RO' };

/** "Mo 21." statt eines vagen "+2 Tage" (Punkt 7) - der konkrete Wochentag/Kalendertag ist bei
 * der Einsatzplanung sofort eindeutig, waehrend "Heute"/"Morgen" fuer die ersten beiden Tage
 * (schneller erfassbar) unveraendert bleiben. */
function shortDayLabel(iso: string, locale: string): string {
  const d = new Date(`${iso}T00:00:00`);
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(d).replace(/[.,]/g, '');
  return `${weekday} ${d.getDate()}.`;
}

/** Kompakte Kennzahl (Punkt 8) statt eines langen, mobil schlecht scanbaren Aufzaehlungssatzes -
 * dasselbe monochrome Outline-Icon-System (currentColor, Strichstaerke 1.6) wie ueberall sonst in
 * der App statt farbiger Statuspunkte - die Zahl bleibt das optisch dominante Element, das Icon
 * ist klein/sekundaer und traegt Bedeutung nie allein ueber Farbe. */
function DayStatItem({ value, label, icon: Icon }: { value: number; label: string; icon?: typeof IconCircle }) {
  return (
    <div className="flex flex-col items-start gap-0.5">
      <span className="text-[17px] font-semibold tabular-nums text-ink">{value}</span>
      <span className="inline-flex items-center gap-1 whitespace-nowrap text-[11px] text-muted">
        {Icon ? <Icon width={12} height={12} className="shrink-0" aria-hidden="true" /> : null}
        {label}
      </span>
    </div>
  );
}

/**
 * Primaerer Bildschirm (Punkt 2/3/10/26, refactored fuer einen kompakteren oberen Bereich): Ziel
 * ist, dass die erste Aufgabenkarte auf dem Smartphone moeglichst ohne Scrollen sichtbar ist -
 * erreicht durch Zusammenfuehren von "Meine Aufgaben"/"Alle"/Standortfilter in EINE Chip-Zeile,
 * eine kompakte Kennzahlenzeile statt eines langen Satzes, konkrete Tagesnamen, Admin-Aktionen
 * hinter "Auswaehlen"/"Weitere Aktionen" statt dauerhaft sichtbarer Buttons, und eine einklapp-
 * bare Team-Auslastung (fuer normale Housekeeper komplett ausgeblendet). Task-Ermittlung,
 * Zuweisung, Timer und Berechtigungen (isManagerHere/isPropertyManager) sind unveraendert
 * dieselbe Logik wie zuvor - hier wird ausschliesslich die Darstellung neu organisiert.
 */
export function TasksScreen({ app }: { app: HousekeepingApp }) {
  const {
    state, t, tasksForDay, daySummaryFor, capacityFor, selectDay, selectPropertyScope, toggleMyTasksOnly,
    toggleTaskMultiSelect, toggleTaskSelection, openTask, bulkAssignTasks, clearDayAssignments, retryTasksLoad,
    noticeForTask, isNoticeAcknowledgedBy, openManualTaskForm, setManualTaskFilter,
  } = app;
  const [bulkOpen, setBulkOpen] = useState(false);
  const [moreActionsOpen, setMoreActionsOpen] = useState(false);
  const [teamOpen, setTeamOpen] = useState(false);

  const isAdmin = state.user?.role === 'admin';
  const allowed = allowedProperties(state.user, state.properties.map((p) => p.code));
  const allowedProps = state.properties.filter((p) => allowed.includes(p.code));
  const managed = managedPropertyCodes(state.user, allowed);
  const isManagerHere = state.propertyScope === 'all' ? managed.length > 0 || isAdmin : isPropertyManager(state.user, state.propertyScope);

  const date = state.selectedDay || state.planningDays[0];
  const visible = date ? tasksForDay(date) : [];
  const summary = date ? daySummaryFor(date) : null;
  const capacity = date && isManagerHere ? capacityFor(date) : [];
  const topCapacityEntry = capacity.find((e) => e.housekeeperId);
  const unassignedCapacityEntry = capacity.find((e) => e.housekeeperId === null);
  // Punkt 4: in der eingeklappten Team-Zusammenfassung darf der Vorname verwendet werden, sofern
  // er unter den aktuell in der Kapazitaetsliste sichtbaren Mitarbeitenden eindeutig bleibt - bei
  // einer Namenskollision (zwei Vornamen gleich) faellt NUR der betroffene Eintrag auf den
  // vollstaendigen Namen zurueck. Die aufgeklappte Ansicht zeigt weiterhin ausnahmslos den
  // vollstaendigen Namen (unveraendert, siehe capacity.map() unten).
  const firstName = (name: string) => name.split(' ')[0] || name;
  const topDisplayName = topCapacityEntry
    ? (capacity.filter((e) => e.housekeeperId).filter((e) => firstName(e.housekeeperName) === firstName(topCapacityEntry.housekeeperName)).length > 1
      ? topCapacityEntry.housekeeperName
      : firstName(topCapacityEntry.housekeeperName))
    : '';

  const scopedHousekeepers: StaffUser[] = state.users.filter((u) => {
    if (u.role === 'admin') return false;
    if (state.propertyScope === 'all') return true;
    return u.properties === 'alle' || u.properties === 'all' || (Array.isArray(u.properties) && u.properties.includes(state.propertyScope));
  });

  async function handleClearDay() {
    if (typeof window !== 'undefined' && !window.confirm(t('clear_day_confirm'))) return;
    await clearDayAssignments();
  }

  // Punkt 10 (Feinschliff-Analyse): "Ansicht" (Zuweisungsfilter: Meine Aufgaben/Alle Aufgaben) und
  // "Standort" (Property-Filter) sind zwei UNABHAENGIGE Dimensionen - anders als zuvor (wo jede
  // Standortauswahl "Meine Aufgaben" automatisch zuruecksetzte) aendert selectScope() jetzt
  // ausschliesslich propertyScope, selectMine()/selectAllTasks() ausschliesslich myTasksOnly. Eine
  // Standortkraft kann so z. B. "Meine Aufgaben" MIT einem Standortfilter kombinieren.
  function selectMine() {
    if (!state.myTasksOnly) toggleMyTasksOnly();
  }
  function selectAllTasks() {
    if (state.myTasksOnly) toggleMyTasksOnly();
  }
  function selectScope(scope: string) {
    if (state.propertyScope !== scope) selectPropertyScope(scope);
  }

  const showPropertyChips = allowedProps.length > 1;
  const showScopeRow = !isManagerHere || showPropertyChips;

  const chipClass = (active: boolean) => cn(
    'inline-flex h-9 shrink-0 items-center rounded-full border px-4 text-[13px] font-medium transition-colors',
    active ? 'border-ink bg-ink text-warm-white' : 'border-line bg-warm-white text-muted hover:text-ink',
  );

  return (
    <div className="pb-6">
      {showScopeRow ? (
        <div className="flex flex-col gap-2 border-b border-line px-4 py-2.5">
          {/* "Ansicht" (Zuweisungsfilter) - entfaellt fuer Admin/Standortverantwortliche (sie
           * starten ohnehin auf "Alle Aufgaben", siehe afterLogin()), analog zum bisherigen
           * Verhalten, nur jetzt als eigene, klein beschriftete Gruppe statt Teil einer gemischten
           * Chip-Zeile. */}
          {!isManagerHere ? (
            <div className="flex flex-col gap-1.5">
              <span className="text-[10.5px] font-medium uppercase tracking-wide text-muted">{t('filter_group_view')}</span>
              <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <button type="button" onClick={selectMine} aria-pressed={state.myTasksOnly} className={chipClass(state.myTasksOnly)}>
                  {t('my_tasks_only')}
                </button>
                <button type="button" onClick={selectAllTasks} aria-pressed={!state.myTasksOnly} className={chipClass(!state.myTasksOnly)}>
                  {t('scope_all_tasks')}
                </button>
              </div>
            </div>
          ) : null}
          {/* "Standort" (Property-Filter) - unabhaengig von der Ansicht oben, startet bei "Alle"
           * (Punkt 10 Default), sofern der Kontext nicht bereits etwas anderes vorausgewaehlt hat. */}
          {showPropertyChips ? (
            <div className="flex flex-col gap-1.5">
              <span className="text-[10.5px] font-medium uppercase tracking-wide text-muted">{t('filter_group_property')}</span>
              <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <button
                  type="button"
                  onClick={() => selectScope('all')}
                  aria-pressed={state.propertyScope === 'all'}
                  className={chipClass(state.propertyScope === 'all')}
                >
                  {t('scope_all')}
                </button>
                {allowedProps.map((p) => (
                  <button
                    key={p.code}
                    type="button"
                    onClick={() => selectScope(p.code)}
                    aria-pressed={state.propertyScope === p.code}
                    className={chipClass(state.propertyScope === p.code)}
                  >
                    {getPropertyDisplayName(p)}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="flex gap-2 overflow-x-auto px-4 pt-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {state.planningDays.map((d, i) => (
          <button
            key={d}
            type="button"
            onClick={() => selectDay(d)}
            aria-pressed={date === d}
            className={cn(
              'flex shrink-0 flex-col items-center rounded-control border px-4 py-2 text-center transition-colors',
              date === d ? 'border-ink bg-ink text-warm-white' : 'border-line bg-warm-white text-muted hover:text-ink',
            )}
          >
            <span className="text-[13px] font-medium">
              {i < DAY_LABEL_KEYS.length ? t(DAY_LABEL_KEYS[i]) : shortDayLabel(d, LOCALES[state.lang] || 'de-DE')}
            </span>
          </button>
        ))}
      </div>

      {summary ? (
        <div className="px-4 pt-3">
          {/* Punkt 8: kompakte Kennzahlenzeile statt eines langen Aufzaehlungssatzes - Werte mit 0
           * werden ausgeblendet, sofern das Verstaendnis dadurch nicht verloren geht (Gesamtzahl
           * bleibt immer sichtbar). Der vollstaendige Satz bleibt fuer Screenreader erhalten. */}
          <p className="sr-only">
            {t('tasks_count', { n: summary.total })}
            {summary.total > 0 ? (
              <>
                {' · '}{t('summary_open', { n: summary.open })}
                {' · '}{t('summary_in_progress', { n: summary.inProgress })}
                {summary.paused > 0 ? <> · {t('summary_paused', { n: summary.paused })}</> : null}
                {' · '}{t('summary_completed', { n: summary.completed })}
                {summary.turnover > 0 ? <> · {t('summary_turnover', { n: summary.turnover })}</> : null}
              </>
            ) : null}
          </p>
          <div className="flex flex-wrap items-start gap-x-5 gap-y-2" aria-hidden="true">
            <DayStatItem value={summary.total} label={t('task_count_suffix')} icon={IconChecklist} />
            {summary.open > 0 ? <DayStatItem value={summary.open} label={t('kpi_open')} icon={IconCircle} /> : null}
            {summary.inProgress > 0 ? <DayStatItem value={summary.inProgress} label={t('kpi_in_progress')} icon={IconPlay} /> : null}
            {summary.paused > 0 ? <DayStatItem value={summary.paused} label={t('kpi_paused')} icon={IconPause} /> : null}
            {summary.completed > 0 ? <DayStatItem value={summary.completed} label={t('kpi_completed')} icon={IconCheck} /> : null}
            {summary.turnover > 0 ? <DayStatItem value={summary.turnover} label={t('kpi_turnover')} icon={IconLayers} /> : null}
          </div>
        </div>
      ) : null}

      {/* Punkt 9: Admin-/Manageraktionen kompakt hinter "Auswaehlen" + "Weitere Aktionen" statt
       * dauerhaft sichtbarer Einzelbuttons - fuer normale Housekeeper vollstaendig ausgeblendet.
       * "+ Aufgabe erstellen" (Punkt "Admin kann Aufgaben erstellen") ist bewusst NUR fuer Admin
       * sichtbar (serverseitig ebenso durchgesetzt, siehe api/manual-tasks.js) - Standort-
       * verantwortliche/Team-Leads sehen weiterhin nur die bestehenden Aktionen. */}
      {isManagerHere ? (
        <div className="flex flex-wrap items-center gap-2 px-4 pt-3">
          <Button variant={state.taskMultiSelect ? 'primary' : 'secondary'} size="sm" onClick={toggleTaskMultiSelect}>
            <IconCheckSquare width={14} height={14} aria-hidden="true" />
            {state.taskMultiSelect ? t('multiselect_on') : t('select_tasks_action')}
          </Button>
          {isAdmin ? (
            <Button variant="secondary" size="sm" onClick={openManualTaskForm}>
              <IconPlus width={14} height={14} aria-hidden="true" />
              {t('create_manual_task_action')}
            </Button>
          ) : null}
          <button
            type="button"
            onClick={() => setMoreActionsOpen(true)}
            aria-label={t('more_actions')}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line text-muted transition-colors hover:text-ink"
          >
            <span aria-hidden="true" className="text-[15px] leading-none tracking-[0.05em]">&bull;&bull;&bull;</span>
          </button>
        </div>
      ) : null}

      {/* Offen/Erledigt-Filter fuer manuelle Aufgaben (Punkt "erledigte Aufgaben bleiben fuer Admin
       * sichtbar") - betrifft AUSSCHLIESSLICH manuelle Aufgaben (siehe useHousekeepingApp.ts#
       * resolvedTasksAll), Reinigungen bleiben von diesem Filter vollstaendig unberuehrt. Nur fuer
       * Admin sichtbar/aenderbar - alle anderen Rollen sehen implizit immer nur "Offen". */}
      {isAdmin ? (
        <div className="flex flex-col gap-1.5 px-4 pt-3">
          <span className="text-[10.5px] font-medium uppercase tracking-wide text-muted">{t('filter_group_manual_tasks')}</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setManualTaskFilter('open')}
              aria-pressed={state.manualTaskFilter === 'open'}
              className={cn(
                'inline-flex h-8 items-center rounded-full border px-3.5 text-[12.5px] font-medium transition-colors',
                state.manualTaskFilter === 'open' ? 'border-ink bg-ink text-warm-white' : 'border-line bg-warm-white text-muted hover:text-ink',
              )}
            >
              {t('manual_tasks_open')}
            </button>
            <button
              type="button"
              onClick={() => setManualTaskFilter('completed')}
              aria-pressed={state.manualTaskFilter === 'completed'}
              className={cn(
                'inline-flex h-8 items-center rounded-full border px-3.5 text-[12.5px] font-medium transition-colors',
                state.manualTaskFilter === 'completed' ? 'border-ink bg-ink text-warm-white' : 'border-line bg-warm-white text-muted hover:text-ink',
              )}
            >
              {t('manual_tasks_completed')}
            </button>
          </div>
        </div>
      ) : null}

      {/* Punkt 11: eingeklappt per Default (kompakte Ein-Zeilen-Zusammenfassung), fuer normale
       * Housekeeper (isManagerHere=false) komplett ausgeblendet. */}
      {isManagerHere && capacity.length > 0 ? (
        <div className="mx-4 mt-3 rounded-card-lg border border-line bg-warm-white">
          <button
            type="button"
            onClick={() => setTeamOpen((v) => !v)}
            className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left"
          >
            <span className="flex min-w-0 items-center gap-1.5">
              <IconUsers width={13} height={13} className="shrink-0 text-muted" aria-hidden="true" />
              {teamOpen ? (
                <span className="text-[13px] font-medium text-ink">{t('capacity_title')}</span>
              ) : (
                <span className="truncate text-[13px] text-ink">
                  <span className="font-medium">{t('capacity_title_short')}</span>
                  {topCapacityEntry ? (
                    <span className="ml-2 text-muted">
                      {topDisplayName} {topCapacityEntry.count}
                      {unassignedCapacityEntry ? ` · ${unassignedCapacityEntry.count} ${t('capacity_unassigned_short')}` : ''}
                    </span>
                  ) : null}
                </span>
              )}
            </span>
            <IconChevronDown width={14} height={14} className={cn('shrink-0 text-muted transition-transform', teamOpen && 'rotate-180')} aria-hidden="true" />
          </button>
          {teamOpen ? (
            <div className="flex flex-col gap-1.5 px-4 pb-3">
              {capacity.map((entry) => (
                <div key={entry.housekeeperId || 'unassigned'} className="flex items-center justify-between text-[13px]">
                  <span className="text-ink">{entry.housekeeperId ? entry.housekeeperName : t('unassigned')}</span>
                  <span className="text-muted">{entry.count} {t('task_count_suffix')}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {state.loading && visible.length === 0 && !state.tasksLoadError ? (
        <div className="px-4 py-10 text-center text-sm text-muted">{t('loading')}</div>
      ) : state.tasksLoadError ? (
        <div className="px-4 py-10 text-center">
          <p className="text-sm text-status-attention">{state.tasksLoadError}</p>
          <Button className="mt-4" size="sm" onClick={() => retryTasksLoad()}>
            {t('retry')}
          </Button>
        </div>
      ) : visible.length === 0 ? (
        <div className="px-4 py-10 text-center text-sm text-muted">{t('no_tasks')}</div>
      ) : (
        <div className="grid grid-cols-1 gap-3 px-4 pt-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((task) => {
            // Punkt 9: dezente Warnkennzeichnung nur, wenn ein Hinweis existiert UND jemand
            // zugewiesen ist UND GENAU diese Person ihn noch nicht bestaetigt hat - kein Hinweis
            // ohne Zuweisung, kein Zustand ohne echte Bestaetigungspruefung.
            const notice = noticeForTask(task.id);
            const noticeState: 'none' | 'unread' | 'read' = !notice || !task.assignedUserId
              ? 'none'
              : isNoticeAcknowledgedBy(task.id, task.assignedUserId) ? 'read' : 'unread';
            return (
              <TaskCard
                key={task.id}
                task={task}
                lang={state.lang}
                selected={state.selectedTasks.has(task.id)}
                selectable={state.taskMultiSelect}
                noticeState={noticeState}
                onOpen={() => openTask(task.id)}
              />
            );
          })}
        </div>
      )}

      {state.taskMultiSelect ? (
        <MultiSelectBar
          lang={state.lang}
          count={state.selectedTasks.size}
          onAssign={() => setBulkOpen(true)}
          onCancel={toggleTaskMultiSelect}
        />
      ) : null}

      <BulkAssignSheet
        open={bulkOpen}
        lang={state.lang}
        housekeepers={scopedHousekeepers}
        count={state.selectedTasks.size}
        onClose={() => setBulkOpen(false)}
        onPick={(hk) => {
          bulkAssignTasks(Array.from(state.selectedTasks), { id: hk.id, name: hk.name });
          setBulkOpen(false);
        }}
      />

      <BottomSheet open={moreActionsOpen} onClose={() => setMoreActionsOpen(false)}>
        <h3 className="italic text-lg text-[#17160f]">{t('more_actions')}</h3>
        <div className="mt-3 flex flex-col divide-y divide-line border-y border-line">
          <button
            type="button"
            onClick={() => { setMoreActionsOpen(false); handleClearDay(); }}
            className="py-2.5 text-left text-[15px] text-ink transition-colors hover:text-sage"
          >
            {t('clear_day')}
          </button>
        </div>
      </BottomSheet>

      <TaskDetailSheet app={app} task={state.detailTaskId ? visible.find((task) => task.id === state.detailTaskId) || null : null} />
      <ManualTaskFormSheet app={app} />
    </div>
  );
}
