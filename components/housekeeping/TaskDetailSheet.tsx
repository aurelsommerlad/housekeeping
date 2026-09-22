import { useEffect, useRef, useState, type ReactNode } from 'react';
import { DOUBLEUP_TYPES } from '@/lib/housekeeping/api';
import { dayHeadingLabel } from '@/lib/housekeeping/dayLabel';
import { isAdmin, isPropertyManager, isTeamLead } from '@/lib/housekeeping/permissions';
import { TASK_STATUS_CONFIG, TASK_TYPE_CONFIG } from '@/lib/housekeeping/task-status-config';
import { canRescheduleTask, nextArrivalDateForTask, requiredPreparationItemIds, taskId as buildTaskId } from '@/lib/housekeeping/tasks';
import { canShowOriginal, resolveFreeText, translationFailedFor } from '@/lib/housekeeping/translation';
import type { TaskReservationSummary, TaskScheduleOverride, TaskType } from '@/lib/housekeeping/types';
import type { HousekeepingApp, ResolvedTask } from '@/lib/housekeeping/useHousekeepingApp';
import { BottomSheet } from './BottomSheet';
import { TonePill } from './TonePill';
import { TimeFlag } from './TimeFlag';
import { OccupancyLine, WorkStatus } from './TaskCard';
import { Button } from '@/components/ui/Button';
import {
  DoubleupIcon, IconAlertCircle, IconCalendar, IconCalendarClock, IconCheck, IconChevronDown, IconCircle, IconClock, IconClose,
  IconEdit, IconGlobe, IconMessageCircle, IconPlus, IconRefresh, IconRotateCcw, IconTask, IconUser,
} from '@/components/ui/icons';
import { cn } from '@/lib/cn';

export interface TaskDetailSheetProps {
  app: HousekeepingApp;
  task: ResolvedTask | null;
}

/** Bugfix (Punkt "Buchungsänderung geändert" zeigte "NaN.NaN."): `change.arrivalFrom/-To`/
 * `departureFrom/-To` (BookingChangeRecord, siehe api/booking-changes.js) sind die ROHEN
 * Apaleo-Reservierungsfelder `r.arrival`/`r.departure` - volle ISO-Datumszeiten
 * ("2026-09-22T15:00:00Z"), NICHT reine Datumsstrings wie `orphanedSchedule.scheduledDate`. Ein
 * direktes Anhaengen von "T00:00:00" an eine bereits vollstaendige ISO-Datumszeit ergab ein
 * ungueltiges Datum. `slice(0, 10)` normalisiert beide Faelle einheitlich auf "YYYY-MM-DD" (bei
 * einem bereits reinen Datumsstring wirkungslos), bevor die Uhrzeit angehaengt wird. */
function formatDayMonth(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
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
  reopened: 'history_reopened', restarted: 'history_restarted', unassigned: 'history_unassigned',
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
 * Stand; der Vorher-Wert kommt ausschliesslich aus dem separat gespeicherten Snapshot.
 *
 * Nutzerfeedback: keine eigene "Zur Kenntnis nehmen"-Aktion mehr - die Karte zeigt ausschliesslich
 * die Aenderung selbst (Datum/Personenanzahl/Einheit). Die Kenntnisnahme (fuer den Aufmerksamkeits-
 * punkt auf der kompakten Karte, siehe TasksScreen.tsx) passiert jetzt automatisch beim Oeffnen
 * dieser Detailansicht (siehe TaskDetailSheet()#useEffect oben), ohne eigenen Klick. */
function BookingChangeDetail({
  change, orphanedSchedule, t, unitLabel,
}: {
  change: NonNullable<ResolvedTask['bookingChange']>; orphanedSchedule: TaskScheduleOverride | null; t: HousekeepingApp['t'];
  /** Loest eine rohe Apaleo-Unit-ID (unitFrom/unitTo) in ihren Anzeigenamen auf (z. B. "ONE"),
   * Fallback auf die ID selbst, falls die Einheit im aktuell geladenen Bestand nicht (mehr)
   * bekannt ist - siehe TaskDetailSheet()#unitDisplayName. */
  unitLabel: (unitId: string | undefined) => string;
}) {
  return (
    <div className="rounded-control border border-status-progress/25 bg-status-progress-bg px-3.5 py-3">
      <div className="flex min-w-0 items-start gap-2">
        <IconRefresh width={16} height={16} className="mt-0.5 shrink-0 text-status-progress" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-[11.5px] font-semibold uppercase tracking-wide text-status-progress">{t('booking_changed_title')}</p>
          <p className="text-[11.5px] text-muted">{formatDateShort(change.changedAt)} · {formatClock(change.changedAt)}</p>
        </div>
      </div>
      <div className="mt-2 flex flex-col gap-1">
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
        {change.guestsFrom !== undefined || change.guestsTo !== undefined ? (
          <p className="text-[12.5px] text-ink">
            <span className="text-muted">{t('booking_changed_guests_label')}:</span> {change.guestsFrom ?? '–'} → {change.guestsTo ?? '–'}
          </p>
        ) : null}
        {change.unitFrom !== undefined || change.unitTo !== undefined ? (
          <p className="text-[12.5px] text-ink">
            <span className="text-muted">{t('booking_changed_unit_label')}:</span> {unitLabel(change.unitFrom)} → {unitLabel(change.unitTo)}
          </p>
        ) : null}
      </div>
      {/* Briefing "Tag ändern" Punkt 16: die bestehende Buchungsaenderungs-Erkennung (Punkt
       * "Buchungsaenderung sichtbar machen") erkennt bereits, dass sich die Abreise geaendert
       * hat - hier wird das lediglich mit einem evtl. noch vorhandenen manuellen
       * Planungs-Override auf den DAMALIGEN Termin gekreuzt (siehe TaskDetailSheet()
       * #orphanedSchedule), damit ein bestehender Override nicht kommentarlos verschwindet,
       * ohne eine zweite/konkurrierende Aenderungserkennung zu bauen. */}
      {orphanedSchedule ? (
        <p className="mt-1.5 flex items-start gap-1.5 text-[12px] text-status-attention">
          <IconAlertCircle width={13} height={13} className="mt-0.5 shrink-0" aria-hidden="true" />
          {t('schedule_override_orphaned_note', { date: formatDayMonth(orphanedSchedule.scheduledDate) })}
        </p>
      ) : null}
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
  app, task, isManager, assignmentOpen, onToggleAssignment, heading, showTeamInline = true,
}: {
  app: HousekeepingApp; task: ResolvedTask; isManager: boolean; assignmentOpen: boolean; onToggleAssignment: () => void;
  /** Briefing "Reinigungsdetailansicht ueberarbeiten" Punkt 7: innerhalb des gemeinsamen
   * "Arbeitsauftrag"-Abschnitts (Team+Reinigungskraft+Vorbereitung) heisst dieses Feld
   * "Reinigungskraft" statt "Reinigung" (Team steht daneben als eigenes Feld) - optional, damit
   * ein etwaiger anderer Aufrufer weiterhin die urspruengliche Standardueberschrift bekaeme. */
  heading?: string;
  /** false (nur im neuen "Arbeitsauftrag"-Kontext): der Teamname steht bereits als eigenes Feld
   * daneben - die Zusammenfassungszeile hier zeigt dann NUR die Person (bzw. "Nicht zugewiesen"/
   * "Noch nicht verteilt"), statt ihn ein zweites Mal in derselben Zeile zu wiederholen. */
  showTeamInline?: boolean;
}) {
  const { t, state, assignTask, releaseTask, workloadForPropertyDay, shortStaffName } = app;
  // Briefing "Tag ändern" Punkt 13: die Auslastungsanzeige ("N Aufgaben heute") muss den
  // EFFEKTIVEN Tag betrachten (scheduledDate), nicht das unveraenderte Quelldatum - sonst wuerde
  // sie nach einer Verschiebung die Auslastung des falschen Tages zeigen.
  const workload = workloadForPropertyDay(task.propertyCode, task.scheduledDate);
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
  // Punkt "Wieder aktivieren": nach einem Reopen+Neustart soll "In Reinigung · seit HH:MM" die
  // Startzeit DIESER (neuen) Sitzung zeigen, nicht die des historischen allerersten Starts vor der
  // vorherigen Fertigstellung - deshalb wird ab dem letzten 'reopened'-Eintrag gesucht, falls
  // vorhanden. Ohne jemals reaktivierte Vorgeschichte bleibt das Verhalten exakt wie zuvor (erster
  // 'started'-Eintrag insgesamt).
  const lastReopenedIndex = (() => {
    for (let i = task.history.length - 1; i >= 0; i -= 1) if (task.history[i].action === 'reopened') return i;
    return -1;
  })();
  const firstStartedAt = lastReopenedIndex >= 0
    ? (task.history.slice(lastReopenedIndex + 1).find((h) => h.action === 'started' || h.action === 'restarted')?.at ?? task.cleaningStartedAt ?? null)
    : (task.history.find((h) => h.action === 'started')?.at ?? task.cleaningStartedAt ?? null);
  const lastPausedAt = [...task.history].reverse().find((h) => h.action === 'paused')?.at ?? null;
  // Briefing "Wieder aktivieren": "Wieder geöffnet / Aurel · 11:40 Uhr" - sobald die Reinigung
  // erneut gestartet wurde, tritt task.reopened automatisch wieder zurueck (letzter Verlaufseintrag
  // ist dann 'restarted', nicht mehr 'reopened' - siehe tasks.ts#ResolvedTask.reopened) und der
  // aktuelle Status (statusNode oben) uebernimmt wieder die visuelle Prioritaet, ohne dass diese
  // Zeile hier extra ausgeblendet werden muesste.
  const reopenedEntry = task.reopened ? [...task.history].reverse().find((h) => h.action === 'reopened') : null;

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
  // Task Card (TaskCard.tsx), hier nur ausgeschrieben statt abgekuerzt. Im "Arbeitsauftrag"-Kontext
  // (showTeamInline=false) steht der Teamname bereits als eigenes Feld daneben - hier dann nur
  // Person/"Nicht zugewiesen"/"Noch nicht verteilt", ohne den Teamnamen zu wiederholen.
  const assignmentLabel = showTeamInline
    ? (task.assignedUserName
      ? (task.assignedTeamName ? `${shortStaffName(task.assignedUserName)} · ${task.assignedTeamName}` : shortStaffName(task.assignedUserName))
      : (task.assignedTeamName ? `${task.assignedTeamName} · ${t('team_task_unclaimed')}` : t('unassigned')))
    : (task.assignedUserName ? shortStaffName(task.assignedUserName) : (task.assignedTeamName ? t('team_task_unclaimed') : t('unassigned')));

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
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted">{heading ?? t('cleaning_status_title')}</p>
      {canManage ? (
        <button type="button" onClick={onToggleAssignment} className="flex flex-col gap-0.5 rounded-control py-0.5 text-left transition-colors hover:bg-surface">
          {summaryRow}
          {assigneeWorkload != null ? <p className="pl-6 text-[11.5px] text-muted">{t('task_count_today', { n: assigneeWorkload })}</p> : null}
          {reopenedEntry ? (
            <p className="pl-6 text-[11.5px] text-muted">
              {t('reopened_detail_by', { name: shortStaffName(reopenedEntry.byUserName), time: formatClock(reopenedEntry.at) })}
            </p>
          ) : null}
        </button>
      ) : (
        <div className="flex flex-col gap-0.5">
          {summaryRow}
          {assigneeWorkload != null ? <p className="pl-6 text-[11.5px] text-muted">{t('task_count_today', { n: assigneeWorkload })}</p> : null}
          {reopenedEntry ? (
            <p className="pl-6 text-[11.5px] text-muted">
              {t('reopened_detail_by', { name: shortStaffName(reopenedEntry.byUserName), time: formatClock(reopenedEntry.at) })}
            </p>
          ) : null}
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
  app, task, isManager, mine, onNoticeBlocked, onPreparationBlocked,
}: {
  app: HousekeepingApp; task: ResolvedTask; isManager: boolean; mine: boolean; onNoticeBlocked: () => void;
  /** Briefing "Vorbereitung als Checkliste" Punkt 4/5: bewusst eine ZWEITE, von onNoticeBlocked
   * komplett getrennte Blockierung - unbestaetigter Hinweis verhindert den START, offene
   * Vorbereitung verhindert den ABSCHLUSS. Beide fuehren den Benutzer zum jeweiligen Problem
   * (Scroll+Highlight), nie zu einer konkurrierenden Warnmeldung am Button selbst. */
  onPreparationBlocked: () => void;
}) {
  const {
    t, claimTask, releaseTask, startTaskTimer, pauseTaskTimer, openLinenCompletion, completeTaskInspection, noticeForTask,
    completeManualTask, reopenTask, reopenManualTask, shortStaffName, state,
  } = app;
  const canAct = isManager || mine;
  // Briefing "Wieder aktivieren": ausschliesslich echter Admin (server-seitig identisch
  // durchgesetzt, siehe api/task-assignments.js#reopen/api/manual-tasks.js#reopen) - bewusst NICHT
  // `isManager` (Standortverantwortliche duerfen laut Briefing ausdruecklich NICHT reaktivieren).
  const canReopen = isAdmin(state.user);
  function handleReopenCleaning() {
    if (typeof window !== 'undefined' && !window.confirm(t('reopen_confirm_cleaning', { unit: task.unitName || task.propertyName }))) return;
    reopenTask(task.id);
  }
  function handleReopenManual() {
    if (typeof window !== 'undefined' && !window.confirm(t('reopen_confirm_manual', { title: task.manualTitle || task.propertyName }))) return;
    reopenManualTask(task.id);
  }
  const notice = noticeForTask(task.id);
  const currentUserId = state.user?.id || null;
  const currentUserAck = currentUserId ? state.taskNoticeAcks[`${task.id}|${currentUserId}`] : null;
  const currentUserAckCurrent = !!(notice && currentUserAck && currentUserAck.noticeVersion === notice.version);

  // Punkt 3: manuelle Aufgaben haben KEINEN Reinigungs-Workflow (kein Start/Pause/Timer) - eigener,
  // vollstaendig getrennter Zweig ganz am Anfang, damit keiner der Status-basierten Reinigungs-
  // Zweige unten (insb. 'open'/'assigned' faellt sonst mit dem Claim-Flow zusammen) je greift.
  if (task.type === 'manual') {
    if (task.status === 'completed') {
      // Punkt "Wieder aktivieren": nach einem Reopen+erneutem Abschluss kann der Verlauf mehrere
      // 'completed'-Eintraege enthalten (z. B. [completed, reopened, completed]) - hier zaehlt
      // immer der LETZTE (der aktuell gueltige Abschluss), nicht mehr history[0].
      const doneEntry = [...task.history].reverse().find((h) => h.action === 'completed') || null;
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
          {canReopen ? (
            <Button variant="ghost" className="w-full" onClick={handleReopenManual}>
              <IconRefresh width={15} height={15} aria-hidden="true" />
              {t('reopen_action')}
            </Button>
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
      <div className="flex flex-col gap-1.5">
        <Button variant="secondary" className="w-full" disabled>
          <IconCheck width={15} height={15} className="text-sage" aria-hidden="true" />
          {t('cleaning_completed_status')}
        </Button>
        {canReopen ? (
          <Button variant="ghost" className="w-full" onClick={handleReopenCleaning}>
            <IconRefresh width={15} height={15} aria-hidden="true" />
            {t('reopen_action')}
          </Button>
        ) : null}
      </div>
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
    // Briefing "Vorbereitung als Checkliste" Punkt 4/5: eine offene Vorbereitung blockiert
    // ausschliesslich den ABSCHLUSS, nie den Start (siehe onNoticeBlocked oben fuer die
    // umgekehrte, separate Blockierung). Identisches Muster wie beim Start-Button: der Button
    // bleibt sichtbar und wirkt ECHT disabled, kein konkurrierender Text daneben - die
    // umschliessende <div> faengt den Tap trotzdem ab und fuehrt zum Problem (Vorbereitung).
    const openPreparationCount = requiredPreparationItemIds(task).filter((id) => !task.preparationCompletions[id]).length;
    const prepBlocked = openPreparationCount > 0;
    return (
      <div className="flex flex-col gap-2">
        <Button variant="secondary" className="w-full" onClick={() => pauseTaskTimer(task.id)}>
          {t('pause_clean')}
        </Button>
        <div onClick={prepBlocked ? onPreparationBlocked : undefined} className={prepBlocked ? 'cursor-not-allowed' : undefined}>
          <Button
            variant="primary"
            className="w-full"
            disabled={prepBlocked}
            title={prepBlocked ? t('preparation_incomplete_hint') : undefined}
            onClick={() => openLinenCompletion(task)}
          >
            {t('finish_clean')}
          </Button>
        </div>
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
    state, t, closeTaskModal, toggleTaskDoubleType, togglePreparationItem,
    finishTaskDoubleup, shortStaffName,
    noticeForTask, saveTaskNotice, removeTaskNotice, acknowledgeTaskNotice, retryTaskNoticeTranslation,
    saveTaskTimeOverride, removeTaskTimeOverride, setTaskTeam,
    rescheduleTask, resetTaskSchedule,
    markTaskSeen, isTaskSeenByMe, isBookingChangeAckedByMe, acknowledgeBookingChange,
  } = app;
  const open = !!task;
  const [noticeFormOpen, setNoticeFormOpen] = useState(false);
  const [noticeDraft, setNoticeDraft] = useState('');
  const [timeFormOpen, setTimeFormOpen] = useState(false);
  const [departureDraft, setDepartureDraft] = useState('');
  const [arrivalDraft, setArrivalDraft] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [assignmentOpen, setAssignmentOpen] = useState(false);
  const [scheduleFormOpen, setScheduleFormOpen] = useState(false);
  const [scheduleDraft, setScheduleDraft] = useState('');
  // Punkt 7: kurzzeitige Hervorhebung der Notice-Card, wenn ein Housekeeper "Reinigung starten"
  // versucht, ohne den wichtigen Hinweis bestaetigt zu haben (siehe onNoticeBlocked unten).
  const noticeRef = useRef<HTMLDivElement>(null);
  const [noticeHighlight, setNoticeHighlight] = useState(false);
  // Briefing "Vorbereitung als Checkliste" Punkt 4/5: dieselbe Scroll+Highlight-Mechanik wie beim
  // wichtigen Hinweis, aber vollstaendig getrennt - eine offene Vorbereitung blockiert den
  // ABSCHLUSS, nie den Start (siehe onPreparationBlocked unten).
  const prepRef = useRef<HTMLDivElement>(null);
  const [prepHighlight, setPrepHighlight] = useState(false);
  // Briefing "automatische Uebersetzung frei eingegebener operativer Texte" Punkt 9: zwei
  // getrennte "Original anzeigen"-Toggles (Hinweis/Aufgaben-Beschreibung), rein clientseitiger
  // UI-Zustand - keine eigene Persistenz noetig, faellt beim Schliessen des Sheets zurueck.
  const [noticeShowOriginal, setNoticeShowOriginal] = useState(false);
  const [descriptionShowOriginal, setDescriptionShowOriginal] = useState(false);

  // Briefing "Reinigungskarten ueberarbeiten" Punkt 5: "gesehen" gilt GENAU dann, wenn die
  // Detailansicht fuer DIESEN Task tatsaechlich geoeffnet wurde - nicht schon beim Laden/Scrollen
  // des Dashboards (dort wird task.id nie an diese Komponente durchgereicht, siehe
  // TasksScreen.tsx#state.detailTaskId). Muss VOR dem fruehen `if (!task) return` stehen (Regeln
  // der Hooks), daher der Guard innerhalb des Effekts selbst.
  useEffect(() => {
    if (!task) return;
    if (isTaskSeenByMe(task.id)) return;
    markTaskSeen(task.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.id]);

  // Nutzerfeedback "Buchung geändert braucht keine manuelle Bestaetigung mehr": die
  // BUCHUNG-GEÄNDERT-Karte zeigt nur noch die Änderung selbst, ohne eigene Aktion - das
  // Öffnen der Detailansicht gilt jetzt automatisch als Kenntnisnahme (identisch zum
  // markTaskSeen-Effekt direkt darueber), statt einen expliziten Klick zu verlangen. Der
  // orangene Aufmerksamkeitspunkt auf der kompakten Karte (TasksScreen.tsx) und der
  // "Buchung geändert"-Chip oben rechts in dieser Ansicht (attentionState unten) verschwinden
  // dadurch weiterhin zuverlaessig, sobald jemand die Aenderung tatsaechlich gesehen hat.
  useEffect(() => {
    if (!task || !task.bookingChange) return;
    if (isBookingChangeAckedByMe(task)) return;
    acknowledgeBookingChange(task.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.id, task?.bookingChange?.changedAt]);

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

  // --- "Tag ändern" (Briefing) ---------------------------------------------------------------
  // Punkt 4: nur Admin darf tatsaechlich verschieben - Standortverantwortliche/Team-Leads/
  // Housekeeper sehen "Geplant für"/"Verschoben" weiterhin (siehe JSX unten), aber ohne Stift-Icon.
  // Punkt 12: eine laufende/pausierte/abgeschlossene Reinigung (bzw. eine erledigte Aufgabe) kann
  // nicht mehr verschoben werden. Punkt: 'extra' (tagesaktuelle Zusatzausstattung ohne eigenen Tag)
  // ist begrifflich nicht "verschiebbar" (siehe tasks.ts#buildTasks - wird taeglich neu nur fuer
  // HEUTE abgeleitet) und deshalb bewusst ausgenommen.
  const canScheduleType = task.type !== 'extra';
  const canEditSchedule = canScheduleType && isAdmin(state.user) && canRescheduleTask(task.status);
  // Punkt 7: das harte Referenzdatum fuer Warnung/Blockierung - nur bei Turnover/Departure gesetzt.
  const nextArrivalDate = nextArrivalDateForTask(task);
  // Punkt "vor Implementierung analysieren"/Server-Kommentar (api/task-schedule-overrides.js): das
  // Planungsfenster ist unveraendert 4 Tage breit (Heute+3) - eine Verschiebung ausserhalb dieses
  // Fensters wuerde den Task beim naechsten Tageswechsel verwaisen lassen (sein Quelldatum faellt
  // aus dem rollierenden Fenster, buildTasks() erzeugt ihn dann gar nicht mehr). Schnellauswahl UND
  // freies Datum werden deshalb bewusst auf genau dieses Fenster begrenzt.
  const scheduleMin = state.planningDays[0] || task.scheduledDate;
  const scheduleMax = state.planningDays[state.planningDays.length - 1] || task.scheduledDate;
  const scheduleBlocked = !!(nextArrivalDate && scheduleDraft && scheduleDraft > nextArrivalDate);
  const scheduleCollision = !!(nextArrivalDate && scheduleDraft && scheduleDraft === nextArrivalDate);

  function openScheduleForm() {
    setScheduleDraft(task!.scheduledDate);
    setScheduleFormOpen(true);
  }
  async function handleSaveSchedule() {
    if (!scheduleDraft || scheduleBlocked) return;
    if (scheduleDraft === task!.scheduledDate) { setScheduleFormOpen(false); return; }
    await rescheduleTask(task!.id, scheduleDraft, nextArrivalDate, !!task!.assignedUserId);
    setScheduleFormOpen(false);
  }
  async function handleResetSchedule() {
    if (typeof window !== 'undefined' && !window.confirm(t('reset_schedule_confirm'))) return;
    await resetTaskSchedule(task!.id);
    setScheduleFormOpen(false);
  }
  // Briefing Punkt 16: bestehende Buchungsaenderungs-Erkennung (task.bookingChange, siehe oben)
  // gegen einen evtl. noch vorhandenen manuellen Override auf den DAMALIGEN Termin kreuzen - reine
  // Best-Effort-Anzeige (Reinigung/Turnover sind die einzigen Typen, deren Abreisedatum sich per
  // Buchungsaenderung verschieben laesst), keine zweite Aenderungserkennung.
  const orphanedSchedule = (() => {
    if (!task.bookingChange?.departureFrom || !task.sourceReservationId) return null;
    const candidateTypes: TaskType[] = ['turnover', 'departure'];
    for (const ty of candidateTypes) {
      const oldId = buildTaskId(task.propertyCode, task.unitId, task.bookingChange.departureFrom, ty, task.sourceReservationId);
      const found = state.taskScheduleOverrides[oldId];
      if (found) return found;
    }
    return null;
  })();

  // Briefing "Reinigungskarten ueberarbeiten" Punkt 8: unitFrom/unitTo im BookingChangeRecord
  // sind rohe Apaleo-Unit-IDs (siehe api/booking-changes.js) - hier auf den bereits geladenen
  // Apartmentnamen aufgeloest ("ONE" statt einer internen ID), Fallback auf die ID selbst, falls
  // die Einheit in state.planningUnits (aktueller Standort-/Zeitraumfilter) nicht bekannt ist.
  function unitDisplayName(unitId: string | undefined): string {
    if (!unitId) return '–';
    return state.planningUnits.find((u) => u.id === unitId)?.name || unitId;
  }
  const bookingChangeAcked = task.bookingChange ? isBookingChangeAckedByMe(task) : true;

  // Briefing "Reinigungsdetailansicht ueberarbeiten" Punkt 1/6: derselbe Aufmerksamkeits-Zustand
  // wie auf der kompakten Karte (siehe TasksScreen.tsx#cardAttentionState) - Buchungsaenderung hat
  // immer Vorrang vor "ungesehen", niemals beide gleichzeitig. Wird kurz nach dem Oeffnen wieder
  // 'none', sobald der Auto-Acknowledge-Effekt oben (siehe useEffect) die Kenntnisnahme
  // serverseitig gespeichert hat.
  const attentionState: 'none' | 'new' | 'changed' = task.bookingChange && !bookingChangeAcked
    ? 'changed'
    : (!isTaskSeenByMe(task.id) ? 'new' : 'none');

  // Punkt 8: dasselbe "gebucht vs. manuell" Prinzip wie auf der kompakten Karte (TaskCard.tsx) -
  // ein per Apaleo-Service (BABY) gebuchtes Babybett/ein gebuchter Hund gilt in der "Vorbereitung"
  // unten IMMER als aktiv, unabhaengig vom separaten, manuell togglebaren Housekeeping-Flag
  // (task.doubleupTypes) - beide Quellen bleiben technisch weiterhin getrennt (siehe
  // toggleTaskDoubleType), nur die visuelle "aktiv"-Kennzeichnung beruecksichtigt jetzt beide.
  const apaleoHasDog = !!(task.reservationInfo?.hasDog || task.nextReservationInfo?.hasDog);
  const apaleoHasCrib = !!(task.reservationInfo?.hasCrib || task.nextReservationInfo?.hasCrib);

  // Punkt 3/4: die tatsaechlich abzuhakenden Vorbereitungs-Positionen (siehe
  // requiredPreparationItemIds - manuelle Flags plus ein gebuchtes Babybett; ein nur gebuchter
  // Hund bleibt dort bewusst aussen vor) und wie viele davon noch offen sind, bestimmt ob die
  // Checkliste ueberhaupt angezeigt wird und ob "Reinigung abschliessen" blockiert.
  const requiredPrepIds = requiredPreparationItemIds(task);
  const openPreparationCount = requiredPrepIds.filter((id) => !task.preparationCompletions[id]).length;

  // Nutzerfeedback "keine konkurrierende Meldung am Start-Button": KEIN Toast mehr (der erschien
  // optisch wie ein zweiter, schwarzer Hinweis direkt neben dem schwarzen Start-Button) und KEIN
  // zusaetzlicher, dauerhaft eingeblendeter Erklaerungstext in der Hinweis-Karte (Nutzerfeedback:
  // die Variante ohne diesen Text war klarer) - ein blockierter Start-Versuch fuehrt ausschliesslich
  // per Scroll+kurzem Rahmen-Highlight zur Hinweis-Karte, ohne dass irgendwo sonst eine Meldung
  // aufploppt oder zusaetzlicher Text erscheint.
  function handleNoticeBlocked() {
    setNoticeHighlight(true);
    noticeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => setNoticeHighlight(false), 2000);
  }

  // Briefing "Vorbereitung als Checkliste" Punkt 4/5: identisches Muster wie handleNoticeBlocked,
  // aber fuer die separate Abschluss-Blockierung (offene Vorbereitung) - fuehrt zum Bereich
  // "Vorbereitung" statt zum wichtigen Hinweis, ebenfalls ohne Toast/konkurrierende Meldung.
  function handlePreparationBlocked() {
    setPrepHighlight(true);
    prepRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => setPrepHighlight(false), 2000);
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
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <button
            type="button"
            onClick={closeTaskModal}
            aria-label={t('close')}
            className="-mr-1 -mt-1 rounded-full p-1.5 text-muted transition-colors hover:bg-surface hover:text-ink"
          >
            <IconClose width={18} height={18} aria-hidden="true" />
          </button>
          {/* Briefing "Reinigungsdetailansicht ueberarbeiten" Punkt 1/6: derselbe Aufmerksamkeits-
           * Punkt wie auf der kompakten Karte, hier zusaetzlich mit Text statt nur Farbe (Farbe ist
           * nie der einzige Bedeutungstraeger). */}
          {attentionState !== 'none' ? (
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-medium',
                attentionState === 'changed' ? 'bg-status-progress-bg text-status-progress' : 'bg-status-clean-bg text-status-clean',
              )}
            >
              <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', attentionState === 'changed' ? 'bg-dot-changed' : 'bg-dot-new')} aria-hidden="true" />
              {t(attentionState === 'changed' ? 'booking_changed_dot_label' : 'task_new_dot_label')}
            </span>
          ) : null}
        </div>
      </div>

      <div className="mt-2 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5">
            {isManualTask ? <IconTask width={15} height={15} className="shrink-0 text-type-manual" aria-hidden="true" /> : null}
            <TonePill config={TASK_TYPE_CONFIG[task.type]} lang={state.lang} size="sm" />
            {/* Nutzerfeedback: "Termin verschoben"/"Wieder aktiviert" gehoeren fachlich zum Typ,
             * direkt daneben statt neben der Zuweisung (siehe TaskCard.tsx fuer dieselbe Aenderung
             * auf der kompakten Karte). */}
            {task.reopened ? (
              <span title={t('reopened_badge_label')}>
                <IconRotateCcw width={14} height={14} className="shrink-0 text-muted" role="img" aria-label={t('reopened_badge_label')} />
              </span>
            ) : null}
            {task.scheduleOverride ? (
              <span title={t('rescheduled_badge_label')}>
                <IconCalendarClock width={14} height={14} className="shrink-0 text-muted" role="img" aria-label={t('rescheduled_badge_label')} />
              </span>
            ) : null}
          </span>
          {/* Briefing "Reinigungsdetailansicht ueberarbeiten" Punkt 1/7: Team+Reinigungskraft in
           * EINER Zeile direkt neben dem Typ-Label - identische, bereits bestehende Logik wie auf
           * der kompakten Karte (WorkStatus), nicht neu erfunden. Fuer manuelle Aufgaben (kein
           * Reinigungs-Workflow/Team) steht die Zuweisung stattdessen weiter unten. */}
          {!isManualTask ? (
            <span className="min-w-0 shrink-0">
              <WorkStatus task={task} lang={state.lang} shortName={shortStaffName} />
            </span>
          ) : null}
        </div>

        {/* Nutzerfeedback: "Geplant für" stand bisher als eigene, mit einer Grossbuchstaben-
         * Ueberschrift eingeleitete Zeile ÜBER dem Zeitfenster - optisch zwei unabhaengige Bloecke
         * auf unterschiedlicher Texthoehe. Datum und Zeit gehoeren fachlich zusammen (beide
         * beschreiben "wann") und stehen jetzt in EINER Zeile auf gleicher Hoehe/Schriftgroesse,
         * Kalender-Icon analog zum bestehenden Uhr-Icon der Zeit - wie "Zeitfenster" zuvor ganz
         * ohne vorangestellte Ueberschrift. "Tag ändern" (Punkt 5/9 aus dem vorherigen Briefing)
         * bleibt unveraendert: Admin-Edit-Stift direkt daneben oeffnet dasselbe inline Formular
         * (Schnellauswahl + Datepicker + Kollisions-Warnung/-Block). hasTimeRow ist eine
         * Teilmenge von canScheduleType (nur turnover/departure haben ueberhaupt eine Kernzeit),
         * die aeussere Bedingung kann sich deshalb auf canScheduleType beschraenken. */}
        {canScheduleType ? (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
              <span className="flex items-center gap-1.5 text-[19px] font-semibold text-ink">
                <IconCalendar width={18} height={18} className="shrink-0 text-muted" aria-hidden="true" />
                {formatFullDate(task.scheduledDate)}
              </span>
              {canEditSchedule ? (
                <button
                  type="button"
                  onClick={() => (scheduleFormOpen ? setScheduleFormOpen(false) : openScheduleForm())}
                  aria-label={t('schedule_change_action')}
                  title={t('schedule_change_action')}
                  className="rounded-full p-1 text-muted transition-colors hover:bg-surface hover:text-ink"
                >
                  <IconEdit width={15} height={15} aria-hidden="true" />
                </button>
              ) : null}

              {hasTimeRow ? (
                <>
                  <span className="text-muted" aria-hidden="true">·</span>
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
                </>
              ) : null}

              {task.type === 'departure' && task.followingArrivalDate ? (
                <span className="ml-auto text-right text-[11px] leading-tight text-muted">
                  {t('next_arrival_label')}<br />{formatDayMonth(task.followingArrivalDate)}
                </span>
              ) : null}
            </div>

            {/* Nutzerfeedback: eine manuell verschobene Reinigung war bisher nur ein dezenter
             * grauer Hinweistext - kaum von normalem Fliesstext zu unterscheiden. Jetzt ein
             * deutliches gelb/goldenes Feld (bereits bestehender status-progress-Ton, siehe
             * "Buchung geändert" oben - keine neue Farbe eingefuehrt), damit eine Verschiebung auf
             * den ersten Blick auffaellt. Zeigt weiterhin das URSPRUENGLICHE Datum; die
             * tatsaechliche Reservierung (Abreise/Naechste Anreise) steht unveraendert separat
             * weiter unten - nie der Eindruck, die Reservierung selbst waere geaendert worden. */}
            {task.scheduleOverride ? (
              <div className="flex items-start gap-2 rounded-control border border-status-progress/25 bg-status-progress-bg px-3 py-2">
                <IconRefresh width={14} height={14} className="mt-0.5 shrink-0 text-status-progress" aria-hidden="true" />
                <p className="text-[12.5px] font-medium text-status-progress">
                  {t('rescheduled_from', {
                    from: formatFullDate(task.scheduleOverride.originalScheduledDate),
                    to: formatFullDate(task.scheduleOverride.scheduledDate),
                  })}
                </p>
              </div>
            ) : null}

            {!hasTimeRow && task.type === 'stayover' && task.nights ? (
              <p className="text-[13px] text-muted">{t(task.nights === 1 ? 'nights_one' : 'nights_many', { n: task.nights })}</p>
            ) : null}

            {canEditSchedule && scheduleFormOpen ? (
              <div className="rounded-control border border-line bg-warm-white px-3.5 py-3">
                {/* Punkt 6: Sicherheitsinformation - kompakter Reservierungskontext, BEVOR
                 * gespeichert wird. Die volle Reservierungskarte steht ohnehin weiter unten. */}
                {nextArrivalDate ? (
                  <p className="mb-2.5 text-[12px] text-muted">
                    {t('label_departure')} {formatFullDate(task.date)}{task.effectiveDepartureTime ? ` · ${task.effectiveDepartureTime}` : ''}
                    {' · '}{t('next_arrival_label')} {formatFullDate(nextArrivalDate)}
                    {task.type === 'turnover' && task.effectiveArrivalTime ? ` · ${task.effectiveArrivalTime}` : ''}
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-1.5">
                  {state.planningDays.map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setScheduleDraft(d)}
                      className={cn(
                        'rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors',
                        scheduleDraft === d ? 'border-ink bg-ink text-warm-white' : 'border-line bg-warm-white text-muted hover:text-ink',
                      )}
                    >
                      {dayHeadingLabel(t, state.lang, d, state.planningDays)}
                    </button>
                  ))}
                </div>
                {/* Punkt 5: "Anderer Datum ..." - bestehender nativer Date-Picker (wie beim
                 * Zeitfenster-Editor `type="time"` oben) statt einer neuen Datepicker-Komponente.
                 * Auf das 4-Tage-Planungsfenster begrenzt (siehe Kommentar bei scheduleMin/Max
                 * oben) - jenseits dessen wuerde der Task beim naechsten Tageswechsel verwaisen. */}
                <label className="mt-2.5 flex flex-col gap-1 text-[12.5px] font-medium text-muted">
                  {t('schedule_custom_date')}
                  <input
                    type="date"
                    value={scheduleDraft}
                    min={scheduleMin}
                    max={scheduleMax}
                    onChange={(e) => setScheduleDraft(e.target.value)}
                    className="rounded-control border border-line bg-warm-white px-2.5 py-1.5 text-[13px] text-ink"
                  />
                </label>

                {/* Punkt 7: Warnung bei Kollision mit der naechsten Anreise, HARTE Blockierung
                 * (Speichern deaktiviert), wenn der gewaehlte Tag NACH der naechsten Anreise
                 * liegt - serverseitig zusaetzlich durchgesetzt (siehe rescheduleTask/
                 * api/task-schedule-overrides.js). */}
                {scheduleBlocked ? (
                  <p className="mt-2.5 flex items-start gap-1.5 text-[12.5px] font-medium text-status-attention">
                    <IconAlertCircle width={14} height={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                    {t('schedule_after_arrival_blocked')}
                  </p>
                ) : scheduleCollision ? (
                  <p className="mt-2.5 flex items-start gap-1.5 text-[12.5px] text-status-attention">
                    <IconAlertCircle width={14} height={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                    {t('schedule_arrival_collision_warning')}
                  </p>
                ) : null}

                <div className="mt-2.5 flex items-center justify-between gap-2">
                  {task.scheduleOverride ? (
                    <button type="button" onClick={handleResetSchedule} className="text-[12px] font-medium text-muted hover:text-ink">
                      {t('reset_schedule')}
                    </button>
                  ) : <span />}
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setScheduleFormOpen(false)}>{t('cancel')}</Button>
                    <Button variant="primary" size="sm" disabled={scheduleBlocked} onClick={handleSaveSchedule}>{t('save')}</Button>
                  </div>
                </div>
              </div>
            ) : null}

            {hasTimeRow && canEditTimes && timeFormOpen ? (
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
        ) : null}

        {/* Briefing "Reinigungsdetailansicht ueberarbeiten" Punkt 1: kompakte ABREISE/ANREISE-
         * Belegungszeile - dieselbe, bereits bestehende Komponente wie auf der kompakten Karte
         * (TaskCard.tsx#OccupancyLine), hier ohne die manuellen Vorbereitungs-Icons (die stehen
         * weiter unten ausfuehrlich in "Arbeitsauftrag") - rendert fuer 'manual'/'extra' oder ohne
         * Reservierungsdaten von selbst nichts. */}
        {!isManualTask ? <OccupancyLine task={task} lang={state.lang} doubleTypes={[]} /> : null}

        {/* Punkt 6: die fruehere, hier zusaetzlich stehende Zuweisungszeile wurde entfernt - der
         * Name gehoert visuell eindeutig zur "Reinigung"-Sektion weiter unten (Mitarbeiter+Status
         * zusammengefuehrt), eine zweite Anzeige an dieser Stelle wirkte nur zerstreut. Fuer
         * manuelle Aufgaben (kein Reinigungs-Workflow) steht die Zuweisung stattdessen direkt vor
         * der Hauptaktion (siehe unten). */}

        {/* "Buchung" (Briefing "Reinigungsdetailansicht ueberarbeiten" Punkt 2): Reservierungsdaten
         * und Reservierungskommentar in EINEM gemeinsamen Bereich statt zweier gleichrangiger
         * Karten - der Kommentar ist eine sekundaere Information INNERHALB der Buchung (kleinere
         * Schrift, eigenes Sprechblasen-Icon, per Trennlinie abgesetzt statt eigener Card). Bei
         * Turnover weiterhin zweispaltig (Desktop/Tablet), strikt getrennt in Abreise/Naechste
         * Anreise (unveraendert). "Buchung in Apaleo öffnen" bewusst NICHT ergaenzt - es gibt
         * aktuell keine zuverlaessige Web-URL/ID-Logik zu einer Apaleo-Reservierung im Bestand
         * dieser App (nur der REST-API-Token-Fluss in api/_apaleo.js), siehe Abschlussbericht. */}
        {task.reservationInfo || task.nextReservationInfo || task.comment ? (
          <div className="rounded-control border border-line bg-surface px-3.5 py-3">
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted">{t('reservation_title')}</p>
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
            {task.comment ? (
              <div className={cn('text-[12.5px] text-ink', (task.reservationInfo || task.nextReservationInfo) && 'mt-3 border-t border-line pt-2.5')}>
                <p className="mb-0.5 flex items-center gap-1.5 text-[12px] font-medium text-muted">
                  <IconMessageCircle width={13} height={13} className="shrink-0" aria-hidden="true" />
                  {t('guest_comment')}
                </p>
                <p className="whitespace-pre-wrap">{cleanGuestComment(task.comment)}</p>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Beschreibung der manuellen Aufgabe (Punkt "Admin kann Aufgaben erstellen") - ersetzt an
         * dieser Stelle Reservierung/Gaestekommentar, die es fuer eine Aufgabe nicht gibt. */}
        {isManualTask && task.manualDescription ? (
          <div className="rounded-control border border-line bg-surface px-3.5 py-3 text-[13px] text-ink">
            <p className="mb-1 font-medium text-muted">{t('manual_task_description_title')}</p>
            <p className="whitespace-pre-wrap">
              {descriptionShowOriginal
                ? task.manualDescriptionTranslation?.sourceText || task.manualDescription
                : resolveFreeText(task.manualDescriptionTranslation, task.manualDescription, state.lang)}
            </p>
            {canShowOriginal(task.manualDescriptionTranslation, state.lang) ? (
              <button
                type="button"
                onClick={() => setDescriptionShowOriginal((v) => !v)}
                className="mt-1.5 text-[12px] font-medium text-muted underline decoration-dotted hover:text-ink"
              >
                {descriptionShowOriginal
                  ? t('show_translation_action')
                  : t('show_original_action')}
              </button>
            ) : null}
            {descriptionShowOriginal && task.manualDescriptionTranslation ? (
              <p className="mt-1 text-[11px] uppercase tracking-wide text-muted">
                {t('original_text_label', { lang: task.manualDescriptionTranslation.sourceLanguage.toUpperCase() })}
              </p>
            ) : null}
            {isManager && translationFailedFor(task.manualDescriptionTranslation, state.lang) ? (
              <p className="mt-1.5 text-[12px] text-muted">
                {t('translation_failed_admin_hint', { lang: state.lang.toUpperCase() })}
              </p>
            ) : null}
          </div>
        ) : null}

        {/* Buchungsaenderung (Punkt 9) - nur fuer Apaleo-abgeleitete Tasks (turnover/departure/
         * stayover) ueberhaupt moeglich, siehe types.ts#BookingChangeRecord. */}
        {task.bookingChange ? (
          <BookingChangeDetail change={task.bookingChange} orphanedSchedule={orphanedSchedule} t={t} unitLabel={unitDisplayName} />
        ) : null}

        {/* Wichtiger Hinweis - NIE aus dem Apaleo-Kommentar abgeleitet/ueberschrieben (Punkt 12).
         * Briefing "Reinigungsdetailansicht ueberarbeiten" Punkt 4: deutlich staerker hervorgehoben
         * als eine normale Info-Karte (warme, aber nicht grellrote Flaeche + Akzentfarbe/-linie,
         * Outline-Icon, GROSSGESCHRIEBENER Titel) - visuell klar wichtiger als "Buchung"/der
         * Reservierungskommentar. Punkt 7: ref+Hervorhebung fuer den blockierten Start-Versuch
         * (siehe handleNoticeBlocked oben) - Nutzerfeedback: NUR der Rahmen wird beim Highlight
         * dunkler/kraeftiger (border-status-attention statt der gedaempften /25-Variante), bewusst
         * OHNE zusaetzlichen `ring` (frueher `ring-2 ring-status-attention/30` daneben) - ein
         * zweiter, separat gerenderter Ring-Schatten direkt neben dem eigentlichen Rahmen konnte je
         * nach Geraet/Browser wie ein zusaetzlicher, dunkler zweiter Rand wirken. Genau EIN Rahmen,
         * keine zwei uebereinanderliegenden Umrandungen. */}
        {notice ? (
          <div
            ref={noticeRef}
            className={cn(
              'rounded-control border px-3.5 py-3 transition-colors',
              noticeHighlight ? 'border-status-attention bg-status-attention-bg' : 'border-status-attention/25 bg-status-attention-bg',
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-start gap-2">
                <IconAlertCircle width={18} height={18} className="mt-0.5 shrink-0 text-status-attention" aria-hidden="true" />
                <p className="text-[12px] font-semibold uppercase tracking-wide text-status-attention">{t('important_notice_title')}</p>
              </div>
              {/* Briefing Punkt 5: dezenter Hinweis, dass eine automatische Uebersetzung angezeigt
               * wird - bewusst sehr sekundaer (kleine graue Schrift, kein eigenes Gewicht), nie mit
               * dem WICHTIGER-HINWEIS-Titel konkurrierend. Nur wenn tatsaechlich eine Uebersetzung
               * fuer die aktuelle Sprache existiert (dieselbe Bedingung wie "Original anzeigen") -
               * keine Fake-Anzeige, wenn (noch) keine Uebersetzung vorliegt. */}
              {canShowOriginal(notice.translation, state.lang) ? (
                <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted">
                  <IconGlobe width={12} height={12} className="shrink-0" aria-hidden="true" />
                  {t('auto_translated_label')}
                </span>
              ) : null}
            </div>
            <div className="ml-[26px] min-w-0">
                <p className="mt-1 whitespace-pre-wrap text-[13px] text-ink">
                  {noticeShowOriginal
                    ? notice.translation?.sourceText || notice.text
                    : resolveFreeText(notice.translation, notice.text, state.lang)}
                </p>
                {canShowOriginal(notice.translation, state.lang) ? (
                  <button
                    type="button"
                    onClick={() => setNoticeShowOriginal((v) => !v)}
                    className="mt-1 text-[12px] font-medium text-muted underline decoration-dotted hover:text-ink"
                  >
                    {noticeShowOriginal ? t('show_translation_action') : t('show_original_action')}
                  </button>
                ) : null}
                {noticeShowOriginal && notice.translation ? (
                  <p className="mt-1 text-[11px] uppercase tracking-wide text-muted">
                    {t('original_text_label', { lang: notice.translation.sourceLanguage.toUpperCase() })}
                  </p>
                ) : null}
                {isManager && translationFailedFor(notice.translation, state.lang) ? (
                  <div className="mt-1.5 flex items-center gap-2 text-[12px] text-muted">
                    <span>{t('translation_failed_admin_hint', { lang: state.lang.toUpperCase() })}</span>
                    <button
                      type="button"
                      onClick={() => retryTaskNoticeTranslation(task!.id)}
                      className="font-medium text-ink hover:text-sage"
                    >
                      {t('translation_retry_action')}
                    </button>
                  </div>
                ) : null}
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

        {/* "Arbeitsauftrag" (Briefing "Reinigungsdetailansicht ueberarbeiten" Punkt 7): Team,
         * Reinigungskraft und Vorbereitung in EINEM verstaendlichen Abschnitt statt dreier
         * getrennter, teils redundanter Bereiche - Team und Reinigungskraft sind zwei
         * unterschiedliche, hier bewusst getrennt beschriftete Informationen (Punkt 1 zeigt sie im
         * Kopf bereits kombiniert per WorkStatus, hier also nicht nochmal als eine Zeile
         * wiederholt). Auf Desktop nebeneinander (Punkt 14), mobil untereinander. Manuelle
         * Aufgaben haben keinen Team-/Reinigungs-Workflow - dort weiterhin nur die schlichte
         * Zuweisungszeile vor der Hauptaktion. */}
        {!isManualTask ? (
          <div className="flex flex-col gap-3 rounded-control border border-line bg-type-stayover-bg px-3.5 py-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted">{t('work_order_title')}</p>
            <div className="flex flex-col gap-3 sm:flex-row sm:gap-6">
              {/* Team-Feld: Admin kann es hier aendern (unabhaengig vom Standortverantwortlichen-
               * Recht auf die Zuweisung daneben); Standortverantwortliche/Housekeeper sehen es nur,
               * wenn ein Team gesetzt ist (kein leeres Feld ohne Aussage). */}
              {isAdmin(state.user) && state.teams.length > 0 ? (
                <label className="flex flex-1 flex-col gap-1 text-[13px]">
                  <span className="text-[11px] text-muted">{t('team_label')}</span>
                  <select
                    value={task.assignedTeamId || ''}
                    onChange={(e) => setTaskTeam(task.id, e.target.value || null)}
                    className="rounded-control border border-line bg-warm-white px-2.5 py-1.5 text-[13px] text-ink"
                  >
                    <option value="">{t('no_team_label')}</option>
                    {state.teams.filter((tm) => tm.active).map((tm) => (
                      <option key={tm.id} value={tm.id}>{tm.name}</option>
                    ))}
                  </select>
                </label>
              ) : task.assignedTeamName ? (
                <div className="flex flex-1 flex-col gap-1">
                  <span className="text-[11px] text-muted">{t('team_label')}</span>
                  <span className="text-[13px] font-medium text-ink">{task.assignedTeamName}</span>
                </div>
              ) : null}

              {/* "Reinigungskraft" (Zuweisung + Reinigungsstatus zusammengefuehrt) - Admin/
               * Standortverantwortlich koennen die Zeile aufklappen, um denselben
               * Zuweisungs-Picker wie zuvor zu nutzen; ein normaler Housekeeper sieht nur die
               * Anzeige (unveraenderte Logik, siehe CleaningAssignmentSection). */}
              <div className="flex-1">
                <CleaningAssignmentSection
                  app={app}
                  task={task}
                  isManager={isManager}
                  assignmentOpen={assignmentOpen}
                  onToggleAssignment={() => setAssignmentOpen((v) => !v)}
                  heading={t('assignee_label')}
                  showTeamInline={false}
                />
              </div>
            </div>

            {/* "Vorbereitung" (vormals "Zusatzausstattung"), aufgeteilt in zwei getrennte Bereiche
             * (Briefing "UX-Optimierung Reinigungsdetail" Punkt 6/7): (a) ein Admin-/Standort-
             * verantwortlichen-Editor zum Festlegen, welche Vorbereitung ueberhaupt gilt (die
             * bisherigen Toggle-Chips, nur umbenannt), und (b) eine fuer die Reinigungskraft
             * bestimmte, echte Checkliste (kein Chip/Filter-Look) mit antippbaren Zeilen fuer
             * requiredPreparationItemIds(task) - das sind die manuell gesetzten Flags PLUS ein per
             * Apaleo-Service (BABY) gebuchtes Babybett (siehe requiredPreparationItemIds in
             * lib/housekeeping/tasks.ts). Ein nur gebuchter Hund ohne manuelles 'dog'-Flag taucht
             * bewusst NICHT in der Checkliste auf, sondern bleibt reine Gaesteinformation
             * (prep_apaleo_note weiter unten). toggleTaskDoubleType bleibt ausschliesslich der
             * Admin-Editor fuer den manuellen Flag; togglePreparationItem ist die neue, getrennte
             * Persistenz fuer den Erledigt-Status je Aufgabe (TaskAssignment.preparationCompletions). */}
            <div className="flex flex-col gap-3 border-t border-line pt-3">
              {isManager ? (
                <div className="flex flex-col gap-1.5">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted">{t('preparation_settings_title')}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {DOUBLEUP_TYPES.map((dt) => {
                      const manuallyOn = selectedTypes.includes(dt.id);
                      const apaleoOn = (dt.id === 'crib' && apaleoHasCrib) || (dt.id === 'dog' && apaleoHasDog);
                      const on = manuallyOn || apaleoOn;
                      const isAddExtra = dt.id === 'extra' && !on;
                      return (
                        <button
                          key={dt.id}
                          type="button"
                          onClick={() => toggleTaskDoubleType(task!, dt.id)}
                          className={cn(
                            'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors',
                            on
                              ? 'border-sage bg-warm-white text-ink'
                              : isAddExtra
                                ? 'border-dashed border-line bg-warm-white text-muted hover:text-ink'
                                : 'border-line bg-warm-white text-muted hover:text-ink',
                          )}
                        >
                          {isAddExtra ? <IconPlus width={13} height={13} aria-hidden="true" /> : <DoubleupIcon id={dt.id} width={14} height={14} aria-hidden="true" />}
                          {isAddExtra ? t('doubleup_extra_add') : t(dt.label)}
                          {on ? <IconCheck width={12} height={12} className="text-sage" aria-hidden="true" /> : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {requiredPrepIds.length > 0 ? (
                <div
                  ref={prepRef}
                  className={cn(
                    'flex flex-col gap-1.5 rounded-control transition-colors',
                    prepHighlight ? '-mx-1.5 bg-warm-white/70 px-1.5 py-1.5 ring-2 ring-sage/40' : undefined,
                  )}
                >
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted">{t('task_prep_title')}</p>
                  {/* Nutzerfeedback: die vorherige, groessere Chip-Darstellung war besser lesbar als
                   * die schmale Listenzeile - jetzt wieder als groesserer Pill wie zuvor, nur
                   * zusaetzlich tappable und mit Haken, sobald erledigt (weiterhin ueber
                   * togglePreparationItem/task.preparationCompletions, nicht mehr nur Anzeige). */}
                  <div className="flex flex-wrap gap-2">
                    {requiredPrepIds.map((id) => {
                      const dt = DOUBLEUP_TYPES.find((d) => d.id === id);
                      if (!dt) return null;
                      const completion = task.preparationCompletions[id];
                      const done = !!completion;
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => togglePreparationItem(task.id, id)}
                          title={isManager && completion ? t('preparation_completed_detail', {
                            name: shortStaffName(completion.completedByUserName),
                            time: new Date(completion.completedAt).toLocaleString(state.lang),
                          }) : undefined}
                          className={cn(
                            'inline-flex min-h-[44px] items-center gap-2 rounded-full border px-3.5 py-2 text-[13.5px] font-medium transition-colors',
                            done ? 'border-sage bg-warm-white text-ink' : 'border-line bg-warm-white text-muted hover:text-ink',
                          )}
                        >
                          {done
                            ? <IconCheck width={16} height={16} className="shrink-0 text-sage" aria-hidden="true" />
                            : <IconCircle width={16} height={16} className="shrink-0 text-muted" aria-hidden="true" />}
                          <DoubleupIcon id={dt.id} width={16} height={16} className="shrink-0" aria-hidden="true" />
                          {t(dt.label)}
                        </button>
                      );
                    })}
                  </div>
                  {openPreparationCount > 0 ? <p className="text-[11px] text-muted">{t('preparation_incomplete_hint')}</p> : null}
                </div>
              ) : null}

              {apaleoHasDog && !selectedTypes.includes('dog') ? (
                <p className="text-[11px] text-muted">{t('prep_apaleo_note')}</p>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-[13px]">
            <IconUser width={15} height={15} className="shrink-0 text-muted" aria-hidden="true" />
            <span className={task.assignedUserName ? 'font-medium text-ink' : 'text-muted'}>
              {task.assignedUserName ? shortStaffName(task.assignedUserName) : t('unassigned')}
            </span>
          </div>
        )}

        {!isManualTask && !isManager && selectedTypes.length > 0 && task.type === 'extra' ? (
          <Button variant="secondary" className="w-full" onClick={() => finishTaskDoubleup(task!)}>
            {t('finish_doubleup')}
          </Button>
        ) : null}

        {/* Briefing "Reinigungsdetailansicht ueberarbeiten" Punkt 9: "Reinigung starten" als
         * eindeutige primaere Aktion, "Vorfall melden" deutlich sekundaerer (Outline) und - wo
         * Platz ist - daneben statt gestapelt darunter. `flex-col-reverse` auf Mobile zeigt trotz
         * dieser DOM-Reihenfolge (Vorfall zuerst) die primaere Aktion oben, sekundaer darunter;
         * `sm:flex-row` stellt Vorfall links/PrimaryAction rechts nebeneinander, sobald Platz ist -
         * ausschliesslich Layout, PrimaryAction/openIncidentReport bleiben unveraendert. */}
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          {/* "Vorfall melden" (Briefing Punkt 4) - sekundaere Aktion, bevorzugter Workflow waehrend
           * einer laufenden Reinigung: die Reinigung ist hier bereits bekannt, der Benutzer muss sie
           * im Formular nicht nochmal auswaehlen (siehe useHousekeepingApp.ts#openIncidentReport).
           * Fuer manuelle Aufgaben nicht sinnvoll (keine Reinigung, taskId folgt zudem nicht dem von
           * openIncidentReport erwarteten Apaleo-Task-ID-Format). */}
          {!isManualTask ? (
            <Button variant="ghost" className="w-full sm:w-auto sm:shrink-0 sm:px-5" onClick={() => app.openIncidentReport(task!.id)}>
              <IconAlertCircle width={15} height={15} aria-hidden="true" />
              {t('report_incident_title')}
            </Button>
          ) : null}
          <div className="flex-1">
            <PrimaryAction
              app={app} task={task} isManager={isManager} mine={mine}
              onNoticeBlocked={handleNoticeBlocked} onPreparationBlocked={handlePreparationBlocked}
            />
          </div>
        </div>

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
