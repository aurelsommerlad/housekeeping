import { useState } from 'react';
import { DOUBLEUP_TYPES } from '@/lib/housekeeping/api';
import { formatDuration } from '@/lib/housekeeping/rooms';
import { isAdmin, isPropertyManager } from '@/lib/housekeeping/permissions';
import { TASK_TYPE_CONFIG } from '@/lib/housekeeping/task-status-config';
import type { TaskReservationSummary } from '@/lib/housekeeping/types';
import type { HousekeepingApp, ResolvedTask } from '@/lib/housekeeping/useHousekeepingApp';
import { BottomSheet } from './BottomSheet';
import { TonePill } from './TonePill';
import { TimeFlag } from './TimeFlag';
import { Button } from '@/components/ui/Button';
import {
  DoubleupIcon, IconAlertCircle, IconCheck, IconChevronDown, IconCircle, IconClock, IconClose, IconEdit, IconPause,
  IconPlay, IconPlus, IconUser,
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
      <p className="text-[12px] text-muted">{info.reservationId}</p>
      {info.adults != null ? (
        <p className="text-[12.5px] text-ink">
          {t('search_adults_count', { n: info.adults })}
          {info.childrenCount > 0 ? ` · ${t('reservation_children_count', { n: info.childrenCount })}` : ''}
        </p>
      ) : null}
      {info.childrenCount > 0 ? (
        <p className="text-[11.5px] text-muted">{t('reservation_children_ages_line', { ages: info.childAges.join(', ') })}</p>
      ) : null}
      <p className="text-[11.5px] text-muted">
        {t('reservation_booked_on')} {info.bookingDate ? formatFullDate(info.bookingDate) : '–'}
      </p>
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

/** Elapsed-Anzeige + Primaeraktion (Punkt 10) - EIN gemeinsamer Block statt der zuvor doppelt
 * (Admin/Housekeeper) vorhandenen Kopie. Nutzt ausschliesslich die bereits vorhandenen
 * Timer-/Status-Funktionen (startTaskTimer/pauseTaskTimer/finishTask/claimTask/releaseTask) - kein
 * zweiter Mechanismus. `canAct` = Admin/Standortverantwortlicher oder eigene Zuweisung (identisch
 * zur bereits serverseitig erlaubten Selbstbedienungs-Regel fuer startTimer/stopTimer/release,
 * siehe api/task-assignments.js) - vorher konnten Admin/Standortverantwortliche den Timer eines
 * Tasks ueberhaupt nicht ueber die UI bedienen, obwohl der Server es schon erlaubte.
 */
function CleaningStatusSection({ app, task, isManager, mine }: { app: HousekeepingApp; task: ResolvedTask; isManager: boolean; mine: boolean }) {
  const { t, claimTask, releaseTask, startTaskTimer, pauseTaskTimer, finishTask, completeTaskInspection, noticeForTask, state } = app;
  const canAct = isManager || mine;
  const notice = noticeForTask(task.id);
  const currentUserId = state.user?.id || null;
  const currentUserAck = currentUserId ? state.taskNoticeAcks[`${task.id}|${currentUserId}`] : null;
  const currentUserAckCurrent = !!(notice && currentUserAck && currentUserAck.noticeVersion === notice.version);

  const firstStartedAt = task.history.find((h) => h.action === 'started')?.at ?? task.cleaningStartedAt ?? null;
  const lastPausedAt = [...task.history].reverse().find((h) => h.action === 'paused')?.at ?? null;

  return (
    <div className="flex flex-col gap-2.5">
      <h4 className="text-[13px] font-medium text-muted">{t('cleaning_status_title')}</h4>

      {task.status === 'completed' ? (
        <p className="flex items-center gap-1.5 text-[13px] font-medium text-ink">
          <IconCheck width={16} height={16} className="text-sage" aria-hidden="true" />
          {t('cleaning_completed_status')}{task.completedAt ? ` · ${formatClock(task.completedAt)}` : ''}
        </p>
      ) : task.status === 'in_progress' || task.status === 'paused' ? (
        <div className={cn(
          'rounded-control border px-4 py-3 text-center',
          task.status === 'in_progress' ? 'border-status-progress/30 bg-status-progress-bg' : 'border-status-blocked/30 bg-status-blocked-bg',
        )}
        >
          {firstStartedAt ? <p className="text-[12px] text-muted">{t('started_at_label', { time: formatClock(firstStartedAt) })}</p> : null}
          {task.status === 'paused' && lastPausedAt ? (
            <p className="text-[12px] text-muted">{t('paused_at_label', { time: formatClock(lastPausedAt) })}</p>
          ) : null}
          <p className={cn(
            'mt-1 text-[11.5px] font-medium uppercase tracking-wide',
            task.status === 'in_progress' ? 'text-status-progress' : 'text-status-blocked',
          )}
          >
            {t('elapsed')}
          </p>
          <p className="mt-0.5 text-3xl tabular-nums text-ink">{formatDuration(task.elapsedSeconds)}</p>
        </div>
      ) : (
        <TonePill config={{ labelKey: task.status === 'assigned' ? 'wf_assigned' : 'wf_open', toneClass: 'text-muted', toneBgClass: 'bg-surface', toneBorderClass: 'border-line', dotClass: 'bg-muted' }} lang={state.lang} size="sm" className="self-start" />
      )}

      {task.status === 'inspection' && isManager ? (
        <Button variant="primary" className="w-full" onClick={() => completeTaskInspection(task)}>
          {t('complete_inspection')}
        </Button>
      ) : null}

      {task.status === 'open' && !isManager ? (
        <Button variant="primary" className="w-full" onClick={() => claimTask(task.id)}>
          {t('claim_task')}
        </Button>
      ) : null}

      {task.status === 'assigned' && canAct ? (
        <div className="flex flex-col gap-2">
          {notice && !currentUserAckCurrent && !isManager ? (
            <p className="text-[12px] text-muted">{t('notice_start_blocked')}</p>
          ) : null}
          <Button
            variant="primary"
            className="w-full"
            disabled={!isManager && !!notice && !currentUserAckCurrent}
            onClick={() => startTaskTimer(task.id)}
          >
            {t('start_clean')}
          </Button>
          <Button variant="ghost" className="w-full" onClick={() => releaseTask(task.id)}>
            {t('release_task')}
          </Button>
        </div>
      ) : null}

      {task.status === 'in_progress' && canAct ? (
        <div className="flex flex-col gap-2">
          <Button variant="secondary" className="w-full" onClick={() => pauseTaskTimer(task.id)}>
            {t('pause_clean')}
          </Button>
          <Button variant="primary" className="w-full" onClick={() => finishTask(task)}>
            {t('finish_clean')}
          </Button>
        </div>
      ) : null}

      {task.status === 'paused' && canAct ? (
        <Button variant="primary" className="w-full" onClick={() => startTaskTimer(task.id)}>
          {t('resume_clean')}
        </Button>
      ) : null}
    </div>
  );
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
    state, t, closeTaskModal, releaseTask, assignTask, toggleTaskDoubleType,
    finishTaskDoubleup, workloadForPropertyDay,
    noticeForTask, saveTaskNotice, removeTaskNotice, acknowledgeTaskNotice,
    saveTaskTimeOverride, removeTaskTimeOverride,
  } = app;
  const open = !!task;
  const [noticeFormOpen, setNoticeFormOpen] = useState(false);
  const [noticeDraft, setNoticeDraft] = useState('');
  const [timeFormOpen, setTimeFormOpen] = useState(false);
  const [departureDraft, setDepartureDraft] = useState('');
  const [arrivalDraft, setArrivalDraft] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);

  if (!task) {
    return <BottomSheet open={false} onClose={closeTaskModal}><div /></BottomSheet>;
  }

  const isManager = isPropertyManager(state.user, task.propertyCode);
  // Punkt 13: Standortverantwortliche duerfen die Zeiten NUR sehen, nicht bearbeiten - anders als
  // beim "Wichtigen Hinweis" ist das hier bewusst echtem Admin vorbehalten (serverseitig ebenso
  // durchgesetzt, siehe api/task-time-overrides.js).
  const canEditTimes = isAdmin(state.user);
  const propHks = state.users.filter(
    (u) => u.role !== 'admin' &&
      (u.properties === 'alle' || u.properties === 'all' || (Array.isArray(u.properties) && u.properties.includes(task.propertyCode))),
  );
  const workload = workloadForPropertyDay(task.propertyCode, task.date);
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

  const hasTimeRow = task.type === 'turnover' || task.type === 'departure';

  return (
    <BottomSheet open={open} onClose={closeTaskModal}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="italic text-xl leading-tight text-[#17160f]">
          {task.unitName} <span className="text-[15px] text-muted">· {task.propertyName}</span>
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
        <TonePill config={TASK_TYPE_CONFIG[task.type]} lang={state.lang} size="sm" className="self-start" />

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
                    name: task.timeOverride.changedByName,
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

        {/* Kompakte Zuweisungszeile (Punkt 1) - ersetzt das fruehere "Zugewiesen"-Badge, der Name
         * allein zeigt bereits eindeutig, dass zugewiesen ist. Die interaktive Zuweisung/Aenderung
         * bleibt unten im Zuweisung-Abschnitt (Admin/Standortverantwortlich). */}
        <div className="flex items-center gap-1.5 border-y border-line/70 py-2 text-[13px]">
          <IconUser width={15} height={15} className="shrink-0 text-muted" aria-hidden="true" />
          <span className={task.assignedUserName ? 'font-medium text-ink' : 'text-muted'}>
            {task.assignedUserName || t('unassigned')}
          </span>
        </div>

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

        {/* Wichtiger Hinweis - NIE aus dem Apaleo-Kommentar abgeleitet/ueberschrieben (Punkt 12),
         * sehr helle warme Flaeche statt roter Warnbox. */}
        {notice ? (
          <div className="rounded-control border border-line bg-surface px-3.5 py-3">
            <div className="flex items-start gap-2">
              <IconAlertCircle width={18} height={18} className="mt-0.5 shrink-0 text-muted" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-ink">{t('important_notice_title')}</p>
                <p className="mt-1 whitespace-pre-wrap text-[13px] text-ink">{notice.text}</p>
                <div className="mt-2.5">
                  {currentUserAckCurrent && currentUserAck ? (
                    <span className="inline-flex items-center gap-1.5 text-[12.5px] text-muted">
                      <IconCheck width={14} height={14} className="text-sage" aria-hidden="true" />
                      {t('notice_ack_done', { name: currentUserAck.userName, time: formatClock(currentUserAck.acknowledgedAt) })}
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
        ) : isManager && !noticeFormOpen ? (
          <button
            type="button"
            onClick={openNoticeForm}
            className="inline-flex items-center gap-1.5 self-start text-[13px] font-medium text-muted hover:text-ink"
          >
            <IconPlus width={16} height={16} aria-hidden="true" />
            {t('important_notice_add')}
          </button>
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

        {/* Zuweisung (Punkt 8) - Admin/Standortverantwortlich: interaktive Liste; sonst nur die
         * bereits ausgewaehlte Zusatzausstattung als Chips (read-only), unveraendert. */}
        {isManager ? (
          <div>
            <h4 className="mb-1.5 text-[13px] font-medium text-muted">{t('assign_to')}</h4>
            <div className="flex flex-col">
              {propHks.map((hk) => {
                const isAssigned = task.assignedUserId === hk.id;
                return (
                  <button
                    key={hk.id}
                    type="button"
                    onClick={() => assignTask(task!.id, { id: hk.id, name: hk.name })}
                    className={cn(
                      'flex items-center justify-between rounded-control px-2.5 py-2 text-left text-sm transition-colors',
                      isAssigned ? 'font-medium text-ink' : 'text-muted hover:bg-surface',
                    )}
                  >
                    <span>{hk.name} · {workload[hk.id] || 0} {t('task_count_suffix')}</span>
                    {isAssigned ? <IconCheck width={15} height={15} aria-hidden="true" /> : null}
                  </button>
                );
              })}
              {task.assignedUserId ? (
                <button
                  type="button"
                  onClick={() => releaseTask(task!.id)}
                  className="flex items-center justify-between rounded-control px-2.5 py-2 text-left text-sm text-muted transition-colors hover:bg-surface"
                >
                  {t('unassigned')}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        <div>
          <h4 className="mb-1.5 text-[13px] font-medium text-muted">{t('doubleup_needed')}</h4>
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
                      'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors',
                      on ? 'border-sage bg-type-stayover-bg text-ink' : 'border-line bg-warm-white text-muted hover:text-ink',
                    )}
                  >
                    <DoubleupIcon id={dt.id} width={15} height={15} aria-hidden="true" />
                    {t(dt.label)}
                    {on ? <IconCheck width={13} height={13} className="text-sage" aria-hidden="true" /> : null}
                  </button>
                );
              })
              : DOUBLEUP_TYPES.filter((dt) => selectedTypes.includes(dt.id)).map((dt) => (
                <span
                  key={dt.id}
                  className="inline-flex items-center gap-1.5 rounded-full border border-sage bg-type-stayover-bg px-3 py-1.5 text-[12.5px] font-medium text-ink"
                >
                  <DoubleupIcon id={dt.id} width={15} height={15} aria-hidden="true" />
                  {t(dt.label)}
                </span>
              ))}
          </div>
        </div>

        {!isManager && selectedTypes.length > 0 && task.type === 'extra' ? (
          <Button variant="secondary" className="w-full" onClick={() => finishTaskDoubleup(task!)}>
            {t('finish_doubleup')}
          </Button>
        ) : null}

        <CleaningStatusSection app={app} task={task} isManager={isManager} mine={mine} />

        {/* Reinigungsverlauf (Punkt 13: bei Bedarf aufklappbar statt immer sichtbar, reduziert
         * das Scrollen fuer den operativ wichtigeren Teil oberhalb). */}
        {task.history.length > 0 ? (
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
                    {formatClock(entry.at)} · {t(HISTORY_LABEL_KEYS[entry.action])} · {entry.byUserName}
                    {entry.source ? <> · {t(entry.source === 'nfc' ? 'source_nfc' : 'source_manual')}</> : null}
                  </p>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <Button variant="ghost" className="mt-4 w-full" onClick={closeTaskModal}>
        {t('close')}
      </Button>
    </BottomSheet>
  );
}
