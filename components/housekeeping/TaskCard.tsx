import type { Lang } from '@/lib/housekeeping/i18n';
import { translate } from '@/lib/housekeeping/i18n';
import { DOUBLEUP_TYPES } from '@/lib/housekeeping/api';
import { DoubleupIcon, IconAlertCircle, IconCheck, IconClock, IconEdit, IconPause, IconPlay, IconUser } from '@/components/ui/icons';
import { TASK_TYPE_CONFIG } from '@/lib/housekeeping/task-status-config';
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
 * Arbeitsstatus/Zuweisung rechts im Kopfbereich (Punkt 2/3 des Redesigns) - ersetzt das
 * fruehere separate "Zugewiesen"-Badge UND die zusaetzliche Namenszeile am Kartenende: laeuft
 * oder pausiert eine Reinigung, ist DAS der wichtigere Zustand (Icon + Status + Zeit + Name in
 * einer Zeile statt zwei gestapelten, damit sich die Kartenhoehe nicht aendert); fertige Aufgaben
 * zeigen "Fertig · HH:MM" statt einer nochmaligen Zuweisungsangabe (Punkt 10). Sonst schlicht die
 * Zuweisung selbst - der Name allein zeigt bereits eindeutig, dass zugewiesen ist.
 */
function WorkStatus({ task, lang }: { task: ResolvedTask; lang: Lang }) {
  const name = task.assignedUserName || translate(lang, 'unassigned');

  if (task.status === 'completed') {
    return (
      <span className="flex min-w-0 items-center gap-1 truncate text-[12px] text-muted">
        <IconCheck width={13} height={13} className="shrink-0" aria-hidden="true" />
        <span className="truncate">
          {translate(lang, 'wf_done')}
          {task.completedAt ? ` · ${formatClock(task.completedAt)}` : ''}
        </span>
      </span>
    );
  }

  if (task.status === 'in_progress') {
    const since = lastHistoryAt(task, 'started') ?? task.cleaningStartedAt;
    return (
      <span className="flex min-w-0 items-center gap-1 truncate text-[12px] text-status-progress">
        <IconPlay width={13} height={13} className="shrink-0" aria-hidden="true" />
        <span className="truncate">
          {translate(lang, 'task_running_label')}{since ? ` · ${formatClock(since)}` : ''} · {name}
        </span>
      </span>
    );
  }

  if (task.status === 'paused') {
    const since = lastHistoryAt(task, 'paused');
    return (
      <span className="flex min-w-0 items-center gap-1 truncate text-[12px] text-status-blocked">
        <IconPause width={13} height={13} className="shrink-0" aria-hidden="true" />
        <span className="truncate">
          {translate(lang, 'task_paused_label')}{since ? ` · ${formatClock(since)}` : ''} · {name}
        </span>
      </span>
    );
  }

  return (
    <span className={cn('flex min-w-0 items-center gap-1 truncate text-[12px]', task.assignedUserName ? 'font-medium text-ink' : 'text-muted')}>
      <IconUser width={13} height={13} className="shrink-0" aria-hidden="true" />
      <span className="truncate">{name}</span>
    </span>
  );
}

/**
 * Zeitzeile (Punkt 4/5 des Redesigns) - EINE Zeile statt zuvor zwei getrennter Bloecke (Zeit +
 * separat LCO/ECI/Konflikt/Override): Uhr-Icon + prominente Kernzeit, danach dieselben,
 * unveraenderten TimeFlag-Badges direkt daneben statt darunter. Reine Darstellung, Ableitung/
 * Prioritaet der Werte selbst (effectiveDepartureTime/-ArrivalTime, timeConflict, ...) bleibt
 * exakt lib/housekeeping/tasks.ts vorbehalten.
 */
function TimeLine({ task, lang }: { task: ResolvedTask; lang: Lang }) {
  const flags = task.timeConflict ? (
    <TimeFlag icon={IconAlertCircle} tone="attention">{translate(lang, 'time_conflict_badge')}</TimeFlag>
  ) : (
    <>
      {task.hasLateCheckout ? <TimeFlag icon={IconClock}>{translate(lang, 'late_checkout_badge', { time: task.bookedDepartureTime })}</TimeFlag> : null}
      {task.hasEarlyCheckin ? <TimeFlag icon={IconClock}>{translate(lang, 'early_checkin_badge', { time: task.bookedArrivalTime || '' })}</TimeFlag> : null}
    </>
  );
  const overrideFlag = task.departureOverridden || task.arrivalOverridden ? (
    <TimeFlag icon={IconEdit}>{translate(lang, 'time_changed_badge')}</TimeFlag>
  ) : null;

  if (task.type === 'turnover') {
    return (
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 border-t border-line/70 pt-2">
        <span className="flex items-center gap-1.5 text-[15px] font-semibold tabular-nums text-ink">
          <IconClock width={15} height={15} className="shrink-0 text-muted" aria-hidden="true" />
          {task.effectiveDepartureTime} → {task.effectiveArrivalTime}
        </span>
        {flags}
        {overrideFlag}
      </div>
    );
  }

  if (task.type === 'departure') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-x-2.5 gap-y-1 border-t border-line/70 pt-2">
        <span className="flex items-center gap-2.5">
          <span className="flex items-center gap-1.5 text-[15px] font-semibold tabular-nums text-ink">
            <IconClock width={15} height={15} className="shrink-0 text-muted" aria-hidden="true" />
            {task.effectiveDepartureTime}
          </span>
          {flags}
          {overrideFlag}
        </span>
        {task.followingArrivalDate ? (
          <span className="text-right text-[11px] leading-tight text-muted">
            {translate(lang, 'next_arrival_label')}<br />{formatDayMonth(task.followingArrivalDate)}
          </span>
        ) : null}
      </div>
    );
  }

  if (task.type === 'stayover' && task.nights) {
    return (
      <p className="border-t border-line/70 pt-2 text-[12.5px] text-muted">
        {translate(lang, task.nights === 1 ? 'nights_one' : 'nights_many', { n: task.nights })}
      </p>
    );
  }

  return null;
}

/**
 * Gast/Buchung + Extras (Punkt 6/7 des Redesigns) - EINE sekundaere Fusszeile statt zuvor bis zu
 * drei getrennten (Reservierung/Gaestezahl, Doubleup-Icons, Zuweisung). Extras-Icons rechts in
 * derselben Zeile statt einer eigenen Zeile.
 */
function GuestLine({ task, lang, doubleTypes }: { task: ResolvedTask; lang: Lang; doubleTypes: typeof DOUBLEUP_TYPES }) {
  // Punkt "Wichtige Korrektur" (unveraendert): Turnover zeigt die ANKOMMENDE, alle anderen Typen
  // die eigene Reservierung - siehe tasks.ts.
  const cardReservation = task.type === 'turnover' ? task.nextReservationInfo : task.reservationInfo;
  const guestText = cardReservation
    ? `${cardReservation.guestName || translate(lang, 'unassigned')} · ${cardReservation.reservationId}`
    : typeof task.guestCount === 'number'
      ? translate(lang, 'guests_count', { n: task.guestCount })
      : null;

  if (!guestText && !doubleTypes.length) return null;

  return (
    <div className="flex items-center justify-between gap-2">
      {guestText ? (
        <span className="flex min-w-0 items-center gap-1.5 truncate text-[12px] text-muted">
          <IconUser width={13} height={13} className="shrink-0" aria-hidden="true" />
          <span className="truncate">{guestText}</span>
        </span>
      ) : <span />}
      {doubleTypes.length ? (
        <span className="flex shrink-0 items-center gap-1.5 text-muted">
          {doubleTypes.map((dt) => {
            const label = translate(lang, dt.label);
            return <DoubleupIcon key={dt.id} id={dt.id} width={15} height={15} role="img" aria-label={label} />;
          })}
        </span>
      ) : null}
    </div>
  );
}

/**
 * Reinigungsauftrags-Karte (Redesign: klare Informationshierarchie statt vieler gleichwertiger
 * Badges/Zeilen) - Ebene 1 Apartment+Standort, Ebene 2 Aufgabentyp+Arbeitsstatus, Ebene 3
 * Zeitfenster, Ebene 4 Gast/Buchung+Extras. Dieselbe kompakte Kartengroesse wie zuvor (siehe
 * Playwright-Hoehenvergleich vor/nach der Aenderung) - reine Darstellung, keine Aenderung an
 * Task-Ableitung/Zuweisung/Timer/Pausen/NFC/Notices/Zeiten-Overrides.
 */
export function TaskCard({ task, lang, selected, selectable, noticeState = 'none', onOpen }: TaskCardProps) {
  const typeConfig = TASK_TYPE_CONFIG[task.type];
  const doubleTypes = task.doubleupTypes.length
    ? DOUBLEUP_TYPES.filter((dt) => task.doubleupTypes.includes(dt.id))
    : [];
  const isCompleted = task.status === 'completed';

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
        <span className="italic text-[17px] font-medium leading-none text-ink">
          {task.unitName} <span className="text-[13px] font-normal not-italic text-muted">· {task.propertyName}</span>
        </span>
        {noticeState === 'unread' ? (
          <IconAlertCircle width={16} height={16} className="mt-0.5 shrink-0 text-muted" aria-hidden="true" />
        ) : noticeState === 'read' ? (
          <IconCheck width={14} height={14} className="mt-1 shrink-0 text-sage" aria-hidden="true" />
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-2">
        <TonePill config={typeConfig} lang={lang} size="sm" />
        <WorkStatus task={task} lang={lang} />
      </div>

      <TimeLine task={task} lang={lang} />

      <GuestLine task={task} lang={lang} doubleTypes={doubleTypes} />
    </button>
  );
}
