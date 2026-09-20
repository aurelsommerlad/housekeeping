import type { Lang } from '@/lib/housekeeping/i18n';
import { translate } from '@/lib/housekeeping/i18n';
import { DOUBLEUP_TYPES } from '@/lib/housekeeping/api';
import { TASK_STATUS_CONFIG, TASK_TYPE_CONFIG } from '@/lib/housekeeping/task-status-config';
import { formatDuration } from '@/lib/housekeeping/rooms';
import type { ResolvedTask } from '@/lib/housekeeping/useHousekeepingApp';
import { TonePill } from './TonePill';
import { cn } from '@/lib/cn';

export interface TaskCardProps {
  task: ResolvedTask;
  lang: Lang;
  selected: boolean;
  selectable: boolean;
  onOpen: () => void;
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
 * Reinigungsauftrags-Karte (Punkt 10) - dasselbe reduzierte, auf einen Blick erfassbare Muster
 * wie die bestehende RoomCard (gleicher radius-card-lg/Kartenrahmen, gleiche Selektions-Logik
 * fuer Bulk Assign), aber datums-/auftragszentriert statt zimmerzentriert: Typ-Badge zuerst
 * (Turnover hoechste Prioritaet, Punkt 9), dann An-/Abreisezeiten, Gaesteanzahl, Extras,
 * zuletzt die Zuweisung.
 */
export function TaskCard({ task, lang, selected, selectable, onOpen }: TaskCardProps) {
  const typeConfig = TASK_TYPE_CONFIG[task.type];
  const statusConfig = TASK_STATUS_CONFIG[task.status];
  const doubleTypes = task.doubleupTypes.length
    ? DOUBLEUP_TYPES.filter((dt) => task.doubleupTypes.includes(dt.id))
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
        <span className="font-heading text-[17px] leading-none text-ink">
          {task.unitName} <span className="text-muted">· {task.propertyName}</span>
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <TonePill config={typeConfig} lang={lang} size="sm" />
        {task.status !== 'open' ? <TonePill config={statusConfig} lang={lang} size="sm" /> : null}
        {task.status === 'in_progress' ? (
          <span className="text-[12px] font-medium tabular-nums text-status-progress">{formatDuration(task.elapsedSeconds)}</span>
        ) : null}
      </div>

      {task.type === 'turnover' ? (
        <p className="text-[12.5px] text-muted">
          {translate(lang, 'label_departure')} {formatTime(task.departureTime)} → {translate(lang, 'label_arrival')} {formatTime(task.nextArrivalTime)}
        </p>
      ) : task.type === 'departure' ? (
        <p className="text-[12.5px] text-muted">
          {translate(lang, 'label_departure')} {formatTime(task.departureTime)}
          {task.followingArrivalDate ? (
            <> · {translate(lang, 'next_arrival_label')}: {formatDayMonth(task.followingArrivalDate)}</>
          ) : null}
        </p>
      ) : task.type === 'stayover' ? (
        <p className="text-[12.5px] text-muted">{task.nights ? translate(lang, task.nights === 1 ? 'nights_one' : 'nights_many', { n: task.nights }) : null}</p>
      ) : null}

      {typeof task.guestCount === 'number' ? (
        <p className="text-[12.5px] text-muted">{translate(lang, 'guests_count', { n: task.guestCount })}</p>
      ) : null}

      {doubleTypes.length ? (
        <p className="flex items-center gap-1 text-[13px]" aria-hidden="true">
          {doubleTypes.map((dt) => (
            <span key={dt.id}>{dt.icon}</span>
          ))}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <span className="truncate text-[12.5px] font-medium text-ink">
          {task.assignedUserName || translate(lang, 'unassigned')}
        </span>
      </div>
    </button>
  );
}
