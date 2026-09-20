'use client';

import { useState } from 'react';
import type { HousekeepingApp } from '@/lib/housekeeping/useHousekeepingApp';
import type { StaffUser } from '@/lib/housekeeping/types';
import { allowedProperties } from '@/lib/housekeeping/rooms';
import { getPropertyDisplayName } from '@/lib/housekeeping/api';
import { isPropertyManager, managedPropertyCodes } from '@/lib/housekeeping/permissions';
import { TaskCard } from './TaskCard';
import { TaskDetailSheet } from './TaskDetailSheet';
import { MultiSelectBar } from './MultiSelectBar';
import { BulkAssignSheet } from './BulkAssignSheet';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';

const DAY_LABEL_KEYS = ['day_today', 'day_tomorrow', 'day_plus2', 'day_plus3'] as const;

/**
 * Primaerer Bildschirm (Punkt 2/3/10/26): Tagesnavigation Heute+3, standortuebergreifende
 * Auswahl, priorisierte Auftragsliste des gewaehlten Tages statt einer reinen Zimmerliste.
 */
export function TasksScreen({ app }: { app: HousekeepingApp }) {
  const {
    state, t, tasksForDay, daySummaryFor, capacityFor, selectDay, selectPropertyScope, toggleMyTasksOnly,
    toggleTaskMultiSelect, toggleTaskSelection, openTask, bulkAssignTasks, clearDayAssignments, retryTasksLoad,
  } = app;
  const [bulkOpen, setBulkOpen] = useState(false);

  const isAdmin = state.user?.role === 'admin';
  const allowed = allowedProperties(state.user, state.properties.map((p) => p.code));
  const allowedProps = state.properties.filter((p) => allowed.includes(p.code));
  const managed = managedPropertyCodes(state.user, allowed);
  const isManagerHere = state.propertyScope === 'all' ? managed.length > 0 || isAdmin : isPropertyManager(state.user, state.propertyScope);

  const date = state.selectedDay || state.planningDays[0];
  const visible = date ? tasksForDay(date) : [];
  const summary = date ? daySummaryFor(date) : null;
  const capacity = date && isManagerHere ? capacityFor(date) : [];

  const scopedHousekeepers: StaffUser[] = state.users.filter((u) => {
    if (u.role === 'admin') return false;
    if (state.propertyScope === 'all') return true;
    return u.properties === 'alle' || u.properties === 'all' || (Array.isArray(u.properties) && u.properties.includes(state.propertyScope));
  });

  async function handleClearDay() {
    if (typeof window !== 'undefined' && !window.confirm(t('clear_day_confirm'))) return;
    await clearDayAssignments();
  }

  return (
    <div className="pb-6">
      {allowedProps.length > 1 ? (
        <div className="flex gap-2 overflow-x-auto border-b border-line px-4 py-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button
            type="button"
            onClick={() => selectPropertyScope('all')}
            aria-pressed={state.propertyScope === 'all'}
            className={cn(
              'inline-flex h-9 shrink-0 items-center rounded-full border px-4 text-[13px] font-medium transition-colors',
              state.propertyScope === 'all' ? 'border-ink bg-ink text-warm-white' : 'border-line bg-warm-white text-muted hover:text-ink',
            )}
          >
            {t('scope_all')}
          </button>
          {allowedProps.map((p) => (
            <button
              key={p.code}
              type="button"
              onClick={() => selectPropertyScope(p.code)}
              aria-pressed={state.propertyScope === p.code}
              className={cn(
                'inline-flex h-9 shrink-0 items-center rounded-full border px-4 text-[13px] font-medium transition-colors',
                state.propertyScope === p.code ? 'border-ink bg-ink text-warm-white' : 'border-line bg-warm-white text-muted hover:text-ink',
              )}
            >
              {getPropertyDisplayName(p)}
            </button>
          ))}
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
            <span className="text-[13px] font-medium">{t(DAY_LABEL_KEYS[i])}</span>
          </button>
        ))}
      </div>

      {summary ? (
        <div className="px-4 pt-3">
          <p className="text-[13px] text-muted">
            {t('tasks_count', { n: summary.total })}
            {summary.total > 0 ? (
              <>
                {' · '}{t('summary_assigned', { n: summary.assigned })}
                {' · '}{t('summary_open', { n: summary.open })}
                {summary.turnover > 0 ? <> · {t('summary_turnover', { n: summary.turnover })}</> : null}
              </>
            ) : null}
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 px-4 pt-3">
        <Button variant="secondary" size="sm" onClick={toggleMyTasksOnly}>
          {state.myTasksOnly ? t('all_tasks_toggle') : t('my_tasks_only')}
        </Button>
        {isManagerHere ? (
          <>
            <Button variant={state.taskMultiSelect ? 'primary' : 'secondary'} size="sm" onClick={toggleTaskMultiSelect}>
              {state.taskMultiSelect ? t('multiselect_on') : t('multiselect')}
            </Button>
            <Button variant="ghost" size="sm" onClick={handleClearDay}>
              {t('clear_day')}
            </Button>
          </>
        ) : null}
      </div>

      {isManagerHere && capacity.length > 0 ? (
        <div className="mx-4 mt-3 rounded-card-lg border border-line bg-warm-white p-4">
          <h2 className="font-heading text-sm italic text-ink">{t('capacity_title')}</h2>
          <div className="mt-2 flex flex-col gap-1.5">
            {capacity.map((entry) => (
              <div key={entry.housekeeperId || 'unassigned'} className="flex items-center justify-between text-[13px]">
                <span className="text-ink">{entry.housekeeperId ? entry.housekeeperName : t('unassigned')}</span>
                <span className="text-muted">{entry.count} {t('task_count_suffix')}</span>
              </div>
            ))}
          </div>
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
          {visible.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              lang={state.lang}
              selected={state.selectedTasks.has(task.id)}
              selectable={state.taskMultiSelect}
              onOpen={() => openTask(task.id)}
            />
          ))}
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

      <TaskDetailSheet app={app} task={state.detailTaskId ? visible.find((task) => task.id === state.detailTaskId) || null : null} />
    </div>
  );
}
