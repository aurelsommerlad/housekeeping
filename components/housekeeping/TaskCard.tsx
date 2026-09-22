import type { Lang } from '@/lib/housekeeping/i18n';
import { translate } from '@/lib/housekeeping/i18n';
import { DOUBLEUP_TYPES } from '@/lib/housekeeping/api';
import {
  DoubleupIcon, IconAlertCircle, IconCheck, IconClock, IconEdit, IconEnter, IconExit, IconPause, IconPlay, IconRefresh,
  IconTask, IconUser,
} from '@/components/ui/icons';
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
  /** Punkt "Reinigungskräfte standardmäßig nur mit Vornamen anzeigen" - reine Darstellungsfunktion
   * (siehe lib/housekeeping/names.ts/useHousekeepingApp.ts#shortStaffName), der gespeicherte
   * volle Name bleibt unveraendert. */
  shortName: (name: string | null | undefined) => string;
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
  manual: 'border-l-type-manual/50',
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
    if (task.history[i].action === action || (action === 'started' && (task.history[i].action === 'resumed' || task.history[i].action === 'restarted'))) {
      return task.history[i].at;
    }
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
function WorkStatus({ task, lang, shortName }: { task: ResolvedTask; lang: Lang; shortName: (name: string | null | undefined) => string }) {
  const name = task.assignedUserName ? shortName(task.assignedUserName) : translate(lang, 'unassigned');

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

  // Housekeeping Teams: Person+Team ("Maria Keller · Reinigungsfirma B"), Team ohne Person
  // ("Reinigungsfirma B · Noch nicht verteilt") oder wie zuvor "Nicht zugewiesen" - EINE Zeile,
  // keine zusaetzliche Kartenhoehe (Briefing "Task Card ... darf nicht hoeher werden").
  const label = task.assignedUserName
    ? (task.assignedTeamName ? `${shortName(task.assignedUserName)} · ${task.assignedTeamName}` : shortName(task.assignedUserName))
    : (task.assignedTeamName ? `${task.assignedTeamName} · ${translate(lang, 'team_task_unclaimed')}` : name);

  return (
    <span className={cn('flex min-w-0 items-center gap-1 truncate text-[12px]', (task.assignedUserName || task.assignedTeamName) ? 'font-medium text-ink' : 'text-muted')}>
      <IconUser width={13} height={13} className="shrink-0" aria-hidden="true" />
      <span className="truncate">{label}</span>
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
  // Punkt "Buchungsaenderung sichtbar machen": nur ein dezenter Hinweis auf der kompakten Karte,
  // niemals die volle Vorher/Nachher-Historie (die steht in der Detailansicht, siehe
  // TaskDetailSheet.tsx) - dasselbe TimeFlag-Badge wie die uebrigen Zeit-Kennzeichnungen.
  const bookingChangeFlag = task.bookingChange ? (
    <TimeFlag icon={IconRefresh}>{translate(lang, 'booking_changed_badge')}</TimeFlag>
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
        {bookingChangeFlag}
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
          {bookingChangeFlag}
        </span>
        {task.followingArrivalDate ? (
          <span className="text-right text-[11px] leading-tight text-muted">
            {translate(lang, 'next_arrival_label')}<br />{formatDayMonth(task.followingArrivalDate)}
          </span>
        ) : null}
      </div>
    );
  }

  if (task.type === 'stayover' && (task.nights || task.bookingChange)) {
    return (
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 border-t border-line/70 pt-2">
        {task.nights ? (
          <p className="text-[12.5px] text-muted">
            {translate(lang, task.nights === 1 ? 'nights_one' : 'nights_many', { n: task.nights })}
          </p>
        ) : null}
        {bookingChangeFlag}
      </div>
    );
  }

  if (task.type === 'manual' && task.manualTitle) {
    return (
      <p className="truncate border-t border-line/70 pt-2 text-[13px] text-ink">{task.manualTitle}</p>
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

/** Gebuchte Apaleo-Extras (Hund/Babybett) DIESER EINEN Reservierung - niemals die der jeweils
 * anderen Seite (siehe reservationSummary() in tasks.ts, das die Trennung schon an der Quelle
 * garantiert). Reine Anzeige derselben monochromen Outline-Icons wie bei "Vorbereitung"
 * (DoubleupIcon/DOUBLEUP_ICONS), hier nur mit einem eigenen, expliziten "... gebucht"-Label statt
 * des generischen Vorbereitungs-Labels - macht in der Detailansicht/Tooltip den Unterschied
 * zum manuell gesetzten Housekeeping-Flag klar. */
function bookedExtraIcons(info: { hasDog: boolean; hasCrib: boolean } | null | undefined, lang: Lang): { id: string; label: string }[] {
  if (!info) return [];
  const extras: { id: string; label: string }[] = [];
  if (info.hasDog) extras.push({ id: 'dog', label: translate(lang, 'booked_dog_label') });
  if (info.hasCrib) extras.push({ id: 'crib', label: translate(lang, 'booked_crib_label') });
  return extras;
}

/** Ein Belegungs-Feld mit sehr kleinem, dezentem Sekundaerlabel ("Abreise"/"Anreise") darueber -
 * ersetzt das fruehere einzelne Check-out-/Check-in-Icon ohne Beschriftung (Punkt "Bedeutung...
 * ohne Erklaerung nicht eindeutig genug"): das Label allein macht die Richtung eindeutig, das
 * Icon bleibt zusaetzlich als visueller Anker erhalten. `extras` (gebuchte Hund-/Babybett-
 * Services DIESER Reservierung) stehen direkt hinter der Gaestezahl in derselben Zeile - keine
 * neue Zeile, keine Aenderung der Kartenhoehe. */
function OccupancyBlock({
  icon: Icon, label, text, extras,
}: { icon: typeof IconExit; label: string; text: string; extras: { id: string; label: string }[] }) {
  return (
    <div className="flex min-w-0 flex-col">
      <span className="truncate text-[8px] font-medium uppercase leading-none tracking-wide text-muted">{label}</span>
      <span className="mt-0.5 flex min-w-0 items-center gap-1 text-[12px] leading-none text-muted">
        <Icon width={12} height={12} className="shrink-0" aria-hidden="true" />
        <span className="truncate">{text}</span>
        {extras.length ? (
          <span className="flex shrink-0 items-center gap-1">
            {extras.map((e) => (
              <DoubleupIcon key={e.id} id={e.id} width={12} height={12} role="img" aria-label={e.label} />
            ))}
          </span>
        ) : null}
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
        {departureText ? (
          <OccupancyBlock icon={IconExit} label={translate(lang, 'label_departure')} text={departureText} extras={bookedExtraIcons(task.reservationInfo, lang)} />
        ) : <span />}
        {arrivalText ? (
          <OccupancyBlock icon={IconEnter} label={translate(lang, 'label_arrival')} text={arrivalText} extras={bookedExtraIcons(task.nextReservationInfo, lang)} />
        ) : <span />}
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
export function TaskCard({ task, lang, selected, selectable, noticeState = 'none', shortName, onOpen }: TaskCardProps) {
  const typeConfig = TASK_TYPE_CONFIG[task.type];
  // Punkt "gebucht vs. manuell": ein Hund/Babybett, das bereits als gebuchtes Apaleo-Extra bei
  // Abreise oder Anreise angezeigt wird (siehe OccupancyLine/bookedExtraIcons), erscheint hier in
  // der manuellen Vorbereitungs-Icon-Gruppe NICHT ein zweites Mal - beide Datenquellen bleiben
  // getrennt, aber dasselbe Symbol wird nie doppelt auf derselben Karte gezeigt.
  const apaleoHasDog = !!(task.reservationInfo?.hasDog || task.nextReservationInfo?.hasDog);
  const apaleoHasCrib = !!(task.reservationInfo?.hasCrib || task.nextReservationInfo?.hasCrib);
  const doubleTypes = task.doubleupTypes.length
    ? DOUBLEUP_TYPES.filter((dt) => task.doubleupTypes.includes(dt.id) && !(dt.id === 'dog' && apaleoHasDog) && !(dt.id === 'crib' && apaleoHasCrib))
    : [];
  const isCompleted = task.status === 'completed';

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        // Feinschliff Runde 7 (Punkt 6): auf Desktop etwas grosszuegigerer Innenraum (~12%
        // mehr Padding, minimal mehr Zeilenabstand) fuer schnellere Erfassbarkeit auf grossen
        // Bildschirmen - Kartenbreite/-design/Mobile-Masse bleiben unveraendert (kein `p-4`/
        // `gap-1.5` unterhalb `xl` betroffen).
        'relative flex flex-col gap-1.5 rounded-card-lg border p-4 text-left transition-colors xl:gap-2 xl:p-[18px]',
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
          {/* Standortweite manuelle Aufgabe (Punkt 2 "Apartment optional") hat kein unitName -
           * dann traegt der Standortname allein die Ueberschrift statt eines leeren "· Standort". */}
          {task.unitName ? (
            <>{task.unitName} <span className="text-[13px] font-normal not-italic text-muted">· {task.propertyName}</span></>
          ) : (
            task.propertyName
          )}
        </span>
        {noticeState === 'unread' ? (
          <IconAlertCircle width={16} height={16} className="mt-0.5 shrink-0 text-muted" aria-hidden="true" />
        ) : noticeState === 'read' ? (
          <IconCheck width={14} height={14} className="mt-1 shrink-0 text-sage" aria-hidden="true" />
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5">
          {/* Punkt 1: Aufgabe vs. Reinigung nie nur ueber Farbe - zusaetzliches monochromes
           * Outline-Icon neben dem ohnehin schon textlichen "Aufgabe"-Label der TonePill. */}
          {task.type === 'manual' ? <IconTask width={14} height={14} className="shrink-0 text-type-manual" aria-hidden="true" /> : null}
          <TonePill config={typeConfig} lang={lang} size="sm" />
        </span>
        <span className="flex min-w-0 items-center gap-1">
          {/* Briefing "Tag ändern" Punkt 8: dezente Kennzeichnung einer manuell verschobenen
           * Reinigung/Aufgabe - bestehendes Outline-Icon (IconRefresh, bereits fuer
           * "booking_changed_badge" in TimeLine() verwendet, hier fuer denselben "etwas an der
           * Planung wurde geaendert"-Sinngehalt in einer anderen Zeile/anderem Kontext), kein
           * neues Icon, keine Kartenvergroesserung (bleibt in der bestehenden Statuszeile). */}
          {task.scheduleOverride ? (
            <span title={translate(lang, 'rescheduled_badge_label')}>
              <IconRefresh width={13} height={13} className="shrink-0 text-muted" role="img" aria-label={translate(lang, 'rescheduled_badge_label')} />
            </span>
          ) : null}
          {/* Briefing "Wieder aktivieren": dezentes, bereits vorhandenes Outline-Icon (kein neues
           * Icon, keine Warnfarbe, keine zusaetzliche Kartenflaeche) - verschwindet automatisch
           * wieder, sobald die Reinigung erneut gestartet wurde (siehe tasks.ts#ResolvedTask.reopened:
           * rein aus dem letzten Verlaufseintrag abgeleitet), dann uebernimmt WorkStatus unten
           * wieder den aktuellen Status ("In Reinigung ..."). */}
          {task.reopened ? (
            <span title={translate(lang, 'reopened_badge_label')}>
              <IconRefresh width={13} height={13} className="shrink-0 text-muted" role="img" aria-label={translate(lang, 'reopened_badge_label')} />
            </span>
          ) : null}
          <WorkStatus task={task} lang={lang} shortName={shortName} />
        </span>
      </div>

      <TimeLine task={task} lang={lang} />

      <OccupancyLine task={task} lang={lang} doubleTypes={doubleTypes} />
    </button>
  );
}
