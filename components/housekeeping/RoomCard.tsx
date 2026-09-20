import type { Room } from '@/lib/housekeeping/types';
import type { Lang } from '@/lib/housekeeping/i18n';
import { translate } from '@/lib/housekeeping/i18n';
import { DOUBLEUP_TYPES } from '@/lib/housekeeping/api';
import { formatDuration, workflowStatus } from '@/lib/housekeeping/rooms';
import { describeTurnover, isSameDayTurnover } from '@/lib/housekeeping/turnover';
import { WorkflowStatusPill } from './WorkflowStatusPill';
import { cn } from '@/lib/cn';

export interface RoomCardProps {
  room: Room;
  lang: Lang;
  selected: boolean;
  selectable: boolean;
  onOpen: () => void;
}

/**
 * Reduzierte Zimmerkarte (Briefing Punkt 6): Zimmername + Status prominent, Turnover/Anreise-
 * Abreise/Zuweisung/Extras bewusst kleiner und zurueckhaltender. Same-Day-Turnover bleibt trotz
 * der ruhigeren Optik sofort erkennbar (eigene Kennzeichnung, operative Prioritaet).
 */
export function RoomCard({ room, lang, selected, selectable, onOpen }: RoomCardProps) {
  const status = workflowStatus(room);
  const turnoverLine = describeTurnover(room, lang);
  const sameDay = isSameDayTurnover(room);
  const doubleTypes = room.doubleup?.types?.length
    ? DOUBLEUP_TYPES.filter((dt) => room.doubleup!.types.includes(dt.id))
    : [];

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'relative flex flex-col gap-2 rounded-card-lg border bg-warm-white p-4 text-left transition-colors',
        selected ? 'border-ink ring-2 ring-ink/20' : 'border-line hover:border-sage/50',
      )}
    >
      {selectable ? (
        <span
          className={cn(
            'absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full border text-[11px]',
            selected ? 'border-ink bg-ink text-warm-white' : 'border-line bg-warm-white text-transparent',
          )}
          aria-hidden="true"
        >
          ✓
        </span>
      ) : null}

      <div className="flex items-start justify-between gap-2 pr-6">
        <span className="font-heading text-[19px] leading-none text-ink">{room.number}</span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <WorkflowStatusPill status={status} lang={lang} size="sm" />
        {sameDay ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-status-attention/30 bg-status-attention-bg px-2 py-0.5 text-[11.5px] font-medium text-status-attention">
            {translate(lang, 'turnover_priority')}
          </span>
        ) : null}
        {room.running ? (
          <span className="text-[12px] font-medium tabular-nums text-status-progress">{formatDuration(room.elapsed)}</span>
        ) : null}
      </div>

      {turnoverLine ? <p className="text-[12.5px] text-muted">{turnoverLine}</p> : null}

      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <span className="truncate text-[12.5px] text-muted">
          {room.assignment ? room.assignment.housekeeperName : ''}
        </span>
        {doubleTypes.length ? (
          <span className="inline-flex items-center gap-0.5 text-[13px]" aria-hidden="true">
            {doubleTypes.map((dt) => (
              <span key={dt.id}>{dt.icon}</span>
            ))}
          </span>
        ) : null}
      </div>
    </button>
  );
}
