import type { Lang } from '@/lib/housekeeping/i18n';
import { translate } from '@/lib/housekeeping/i18n';
import { DOUBLEUP_TYPES } from '@/lib/housekeeping/api';
import { DoubleupIcon, IconAlertCircle, IconCheck, IconClock, IconEdit, IconEnter, IconExit, IconPause, IconPlay, IconUser } from '@/components/ui/icons';
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

/** Kompakte "N Erw. · N Kinder"-Belegung (Punkt 6/7) - bewusst abgekuerzt, ohne Gesamtzahl und
 * ohne Kinderalter (beides bleibt der Detailansicht vorbehalten). `null`, wenn keine Erwachsenen-
 * Zahl bekannt ist (dann wird auf der Karte nichts behauptet statt einer falschen "0"). */
function formatOccupancy(lang: Lang, adults: number | null, childrenCount: number): string | null {
  if (adults == null) return null;
  const parts = [translate(lang, 'occ_adults', { n: adults })];
  if (childrenCount > 0) parts.push(translate(lang, childrenCount === 1 ? 'occ_child_one' : 'occ_children_many', { n: childrenCount }));
  return parts.join(' · ');
}

/** Ein Belegungs-Feld mit sehr kleinem, dezentem Sekundaerlabel ("Abreise"/"Anreise") darueber -
 * ersetzt das fruehere einzelne Check-out-/Check-in-Icon ohne Beschriftung (Punkt "Bedeutung...
 * ohne Erklaerung nicht eindeutig genug"): das Label allein macht die Richtung eindeutig, das
 * Icon bleibt zusaetzlich als visueller Anker erhalten. */
function OccupancyBlock({ icon: Icon, label, text }: { icon: typeof IconExit; label: string; text: string }) {
  return (
    <div className="flex min-w-0 flex-col">
      <span className="truncate text-[8px] font-medium uppercase leading-none tracking-wide text-muted">{label}</span>
      <span className="mt-0.5 flex min-w-0 items-center gap-1 truncate text-[12px] leading-none text-muted">
        <Icon width={12} height={12} className="shrink-0" aria-hidden="true" />
        <span className="truncate">{text}</span>
      </span>
    </div>
  );
}

/**
 * Belegungszeile + Extras (Redesign Punkt 1-9: ersetzt die zuvor hier gezeigte Gastname+
 * Buchungsnummer-Zeile) - bei Turnover STRIKT getrennt Abreise-Belegung (links, aus
 * task.reservationInfo, der abreisenden Reservierung) und Anreise-Belegung (rechts, aus
 * task.nextReservationInfo, der naechsten Reservierung), je mit eigenem "Abreise"/"Anreise"-Label
 * statt eines verbindenden Pfeils (die Richtung ist durch die Label bereits eindeutig, siehe
 * OccupancyBlock) - niemals aus derselben Reservierung gemischt, siehe tasks.ts fuer die bereits
 * bestehende, hier nur gelesene Trennung. Bei reiner Abreise nur die abreisende Seite (die zweite
 * Spalte bleibt leer statt faelschlich eine "Anreise" ohne Daten zu behaupten); bei
 * Zwischenreinigung (laufender Aufenthalt, weder An- noch Abreise heute) neutral ohne
 * Richtungssymbol/Label. Extras-Icons bleiben rechts in derselben Zeile.
 */
function OccupancyLine({ task, lang, doubleTypes }: { task: ResolvedTask; lang: Lang; doubleTypes: typeof DOUBLEUP_TYPES }) {
  const departureText = task.reservationInfo ? formatOccupancy(lang, task.reservationInfo.adults, task.reservationInfo.childrenCount) : null;
  const arrivalText = task.type === 'turnover' && task.nextReservationInfo
    ? formatOccupancy(lang, task.nextReservationInfo.adults, task.nextReservationInfo.childrenCount)
    : null;

  let occupancy = null;
  if ((task.type === 'turnover' || task.type === 'departure') && (departureText || arrivalText)) {
    occupancy = (
      <div className="grid min-w-0 flex-1 grid-cols-2 gap-x-2">
        {departureText ? <OccupancyBlock icon={IconExit} label={translate(lang, 'label_departure')} text={departureText} /> : <span />}
        {arrivalText ? <OccupancyBlock icon={IconEnter} label={translate(lang, 'label_arrival')} text={arrivalText} /> : <span />}
      </div>
    );
  } else if (task.type === 'stayover' && departureText) {
    occupancy = (
      <span className="flex min-w-0 items-center gap-1 truncate text-[12px] text-muted">
        <IconUser width={13} height={13} className="shrink-0" aria-hidden="true" />
        <span className="truncate">{departureText}</span>
      </span>
    );
  }

  if (!occupancy && !doubleTypes.length) return null;

  return (
    <div className="flex items-end justify-between gap-2">
      {occupancy || <span />}
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
        'relative flex flex-col gap-1.5 rounded-card-lg border p-4 text-left transition-colors',
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

      <OccupancyLine task={task} lang={lang} doubleTypes={doubleTypes} />
    </button>
  );
}
