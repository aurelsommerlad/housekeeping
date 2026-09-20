import { DOUBLEUP_TYPES } from '@/lib/housekeeping/api';
import { formatDuration } from '@/lib/housekeeping/rooms';
import { isPropertyManager } from '@/lib/housekeeping/permissions';
import { TASK_STATUS_CONFIG, TASK_TYPE_CONFIG } from '@/lib/housekeeping/task-status-config';
import type { HousekeepingApp, ResolvedTask } from '@/lib/housekeeping/useHousekeepingApp';
import { BottomSheet } from './BottomSheet';
import { TonePill } from './TonePill';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';

export interface TaskDetailSheetProps {
  app: HousekeepingApp;
  task: ResolvedTask | null;
}

function formatTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatDayMonth(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00`);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.`;
}

/**
 * Auftrags-Detail als Bottom Sheet - analog zu RoomDetailSheet, aber auftragszentriert (Punkt 4):
 * Zuweisen/Timer/Abschluss beziehen sich auf DIESEN Task (an diesem Datum), nicht dauerhaft auf
 * das Apartment. Standortverantwortliche (Punkt 15) sehen dieselbe "Zuweisen an"-Ansicht wie
 * bisher Admins, aber nur fuer Mitarbeiter mit Zugriff auf DIESES Property; normale Housekeeper
 * (Punkt 14) sehen stattdessen Selbstzuweisung/Freigabe.
 */
export function TaskDetailSheet({ app, task }: TaskDetailSheetProps) {
  const {
    state, t, closeTaskModal, claimTask, releaseTask, assignTask, toggleTaskDoubleType,
    startTaskTimer, pauseTaskTimer, finishTask, completeTaskInspection, finishTaskDoubleup, workloadForPropertyDay,
  } = app;
  const open = !!task;

  if (!task) {
    return <BottomSheet open={false} onClose={closeTaskModal}><div /></BottomSheet>;
  }

  const isManager = isPropertyManager(state.user, task.propertyCode);
  const propHks = state.users.filter(
    (u) => u.role !== 'admin' &&
      (u.properties === 'alle' || u.properties === 'all' || (Array.isArray(u.properties) && u.properties.includes(task.propertyCode))),
  );
  const workload = workloadForPropertyDay(task.propertyCode, task.date);
  const mine = !!(task.assignedUserId && state.user && task.assignedUserId === state.user.id);
  const selectedTypes = task.doubleupTypes;

  return (
    <BottomSheet open={open} onClose={closeTaskModal}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-heading text-xl italic text-ink">
          {task.unitName} <span className="text-muted">· {task.propertyName}</span>
        </h3>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <TonePill config={TASK_TYPE_CONFIG[task.type]} lang={state.lang} />
        <TonePill config={TASK_STATUS_CONFIG[task.status]} lang={state.lang} />
      </div>

      {task.type === 'turnover' ? (
        <p className="mt-2 text-[13px] text-muted">
          {t('label_departure')} {formatTime(task.departureTime)} → {t('label_arrival')} {formatTime(task.nextArrivalTime)}
        </p>
      ) : task.type === 'departure' ? (
        <p className="mt-2 text-[13px] text-muted">
          {t('label_departure')} {formatTime(task.departureTime)}
          {task.followingArrivalDate ? <> · {t('next_arrival_label')}: {formatDayMonth(task.followingArrivalDate)}</> : null}
        </p>
      ) : null}

      {task.nextGuestName || task.guestName ? (
        <p className="mt-1 text-[13px] text-muted">{task.type === 'turnover' ? task.nextGuestName : task.guestName}</p>
      ) : null}

      {task.comment ? (
        <div className="mt-3 rounded-control border border-line bg-surface px-3.5 py-3 text-[13px] text-ink">
          <p className="mb-1 font-medium text-muted">{t('guest_comment')}</p>
          {task.comment}
        </div>
      ) : null}

      {task.status === 'in_progress' ? (
        <div className="mt-4 rounded-control border border-status-progress/30 bg-status-progress-bg px-4 py-3 text-center">
          <p className="text-[11.5px] font-medium uppercase tracking-wide text-status-progress">{t('elapsed')}</p>
          <p className="mt-0.5 font-heading text-3xl tabular-nums text-ink">{formatDuration(task.elapsedSeconds)}</p>
        </div>
      ) : null}

      {isManager ? (
        <>
          <h4 className="mb-2 mt-5 text-[13px] font-medium text-muted">{t('assign_to')}</h4>
          <div className="flex flex-col gap-1">
            {propHks.map((hk) => {
              const isAssigned = task.assignedUserId === hk.id;
              return (
                <button
                  key={hk.id}
                  type="button"
                  onClick={() => assignTask(task.id, { id: hk.id, name: hk.name })}
                  className={cn(
                    'flex items-center justify-between rounded-control px-3 py-2.5 text-left text-sm transition-colors',
                    isAssigned ? 'font-medium text-ink' : 'text-muted hover:bg-surface',
                  )}
                >
                  <span>{hk.name} ({workload[hk.id] || 0} {t('task_count_suffix')})</span>
                  {isAssigned ? '✓' : null}
                </button>
              );
            })}
            {task.assignedUserId ? (
              <button
                type="button"
                onClick={() => releaseTask(task.id)}
                className="flex items-center justify-between rounded-control px-3 py-2.5 text-left text-sm text-muted transition-colors hover:bg-surface"
              >
                {t('unassigned')}
              </button>
            ) : null}
          </div>

          <h4 className="mb-2 mt-5 text-[13px] font-medium text-muted">{t('doubleup_needed')}</h4>
          <div className="flex flex-wrap gap-2">
            {DOUBLEUP_TYPES.map((dt) => {
              const on = selectedTypes.includes(dt.id);
              return (
                <button
                  key={dt.id}
                  type="button"
                  onClick={() => toggleTaskDoubleType(task, dt.id)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors',
                    on ? 'border-ink bg-ink text-warm-white' : 'border-line bg-warm-white text-muted hover:text-ink',
                  )}
                >
                  <span aria-hidden="true">{dt.icon}</span>
                  {t(dt.label)}
                </button>
              );
            })}
          </div>

          {task.status === 'inspection' ? (
            <Button variant="primary" className="mt-6 w-full" onClick={() => completeTaskInspection(task)}>
              {t('complete_inspection')}
            </Button>
          ) : null}
        </>
      ) : (
        <>
          {selectedTypes.length > 0 ? (
            <>
              <div className="mt-4 flex flex-wrap gap-2">
                {DOUBLEUP_TYPES.filter((dt) => selectedTypes.includes(dt.id)).map((dt) => (
                  <span
                    key={dt.id}
                    className="inline-flex items-center gap-1.5 rounded-full border border-ink bg-ink px-3.5 py-1.5 text-[13px] font-medium text-warm-white"
                  >
                    <span aria-hidden="true">{dt.icon}</span>
                    {t(dt.label)}
                  </span>
                ))}
              </div>
              {task.type === 'extra' ? (
                <Button variant="secondary" className="mt-3 w-full" onClick={() => finishTaskDoubleup(task)}>
                  {t('finish_doubleup')}
                </Button>
              ) : null}
            </>
          ) : null}

          {task.status === 'open' ? (
            <Button variant="primary" className="mt-5 w-full" onClick={() => claimTask(task.id)}>
              {t('claim_task')}
            </Button>
          ) : null}

          {mine && task.status === 'assigned' ? (
            <div className="mt-5 flex flex-col gap-2.5">
              <Button variant="primary" className="w-full" onClick={() => startTaskTimer(task.id)}>
                {t('start_clean')}
              </Button>
              <Button variant="ghost" className="w-full" onClick={() => releaseTask(task.id)}>
                {t('release_task')}
              </Button>
            </div>
          ) : null}

          {mine && task.status === 'in_progress' ? (
            <div className="mt-5 flex flex-col gap-2.5">
              <Button variant="secondary" className="w-full" onClick={() => pauseTaskTimer(task.id)}>
                {t('pause_clean')}
              </Button>
              <Button variant="primary" className="w-full" onClick={() => finishTask(task)}>
                {t('finish_clean')}
              </Button>
            </div>
          ) : null}
        </>
      )}

      <Button variant="ghost" className="mt-5 w-full" onClick={closeTaskModal}>
        {t('close')}
      </Button>
    </BottomSheet>
  );
}
