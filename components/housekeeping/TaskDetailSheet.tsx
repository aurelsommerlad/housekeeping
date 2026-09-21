import { useRef, useState, type ReactNode } from 'react';
import { DOUBLEUP_TYPES } from '@/lib/housekeeping/api';
import { isAdmin, isPropertyManager, isTeamLead } from '@/lib/housekeeping/permissions';
import { TASK_STATUS_CONFIG, TASK_TYPE_CONFIG } from '@/lib/housekeeping/task-status-config';
import type { TaskReservationSummary } from '@/lib/housekeeping/types';
import type { HousekeepingApp, ResolvedTask } from '@/lib/housekeeping/useHousekeepingApp';
import { BottomSheet } from './BottomSheet';
import { TonePill } from './TonePill';
import { TimeFlag } from './TimeFlag';
import { Button } from '@/components/ui/Button';
import {
  DoubleupIcon, IconAlertCircle, IconCheck, IconChevronDown, IconCircle, IconClock, IconClose, IconEdit, IconPlus,
  IconRefresh, IconTask, IconUser,
} from '@/components/ui/icons';
import { cn } from '@/lib/cn';

export interface TaskDetailSheetProps {
  app: HousekeepingApp;
  task: ResolvedTask | null;
}

function formatDayMonth(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00`);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.`;
}

function formatClock(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatDateShort(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.`;
}

const HISTORY_LABEL_KEYS = {
  started: 'history_started', paused: 'history_paused', resumed: 'history_resumed', completed: 'history_completed',
} as const;

function formatFullDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00`);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

/** Entfernt rein technische "|||"-Trennzeichen, die Apaleo selbst in `comment` liefert (live
 * bestaetigt, z. B. " ||| Geschaetzte Ankunftszeit: 16:00" fuer einen Kommentar ohne fuehrenden
 * Freitext-Teil) - NUR fuer die Anzeige hier, der Apaleo-Originalwert in task.comment bleibt an
 * der Datenquelle (tasks.ts) unveraendert. */
function cleanGuestComment(raw: string): string {
  return raw.split('|||').map((part) => part.trim()).filter(Boolean).join('\n');
}

/** Punkt 5: "2 Erwachsene · 3 Kinder" statt separater Tabellenzeilen; keine Kinder -> nur
 * "2 Erwachsene", keine zusaetzliche "Kinder: -"-Zeile. */
function CompactReservation({ info, heading, t }: { info: TaskReservationSummary; heading?: string; t: HousekeepingApp['t'] }) {
  return (
    <div className="flex flex-col gap-1">
      {heading ? <p className="text-[11px] font-medium uppercase tracking-wide text-muted">{heading}</p> : null}
      <p className="font-medium text-ink">{info.guestName || t('unassigned')}</p>
      {/* Punkt 8: Buchungsnummer + "gebucht am" kompakt in EINER Zeile statt zweier Zeilen mit
       * eigener Ueberschrift ("Gebucht am\n10.08.2026") - dieselben Werte, nur zusammengefasst. */}
      <p className="text-[12px] text-muted">
        {info.reservationId}
        {info.bookingDate ? ` · ${t('reservation_booked_on')} ${formatFullDate(info.bookingDate)}` : ''}
      </p>
      {info.adults != null ? (
        <p className="text-[12.5px] text-ink">
          {t('search_adults_count', { n: info.adults })}
          {info.childrenCount > 0 ? ` · ${t('reservation_children_count', { n: info.childrenCount })}` : ''}
        </p>
      ) : null}
      {info.childrenCount > 0 ? (
        <p className="text-[11.5px] text-muted">{t('reservation_children_ages_line', { ages: info.childAges.join(', ') })}</p>
      ) : null}
      {/* Gebuchte Apaleo-Extras (Hund/Babybett) DIESER Reservierung - fachlich getrennt von der
       * manuell in Housekeeping gesetzten "Vorbereitung" weiter unten (siehe task_prep_title),
       * deshalb ein eigenes, explizit als "gebucht" gekennzeichnetes Mini-Label statt derselben
       * Chips wiederzuverwenden. */}
      {info.hasDog || info.hasCrib ? (
        <div className="flex flex-col gap-0.5">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted">{t('booked_extras_title')}</p>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5">
            {info.hasDog ? (
              <span className="inline-flex items-center gap-1 text-[12px] text-ink">
                <DoubleupIcon id="dog" width={13} height={13} aria-hidden="true" />
                {t('doubleup_dog')}
              </span>
            ) : null}
            {info.hasCrib ? (
              <span className="inline-flex items-center gap-1 text-[12px] text-ink">
                <DoubleupIcon id="crib" width={13} height={13} aria-hidden="true" />
                {t('doubleup_crib')}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Punkt 3: die ausfuehrliche Erklaerung ("gebucht bis/ab HH:MM") bleibt per Tooltip erreichbar,
 * statt neben der ohnehin schon im Zeitfenster sichtbaren Zeit ein zweites Mal ausgeschrieben zu
 * werden. Reiner Darstellungs-Wrapper um das unveraenderte TimeFlag. */
function TimeBadge({ icon, tone, title, children }: { icon: Parameters<typeof TimeFlag>[0]['icon']; tone?: 'muted' | 'attention'; title: string; children: string }) {
  return (
    <span title={title}>
      <TimeFlag icon={icon} tone={tone}>{children}</TimeFlag>
    </span>
  );
}

/** Punkt "Buchungsaenderung sichtbar machen" (9): nachvollziehbare Vorher/Nachher-Anzeige in der
 * Detailansicht - nur die housekeeping-relevanten Felder, die sich tatsaechlich geaendert haben
 * (siehe types.ts#BookingChangeRecord/api/booking-changes.js). Apaleo liefert nur den aktuellen
 * Stand; der Vorher-Wert kommt ausschliesslich aus dem separat gespeicherten Snapshot. */
function BookingChangeDetail({ change, t }: { change: NonNullable<ResolvedTask['bookingChange']>; t: HousekeepingApp['t'] }) {
  return (
    <div className="rounded-control border border-line bg-surface px-3.5 py-3">
      <div className="flex items-start gap-2">
        <IconRefresh width={16} height={16} className="mt-0.5 shrink-0 text-muted" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-ink">
            {t('booking_changed_title')} <span className="font-normal text-muted">· {formatDateShort(change.changedAt)} {formatClock(change.changedAt)}</span>
          </p>
          <div className="mt-1.5 flex flex-col gap-1">
            {change.arrivalFrom !== undefined || change.arrivalTo !== undefined ? (
              <p className="text-[12.5px] text-ink">
                <span className="text-muted">{t('label_arrival')}:</span> {formatDayMonth(change.arrivalFrom || null)} → {formatDayMonth(change.arrivalTo || null)}
              </p>
            ) : null}
            {change.departureFrom !== undefined || change.departureTo !== undefined ? (
              <p className="text-[12.5px] text-ink">
                <span className="text-muted">{t('label_departure')}:</span> {formatDayMonth(change.departureFrom || null)} → {formatDayMonth(change.departureTo || null)}
              </p>
            ) : null}
            {change.unitFrom !== undefined || change.unitTo !== undefined ? (
              <p className="text-[12.5px] text-ink">
                <span className="text-muted">{t('reservation_title')}:</span> {change.unitFrom || '–'} → {change.unitTo || '–'}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * "Reinigung"-Abschnitt (Punkt "Zuweisung + Reinigungsstatus zusammenfuehren") - EINE Zeile mit
 * Name/"Nicht zugewiesen" links und Status rechts statt zweier getrennter Bereiche ("Zuweisen an"
 * + "Reinigungsstatus"). Admin/Standortverantwortlich koennen die Zeile aufklappen, um denselben,
 * unveraenderten Zuweisungs-Picker (Mitarbeiterliste mit Auslastung + Freigeben) zu nutzen, statt
 * dass er dauerhaft sichtbar ist; ein normaler Housekeeper sieht nur die schreibgeschuetzte
 * Anzeige (bestehende Berechtigungslogik, unveraendert - nur isManager darf zuweisen/freigeben).
 */
function CleaningAssignmentSection({
  app, task, isManager, assignmentOpen, onToggleAssignment,
}: { app: HousekeepingApp; task: ResolvedTask; isManager: boolean; assignmentOpen: boolean; onToggleAssignment: () => void }) {
  const { t, state, assignTask, releaseTask, workloadForPropertyDay, shortStaffName } = app;
  const workload = workloadForPropertyDay(task.propertyCode, task.date);
  // Housekeeping Teams: der Team-Verantwortliche des GENAU diesem Task zugeordneten Teams darf
  // hier zusaetzlich zu Standortverantwortlichen Personen zuweisen/umverteilen/freigeben - aber
  // ausschliesslich innerhalb des eigenen Teams (server-seitig identisch durchgesetzt, siehe
  // api/task-assignments.js#assign/release). isManager bleibt unveraendert das bestehende Recht.
  const isLeadHere = isTeamLead(state.user) && !!task.assignedTeamId && state.user?.housekeepingTeamId === task.assignedTeamId;
  const canManage = isManager || isLeadHere;
  const propHksAll = state.users.filter(
    (u) => u.role !== 'admin' &&
      (u.properties === 'alle' || u.properties === 'all' || (Array.isArray(u.properties) && u.properties.includes(task.propertyCode))),
  );
  // Ein reiner Team-Lead (kein Standortverantwortlicher) sieht/verteilt ausschliesslich unter
  // Mitgliedern des EIGENEN Teams - ein Standortverantwortlicher behaelt sein bestehendes,
  // teamuebergreifendes Recht unveraendert (Briefing: managedProperties bleibt eine eigene,
  // nicht mit teamRole vermischte Zustaendigkeit).
  const propHks = isManager ? propHksAll : propHksAll.filter((u) => u.housekeepingTeamId === task.assignedTeamId);
  const assigneeWorkload = task.assignedUserId ? workload[task.assignedUserId] || 0 : null;
  const firstStartedAt = task.history.find((h) => h.action === 'started')?.at ?? task.cleaningStartedAt ?? null;
  const lastPausedAt = [...task.history].reverse().find((h) => h.action === 'paused')?.at ?? null;

  let statusNode: ReactNode;
  if (task.status === 'completed') {
    statusNode = (
      <span className="flex shrink-0 items-center gap-1 text-[12.5px] font-medium text-muted">
        <IconCheck width={14} height={14} className="text-sage" aria-hidden="true" />
        {t('wf_done')}{task.completedAt ? ` · ${formatClock(task.completedAt)}` : ''}
      </span>
    );
  } else if (task.status === 'in_progress') {
    statusNode = (
      <span className="shrink-0 text-[12.5px] font-medium text-status-progress">
        {t('task_running_label')}{firstStartedAt ? ` · ${t('since_label', { time: formatClock(firstStartedAt) })}` : ''}
      </span>
    );
  } else if (task.status === 'paused') {
    statusNode = (
      <span className="shrink-0 text-[12.5px] font-medium text-status-blocked">
        {t('task_paused_label')}{lastPausedAt ? ` · ${t('since_label', { time: formatClock(lastPausedAt) })}` : ''}
      </span>
    );
  } else {
    statusNode = <TonePill config={TASK_STATUS_CONFIG[task.status]} lang={state.lang} size="sm" className="shrink-0" />;
  }

  // Housekeeping Teams: Person+Team wenn beides bekannt, sonst Team allein ("Noch nicht
  // verteilt"), sonst wie zuvor "Nicht zugewiesen" - dieselbe Prioritaet wie WorkStatus auf der
  // Task Card (TaskCard.tsx), hier nur ausgeschrieben statt abgekuerzt.
  const assignmentLabel = task.assignedUserName
    ? (task.assignedTeamName ? `${shortStaffName(task.assignedUserName)} · ${task.assignedTeamName}` : shortStaffName(task.assignedUserName))
    : (task.assignedTeamName ? `${task.assignedTeamName} · ${t('team_task_unclaimed')}` : t('unassigned'));

  const summaryRow = (
    <div className="flex items-center justify-between gap-2">
      <span className="flex min-w-0 items-center gap-1.5">
        <IconUser width={15} height={15} className="shrink-0 text-muted" aria-hidden="true" />
        <span className={cn('truncate text-[13px]', (task.assignedUserName || task.assignedTeamName) ? 'font-medium text-ink' : 'text-muted')}>
          {assignmentLabel}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1.5">
        {statusNode}
        {canManage ? (
          <IconChevronDown width={14} height={14} className={cn('text-muted transition-transform', assignmentOpen && 'rotate-180')} aria-hidden="true" />
        ) : null}
      </span>
    </div>
  );

  return (
    <div className="flex flex-col gap-1">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted">{t('cleaning_status_title')}</p>
      {canManage ? (
        <button type="button" onClick={onToggleAssignment} className="flex flex-col gap-0.5 rounded-control py-0.5 text-left transition-colors hover:bg-surface">
          {summaryRow}
          {assigneeWorkload != null ? <p className="pl-6 text-[11.5px] text-muted">{t('task_count_today', { n: assigneeWorkload })}</p> : null}
        </button>
      ) : (
        <div className="flex flex-col gap-0.5">
          {summaryRow}
          {assigneeWorkload != null ? <p className="pl-6 text-[11.5px] text-muted">{t('task_count_today', { n: assigneeWorkload })}</p> : null}
        </div>
      )}

      {canManage && assignmentOpen ? (
        <div className="mt-1 flex flex-col">
          {propHks.map((hk) => {
            const isAssigned = task.assignedUserId === hk.id;
            return (
              <button
                key={hk.id}
                type="button"
                onClick={() => assignTask(task.id, { id: hk.id, name: hk.name })}
                className={cn(
                  'flex items-center justify-between rounded-control px-2.5 py-2 text-left text-sm transition-colors',
                  isAssigned ? 'font-medium text-ink' : 'text-muted hover:bg-surface',
                )}
              >
                <span>{shortStaffName(hk.name)} · {workload[hk.id] || 0} {t('task_count_suffix')}</span>
                {isAssigned ? <IconCheck width={15} height={15} aria-hidden="true" /> : null}
              </button>
            );
          })}
          {task.assignedUserId ? (
            <button
              type="button"
              onClick={() => releaseTask(task.id)}
              className="flex items-center justify-between rounded-control px-2.5 py-2 text-left text-sm text-muted transition-colors hover:bg-surface"
            >
              {t('unassigned')}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Primaeraktion (Punkt "Primary Action") - EIN breiter, klar erkennbarer Button je Status statt
 * eines separaten Elapsed-Zeit-Blocks. Nutzt ausschliesslich die bereits vorhandenen Timer-/
 * Status-Funktionen (startTaskTimer/pauseTaskTimer/claimTask/releaseTask/completeTaskInspection) -
 * kein zweiter Mechanismus. Der "in_progress"-Button oeffnet ueber openLinenCompletion() zunaechst
 * das verpflichtende Waescheformular (LinenCompletionSheet.tsx) statt direkt finishTask()
 * aufzurufen - ist fuer das Property kein Waescheartikel konfiguriert, verhaelt sich das exakt wie
 * zuvor (siehe useHousekeepingApp.ts#openLinenCompletion). `canAct` = Admin/Standortverantwortlicher
 * oder eigene Zuweisung (identisch zur bereits serverseitig erlaubten Selbstbedienungs-Regel fuer
 * startTimer/stopTimer/release, siehe api/task-assignments.js) - vorher konnten Admin/
 * Standortverantwortliche den Timer eines Tasks ueberhaupt nicht ueber die UI bedienen, obwohl der
 * Server es schon erlaubte. */
function PrimaryAction({
  app, task, isManager, mine, onNoticeBlocked,
}: { app: HousekeepingApp; task: ResolvedTask; isManager: boolean; mine: boolean; onNoticeBlocked: () => void }) {
  const {
    t, claimTask, releaseTask, startTaskTimer, pauseTaskTimer, openLinenCompletion, completeTaskInspection, noticeForTask,
    completeManualTask, shortStaffName, state,
  } = app;
  const canAct = isManager || mine;
  const notice = noticeForTask(task.id);
  const currentUserId = state.user?.id || null;
  const currentUserAck = currentUserId ? state.taskNoticeAcks[`${task.id}|${currentUserId}`] : null;
  const currentUserAckCurrent = !!(notice && currentUserAck && currentUserAck.noticeVersion === notice.version);

  // Punkt 3: manuelle Aufgaben haben KEINEN Reinigungs-Workflow (kein Start/Pause/Timer) - eigener,
  // vollstaendig getrennter Zweig ganz am Anfang, damit keiner der Status-basierten Reinigungs-
  // Zweige unten (insb. 'open'/'assigned' faellt sonst mit dem Claim-Flow zusammen) je greift.
  if (task.type === 'manual') {
    if (task.status === 'completed') {
      const doneEntry = task.history[0];
      return (
        <div className="flex flex-col gap-1.5">
          <Button variant="secondary" className="w-full" disabled>
            <IconCheck width={15} height={15} className="text-sage" aria-hidden="true" />
            {t('manual_task_done_status')}
          </Button>
          {doneEntry ? (
            <p className="text-center text-[12px] text-muted">
              {doneEntry.byUserName ? `${shortStaffName(doneEntry.byUserName)} · ` : ''}{formatDateShort(doneEntry.at)} {formatClock(doneEntry.at)}
            </p>
          ) : null}
        </div>
      );
    }
    if (canAct) {
      return (
        <Button variant="primary" className="w-full" onClick={() => completeManualTask(task.id)}>
          {t('finish_manual_task')}
        </Button>
      );
    }
    return null;
  }

  if (task.status === 'inspection' && isManager) {
    return (
      <Button variant="primary" className="w-full" onClick={() => completeTaskInspection(task)}>
        {t('complete_inspection')}
      </Button>
    );
  }

  if (task.status === 'completed') {
    return (
      <Button variant="secondary" className="w-full" disabled>
        <IconCheck width={15} height={15} className="text-sage" aria-hidden="true" />
        {t('cleaning_completed_status')}
      </Button>
    );
  }

  if (task.status === 'open' && !isManager) {
    return (
      <Button variant="primary" className="w-full" onClick={() => claimTask(task.id)}>
        {t('claim_task')}
      </Button>
    );
  }

  if (task.status === 'assigned' && canAct) {
    // Punkt 3 (UX-Feinschliff): Button bleibt an seiner normalen Position, wirkt aber ECHT
    // disabled (opacity/pointer-events ueber Button.tsx#disabled, kein konkurrierender Text
    // daneben) statt eines dauerhaft sichtbaren Warnhinweises. Da ein natives disabled-Element
    // selbst keinen Klick mehr feuert, faengt die umschliessende <div> den Tap trotzdem ab
    // (pointer-events-none auf dem Button gibt den Treffer an sie weiter) und hebt die
    // Notice-Card hervor/scrollt dorthin (siehe onNoticeBlocked in der Elternkomponente) - so
    // bleibt "trotzdem tippen -> Hinweis hervorheben" moeglich, ohne auf einen echten Klick-
    // Handler am (fuer Tastatur/Screenreader) tatsaechlich deaktivierten Button zu verzichten.
    const blocked = !isManager && !!notice && !currentUserAckCurrent;
    return (
      <div className="flex flex-col gap-2">
        <div onClick={blocked ? onNoticeBlocked : undefined} className={blocked ? 'cursor-not-allowed' : undefined}>
          <Button
            variant="primary"
            className="w-full"
            disabled={blocked}
            title={blocked ? t('notice_start_hint') : undefined}
            onClick={() => startTaskTimer(task.id)}
          >
            {t('start_clean')}
          </Button>
        </div>
        <Button variant="ghost" className="w-full" onClick={() => releaseTask(task.id)}>
          {t('release_task')}
        </Button>
      </div>
    );
  }

  if (task.status === 'in_progress' && canAct) {
    return (
      <div className="flex flex-col gap-2">
        <Button variant="secondary" className="w-full" onClick={() => pauseTaskTimer(task.id)}>
          {t('pause_clean')}
        </Button>
        <Button variant="primary" className="w-full" onClick={() => openLinenCompletion(task)}>
          {t('finish_clean')}
        </Button>
      </div>
    );
  }

  if (task.status === 'paused' && canAct) {
    return (
      <Button variant="primary" className="w-full" onClick={() => startTaskTimer(task.id)}>
        {t('resume_clean')}
      </Button>
    );
  }

  return null;
}

/**
 * Auftrags-Detail als Bottom Sheet - analog zu RoomDetailSheet, aber auftragszentriert (Punkt 4):
 * Zuweisen/Timer/Abschluss beziehen sich auf DIESEN Task (an diesem Datum), nicht dauerhaft auf
 * das Apartment.
 *
 * Redesign (Design-Feedback #2): dieselbe Informationshierarchie wie die kompakte Task Card -
 * Kopf knapp (Typ-Badge, Zeitfenster mit Uhr-Icon prominent, LCO/ECI/Konflikt/Override kompakt
 * daneben statt ausgeschrieben), eine schlichte Zuweisungszeile statt eines "Zugewiesen"-Badges,
 * Reservierungen bei Turnover zweispaltig (Desktop/Tablet) statt einer hohen Tabelle,
 * Reinigungsverlauf aufklappbar. Reine Darstellung/Layout - Task-Ableitung, Zuweisung, Timer,
 * Pausen, NFC, Notices und Zeiten-Overrides sind unveraendert dieselbe Logik wie zuvor.
 */
export function TaskDetailSheet({ app, task }: TaskDetailSheetProps) {
  const {
    state, t, closeTaskModal, toggleTaskDoubleType,
    finishTaskDoubleup, showToast, shortStaffName,
    noticeForTask, saveTaskNotice, removeTaskNotice, acknowledgeTaskNotice,
    saveTaskTimeOverride, removeTaskTimeOverride, setTaskTeam,
  } = app;
  const open = !!task;
  const [noticeFormOpen, setNoticeFormOpen] = useState(false);
  const [noticeDraft, setNoticeDraft] = useState('');
  const [timeFormOpen, setTimeFormOpen] = useState(false);
  const [departureDraft, setDepartureDraft] = useState('');
  const [arrivalDraft, setArrivalDraft] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [assignmentOpen, setAssignmentOpen] = useState(false);
  // Punkt 7: kurzzeitige Hervorhebung der Notice-Card, wenn ein Housekeeper "Reinigung starten"
  // versucht, ohne den wichtigen Hinweis bestaetigt zu haben (siehe onNoticeBlocked unten).
  const noticeRef = useRef<HTMLDivElement>(null);
  const [noticeHighlight, setNoticeHighlight] = useState(false);

  if (!task) {
    return <BottomSheet open={false} onClose={closeTaskModal}><div /></BottomSheet>;
  }

  const isManager = isPropertyManager(state.user, task.propertyCode);
  // Punkt 13: Standortverantwortliche duerfen die Zeiten NUR sehen, nicht bearbeiten - anders als
  // beim "Wichtigen Hinweis" ist das hier bewusst echtem Admin vorbehalten (serverseitig ebenso
  // durchgesetzt, siehe api/task-time-overrides.js).
  const canEditTimes = isAdmin(state.user);
  const mine = !!(task.assignedUserId && state.user && task.assignedUserId === state.user.id);
  const selectedTypes = task.doubleupTypes;

  // Wichtiger Hinweis (Punkt 3-8) - eigene, vom Apaleo-Reservierungskommentar getrennte Datenquelle.
  const notice = noticeForTask(task.id);
  const currentUserId = state.user?.id || null;
  const currentUserAck = currentUserId ? state.taskNoticeAcks[`${task.id}|${currentUserId}`] : null;
  const currentUserAckCurrent = !!(notice && currentUserAck && currentUserAck.noticeVersion === notice.version);

  function openNoticeForm() {
    setNoticeDraft(notice?.text || '');
    setNoticeFormOpen(true);
  }
  async function handleSaveNotice() {
    if (!noticeDraft.trim()) return;
    await saveTaskNotice(task!.id, noticeDraft);
    setNoticeFormOpen(false);
  }
  async function handleRemoveNotice() {
    if (typeof window !== 'undefined' && !window.confirm(t('remove_confirm'))) return;
    await removeTaskNotice(task!.id);
  }

  function openTimeForm() {
    setDepartureDraft(task!.effectiveDepartureTime);
    setArrivalDraft(task!.effectiveArrivalTime || '');
    setTimeFormOpen(true);
  }
  async function handleSaveTimes() {
    // Nur tatsaechlich vom gebuchten/Standard-Wert abweichende Felder werden als Override
    // gesendet (Punkt 9/14) - ein unveraendert wieder abgeschicktes Feld erzeugt keine falsche
    // "Geaenderte Zeit"-Kennzeichnung fuer eine Seite, die der Admin gar nicht anfassen wollte.
    const times: { departureTime?: string; arrivalTime?: string } = {};
    if (departureDraft && departureDraft !== task!.bookedDepartureTime) times.departureTime = departureDraft;
    if (task!.type === 'turnover' && arrivalDraft && arrivalDraft !== task!.bookedArrivalTime) times.arrivalTime = arrivalDraft;
    if (Object.keys(times).length > 0) await saveTaskTimeOverride(task!.id, times);
    setTimeFormOpen(false);
  }
  async function handleResetTimes() {
    if (typeof window !== 'undefined' && !window.confirm(t('reset_times_confirm'))) return;
    await removeTaskTimeOverride(task!.id);
    setTimeFormOpen(false);
  }

  // Punkt 7: EINMALIGE, transiente Rueckmeldung statt eines dauerhaft sichtbaren Erklaerungstextes
  // ueber dem Start-Button - zusaetzlich wird die Notice-Card selbst kurz optisch hervorgehoben und
  // ins Bild gescrollt (nichts Neues erklaert, derselbe Text steht bereits in der Notice-Card).
  function handleNoticeBlocked() {
    showToast(t('notice_start_blocked'));
    setNoticeHighlight(true);
    noticeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => setNoticeHighlight(false), 2000);
  }

  const hasTimeRow = task.type === 'turnover' || task.type === 'departure';

  const isManualTask = task.type === 'manual';

  return (
    <BottomSheet open={open} onClose={closeTaskModal}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="italic text-xl leading-tight text-[#17160f]">
          {/* Standortweite manuelle Aufgabe (Punkt 2 "Apartment optional") hat kein unitName. */}
          {task.unitName ? (
            <>{task.unitName} <span className="text-[15px] text-muted">· {task.propertyName}</span></>
          ) : (
            task.propertyName
          )}
        </h3>
        <button
          type="button"
          onClick={closeTaskModal}
          aria-label={t('close')}
          className="-mr-1 -mt-1 shrink-0 rounded-full p-1.5 text-muted transition-colors hover:bg-surface hover:text-ink"
        >
          <IconClose width={18} height={18} aria-hidden="true" />
        </button>
      </div>

      <div className="mt-2 flex flex-col gap-3">
        <span className="flex items-center gap-1.5 self-start">
          {isManualTask ? <IconTask width={15} height={15} className="shrink-0 text-type-manual" aria-hidden="true" /> : null}
          <TonePill config={TASK_TYPE_CONFIG[task.type]} lang={state.lang} size="sm" />
        </span>

        {/* Zeitfenster (Punkt 1/2/3) - EINE Zeile: Uhr-Icon + Kernzeit prominent, Edit-Stift nur
         * fuer Admin direkt daneben statt eines Textlinks, LCO/ECI/Konflikt/Override kompakt mit
         * Tooltip statt ausgeschriebener Zusatzzeilen. */}
        {hasTimeRow ? (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
              <span className="flex items-center gap-1.5 text-[19px] font-semibold tabular-nums text-ink">
                <IconClock width={18} height={18} className="shrink-0 text-muted" aria-hidden="true" />
                {task.type === 'turnover' ? (
                  <>{task.effectiveDepartureTime} → {task.effectiveArrivalTime}</>
                ) : (
                  task.effectiveDepartureTime
                )}
              </span>
              {canEditTimes ? (
                <button
                  type="button"
                  onClick={() => (timeFormOpen ? setTimeFormOpen(false) : openTimeForm())}
                  aria-label={t('edit_times')}
                  title={t('edit_times')}
                  className="rounded-full p-1 text-muted transition-colors hover:bg-surface hover:text-ink"
                >
                  <IconEdit width={15} height={15} aria-hidden="true" />
                </button>
              ) : null}

              {task.timeConflict ? (
                <TimeBadge icon={IconAlertCircle} tone="attention" title={t('time_conflict_detail', { t1: task.bookedDepartureTime, t2: task.bookedArrivalTime || '' })}>
                  {t('time_conflict_badge')}
                </TimeBadge>
              ) : (
                <>
                  {task.hasLateCheckout ? (
                    <TimeBadge icon={IconClock} title={t('late_checkout_detail', { time: task.bookedDepartureTime })}>
                      {t('late_checkout_label')}
                    </TimeBadge>
                  ) : null}
                  {task.hasEarlyCheckin ? (
                    <TimeBadge icon={IconClock} title={t('early_checkin_detail', { time: task.bookedArrivalTime || '' })}>
                      {t('early_checkin_label')}
                    </TimeBadge>
                  ) : null}
                </>
              )}
              {(task.departureOverridden || task.arrivalOverridden) && task.timeOverride ? (
                <TimeBadge
                  icon={IconEdit}
                  title={t('time_changed_detail', {
                    name: shortStaffName(task.timeOverride.changedByName),
                    date: formatDateShort(task.timeOverride.changedAt),
                    time: formatClock(task.timeOverride.changedAt),
                  })}
                >
                  {t('time_changed_badge')}
                </TimeBadge>
              ) : null}

              {task.type === 'departure' && task.followingArrivalDate ? (
                <span className="ml-auto text-right text-[11px] leading-tight text-muted">
                  {t('next_arrival_label')}<br />{formatDayMonth(task.followingArrivalDate)}
                </span>
              ) : null}
            </div>

            {canEditTimes && timeFormOpen ? (
              <div className="rounded-control border border-line bg-warm-white px-3.5 py-3">
                <div className="flex gap-3">
                  <label className="flex flex-1 flex-col gap-1 text-[12.5px] font-medium text-muted">
                    {t('label_departure')}
                    <input
                      type="time"
                      value={departureDraft}
                      onChange={(e) => setDepartureDraft(e.target.value)}
                      className="rounded-control border border-line bg-warm-white px-2.5 py-1.5 text-[13px] text-ink"
                    />
                  </label>
                  {task.type === 'turnover' ? (
                    <label className="flex flex-1 flex-col gap-1 text-[12.5px] font-medium text-muted">
                      {t('label_arrival')}
                      <input
                        type="time"
                        value={arrivalDraft}
                        onChange={(e) => setArrivalDraft(e.target.value)}
                        className="rounded-control border border-line bg-warm-white px-2.5 py-1.5 text-[13px] text-ink"
                      />
                    </label>
                  ) : null}
                </div>
                <div className="mt-2.5 flex items-center justify-between gap-2">
                  {task.timeOverride ? (
                    <button type="button" onClick={handleResetTimes} className="text-[12px] font-medium text-muted hover:text-ink">
                      {t('reset_times')}
                    </button>
                  ) : <span />}
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setTimeFormOpen(false)}>{t('cancel')}</Button>
                    <Button variant="primary" size="sm" onClick={handleSaveTimes}>{t('save')}</Button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        ) : task.type === 'stayover' && task.nights ? (
          <p className="text-[13px] text-muted">{t(task.nights === 1 ? 'nights_one' : 'nights_many', { n: task.nights })}</p>
        ) : null}

        {/* Punkt 6: die fruehere, hier zusaetzlich stehende Zuweisungszeile wurde entfernt - der
         * Name gehoert visuell eindeutig zur "Reinigung"-Sektion weiter unten (Mitarbeiter+Status
         * zusammengefuehrt), eine zweite Anzeige an dieser Stelle wirkte nur zerstreut. Fuer
         * manuelle Aufgaben (kein Reinigungs-Workflow) steht die Zuweisung stattdessen direkt vor
         * der Hauptaktion (siehe unten). */}

        {/* Reservierung (Punkt 4/5) - bei Turnover zweispaltig (Desktop/Tablet), sonst ein
         * einzelner kompakter Block; strikt getrennt in Abreise/Naechste Anreise. */}
        {task.reservationInfo || task.nextReservationInfo ? (
          <div className="rounded-control border border-line bg-surface px-3.5 py-3">
            <p className="mb-2 text-[13px] font-medium text-ink">{t('reservation_title')}</p>
            {task.type === 'turnover' ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {task.reservationInfo ? <CompactReservation info={task.reservationInfo} heading={t('reservation_departure_title')} t={t} /> : null}
                {task.nextReservationInfo ? (
                  <div className="border-t border-line pt-3 sm:border-l sm:border-t-0 sm:pl-3 sm:pt-0">
                    <CompactReservation info={task.nextReservationInfo} heading={t('reservation_arrival_title')} t={t} />
                  </div>
                ) : null}
              </div>
            ) : task.reservationInfo ? (
              <CompactReservation info={task.reservationInfo} t={t} />
            ) : null}
          </div>
        ) : null}

        {task.comment ? (
          <div className="rounded-control border border-line bg-surface px-3.5 py-3 text-[13px] text-ink">
            <p className="mb-1 font-medium text-muted">{t('guest_comment')}</p>
            <p className="whitespace-pre-wrap">{cleanGuestComment(task.comment)}</p>
          </div>
        ) : null}

        {/* Beschreibung der manuellen Aufgabe (Punkt "Admin kann Aufgaben erstellen") - ersetzt an
         * dieser Stelle Reservierung/Gaestekommentar, die es fuer eine Aufgabe nicht gibt. */}
        {isManualTask && task.manualDescription ? (
          <div className="rounded-control border border-line bg-surface px-3.5 py-3 text-[13px] text-ink">
            <p className="mb-1 font-medium text-muted">{t('manual_task_description_title')}</p>
            <p className="whitespace-pre-wrap">{task.manualDescription}</p>
          </div>
        ) : null}

        {/* Buchungsaenderung (Punkt 9) - nur fuer Apaleo-abgeleitete Tasks (turnover/departure/
         * stayover) ueberhaupt moeglich, siehe types.ts#BookingChangeRecord. */}
        {task.bookingChange ? <BookingChangeDetail change={task.bookingChange} t={t} /> : null}

        {/* Wichtiger Hinweis - NIE aus dem Apaleo-Kommentar abgeleitet/ueberschrieben (Punkt 12),
         * sehr helle warme Flaeche statt roter Warnbox. Punkt 7: ref+Hervorhebung fuer den
         * blockierten Start-Versuch (siehe handleNoticeBlocked oben). */}
        {notice ? (
          <div
            ref={noticeRef}
            className={cn(
              'rounded-control border px-3.5 py-3 transition-shadow',
              noticeHighlight ? 'border-status-attention ring-2 ring-status-attention/30' : 'border-line bg-surface',
            )}
          >
            <div className="flex items-start gap-2">
              <IconAlertCircle width={18} height={18} className="mt-0.5 shrink-0 text-muted" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-ink">{t('important_notice_title')}</p>
                <p className="mt-1 whitespace-pre-wrap text-[13px] text-ink">{notice.text}</p>
                <div className="mt-2.5">
                  {currentUserAckCurrent && currentUserAck ? (
                    <span className="inline-flex items-center gap-1.5 text-[12.5px] text-muted">
                      <IconCheck width={14} height={14} className="text-sage" aria-hidden="true" />
                      {t('notice_ack_done', { name: shortStaffName(currentUserAck.userName), time: formatClock(currentUserAck.acknowledgedAt) })}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => acknowledgeTaskNotice(task!.id)}
                      className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-ink hover:text-sage"
                    >
                      <IconCircle width={14} height={14} aria-hidden="true" />
                      {t('notice_ack_prompt')}
                    </button>
                  )}
                </div>
                {isManager ? (
                  <div className="mt-2 flex gap-3 text-[12px] text-muted">
                    <button type="button" onClick={openNoticeForm} className="hover:text-ink">{t('edit')}</button>
                    <button type="button" onClick={handleRemoveNotice} className="hover:text-ink">{t('remove')}</button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        ) : isManager && !noticeFormOpen && !isManualTask ? (
          <div className="flex flex-col gap-1">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted">{t('important_notice_title')}</p>
            <button
              type="button"
              onClick={openNoticeForm}
              className="inline-flex items-center gap-1.5 self-start text-[13px] font-medium text-muted hover:text-ink"
            >
              <IconPlus width={16} height={16} aria-hidden="true" />
              {t('important_notice_add')}
            </button>
          </div>
        ) : null}

        {noticeFormOpen ? (
          <div className="rounded-control border border-line bg-warm-white px-3.5 py-3">
            <p className="mb-1.5 text-[13px] font-medium text-ink">{t('important_notice_title')}</p>
            <textarea
              value={noticeDraft}
              onChange={(e) => setNoticeDraft(e.target.value)}
              placeholder={t('important_notice_placeholder')}
              rows={3}
              className="w-full resize-none rounded-control border border-line bg-warm-white px-3 py-2 text-[13px] text-ink"
            />
            <div className="mt-2 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setNoticeFormOpen(false)}>{t('cancel')}</Button>
              <Button variant="primary" size="sm" onClick={handleSaveNotice}>{t('save')}</Button>
            </div>
          </div>
        ) : null}

        {/* Housekeeping Teams: Team-Zuordnung DIESES Tasks aendern - ausschliesslich Admin (Briefing
         * "UNIQUE PLACES Admin kann ... einzelne Reinigungen einer anderen Reinigungsfirma
         * zuordnen"), unabhaengig vom Standortverantwortlichen-Recht unten. Nur sichtbar, wenn
         * ueberhaupt Teams existieren - vorher entstuende eine leere, sinnlose Auswahl. */}
        {!isManualTask && isAdmin(state.user) && state.teams.length > 0 ? (
          <div className="flex items-center justify-between gap-2 text-[13px]">
            <span className="text-muted">{t('team_label')}</span>
            <select
              value={task.assignedTeamId || ''}
              onChange={(e) => setTaskTeam(task.id, e.target.value || null)}
              className="rounded-control border border-line bg-warm-white px-2 py-1.5 text-[13px] text-ink"
            >
              <option value="">{t('no_team_label')}</option>
              {state.teams.filter((tm) => tm.active).map((tm) => (
                <option key={tm.id} value={tm.id}>{tm.name}</option>
              ))}
            </select>
          </div>
        ) : null}

        {/* "Reinigung" (Zuweisung + Reinigungsstatus zusammengefuehrt) - Admin/Standortverantwortlich
         * koennen die Zeile aufklappen, um denselben Zuweisungs-Picker wie zuvor zu nutzen, statt
         * dass die Mitarbeiterliste dauerhaft sichtbar ist; Housekeeper sehen nur die Anzeige.
         * Manuelle Aufgaben haben keinen Reinigungs-Workflow - dort nur eine schlichte
         * Zuweisungszeile direkt vor der Hauptaktion (Punkt "Admin kann Aufgaben erstellen"). */}
        {!isManualTask ? (
          <CleaningAssignmentSection
            app={app}
            task={task}
            isManager={isManager}
            assignmentOpen={assignmentOpen}
            onToggleAssignment={() => setAssignmentOpen((v) => !v)}
          />
        ) : (
          <div className="flex items-center gap-1.5 text-[13px]">
            <IconUser width={15} height={15} className="shrink-0 text-muted" aria-hidden="true" />
            <span className={task.assignedUserName ? 'font-medium text-ink' : 'text-muted'}>
              {task.assignedUserName ? shortStaffName(task.assignedUserName) : t('unassigned')}
            </span>
          </div>
        )}

        {/* "Vorbereitung" (vormals "Zusatzausstattung") - Admin/Standortverantwortlich: interaktive
         * Toggles; sonst nur die bereits ausgewaehlte Ausstattung als Chips (read-only), unveraendert.
         * Fuer manuelle Aufgaben nicht relevant (kein Doubleup-Bezug). */}
        {!isManualTask ? (
          <div className="flex flex-col gap-1">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted">{t('task_prep_title')}</p>
            <div className="flex flex-wrap gap-1.5">
              {isManager
                ? DOUBLEUP_TYPES.map((dt) => {
                  const on = selectedTypes.includes(dt.id);
                  return (
                    <button
                      key={dt.id}
                      type="button"
                      onClick={() => toggleTaskDoubleType(task!, dt.id)}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors',
                        on ? 'border-sage bg-type-stayover-bg text-ink' : 'border-line bg-warm-white text-muted hover:text-ink',
                      )}
                    >
                      <DoubleupIcon id={dt.id} width={14} height={14} aria-hidden="true" />
                      {t(dt.label)}
                      {on ? <IconCheck width={12} height={12} className="text-sage" aria-hidden="true" /> : null}
                    </button>
                  );
                })
                : DOUBLEUP_TYPES.filter((dt) => selectedTypes.includes(dt.id)).map((dt) => (
                  <span
                    key={dt.id}
                    className="inline-flex items-center gap-1.5 rounded-full border border-sage bg-type-stayover-bg px-2.5 py-1 text-[12px] font-medium text-ink"
                  >
                    <DoubleupIcon id={dt.id} width={14} height={14} aria-hidden="true" />
                    {t(dt.label)}
                  </span>
                ))}
            </div>
          </div>
        ) : null}

        {!isManualTask && !isManager && selectedTypes.length > 0 && task.type === 'extra' ? (
          <Button variant="secondary" className="w-full" onClick={() => finishTaskDoubleup(task!)}>
            {t('finish_doubleup')}
          </Button>
        ) : null}

        <PrimaryAction app={app} task={task} isManager={isManager} mine={mine} onNoticeBlocked={handleNoticeBlocked} />

        {/* "Vorfall melden" (Briefing Punkt 4) - sekundaere Aktion, bevorzugter Workflow waehrend
         * einer laufenden Reinigung: die Reinigung ist hier bereits bekannt, der Benutzer muss sie
         * im Formular nicht nochmal auswaehlen (siehe useHousekeepingApp.ts#openIncidentReport).
         * Fuer manuelle Aufgaben nicht sinnvoll (keine Reinigung, taskId folgt zudem nicht dem von
         * openIncidentReport erwarteten Apaleo-Task-ID-Format). */}
        {!isManualTask ? (
          <Button variant="ghost" className="w-full" onClick={() => app.openIncidentReport(task!.id)}>
            <IconAlertCircle width={15} height={15} aria-hidden="true" />
            {t('report_incident_title')}
          </Button>
        ) : null}

        {/* Reinigungsverlauf (Punkt 13: bei Bedarf aufklappbar statt immer sichtbar, reduziert
         * das Scrollen fuer den operativ wichtigeren Teil oberhalb) - fuer manuelle Aufgaben
         * ausgeblendet: der Erledigt-Status inkl. Mitarbeiter/Zeitpunkt steht bereits direkt bei
         * der Hauptaktion (siehe PrimaryAction), eine zweite Anzeige waere redundant. */}
        {!isManualTask && task.history.length > 0 ? (
          <div>
            <button
              type="button"
              onClick={() => setHistoryOpen((v) => !v)}
              className="flex items-center gap-1 text-[13px] font-medium text-muted hover:text-ink"
            >
              <IconChevronDown width={14} height={14} className={cn('transition-transform', historyOpen && 'rotate-180')} aria-hidden="true" />
              {t(historyOpen ? 'cleaning_history_hide' : 'cleaning_history_show')}
            </button>
            {historyOpen ? (
              <div className="mt-2 flex flex-col gap-1">
                {task.history.map((entry, i) => (
                  <p key={i} className="text-[12.5px] text-muted">
                    {formatClock(entry.at)} · {t(HISTORY_LABEL_KEYS[entry.action])} · {shortStaffName(entry.byUserName)}
                    {entry.source ? <> · {t(entry.source === 'nfc' ? 'source_nfc' : 'source_manual')}</> : null}
                  </p>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </BottomSheet>
  );
}
