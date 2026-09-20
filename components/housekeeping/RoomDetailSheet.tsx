import type { Room } from '@/lib/housekeeping/types';
import { DOUBLEUP_TYPES } from '@/lib/housekeeping/api';
import { DoubleupIcon } from '@/components/ui/icons';
import { formatDuration, workflowStatus } from '@/lib/housekeeping/rooms';
import type { HousekeepingApp } from '@/lib/housekeeping/useHousekeepingApp';
import { BottomSheet } from './BottomSheet';
import { WorkflowStatusPill } from './WorkflowStatusPill';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';

export interface RoomDetailSheetProps {
  app: HousekeepingApp;
  room: Room | null;
}

/**
 * Zimmer-Detail als Bottom Sheet (Briefing Punkt 9) - dieselben Funktionen wie zuvor im
 * zentrierten Modal (Zuweisen, Aufdoppeln, Reinigung starten/pausieren/abschliessen,
 * Inspektion abschliessen, Kommentar), nur klar strukturiert mit primaerer Aktion unten.
 */
export function RoomDetailSheet({ app, room }: RoomDetailSheetProps) {
  const { state, t, closeModal, assignRoom, unassignRoom, toggleDoubleType, startTimer, pauseTimer, finishClean, completeInspection, finishDoubleup } = app;
  const open = !!room;

  if (!room) {
    return <BottomSheet open={false} onClose={closeModal}><div /></BottomSheet>;
  }

  const isAdmin = state.user?.role === 'admin';
  const propHks = state.users.filter(
    (u) => u.role !== 'admin' &&
      (u.properties === 'alle' || u.properties === 'all' || (Array.isArray(u.properties) && state.activeProperty !== null && u.properties.includes(state.activeProperty))),
  );
  const workload: Record<string, number> = {};
  const propPrefix = `${state.activeProperty}_`;
  for (const [key, a] of Object.entries(state.assignments)) {
    if (a && key.startsWith(propPrefix)) workload[a.housekeeperId] = (workload[a.housekeeperId] || 0) + 1;
  }
  const selectedTypes = room.doubleup?.types || [];
  const mine = !!(room.assignment && state.user && room.assignment.housekeeperId === state.user.id);
  const showTimer = room.running || (room.assignment && room.assignment.elapsedSeconds > 0);

  return (
    <BottomSheet open={open} onClose={closeModal}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="italic text-xl text-[#17160f]">{t('room_detail')} {room.number}</h3>
        <WorkflowStatusPill status={workflowStatus(room)} lang={state.lang} />
      </div>
      {room.guestName ? <p className="mt-1 text-[13px] text-muted">{room.guestName}</p> : null}

      {room.comment ? (
        <div className="mt-3 rounded-control border border-line bg-surface px-3.5 py-3 text-[13px] text-ink">
          <p className="mb-1 font-medium text-muted">{t('guest_comment')}</p>
          {room.comment}
        </div>
      ) : null}

      {showTimer ? (
        <div className="mt-4 rounded-control border border-status-progress/30 bg-status-progress-bg px-4 py-3 text-center">
          <p className="text-[11.5px] font-medium uppercase tracking-wide text-status-progress">{t('elapsed')}</p>
          <p className="mt-0.5 text-3xl tabular-nums text-ink">{formatDuration(room.elapsed)}</p>
        </div>
      ) : null}

      {isAdmin ? (
        <>
          <h4 className="mb-2 mt-5 text-[13px] font-medium text-muted">{t('assign_to')}</h4>
          <div className="flex flex-col gap-1">
            <button
              type="button"
              onClick={() => unassignRoom(room.key)}
              disabled={!room.assignment}
              className={cn(
                'flex items-center justify-between rounded-control px-3 py-2.5 text-left text-sm transition-colors',
                !room.assignment ? 'font-medium text-ink' : 'text-muted hover:bg-surface',
              )}
            >
              {t('unassigned')}
              {!room.assignment ? '✓' : null}
            </button>
            {propHks.map((hk) => {
              const isAssigned = room.assignment?.housekeeperId === hk.id;
              return (
                <button
                  key={hk.id}
                  type="button"
                  onClick={() => assignRoom(room.key, { id: hk.id, name: hk.name })}
                  className={cn(
                    'flex items-center justify-between rounded-control px-3 py-2.5 text-left text-sm transition-colors',
                    isAssigned ? 'font-medium text-ink' : 'text-muted hover:bg-surface',
                  )}
                >
                  <span>{hk.name} ({workload[hk.id] || 0} {t('workload')})</span>
                  {isAssigned ? '✓' : null}
                </button>
              );
            })}
          </div>

          <h4 className="mb-2 mt-5 text-[13px] font-medium text-muted">{t('doubleup_needed')}</h4>
          <div className="flex flex-wrap gap-2">
            {DOUBLEUP_TYPES.map((dt) => {
              const on = selectedTypes.includes(dt.id);
              return (
                <button
                  key={dt.id}
                  type="button"
                  onClick={() => toggleDoubleType(room, dt.id)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors',
                    on ? 'border-ink bg-ink text-warm-white' : 'border-line bg-warm-white text-muted hover:text-ink',
                  )}
                >
                  <DoubleupIcon id={dt.id} width={16} height={16} aria-hidden="true" />
                  {t(dt.label)}
                </button>
              );
            })}
          </div>

          {room.condition === 'CleanToBeInspected' ? (
            <Button variant="primary" className="mt-6 w-full" onClick={() => completeInspection(room)}>
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
                    <DoubleupIcon id={dt.id} width={16} height={16} aria-hidden="true" />
                    {t(dt.label)}
                  </span>
                ))}
              </div>
              <Button variant="secondary" className="mt-3 w-full" onClick={() => finishDoubleup(room)}>
                {t('finish_doubleup')}
              </Button>
            </>
          ) : null}

          {room.condition === 'Dirty' || room.forced ? (
            <div className="mt-5 flex flex-col gap-2.5">
              {!room.running ? (
                <Button variant="primary" className="w-full" onClick={() => startTimer(room)}>
                  {t('start_clean')}
                </Button>
              ) : (
                <Button variant="secondary" className="w-full" onClick={() => pauseTimer(room)}>
                  {t('pause_clean')}
                </Button>
              )}
              {mine || !room.assignment ? (
                <Button variant="primary" className="w-full" onClick={() => finishClean(room)}>
                  {t('finish_clean')}
                </Button>
              ) : null}
            </div>
          ) : null}
        </>
      )}

      <Button variant="ghost" className="mt-5 w-full" onClick={closeModal}>
        {t('close')}
      </Button>
    </BottomSheet>
  );
}
