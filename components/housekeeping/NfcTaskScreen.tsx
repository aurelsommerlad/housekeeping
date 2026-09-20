'use client';

import Link from 'next/link';
import { translate } from '@/lib/housekeeping/i18n';
import type { NfcResolveResult } from '@/lib/housekeeping/api';
import { formatDuration, todayISO } from '@/lib/housekeeping/rooms';
import { TASK_STATUS_CONFIG, TASK_TYPE_CONFIG } from '@/lib/housekeeping/task-status-config';
import type { HousekeepingApp } from '@/lib/housekeeping/useHousekeepingApp';
import { TonePill } from './TonePill';
import { Button } from '@/components/ui/Button';
import { IconAlertCircle, IconCheck, IconCircle } from '@/components/ui/icons';

export interface NfcTaskScreenProps {
  app: HousekeepingApp;
  target: NfcResolveResult;
}

/**
 * Kompakte NFC-Ansicht (Briefing "Genau eine relevante Aufgabe") - bewusst NICHT die volle
 * TaskDetailSheet (keine Zuweisungs-/Zeiten-Verwaltung hier, das bleibt der normalen
 * Aufgaben-Ansicht vorbehalten), aber dieselbe Task-/Timer-/Hinweis-Logik: nichts davon wird
 * hier neu erfunden, nur schlanker dargestellt. Startet NIE automatisch - der Mitarbeiter
 * bestaetigt den Start immer bewusst per Klick (Briefing "Ganz wichtig").
 */
export function NfcTaskScreen({ app, target }: NfcTaskScreenProps) {
  const { state, t, claimTask, startTaskTimer, acknowledgeTaskNotice, noticeForTask } = app;

  if (state.loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-page px-6 text-center text-sm text-muted">
        {t('loading')}
      </div>
    );
  }

  const today = state.planningDays[0] || todayISO();
  const task = app.tasksForDayAll(today).find((x) => x.propertyCode === target.propertyCode && x.unitId === target.unitId);

  if (!task) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-page px-6 text-center">
        <div>
          <p className="italic text-xl text-[#17160f]">{target.unitName} <span className="text-muted">· {target.propertyCode}</span></p>
          <p className="mt-2 text-sm text-muted">{t('nfc_no_task_today')}</p>
        </div>
        <Link href="/" className="text-[13px] font-medium text-ink hover:text-sage">{t('nfc_back_to_app')}</Link>
      </div>
    );
  }

  const typeConfig = TASK_TYPE_CONFIG[task.type];
  const statusConfig = TASK_STATUS_CONFIG[task.status];
  const notice = noticeForTask(task.id);
  const currentUserId = state.user?.id || null;
  const currentUserAck = currentUserId ? state.taskNoticeAcks[`${task.id}|${currentUserId}`] : null;
  const currentUserAckCurrent = !!(notice && currentUserAck && currentUserAck.noticeVersion === notice.version);
  const noticeBlocksStart = !!notice && !currentUserAckCurrent;

  async function handleStart() {
    if (task!.status === 'open') await claimTask(task!.id);
    await startTaskTimer(task!.id, 'nfc');
  }

  return (
    <div className="flex min-h-dvh flex-col bg-page px-5 pb-8 pt-[max(env(safe-area-inset-top),1.5rem)]">
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-4">
        <div>
          <p className="italic text-xl text-[#17160f]">
            {task.unitName} <span className="text-muted">· {task.propertyName}</span>
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <TonePill config={typeConfig} lang={state.lang} />
            {task.status !== 'open' ? <TonePill config={statusConfig} lang={state.lang} /> : null}
          </div>
        </div>

        {task.type === 'turnover' ? (
          <p className="text-[13px] text-muted">
            {t('label_departure')} {task.effectiveDepartureTime} → {t('label_arrival')} {task.effectiveArrivalTime}
          </p>
        ) : task.type === 'departure' ? (
          <p className="text-[13px] text-muted">{t('label_departure')} {task.effectiveDepartureTime}</p>
        ) : task.type === 'stayover' && task.nights ? (
          <p className="text-[13px] text-muted">{translate(state.lang, task.nights === 1 ? 'nights_one' : 'nights_many', { n: task.nights })}</p>
        ) : null}

        <p className="text-[13px] font-medium text-ink">{task.assignedUserName || t('unassigned')}</p>

        {notice ? (
          <div className="rounded-control border border-line bg-surface px-3.5 py-3">
            <div className="flex items-start gap-2">
              <IconAlertCircle width={18} height={18} className="mt-0.5 shrink-0 text-muted" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-ink">{t('important_notice_title')}</p>
                <p className="mt-1 whitespace-pre-wrap text-[13px] text-ink">{notice.text}</p>
                <div className="mt-2.5">
                  {currentUserAckCurrent ? (
                    <span className="inline-flex items-center gap-1.5 text-[12.5px] text-muted">
                      <IconCheck width={14} height={14} className="text-sage" aria-hidden="true" />
                      {t('notice_ack_prompt')}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => acknowledgeTaskNotice(task.id)}
                      className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-ink hover:text-sage"
                    >
                      <IconCircle width={14} height={14} aria-hidden="true" />
                      {t('notice_ack_prompt')}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {task.status === 'open' || task.status === 'assigned' ? (
          <Button variant="primary" className="w-full" disabled={noticeBlocksStart} onClick={handleStart}>
            {t('start_clean')}
          </Button>
        ) : task.status === 'paused' ? (
          <Button variant="primary" className="w-full" disabled={noticeBlocksStart} onClick={handleStart}>
            {t('nfc_resume_label')}
          </Button>
        ) : task.status === 'in_progress' ? (
          <div className="rounded-control border border-status-progress/30 bg-status-progress-bg px-4 py-3 text-center">
            <p className="text-[13px] font-medium text-status-progress">{t('nfc_running_label')}</p>
            <p className="mt-0.5 text-2xl tabular-nums text-ink">{formatDuration(task.elapsedSeconds)}</p>
          </div>
        ) : (
          <p className="inline-flex items-center justify-center gap-1.5 rounded-control border border-status-clean/30 bg-status-clean-bg px-4 py-3 text-center text-[13px] font-medium text-status-clean">
            <IconCheck width={16} height={16} aria-hidden="true" />
            {t('nfc_already_completed')}
          </p>
        )}
      </div>

      <Link href="/" className="mt-6 self-center text-[13px] font-medium text-muted hover:text-ink">
        {t('nfc_back_to_app')}
      </Link>
    </div>
  );
}
