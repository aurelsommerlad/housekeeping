import type { Lang } from '@/lib/housekeeping/i18n';
import { translate } from '@/lib/housekeeping/i18n';
import { DOUBLEUP_TYPES } from '@/lib/housekeeping/api';
import { DoubleupIcon, IconAlertCircle, IconCheck, IconClock, IconEdit } from '@/components/ui/icons';
import { TASK_STATUS_CONFIG, TASK_TYPE_CONFIG } from '@/lib/housekeeping/task-status-config';
import { formatDuration } from '@/lib/housekeeping/rooms';
import type { ResolvedTask } from '@/lib/housekeeping/useHousekeepingApp';
import { TonePill } from './TonePill';
import { TimeFlag } from './TimeFlag';
import { cn } from '@/lib/cn';

export interface TaskCardProps {
  task: ResolvedTask;
  lang: Lang;
  selected: boolean;
  selectable: boolean;
  /** Punkt 9: 'unread' zeigt ein dezentes Outline-Warnsymbol (wichtiger, vom zugewiesenen
   * Mitarbeiter noch nicht bestaetigter Hinweis), 'read' ein dezentes Haekchen, 'none' nichts. */
  noticeState?: 'none' | 'unread' | 'read';
  onOpen: () => void;
}

function formatDayMonth(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00`);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.`;
}

// Literale Klassennamen (Tailwind kann Utility-Klassen nur erkennen, wenn sie irgendwo im
// Quellcode woertlich vorkommen - eine zur Laufzeit per String-Ersetzung aus toneBorderClass
// zusammengesetzte Klasse wuerde vom Scanner nicht gefunden und bliebe ungestylt).
const TYPE_LEFT_BORDER: Record<ResolvedTask['type'], string> = {
  turnover: 'border-l-type-turnover/50',
  departure: 'border-l-type-departure/50',
  stayover: 'border-l-type-stayover/50',
  extra: 'border-l-type-extra/50',
};

function formatClock(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Letzter Verlaufseintrag mit dieser Aktion (Punkt "Reinigungsverlauf") - fuer "seit HH:MM" auf
 * der Karte (z. B. wann eine laufende Reinigung zuletzt gestartet/fortgesetzt oder pausiert
 * wurde), ohne einen eigenen, parallelen Zeitstempel zu fuehren. */
function lastHistoryAt(task: ResolvedTask, action: 'started' | 'resumed' | 'paused'): number | null {
  for (let i = task.history.length - 1; i >= 0; i -= 1) {
    if (task.history[i].action === action || (action === 'started' && task.history[i].action === 'resumed')) return task.history[i].at;
  }
  return null;
}

/**
 * Reinigungsauftrags-Karte (Punkt 10) - dasselbe reduzierte, auf einen Blick erfassbare Muster
 * wie die bestehende RoomCard (gleicher radius-card-lg/Kartenrahmen, gleiche Selektions-Logik
 * fuer Bulk Assign), aber datums-/auftragszentriert statt zimmerzentriert: Typ-Badge zuerst
 * (Turnover hoechste Prioritaet, Punkt 9), dann An-/Abreisezeiten, Gaesteanzahl, Extras,
 * zuletzt die Zuweisung.
 */
export function TaskCard({ task, lang, selected, selectable, noticeState = 'none', onOpen }: TaskCardProps) {
  const typeConfig = TASK_TYPE_CONFIG[task.type];
  const statusConfig = TASK_STATUS_CONFIG[task.status];
  const doubleTypes = task.doubleupTypes.length
    ? DOUBLEUP_TYPES.filter((dt) => task.doubleupTypes.includes(dt.id))
    : [];
  const isCompleted = task.status === 'completed';
  const startedAt = lastHistoryAt(task, 'started') ?? task.cleaningStartedAt;
  const pausedAt = lastHistoryAt(task, 'paused');

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'relative flex flex-col gap-2 rounded-card-lg border p-4 text-left transition-colors',
        // Punkt "Fertig": Karte deutlich zurueckgenommen, aber die Ursprungsfarbe des Aufgabentyps
        // bleibt als duenner linker Rand erkennbar (statt vollflaechig, statt komplett ausgegraut).
        isCompleted
          ? cn('border-l-[3px] border-line bg-warm-white opacity-90', TYPE_LEFT_BORDER[task.type])
          : cn(typeConfig.toneBgClass, selected ? 'border-ink ring-2 ring-ink/20' : 'border-line hover:border-sage/50'),
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
        <span className="italic text-[17px] leading-none text-ink">
          {task.unitName} <span className="text-muted">· {task.propertyName}</span>
        </span>
        {noticeState === 'unread' ? (
          <IconAlertCircle width={16} height={16} className="mt-0.5 shrink-0 text-muted" aria-hidden="true" />
        ) : noticeState === 'read' ? (
          <IconCheck width={14} height={14} className="mt-1 shrink-0 text-sage" aria-hidden="true" />
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <TonePill config={typeConfig} lang={lang} size="sm" />
        {task.status !== 'open' ? <TonePill config={statusConfig} lang={lang} size="sm" /> : null}
        {task.status === 'in_progress' ? (
          <span className="text-[12px] font-medium tabular-nums text-status-progress">{formatDuration(task.elapsedSeconds)}</span>
        ) : null}
        {task.status === 'in_progress' && task.assignedUserName ? (
          <span className="text-[12px] text-muted">
            {translate(lang, 'assignee_since', { name: task.assignedUserName, time: startedAt ? formatClock(startedAt) : '' })}
          </span>
        ) : null}
        {task.status === 'paused' && task.assignedUserName ? (
          <span className="text-[12px] text-muted">
            {translate(lang, 'assignee_since', { name: task.assignedUserName, time: pausedAt ? formatClock(pausedAt) : '' })}
          </span>
        ) : null}
        {isCompleted && task.assignedUserName ? (
          <span className="text-[12px] text-muted">
            {translate(lang, 'assignee_at', { name: task.assignedUserName, time: task.completedAt ? formatClock(task.completedAt) : '' })}
          </span>
        ) : null}
      </div>

      {task.type === 'turnover' ? (
        <p className="text-[12.5px] text-muted">
          {translate(lang, 'label_departure')} {task.effectiveDepartureTime} → {translate(lang, 'label_arrival')} {task.effectiveArrivalTime}
        </p>
      ) : task.type === 'departure' ? (
        <p className="text-[12.5px] text-muted">
          {translate(lang, 'label_departure')} {task.effectiveDepartureTime}
          {task.followingArrivalDate ? (
            <> · {translate(lang, 'next_arrival_label')}: {formatDayMonth(task.followingArrivalDate)}</>
          ) : null}
        </p>
      ) : task.type === 'stayover' ? (
        <p className="text-[12.5px] text-muted">{task.nights ? translate(lang, task.nights === 1 ? 'nights_one' : 'nights_many', { n: task.nights }) : null}</p>
      ) : null}

      {/* Late Check-out/Early Check-in/Zeitkonflikt/manueller Override (Punkt 1-4/9/14) - dezent,
       * monochrom, nie farblich "laut" ausser dem echten Zeitkonflikt (status-attention, dieselbe
       * sehr zurueckhaltende Warmtoene wie der "Wichtiger Hinweis"-Block). Bei einem Konflikt
       * werden die einzelnen LCO/ECI-Kennzeichnungen durch die kombinierte Meldung ersetzt statt
       * redundant zusaetzlich gezeigt. */}
      {task.timeConflict || task.hasLateCheckout || task.hasEarlyCheckin || task.departureOverridden || task.arrivalOverridden ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {task.timeConflict ? (
            <TimeFlag icon={IconAlertCircle} tone="attention">{translate(lang, 'time_conflict_badge')}</TimeFlag>
          ) : (
            <>
              {task.hasLateCheckout ? <TimeFlag icon={IconClock}>{translate(lang, 'late_checkout_badge', { time: task.bookedDepartureTime })}</TimeFlag> : null}
              {task.hasEarlyCheckin ? <TimeFlag icon={IconClock}>{translate(lang, 'early_checkin_badge', { time: task.bookedArrivalTime || '' })}</TimeFlag> : null}
            </>
          )}
          {task.departureOverridden || task.arrivalOverridden ? (
            <TimeFlag icon={IconEdit}>{translate(lang, 'time_changed_badge')}</TimeFlag>
          ) : null}
        </div>
      ) : null}

      {typeof task.guestCount === 'number' ? (
        <p className="text-[12.5px] text-muted">{translate(lang, 'guests_count', { n: task.guestCount })}</p>
      ) : null}

      {doubleTypes.length ? (
        <p className="flex items-center gap-1.5 text-muted" aria-hidden="true">
          {doubleTypes.map((dt) => (
            <DoubleupIcon key={dt.id} id={dt.id} width={16} height={16} />
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
