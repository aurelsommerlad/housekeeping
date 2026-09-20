import { useState } from 'react';
import { DOUBLEUP_TYPES } from '@/lib/housekeeping/api';
import { formatDuration } from '@/lib/housekeeping/rooms';
import { isAdmin, isPropertyManager } from '@/lib/housekeeping/permissions';
import { TASK_STATUS_CONFIG, TASK_TYPE_CONFIG } from '@/lib/housekeeping/task-status-config';
import type { HousekeepingApp, ResolvedTask } from '@/lib/housekeeping/useHousekeepingApp';
import { BottomSheet } from './BottomSheet';
import { TonePill } from './TonePill';
import { TimeFlag } from './TimeFlag';
import { Button } from '@/components/ui/Button';
import { DoubleupIcon, IconAlertCircle, IconCheck, IconCircle, IconClock, IconEdit, IconPlus } from '@/components/ui/icons';
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

/**
 * Auftrags-Detail als Bottom Sheet - analog zu RoomDetailSheet, aber auftragszentriert (Punkt 4):
 * Zuweisen/Timer/Abschluss beziehen sich auf DIESEN Task (an diesem Datum), nicht dauerhaft auf
 * das Apartment. Standortverantwortliche (Punkt 15) sehen dieselbe "Zuweisen an"-Ansicht wie
 * bisher Admins, aber nur fuer Mitarbeiter mit Zugriff auf DIESES Property; normale Housekeeper
 * (Punkt 14) sehen stattdessen Selbstzuweisung/Freigabe.
 *
 * Ueberarbeitete Hierarchie (Design-Feedback): Titel -> Typ/Status -> Zeiten -> Gast ->
 * Reservierungskommentar -> Wichtiger Hinweis (falls vorhanden/verwaltbar) -> Zuweisung ->
 * Zusatzausstattung -> Aktionen, mit durchgehend `gap-3` statt uneinheitlicher mt-4/mt-5/mt-6.
 */
export function TaskDetailSheet({ app, task }: TaskDetailSheetProps) {
  const {
    state, t, closeTaskModal, claimTask, releaseTask, assignTask, toggleTaskDoubleType,
    startTaskTimer, pauseTaskTimer, finishTask, completeTaskInspection, finishTaskDoubleup, workloadForPropertyDay,
    noticeForTask, saveTaskNotice, removeTaskNotice, acknowledgeTaskNotice,
    saveTaskTimeOverride, removeTaskTimeOverride,
  } = app;
  const open = !!task;
  const [noticeFormOpen, setNoticeFormOpen] = useState(false);
  const [noticeDraft, setNoticeDraft] = useState('');
  const [timeFormOpen, setTimeFormOpen] = useState(false);
  const [departureDraft, setDepartureDraft] = useState('');
  const [arrivalDraft, setArrivalDraft] = useState('');

  if (!task) {
    return <BottomSheet open={false} onClose={closeTaskModal}><div /></BottomSheet>;
  }

  // Fuer die "Gestartet HH:MM"/"Pausiert seit HH:MM"-Zeilen (Punkt "In Reinigung"/"Pausiert") -
  // direkt aus dem ohnehin vorhandenen Reinigungsverlauf abgeleitet, kein zweiter Zeitstempel.
  const firstStartedAt = task.history.find((h) => h.action === 'started')?.at ?? task.cleaningStartedAt ?? null;
  const lastPausedAt = [...task.history].reverse().find((h) => h.action === 'paused')?.at ?? null;

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
  }

  return (
    <BottomSheet open={open} onClose={closeTaskModal}>
      <h3 className="italic text-xl text-[#17160f]">
        {task.unitName} <span className="text-muted">· {task.propertyName}</span>
      </h3>

      <div className="mt-3 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <TonePill config={TASK_TYPE_CONFIG[task.type]} lang={state.lang} />
          <TonePill config={TASK_STATUS_CONFIG[task.status]} lang={state.lang} />
        </div>

        {task.type === 'turnover' || task.type === 'departure' ? (
          <div className="flex flex-col gap-1.5">
            {task.type === 'turnover' ? (
              <p className="text-[13px] text-muted">
                {t('label_departure')} {task.effectiveDepartureTime} → {t('label_arrival')} {task.effectiveArrivalTime}
              </p>
            ) : (
              <p className="text-[13px] text-muted">
                {t('label_departure')} {task.effectiveDepartureTime}
                {task.followingArrivalDate ? <> · {t('next_arrival_label')}: {formatDayMonth(task.followingArrivalDate)}</> : null}
              </p>
            )}

            {task.timeConflict || task.hasLateCheckout || task.hasEarlyCheckin || task.departureOverridden || task.arrivalOverridden ? (
              <div className="flex flex-col gap-1">
                {task.timeConflict ? (
                  <TimeFlag icon={IconAlertCircle} tone="attention">
                    {t('time_conflict_detail', { t1: task.bookedDepartureTime, t2: task.bookedArrivalTime || '' })}
                  </TimeFlag>
                ) : null}
                {task.hasLateCheckout ? (
                  <TimeFlag icon={IconClock}>{t('late_checkout_detail', { time: task.bookedDepartureTime })}</TimeFlag>
                ) : null}
                {task.hasEarlyCheckin ? (
                  <TimeFlag icon={IconClock}>{t('early_checkin_detail', { time: task.bookedArrivalTime || '' })}</TimeFlag>
                ) : null}
                {(task.departureOverridden || task.arrivalOverridden) && task.timeOverride ? (
                  <TimeFlag icon={IconEdit}>
                    {t('time_changed_detail', {
                      name: task.timeOverride.changedByName,
                      date: formatDateShort(task.timeOverride.changedAt),
                      time: formatClock(task.timeOverride.changedAt),
                    })}
                  </TimeFlag>
                ) : null}
              </div>
            ) : null}

            {canEditTimes && !timeFormOpen ? (
              <div className="flex flex-wrap gap-3">
                <button type="button" onClick={openTimeForm} className="self-start text-[12.5px] font-medium text-muted hover:text-ink">
                  {t('edit_times')}
                </button>
                {task.timeOverride ? (
                  <button type="button" onClick={handleResetTimes} className="self-start text-[12.5px] font-medium text-muted hover:text-ink">
                    {t('reset_times')}
                  </button>
                ) : null}
              </div>
            ) : null}

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
                <div className="mt-2.5 flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setTimeFormOpen(false)}>{t('cancel')}</Button>
                  <Button variant="primary" size="sm" onClick={handleSaveTimes}>{t('save')}</Button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {task.nextGuestName || task.guestName ? (
          <p className="text-[13px] text-muted">{task.type === 'turnover' ? task.nextGuestName : task.guestName}</p>
        ) : null}

        {task.comment ? (
          <div className="rounded-control border border-line bg-surface px-3.5 py-3 text-[13px] text-ink">
            <p className="mb-1 font-medium text-muted">{t('guest_comment')}</p>
            {task.comment}
          </div>
        ) : null}

        {/* Wichtiger Hinweis - NIE aus dem Apaleo-Kommentar abgeleitet/ueberschrieben (Punkt 12),
         * sehr helle warme Flaeche statt roter Warnbox (Punkt 3). */}
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

        {isManager ? (
          <>
            <div>
              <h4 className="mb-2 text-[13px] font-medium text-muted">{t('assign_to')}</h4>
              <div className="flex flex-col gap-1">
                {propHks.map((hk) => {
                  const isAssigned = task.assignedUserId === hk.id;
                  return (
                    <button
                      key={hk.id}
                      type="button"
                      onClick={() => assignTask(task!.id, { id: hk.id, name: hk.name })}
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
                    onClick={() => releaseTask(task!.id)}
                    className="flex items-center justify-between rounded-control px-3 py-2.5 text-left text-sm text-muted transition-colors hover:bg-surface"
                  >
                    {t('unassigned')}
                  </button>
                ) : null}
              </div>
            </div>

            <div>
              <h4 className="mb-2 text-[13px] font-medium text-muted">{t('doubleup_needed')}</h4>
              <div className="flex flex-wrap gap-2">
                {DOUBLEUP_TYPES.map((dt) => {
                  const on = selectedTypes.includes(dt.id);
                  return (
                    <button
                      key={dt.id}
                      type="button"
                      onClick={() => toggleTaskDoubleType(task!, dt.id)}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors',
                        on ? 'border-sage bg-type-stayover-bg text-ink' : 'border-line bg-warm-white text-muted hover:text-ink',
                      )}
                    >
                      <DoubleupIcon id={dt.id} width={16} height={16} aria-hidden="true" />
                      {t(dt.label)}
                    </button>
                  );
                })}
              </div>
            </div>

            {task.status === 'in_progress' || task.status === 'paused' ? (
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
            ) : null}

            {task.status === 'inspection' ? (
              <Button variant="primary" className="w-full" onClick={() => completeTaskInspection(task!)}>
                {t('complete_inspection')}
              </Button>
            ) : null}
          </>
        ) : (
          <>
            {selectedTypes.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {DOUBLEUP_TYPES.filter((dt) => selectedTypes.includes(dt.id)).map((dt) => (
                  <span
                    key={dt.id}
                    className="inline-flex items-center gap-1.5 rounded-full border border-sage bg-type-stayover-bg px-3.5 py-1.5 text-[13px] font-medium text-ink"
                  >
                    <DoubleupIcon id={dt.id} width={16} height={16} aria-hidden="true" />
                    {t(dt.label)}
                  </span>
                ))}
              </div>
            ) : null}

            {task.status === 'in_progress' || task.status === 'paused' ? (
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
            ) : null}

            {selectedTypes.length > 0 && task.type === 'extra' ? (
              <Button variant="secondary" className="w-full" onClick={() => finishTaskDoubleup(task!)}>
                {t('finish_doubleup')}
              </Button>
            ) : null}

            {task.status === 'open' ? (
              <Button variant="primary" className="w-full" onClick={() => claimTask(task!.id)}>
                {t('claim_task')}
              </Button>
            ) : null}

            {mine && task.status === 'assigned' ? (
              <div className="flex flex-col gap-2">
                {notice && !currentUserAckCurrent ? (
                  <p className="text-[12px] text-muted">{t('notice_start_blocked')}</p>
                ) : null}
                <Button
                  variant="primary"
                  className="w-full"
                  disabled={!!notice && !currentUserAckCurrent}
                  onClick={() => startTaskTimer(task!.id)}
                >
                  {t('start_clean')}
                </Button>
                <Button variant="ghost" className="w-full" onClick={() => releaseTask(task!.id)}>
                  {t('release_task')}
                </Button>
              </div>
            ) : null}

            {mine && task.status === 'in_progress' ? (
              <div className="flex flex-col gap-2">
                <Button variant="secondary" className="w-full" onClick={() => pauseTaskTimer(task!.id)}>
                  {t('pause_clean')}
                </Button>
                <Button variant="primary" className="w-full" onClick={() => finishTask(task!)}>
                  {t('finish_clean')}
                </Button>
              </div>
            ) : null}

            {mine && task.status === 'paused' ? (
              <Button variant="primary" className="w-full" onClick={() => startTaskTimer(task!.id)}>
                {t('resume_clean')}
              </Button>
            ) : null}
          </>
        )}

        {/* Reinigungsverlauf - direkt aus dem bestehenden Timer-/Abschluss-Datensatz (kein
         * zweiter, paralleler Speicherort), sichtbar fuer jeden, der diesen Task ueberhaupt
         * oeffnen kann (Admin/Standortverantwortliche/Housekeeper). */}
        {task.history.length > 0 ? (
          <div>
            <h4 className="mb-2 text-[13px] font-medium text-muted">{t('cleaning_history_title')}</h4>
            <div className="flex flex-col gap-1">
              {task.history.map((entry, i) => (
                <p key={i} className="text-[12.5px] text-muted">
                  {formatClock(entry.at)} · {t(HISTORY_LABEL_KEYS[entry.action])} · {entry.byUserName}
                  {entry.source ? <> · {t(entry.source === 'nfc' ? 'source_nfc' : 'source_manual')}</> : null}
                </p>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <Button variant="ghost" className="mt-4 w-full" onClick={closeTaskModal}>
        {t('close')}
      </Button>
    </BottomSheet>
  );
}
