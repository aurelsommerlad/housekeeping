'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import type { HousekeepingApp } from '@/lib/housekeeping/useHousekeepingApp';
import { sortTasksForDay, type ResolvedTask } from '@/lib/housekeeping/tasks';
import type { StaffUser } from '@/lib/housekeeping/types';
import { allowedProperties } from '@/lib/housekeeping/rooms';
import { getPropertyDisplayName } from '@/lib/housekeeping/api';
import { dayOverviewFor } from '@/lib/housekeeping/dayOverview';
import { getTeamMemberships, isTeamLead, managedPropertyCodes } from '@/lib/housekeeping/permissions';
import { DAY_LABEL_KEYS, DAY_LOCALES, shortDayLabel } from '@/lib/housekeeping/dayLabel';
import { countLabel } from '@/lib/housekeeping/pluralLabel';
import { TaskCard } from './TaskCard';
import { TaskDetailSheet } from './TaskDetailSheet';
import { ManualTaskFormSheet } from './ManualTaskFormSheet';
import { MultiSelectBar } from './MultiSelectBar';
import { BulkAssignSheet } from './BulkAssignSheet';
import { BottomSheet } from './BottomSheet';
import { Button } from '@/components/ui/Button';
import { IconCheck, IconCheckSquare, IconChevronDown, IconPlus, IconSparkles, IconTask, IconUsers } from '@/components/ui/icons';
import { cn } from '@/lib/cn';

/** Punkt 6/7 (UX-Feinschliff): Icon DIREKT neben der Zahl (statt darunter beim Label) - eine
 * visuelle Einheit statt zweier gestapelter Zeilen. Alle drei Kennzahlen teilen sich dieselbe
 * Breite/Ausrichtung/Icon-/Zahlengroesse und sind innerhalb ihres Drittels zentriert; der
 * `toneClass` traegt einen sehr zurueckhaltenden, dem bestehenden Task-Typ-/Status-Farbsystem
 * entlehnten Akzent (nie eine farbige Flaeche hinter der ganzen Kennzahl). */
function SummaryStat({ value, label, icon: Icon, toneClass }: { value: number; label: string; icon: typeof IconCheck; toneClass: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5 xl:flex-row xl:items-baseline xl:gap-1.5">
      <span className="flex items-center gap-1.5">
        <Icon width={16} height={16} className={cn('shrink-0', toneClass)} aria-hidden="true" />
        <span className="text-[19px] font-semibold tabular-nums text-ink xl:text-[15px]">{value}</span>
      </span>
      <span className="text-[11px] text-muted xl:text-[13px]">{label}</span>
    </div>
  );
}

/** Briefing "Reinigungskarten ueberarbeiten" Punkt 1: gruppiert eine BEREITS priorisierte
 * Task-Liste (sortTasksForDay() lief schon vorher, siehe useHousekeepingApp.ts#tasksForDay) nach
 * `task.propertyCode` - ausschliesslich die echte Apaleo Property-ID/-Code, niemals Unit-Namen
 * oder String-Matching. Sortiert NICHT neu (Punkt 2: "keine neue parallele Prioritaetslogik") -
 * innerhalb jeder Gruppe bleibt exakt die bestehende, dringlichkeitsbasierte Reihenfolge erhalten,
 * nur partitioniert. Gruppenreihenfolge folgt `orderedCodes` (dieselbe Reihenfolge wie im
 * bestehenden Standort-Dropdown, siehe allowedProps) statt einer neu erfundenen (z. B.
 * alphabetischen) Sortierung; ein Code ausserhalb dieser Liste (sollte praktisch nicht vorkommen)
 * haengt defensiv am Ende an. */
function groupTasksByProperty(
  tasks: ResolvedTask[], orderedCodes: string[],
): { propertyCode: string; propertyName: string; tasks: ResolvedTask[] }[] {
  const byCode = new Map<string, ResolvedTask[]>();
  for (const task of tasks) {
    if (!byCode.has(task.propertyCode)) byCode.set(task.propertyCode, []);
    byCode.get(task.propertyCode)!.push(task);
  }
  const order = [...orderedCodes, ...Array.from(byCode.keys()).filter((c) => !orderedCodes.includes(c))];
  return order
    .filter((code) => byCode.has(code))
    .map((code) => ({ propertyCode: code, propertyName: byCode.get(code)![0].propertyName, tasks: byCode.get(code)! }));
}

/** Korrektur (UX-Feinschliff Runde 3): keine farbige Grossbuchstaben-Ueberschrift mehr - nur
 * noch die Anzahl in normaler Textfarbe ("3 Reinigungen"), optional mit demselben kleinen
 * Outline-Icon wie die zugehoerige Kennzahl oben (in deren dezentem Akzent) fuer den visuellen
 * Bezug. Text selbst bleibt in `text-ink`, nie vollstaendig eingefaerbt.
 *
 * Desktop-Feinschliff (Claude-Befehl 2): auf Mobile bleibt exakt diese Zeile ("3 Reinigungen")
 * bestehen - ab `xl` zeigt eine ZWEITE, per `hidden xl:flex`/`xl:hidden` umgeschaltete Variante
 * stattdessen "[Icon] REINIGUNGEN 3" (ruhige Grossbuchstaben-Kategorie VOR der Zahl, bestehendes
 * Icon unveraendert wiederverwendet) - dieselben Werte (`count`/dasselbe Icon/derselbe toneClass),
 * nur umsortierte Darstellung fuer den Breakpoint, kein zweiter Text-Bau-Mechanismus.
 *
 * Briefing "Reinigungskarten ueberarbeiten" Punkt 1: bei "Alle Standorte" (locationGroups gesetzt)
 * erscheint ZUSAETZLICH je eine kleine, ruhige Standortueberschrift (kein Card-Rahmen darum) vor
 * dem jeweiligen Teil-Grid - bei einem einzelnen ausgewaehlten Standort (locationGroups === null)
 * bleibt exakt das bisherige, einzelne Grid bestehen (keine redundante Standortueberschrift). Auf
 * Mobile identisch zu Desktop, nur dasselbe bereits bestehende responsive Grid je Gruppe. */
function TaskGroup({
  text, count, categoryLabel, icon: Icon, toneClass, tasks, locationGroups, renderCard,
}: {
  text: string; count: number; categoryLabel: string; icon?: typeof IconCheck; toneClass?: string;
  tasks: ResolvedTask[];
  locationGroups: { propertyCode: string; label: string; tasks: ResolvedTask[] }[] | null;
  renderCard: (task: ResolvedTask) => ReactNode;
}) {
  const gridClass = 'grid grid-cols-1 gap-3 px-4 pt-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-[repeat(auto-fill,minmax(340px,1fr))]';
  return (
    <div>
      {/* Desktop-Toolbar-Redesign (Punkt 9/10): auf Desktop bewusst etwas kleiner/ruhiger
       * (kleinere Schrift, normales statt medium Gewicht, gedaempfte Textfarbe) als zuvor, damit
       * sich die inhaltlich redundante Doppelung mit der KPI-Zeile im Toolbar nicht aufdraengt -
       * die Zeile bleibt trotzdem bestehen (andere Funktion: Tages-Kennzahl vs. Abschnittsanfang,
       * siehe Briefing), nur ihr visuelles Gewicht sinkt. `xl:pt-2` verkuerzt zugleich den Abstand
       * zur Toolbar darueber (Punkt 8: kein doppelter Kennzahlen-Bereich mehr, also auch kein
       * grosser Leerraum mehr noetig). Mobile bleibt unveraendert (keine der `xl:`-Klassen wirkt
       * unterhalb 1280px). */}
      <p className="flex items-center gap-1.5 px-4 pt-4 pb-1 text-[13px] font-medium text-ink xl:hidden">
        {Icon ? <Icon width={14} height={14} className={cn('shrink-0', toneClass)} aria-hidden="true" /> : null}
        {text}
      </p>
      <p className="hidden items-center gap-1.5 px-4 pt-2 pb-1 text-[11px] font-normal uppercase tracking-wide text-muted xl:flex">
        {Icon ? <Icon width={13} height={13} className={cn('shrink-0', toneClass)} aria-hidden="true" /> : null}
        {categoryLabel}
        <span className="font-medium normal-case text-ink">{count}</span>
      </p>
      {/* Punkt 8 (Desktop): ab xl eine minmax()-basierte Grid-Regel statt fester 3-Spalten, damit
       * Cards auf sehr breiten Monitoren nicht unnoetig auseinandergezogen werden (Karte selbst
       * unveraendert) - unterhalb xl bleiben sm:/lg:grid-cols-* exakt wie bisher wirksam. */}
      {locationGroups ? (
        <div className="flex flex-col gap-1">
          {locationGroups.map((group) => (
            <div key={group.propertyCode}>
              <p className="px-4 pb-1 pt-3 text-[12px] font-medium text-muted first:pt-1">{group.label}</p>
              <div className={gridClass}>{group.tasks.map(renderCard)}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className={gridClass}>{tasks.map(renderCard)}</div>
      )}
    </div>
  );
}

/**
 * Briefing "Housekeeping-Dashboard anpassen" Punkt 3/4: derselbe visuelle Chip-Stil wie der
 * bestehende native "Ansicht"-Picker (siehe `selectClass` in TasksScreen) - als Knopf+Liste statt
 * <select>, NUR weil eine native <option> keine farbige Teilzeile (Zahl in Warnfarbe) darstellen
 * kann. Fachlich ersetzt sie ausschliesslich die bisherige Anzeige, keine neue Filterlogik: welcher
 * `value` gewaehlt wird, entscheidet weiterhin exakt dieselbe Aufrufer-Logik wie beim bisherigen
 * <select onChange>.
 */
function TaskViewSelect({
  value, options, onChange, className,
}: {
  value: string;
  options: { value: string; label: string; count?: number; highlightCount?: boolean }[];
  onChange: (value: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value) || options[0];
  return (
    <div className={cn('relative min-w-0', className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-full items-center justify-between gap-2 rounded-full border border-line bg-warm-white pl-3.5 pr-3 text-[13px] font-medium text-ink"
        data-focus-none
      >
        <span className="truncate">
          {current.label}
          {typeof current.count === 'number' ? (
            <span className={cn('ml-1.5 font-medium', current.highlightCount && current.count > 0 ? 'text-status-attention' : 'text-muted')}>
              {current.count}
            </span>
          ) : null}
        </span>
        <IconChevronDown width={13} height={13} className={cn('shrink-0 text-muted transition-transform', open && 'rotate-180')} aria-hidden="true" />
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-20 overflow-hidden rounded-card-lg border border-line bg-warm-white shadow-card-lg">
            {options.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => { onChange(o.value); setOpen(false); }}
                className={cn(
                  'flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left text-[13px]',
                  o.value === value ? 'font-medium text-ink' : 'text-muted transition-colors hover:text-ink',
                )}
              >
                <span className="truncate">{o.label}</span>
                {typeof o.count === 'number' ? (
                  <span className={cn(o.highlightCount && o.count > 0 ? 'text-status-attention' : 'text-muted')}>{o.count}</span>
                ) : null}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

/**
 * Primaerer Bildschirm (Punkt 2/3/10/26, refactored fuer einen kompakteren oberen Bereich): Ziel
 * ist, dass die erste Aufgabenkarte auf dem Smartphone moeglichst ohne Scrollen sichtbar ist -
 * erreicht durch Zusammenfuehren von "Meine Aufgaben"/"Alle"/Standortfilter in EINE Chip-Zeile,
 * eine kompakte Kennzahlenzeile statt eines langen Satzes, konkrete Tagesnamen, Admin-Aktionen
 * hinter "Auswaehlen"/"Weitere Aktionen" statt dauerhaft sichtbarer Buttons, und eine einklapp-
 * bare Team-Auslastung (fuer normale Housekeeper komplett ausgeblendet). Task-Ermittlung,
 * Zuweisung, Timer und Berechtigungen (isManagerHere/isPropertyManager) sind unveraendert
 * dieselbe Logik wie zuvor - hier wird ausschliesslich die Darstellung neu organisiert.
 */
export function TasksScreen({ app }: { app: HousekeepingApp }) {
  const {
    state, t, selectDay, selectPropertyScope, toggleMyTasksOnly,
    toggleTaskMultiSelect, toggleTaskSelection, openTask, bulkAssignTasks, clearDayAssignments, retryTasksLoad,
    noticeForTask, isNoticeAcknowledgedBy, openManualTaskForm, shortStaffName, tasksForDayAll,
    isTaskSeenByMe, isBookingChangeAckedByMe,
  } = app;
  const [bulkOpen, setBulkOpen] = useState(false);
  const [moreActionsOpen, setMoreActionsOpen] = useState(false);
  const [teamOpen, setTeamOpen] = useState(false);
  const [doneOpen, setDoneOpen] = useState(false);
  // Briefing "Dashboard fuer Teamleader optimieren" Punkt 4: "Bereits zugewiesen" ist wie "Fertig"
  // per Default eingeklappt, damit die bereits verteilten Aufgaben nicht vor den noch zu
  // verteilenden stehen/die mobile Ansicht unnoetig verlaengern.
  const [assignedOpen, setAssignedOpen] = useState(false);
  // Briefing "Housekeeping-Dashboard anpassen": eine dritte, rein lokale Ansicht zusaetzlich zum
  // bestehenden `myTasksOnly` - ausschliesslich fuer Teamleader/Standortverantwortliche/Admin
  // genutzt (siehe elevatedHere unten). 'mine' spiegelt dabei exakt `myTasksOnly=true` (bestehender
  // Renderpfad bleibt fuer diesen Fall vollstaendig unveraendert), 'home'/'open' sind neue,
  // zusaetzliche Ansichten, die ausschliesslich mit bereits vorhandenen Daten arbeiten.
  const [taskViewMode, setTaskViewMode] = useState<'home' | 'mine' | 'open'>('home');

  // Punkt 17 (Desktop-Admin-Layout): dieselbe Ableitung wie zuvor hier inline, jetzt in
  // lib/housekeeping/dayOverview.ts ausgelagert - die neue DesktopAdminSidebar.tsx nutzt exakt
  // dieselbe Funktion, keine zweite/abweichende Berechnung. Definitionen (Reinigungen/Aufgaben/
  // Fertig, Rollen/Berechtigungen) unveraendert, siehe dortige Kommentare.
  const { date, visible, cleaningTasks, openManualTasks, doneTasks, isAdmin, isManagerHere, capacity } = dayOverviewFor(app);
  const allowed = allowedProperties(state.user, state.properties.map((p) => p.code));
  const allowedProps = state.properties.filter((p) => allowed.includes(p.code));
  const topCapacityEntry = capacity.find((e) => e.housekeeperId);
  const unassignedCapacityEntry = capacity.find((e) => e.housekeeperId === null);

  // Briefing "Housekeeping-Dashboard anpassen": rollenabhaengige Priorisierung/Beschriftung des
  // bestehenden Dashboards - Rollen/Teams/Standortzuordnungen/Tasks/Assignments/APIs bleiben dabei
  // komplett unveraendert (siehe permissions.ts/dayOverview.ts), hier wird ausschliesslich anhand
  // bereits vorhandener Daten klassifiziert, WELCHE Ausschnitte/Beschriftungen angezeigt werden.
  // `isManagerHere` (siehe dayOverview.ts) ist fuer einen reinen Teamleader OHNE managedProperties
  // false - `teamLeadHere` wird deshalb bewusst unabhaengig davon ermittelt.
  const teamLeadHere = isTeamLead(state.user);
  const locationManagerHere = isManagerHere && !isAdmin;
  const myTeamMemberships = getTeamMemberships(state.user);
  const hasTeam = myTeamMemberships.length > 0;
  const plainTeamMemberHere = !isAdmin && !locationManagerHere && !teamLeadHere && hasTeam;
  const elevatedHere = isAdmin || locationManagerHere || teamLeadHere;

  // Ursachenanalyse "Team heute an Datumsauswahl gekoppelt" (Briefing "Dashboard fuer Teamleader
  // optimieren" Punkt 12): der fruehere Fix hielt `taskViewMode` (lokal, hier) und das GLOBALE
  // `state.myTasksOnly` per Toggle synchron und liess den Teamleader-Renderpfad `visible`
  // (= tasksForDay(date), also myTasksOnly-abhaengig) fuer die Leer-/Ladezustand-Pruefung
  // mitbenutzen. Das brach in der Praxis: afterLogin() setzt `myTasksOnly` fuer einen Teamleader
  // OHNE managedProperties beim Login auf `true` (kein Property-Manager) - und zwar ERST NACH dem
  // Laden der Properties, also NACHDEM diese Komponente schon gemountet und ein einmaliger
  // useEffect(...,[]) hier `myTasksOnly` bereits auf `false` korrigiert hatte. afterLogin()
  // ueberschrieb die Korrektur damit unbemerkt wieder mit `true`, und blieb dort fuer die gesamte
  // Session stehen (kein zweiter Korrekturlauf). Die Team-/Zuweisungs-Listen selbst
  // (teamUnassignedTasks/teamAssignedTasks/teamDoneTasksToday, siehe unten) waren die ganze Zeit
  // korrekt nach `date` gefiltert - nur die UEBERGEORDNETE "gibt es ueberhaupt etwas zu zeigen"-
  // Pruefung nutzte `visible` (= NUR die eigenen Aufgaben des Teamleaders an diesem Tag). War der
  // Teamleader an einem Tag zufaellig selbst nicht eingeteilt, war `visible` leer -> "Keine
  // Aufgaben gefunden" ERSETZTE den kompletten (korrekten) Team-Bereich, unabhaengig vom
  // gewaehlten Dropdown-Wert. Erneutes Waehlen von "Team heute" wirkte nur deshalb wie eine
  // Reparatur, weil `selectViewHome()` `myTasksOnly` dabei aktiv zurueck auf `false` setzte.
  //
  // Sauberer Fix: der Teamleader-Renderpfad (Team/Meine Aufgaben/Offene Team-Aufgaben, siehe
  // `showTeamLeadBranch`/`gateVisibleCount` unten) haengt jetzt in KEINEM der drei Modi mehr von
  // `state.myTasksOnly`/`visible` ab - auch "Meine Aufgaben" wird fuer den Teamleader direkt aus
  // `allTasksToday`/`openTasksToday` berechnet (myOwnCleaningToday/myOwnManualToday/
  // myOwnDoneToday). `taskViewMode` (Ansichtsfilter), `state.selectedDay` (Tag) und
  // `state.propertyScope` (Standort) sind dadurch drei vollstaendig unabhaengige Dimensionen -
  // keine beeinflusst beim Wechsel eine der anderen. Fuer Standortverantwortliche/Admin bleibt
  // die bisherige, bereits korrekt funktionierende Kopplung an `myTasksOnly` fuer deren "Meine
  // Aufgaben"-Modus unveraendert (siehe selectViewMineElevated).
  function selectViewHome() {
    setTaskViewMode('home');
    if (!teamLeadHere && state.myTasksOnly) toggleMyTasksOnly();
  }
  function selectViewMineElevated() {
    setTaskViewMode('mine');
    if (!teamLeadHere && !state.myTasksOnly) toggleMyTasksOnly();
  }
  function selectViewOpen() {
    setTaskViewMode('open');
    if (!teamLeadHere && state.myTasksOnly) toggleMyTasksOnly();
  }

  // Aufgaben des Tages OHNE "Meine Aufgaben"-Einschraenkung, aber weiterhin durch den bestehenden
  // Standort-/Zugriffs-Scope begrenzt (tasksForDayAll/resolvedTasksAll laden ohnehin nur bereits
  // erlaubte Standorte, siehe useHousekeepingApp.ts#loadPlanningData) - dieselbe Datenquelle wie
  // `visible` oben, nur ungefiltert von `myTasksOnly`, damit "Team heute"/"Standort heute"/
  // "Uebersicht" unabhaengig vom aktuellen Ansichts-Modus dieselben Tageszahlen zeigen.
  const allTasksToday = date ? tasksForDayAll(date) : [];
  const openTasksToday = allTasksToday.filter((task) => task.status !== 'completed');

  // Teamleader (Punkt 4): nur die Teams, in denen der Nutzer TATSAECHLICH Lead ist (nicht jede
  // blosse Mitgliedschaft) - "Team heute" zeigt bewusst nur das/die eigenen geleiteten Teams.
  const myLeadTeamIds = new Set(myTeamMemberships.filter((m) => m.isLeader).map((m) => m.teamId));
  const teamOpenTasksToday = openTasksToday.filter((task) => task.assignedTeamId && myLeadTeamIds.has(task.assignedTeamId));
  const teamUnassignedTasks = sortTasksForDay(teamOpenTasksToday.filter((task) => !task.assignedUserId));
  const teamAssignedTasks = sortTasksForDay(teamOpenTasksToday.filter((task) => !!task.assignedUserId));
  const teamDoneTasksToday = sortTasksForDay(
    allTasksToday.filter((task) => task.assignedTeamId && myLeadTeamIds.has(task.assignedTeamId) && task.status === 'completed'),
  );
  const myTeamName = state.teams.find((tm) => myLeadTeamIds.has(tm.id))?.name || teamOpenTasksToday.find((task) => task.assignedTeamName)?.assignedTeamName || '';

  // "Meine Aufgaben" fuer den Teamleader (Punkt 12): bewusst NICHT mehr ueber das globale
  // `state.myTasksOnly` + den geteilten `tasksForDay()`-Renderpfad geloest (siehe Kommentar bei
  // selectViewHome oben) - direkt aus `openTasksToday`/`allTasksToday` gefiltert, exakt dieselbe
  // Definition ("meine Aufgaben" = dem eingeloggten Nutzer zugewiesen), nur ohne die
  // myTasksOnly-Kopplung.
  const myOwnCleaningToday = sortTasksForDay(openTasksToday.filter((task) => task.assignedUserId === state.user?.id && task.type !== 'manual'));
  const myOwnManualToday = sortTasksForDay(openTasksToday.filter((task) => task.assignedUserId === state.user?.id && task.type === 'manual'));
  const myOwnDoneToday = sortTasksForDay(allTasksToday.filter((task) => task.assignedUserId === state.user?.id && task.status === 'completed'));

  // Punkt 7: die Reinigungen-/Aufgaben-/Fertig-Kennzahl bleibt bestehen, nur ihr SCOPE wechselt je
  // Rolle UND (fuer den Teamleader neu) je Ansicht - "Meine Aufgaben" zeigt die eigenen Zahlen,
  // "Team"/"Offene Team-Aufgaben" die Team-Zahlen. Fuer Standortverantwortliche/Admin ist
  // `cleaningTasks`/`openManualTasks`/`doneTasks` (siehe dayOverviewFor) weiterhin bereits korrekt
  // auf den aktuellen Standort-Scope begrenzt.
  const summaryCleaningCount = teamLeadHere
    ? (taskViewMode === 'mine' ? myOwnCleaningToday.length : teamOpenTasksToday.filter((task) => task.type !== 'manual').length)
    : cleaningTasks.length;
  const summaryManualCount = teamLeadHere
    ? (taskViewMode === 'mine' ? myOwnManualToday.length : teamOpenTasksToday.filter((task) => task.type === 'manual').length)
    : openManualTasks.length;
  const summaryDoneCount = teamLeadHere
    ? (taskViewMode === 'mine' ? myOwnDoneToday.length : teamDoneTasksToday.length)
    : doneTasks.length;

  // Ursachenanalyse Punkt 12 (Fortsetzung siehe selectViewHome oben): die Lade-/Leer-/KPI-Sichtbar-
  // keitspruefung darf fuer den Teamleader in KEINEM Modus mehr `visible` (= tasksForDay(date),
  // myTasksOnly-abhaengig) verwenden - stattdessen exakt die Summe der Listen, die im jeweiligen
  // Modus tatsaechlich gerendert werden (siehe showTeamLeadBranch weiter unten).
  const teamLeadModeCount =
    taskViewMode === 'mine' ? myOwnCleaningToday.length + myOwnManualToday.length + myOwnDoneToday.length
    : taskViewMode === 'open' ? teamUnassignedTasks.length
    : teamUnassignedTasks.length + teamAssignedTasks.length + teamDoneTasksToday.length;
  const gateVisibleCount = teamLeadHere ? teamLeadModeCount : visible.length;
  // Der Teamleader nutzt fuer ALLE drei Ansichten (Team/Meine Aufgaben/Offene Team-Aufgaben) den
  // eigenen Renderpfad unten - anders als Standortverantwortliche/Admin, deren 'mine'-Modus
  // weiterhin den geteilten Standardpfad (renderCleaningAndManualTaskGroups(cleaningTasks,
  // openManualTasks) via `visible`/`myTasksOnly`) nutzt, siehe selectViewMineElevated oben.
  const showTeamLeadBranch = teamLeadHere || (elevatedHere && taskViewMode !== 'mine');

  // Standortverantwortlicher (Punkt 5): "Nicht zugewiesen" zuerst, unabhaengig vom Aufgabentyp
  // (Reinigung/Aufgabe) - der bestehende Reinigungen-/Aufgaben-Split bleibt fuer den Rest
  // bestehen, siehe Ausschluss-Filter direkt bei der Verwendung unten.
  const locationUnassignedTasks = sortTasksForDay(openTasksToday.filter((task) => !task.assignedUserId));
  const locationUnassignedIds = new Set(locationUnassignedTasks.map((task) => task.id));

  // Admin (Punkt 6): "Handlungsbedarf" nutzt ausschliesslich bereits vorhandene Felder
  // (assignedUserId/hasEarlyCheckin/effectiveArrivalTime) - keine neue Bewertungslogik, keine neue
  // Datenquelle.
  const adminUnassignedTasks = openTasksToday.filter((task) => !task.assignedUserId);
  const adminEarlyCheckinTasks = openTasksToday.filter((task) => task.hasEarlyCheckin);
  const actionNeededIds = new Set([...adminUnassignedTasks, ...adminEarlyCheckinTasks].map((task) => task.id));
  const actionNeededTasks = sortTasksForDay(openTasksToday.filter((task) => actionNeededIds.has(task.id)));
  const singleEarlyCheckinTime = adminEarlyCheckinTasks.length === 1 ? adminEarlyCheckinTasks[0].effectiveArrivalTime : null;

  // Standort-Kompaktinfo (Punkt 5): bei "Alle Standorte" entweder der Name des einzigen verwalteten
  // Standorts oder, falls mehrere, ein generischer Zaehler - kein neuer Berechtigungscode, nur
  // Darstellung der bereits vorhandenen managedPropertyCodes()-Ableitung.
  const managedHereCodes = managedPropertyCodes(state.user, allowedProps.map((p) => p.code));
  const managedHereProps = allowedProps.filter((p) => managedHereCodes.includes(p.code));
  const locationLabel =
    state.propertyScope !== 'all'
      ? getPropertyDisplayName(allowedProps.find((p) => p.code === state.propertyScope) || { code: state.propertyScope, name: state.propertyScope })
      : managedHereProps.length === 1
        ? getPropertyDisplayName(managedHereProps[0])
        : t('dashboard_multiple_locations', { n: managedHereProps.length || allowedProps.length });

  // Briefing "Housekeeping-Dashboard anpassen" Punkt 1: kompakte Info-Zeile direkt unter Datum/
  // Begruessung (die selbst in StaffHeader.tsx liegt) - bewusst hier in TasksScreen statt in
  // StaffHeader, weil StaffHeader auf JEDEM Tab (auch Apartments/Team/Einstellungen) unveraendert
  // gerendert wird und Aufgaben-Kennzahlen dort fehl am Platz waeren; visuell erscheint die Zeile
  // trotzdem direkt unter dem Header, weil TasksScreen unmittelbar darunter beginnt.
  let compactInfoLine: ReactNode = null;
  if (isAdmin) {
    compactInfoLine = t('dashboard_overview_summary_line', {
      n: cleaningTasks.length, m: openManualTasks.length, k: actionNeededTasks.length,
    });
  } else if (locationManagerHere) {
    compactInfoLine = t('dashboard_location_summary_line', {
      location: locationLabel, n: cleaningTasks.length, m: locationUnassignedTasks.length,
    });
  } else if (teamLeadHere) {
    // Punkt 2: die Zusammenfassung bezieht sich immer auf den ausgewaehlten Tag (teamOpenTasksToday/
    // teamUnassignedTasks sind bereits nach `date` gefiltert, siehe oben) und bleibt unabhaengig vom
    // gewaehlten Ansichts-Dropdown (Team/Meine Aufgaben/Offene Team-Aufgaben) konstant sichtbar -
    // Singular/Plural ueber dieselbe countLabel()-Hilfsfunktion wie ueberall sonst in dieser Datei.
    const teamCleaningCountToday = teamOpenTasksToday.filter((task) => task.type !== 'manual').length;
    compactInfoLine = t('dashboard_team_summary_line', {
      team: myTeamName,
      count: countLabel(t, teamCleaningCountToday, 'noun_cleaning_one', 'noun_cleaning_many'),
      open: teamUnassignedTasks.length,
    });
  } else if (plainTeamMemberHere) {
    const myOwnCount = openTasksToday.filter((task) => task.assignedUserId === state.user?.id).length;
    const openTeamCount = openTasksToday.filter(
      (task) => !task.assignedUserId && task.assignedTeamId && myTeamMemberships.some((m) => m.teamId === task.assignedTeamId),
    ).length;
    compactInfoLine =
      openTeamCount > 0
        ? t('dashboard_cleanings_for_you_with_open', { n: myOwnCount, m: openTeamCount })
        : t('dashboard_cleanings_for_you', { n: myOwnCount });
  } else {
    const myOwnCount = openTasksToday.filter((task) => task.assignedUserId === state.user?.id).length;
    compactInfoLine = t('dashboard_cleanings_for_you', { n: myOwnCount });
  }

  // Briefing "Reinigungskarten ueberarbeiten" Punkt 1: nur bei "Alle Standorte" tatsaechlich
  // gruppieren - ist bereits ein einzelner Standort ausgewaehlt, waere die Ueberschrift redundant
  // (Punkt 1, letzter Satz). `orderedPropertyCodes` uebernimmt dieselbe Reihenfolge wie der
  // bestehende Standort-Picker oben (allowedProps), keine neu erfundene (z. B. alphabetische)
  // Sortierung.
  const groupByLocation = state.propertyScope === 'all';
  const orderedPropertyCodes = allowedProps.map((p) => p.code);
  function toLocationGroups(tasks: ResolvedTask[], oneKey: Parameters<typeof countLabel>[2], manyKey: Parameters<typeof countLabel>[3]) {
    if (!groupByLocation) return null;
    return groupTasksByProperty(tasks, orderedPropertyCodes).map((g) => ({
      propertyCode: g.propertyCode,
      label: `${g.propertyName} · ${countLabel(t, g.tasks.length, oneKey, manyKey)}`,
      tasks: g.tasks,
    }));
  }

  // Briefing "Dashboard fuer Teamleader optimieren" Punkt 3/4/5: dieselbe Standortgruppierung wie
  // toLocationGroups(), aber fuer Listen, die Reinigungen UND manuelle Aufgaben GEMISCHT enthalten
  // (Team-"Noch zu verteilen"/"Bereits zugewiesen"/"Offene Team-Aufgaben" trennen bewusst NICHT
  // nach Aufgabentyp, siehe Briefing Punkt 4/5) - toLocationGroups() selbst nimmt nur EIN
  // Nomen-Paar entgegen und wuerde bei gemischten Listen z. B. eine Aufgabe faelschlich
  // "Reinigung" nennen. Baut je Standort stattdessen bis zu zwei Teilzahlen ("2 Reinigungen ·
  // 1 Aufgabe"), jeweils weiterhin ueber dieselbe countLabel()-Pluralisierung.
  function toMixedLocationGroups(tasks: ResolvedTask[]) {
    if (!groupByLocation) return null;
    return groupTasksByProperty(tasks, orderedPropertyCodes).map((g) => {
      const cleaningCount = g.tasks.filter((task) => task.type !== 'manual').length;
      const manualCount = g.tasks.filter((task) => task.type === 'manual').length;
      const parts = [
        cleaningCount > 0 ? countLabel(t, cleaningCount, 'noun_cleaning_one', 'noun_cleaning_many') : null,
        manualCount > 0 ? countLabel(t, manualCount, 'noun_task_one', 'noun_task_many') : null,
      ].filter(Boolean);
      return { propertyCode: g.propertyCode, label: `${g.propertyName} · ${parts.join(' · ')}`, tasks: g.tasks };
    });
  }

  // Punkt 7: kontextabhaengige Leerzustaende fuer den Teamleader - berücksichtigen den aktiven
  // Aufgabenfilter UND den ausgewaehlten Tag statt des generischen "Keine Aufgaben gefunden."
  // "Heute"/"Morgen" bleiben Textphrasen (dieselbe Positionslogik wie dayHeadingLabel/DAY_LABEL_KEYS
  // oben), jeder weitere Tag bekommt konkreten Wochentag + Datum (Intl, wie StaffHeader.tsx).
  function dayPhraseFor(iso: string): string {
    const idx = state.planningDays.indexOf(iso);
    if (idx === 0) return t('day_phrase_today');
    if (idx === 1) return t('day_phrase_tomorrow');
    const locale = DAY_LOCALES[state.lang] || 'de-DE';
    const formatted = new Intl.DateTimeFormat(locale, { weekday: 'long', day: '2-digit', month: 'long' }).format(new Date(`${iso}T00:00:00`));
    return t('day_phrase_on_date', { date: formatted });
  }
  const teamLeadEmptyKey = taskViewMode === 'mine' ? 'empty_my_tasks' : taskViewMode === 'open' ? 'empty_open_team_tasks' : 'empty_team_tasks';
  const teamLeadEmptyText = date ? t(teamLeadEmptyKey, { day: dayPhraseFor(date) }) : t('no_tasks');

  // Briefing "Reinigungskarten ueberarbeiten" Punkt 5/6/7: EIN gemeinsamer Aufmerksamkeits-Zustand
  // pro Karte - Buchungsaenderung (orange) hat immer Vorrang vor "ungesehen" (gruen), niemals
  // beide gleichzeitig. Bewusst UNABHAENGIG von cardNoticeState() unten (siehe dort) - "gesehen"/
  // "Buchungsaenderung bestaetigt" und der "Wichtiger Hinweis"-Bestaetigungsstatus sind zwei
  // technisch komplett getrennte Datenquellen (siehe types.ts).
  function cardAttentionState(task: ResolvedTask): 'none' | 'new' | 'changed' {
    if (task.bookingChange && !isBookingChangeAckedByMe(task)) return 'changed';
    if (!isTaskSeenByMe(task.id)) return 'new';
    return 'none';
  }

  const scopedHousekeepers: StaffUser[] = state.users.filter((u) => {
    if (u.role === 'admin') return false;
    if (state.propertyScope === 'all') return true;
    return u.properties === 'alle' || u.properties === 'all' || (Array.isArray(u.properties) && u.properties.includes(state.propertyScope));
  });

  async function handleClearDay() {
    if (typeof window !== 'undefined' && !window.confirm(t('clear_day_confirm'))) return;
    await clearDayAssignments();
  }

  // Punkt 10 (Feinschliff-Analyse): "Ansicht" (Zuweisungsfilter: Meine Aufgaben/Alle Aufgaben) und
  // "Standort" (Property-Filter) sind zwei UNABHAENGIGE Dimensionen - anders als zuvor (wo jede
  // Standortauswahl "Meine Aufgaben" automatisch zuruecksetzte) aendert selectScope() jetzt
  // ausschliesslich propertyScope, selectMine()/selectAllTasks() ausschliesslich myTasksOnly. Eine
  // Standortkraft kann so z. B. "Meine Aufgaben" MIT einem Standortfilter kombinieren.
  function selectMine() {
    if (!state.myTasksOnly) toggleMyTasksOnly();
  }
  function selectAllTasks() {
    if (state.myTasksOnly) toggleMyTasksOnly();
  }
  function selectScope(scope: string) {
    if (state.propertyScope !== scope) selectPropertyScope(scope);
  }

  const showPropertyChips = allowedProps.length > 1;
  // Briefing "Housekeeping-Dashboard anpassen": vorher gab es fuer Admin/Standortverantwortliche
  // (isManagerHere) UEBERHAUPT keinen "Ansicht"-Picker (nur ggf. den Standortfilter) - jetzt
  // bekommen Admin/Standortverantwortliche/Teamleader (elevatedHere) ebenfalls einen eigenen
  // "Ansicht"-Picker (Team/Standort/Uebersicht heute · Meine Aufgaben · Offen), siehe unten.
  const showScopeRow = elevatedHere || !isManagerHere || showPropertyChips;

  // Wichtiger-Hinweis-Badge auf der Task Card (Punkt 3, unveraendert aus der bisherigen
  // Detailsheet-Logik hierher gezogen): "unread" bezieht sich auf den AKTUELL EINGELOGGTEN
  // Nutzer (state.user), nicht auf task.assignedUserId - dieselbe Semantik wie in
  // TaskDetailSheet.tsx#PrimaryAction (currentUserId/currentUserAckCurrent).
  function cardNoticeState(task: ResolvedTask): 'none' | 'unread' | 'read' {
    const notice = noticeForTask(task.id);
    if (!notice) return 'none';
    return isNoticeAcknowledgedBy(task.id, state.user?.id) ? 'read' : 'unread';
  }

  // Punkt 4 (UX-Feinschliff): Ansicht/Standort nicht mehr als zwei grosse Chip-Gruppen, sondern
  // zwei kompakte Picker (native <select>, mit ueberlagertem Chevron-Icon) in EINER Zeile - die
  // fachliche Trennung der beiden Filterdimensionen (siehe selectMine/selectAllTasks/selectScope
  // oben) bleibt unveraendert, es aendert sich ausschliesslich die Darstellung.
  const selectClass = 'h-9 w-full appearance-none rounded-full border border-line bg-warm-white pl-3.5 pr-8 text-[13px] font-medium text-ink';

  // Briefing "Housekeeping-Dashboard anpassen" Punkt 3/4: fuer Teamleader/Team-Mitglied zeigt der
  // "Ansicht"-Picker zusaetzlich Zahlen je Option (native <select> kann das nicht farbig darstellen,
  // siehe TaskViewSelect oben) - fuer Standortverantwortliche/Admin bleiben die Optionen laut
  // Vorgabe ohne Zahl (nur Team-/Standort-/Uebersichts-Bezeichnung).
  const myOpenTasksCount = openTasksToday.filter((task) => task.assignedUserId === state.user?.id).length;
  let viewOptions: { value: string; label: string; count?: number; highlightCount?: boolean }[] | null = null;
  let viewValue: string = state.myTasksOnly ? 'mine' : 'all';
  let onViewChange: (value: string) => void = (value) => (value === 'mine' ? selectMine() : selectAllTasks());
  if (teamLeadHere) {
    viewOptions = [
      { value: 'home', label: t('dashboard_team_today') },
      { value: 'mine', label: t('my_tasks_only'), count: myOpenTasksCount },
      { value: 'open', label: t('dashboard_open_team_tasks'), count: teamUnassignedTasks.length, highlightCount: true },
    ];
    viewValue = taskViewMode;
    onViewChange = (value) => (value === 'home' ? selectViewHome() : value === 'mine' ? selectViewMineElevated() : selectViewOpen());
  } else if (locationManagerHere) {
    viewOptions = [
      { value: 'home', label: t('dashboard_location_today') },
      { value: 'mine', label: t('my_tasks_only') },
      { value: 'open', label: t('dashboard_open_tasks_generic') },
    ];
    viewValue = taskViewMode;
    onViewChange = (value) => (value === 'home' ? selectViewHome() : value === 'mine' ? selectViewMineElevated() : selectViewOpen());
  } else if (isAdmin) {
    viewOptions = [
      { value: 'home', label: t('dashboard_overview') },
      { value: 'mine', label: t('my_tasks_only') },
      { value: 'open', label: t('dashboard_action_needed') },
    ];
    viewValue = taskViewMode;
    onViewChange = (value) => (value === 'home' ? selectViewHome() : value === 'mine' ? selectViewMineElevated() : selectViewOpen());
  } else if (plainTeamMemberHere) {
    viewOptions = [
      { value: 'mine', label: t('my_tasks_only'), count: myOpenTasksCount },
      { value: 'all', label: t('dashboard_open_team_tasks'), count: openTasksToday.filter((task) => !task.assignedUserId && task.assignedTeamId && myTeamMemberships.some((m) => m.teamId === task.assignedTeamId)).length, highlightCount: true },
    ];
  }

  // Briefing "Housekeeping-Dashboard anpassen": gemeinsame Kartenrender-Helfer fuer die neuen
  // rollenabhaengigen Abschnitte unten - dieselbe Karten-/Gruppen-Darstellung (TaskCard/TaskGroup)
  // wie im unveraenderten Standardpfad, nur mit eigenen, bereits oben gefilterten Listen gefuettert.
  // "Fertig" ist bewusst ebenfalls eine gemeinsame Funktion (statt einer dritten Kopie), damit
  // Standard- und neue Rollenpfade exakt dieselbe Klapp-/Karten-Darstellung verwenden.
  function renderRoleTaskCard(task: ResolvedTask, noticeOverride?: 'none') {
    return (
      <TaskCard
        key={task.id}
        task={task}
        lang={state.lang}
        selected={false}
        selectable={false}
        shortName={shortStaffName}
        noticeState={noticeOverride ?? cardNoticeState(task)}
        attentionState={cardAttentionState(task)}
        onOpen={() => openTask(task.id)}
      />
    );
  }

  function renderCleaningAndManualTaskGroups(cleaningList: ResolvedTask[], manualList: ResolvedTask[]) {
    return (
      <>
        {cleaningList.length > 0 ? (
          <TaskGroup
            text={countLabel(t, cleaningList.length, 'noun_cleaning_one', 'noun_cleaning_many')}
            count={cleaningList.length}
            categoryLabel={t('noun_cleaning_many')}
            icon={IconSparkles}
            toneClass="text-type-turnover"
            tasks={cleaningList}
            locationGroups={toLocationGroups(cleaningList, 'noun_cleaning_one', 'noun_cleaning_many')}
            renderCard={(task) => renderRoleTaskCard(task)}
          />
        ) : null}
        {manualList.length > 0 ? (
          <TaskGroup
            text={countLabel(t, manualList.length, 'noun_task_one', 'noun_task_many')}
            count={manualList.length}
            categoryLabel={t('noun_task_many')}
            toneClass="text-type-departure xl:text-type-manual"
            icon={IconTask}
            tasks={manualList}
            locationGroups={toLocationGroups(manualList, 'noun_task_one', 'noun_task_many')}
            renderCard={(task) => renderRoleTaskCard(task, 'none')}
          />
        ) : null}
      </>
    );
  }

  // Verallgemeinert aus dem bisherigen "Fertig"-Abschnitt (Briefing "Dashboard fuer Teamleader
  // optimieren" Punkt 4): identische Klapp-/Kopfzeilen-Struktur (mobile Kurzform + Desktop-
  // Grossbuchstaben-Kategorie+Zahl, siehe TaskGroup weiter oben), jetzt zusaetzlich mit optionaler
  // Standortgruppierung fuer den neuen "Bereits zugewiesen"-Abschnitt des Teamleaders - bestehende
  // Aufrufer (renderDoneSection ohne dritten Parameter) bleiben visuell unveraendert.
  function renderCollapsibleGroup(
    list: ResolvedTask[],
    opts: {
      open: boolean; onToggle: () => void; icon: typeof IconCheck; toneClass: string;
      mobileLabel: string; categoryLabel: string;
      locationGroups: { propertyCode: string; label: string; tasks: ResolvedTask[] }[] | null;
    },
  ) {
    if (list.length === 0) return null;
    const { open, onToggle, icon: Icon, toneClass, mobileLabel, categoryLabel, locationGroups } = opts;
    const cardGrid = (tasks: ResolvedTask[]) => (
      <div className="grid grid-cols-1 gap-3 px-4 pt-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-[repeat(auto-fill,minmax(340px,1fr))]">
        {tasks.map((task) => renderRoleTaskCard(task, 'none'))}
      </div>
    );
    return (
      <div className="mt-1">
        <button
          type="button"
          onClick={onToggle}
          className="flex w-full items-center justify-between gap-1.5 px-4 pt-4 pb-1 text-left"
        >
          <span className="flex items-center gap-1.5 text-[13px] font-medium text-ink xl:hidden">
            <Icon width={14} height={14} className={cn('shrink-0', toneClass)} aria-hidden="true" />
            {mobileLabel}
          </span>
          <span className="hidden items-center gap-1.5 text-[11px] font-normal uppercase tracking-wide text-muted xl:flex">
            <Icon width={13} height={13} className={cn('shrink-0', toneClass)} aria-hidden="true" />
            {categoryLabel}
            <span className="font-medium normal-case text-ink">{list.length}</span>
          </span>
          <IconChevronDown width={14} height={14} className={cn('shrink-0 text-muted transition-transform', open && 'rotate-180')} aria-hidden="true" />
        </button>
        {open ? (
          locationGroups ? (
            <div className="flex flex-col gap-1">
              {locationGroups.map((group) => (
                <div key={group.propertyCode}>
                  <p className="px-4 pb-1 pt-3 text-[12px] font-medium text-muted first:pt-1">{group.label}</p>
                  {cardGrid(group.tasks)}
                </div>
              ))}
            </div>
          ) : (
            cardGrid(list)
          )
        ) : null}
      </div>
    );
  }

  function renderDoneSection(
    doneList: ResolvedTask[],
    locationGroups: { propertyCode: string; label: string; tasks: ResolvedTask[] }[] | null = null,
  ) {
    return renderCollapsibleGroup(doneList, {
      open: doneOpen,
      onToggle: () => setDoneOpen((v) => !v),
      icon: IconCheck,
      toneClass: 'text-status-clean',
      mobileLabel: `${doneList.length} ${t('section_done_suffix')}`,
      categoryLabel: t('wf_done'),
      locationGroups,
    });
  }

  // Briefing "Dashboard fuer Teamleader optimieren" Punkt 4: "Bereits zugewiesen" - dieselbe
  // Klapp-Mechanik wie "Fertig", nur fuer bereits verteilte Team-Aufgaben statt erledigter.
  function renderAssignedSection(
    list: ResolvedTask[],
    locationGroups: { propertyCode: string; label: string; tasks: ResolvedTask[] }[] | null,
  ) {
    return renderCollapsibleGroup(list, {
      open: assignedOpen,
      onToggle: () => setAssignedOpen((v) => !v),
      icon: IconUsers,
      toneClass: 'text-muted',
      mobileLabel: `${list.length} ${t('dashboard_already_assigned_suffix')}`,
      categoryLabel: t('dashboard_already_assigned'),
      locationGroups,
    });
  }

  return (
    <div className="pb-6">
      {compactInfoLine ? <p className="truncate px-4 pt-2 text-[12.5px] text-muted">{compactInfoLine}</p> : null}
      {/* Desktop-Admin-Layout (>= 1280px): der bisherige eigene xl:mx-auto/max-w-Wrapper hier
       * entfaellt - die Breitenbegrenzung/Zentrierung passiert jetzt einmalig auf Ebene der
       * Grid-Spalte in app/page.tsx (Hauptbereich), damit Header/Toolbar/Sidebar konsistent
       * dieselbe Spaltenbreite respektieren. Rein struktureller Wrapper ohne eigene Mobile-
       * Klassen - fasst Standortfilter/Tagesnavigation/Kennzahlen/Adminaktionen zu EINER
       * kompakten Desktop-Steuerungszeile zusammen (Punkt 4-6), unterhalb von xl bleibt jeder
       * der vier Bloecke exakt in seiner bisherigen Position/Groesse (kein `xl:`-Praefix = kein
       * Effekt unterhalb 1280px).
       *
       * Feinschliff Runde 7 (Punkt 1/8): Zeile 1 = Standort + Tagesnavigation + Aktionen
       * (rechtsbuendig via xl:ml-auto auf den Aktionen), Zeile 2 (xl:basis-full) = die drei
       * Kennzahlen - vorher standen Kennzahlen/Aktionen in umgekehrter Reihenfolge. Die
       * horizontale Aussenabstand-Verdopplung (jeder Block hatte fuer sein eigenes mobiles
       * `px-4` volle Randabstaende, die als direkte Flex-Geschwister auf Desktop addiert
       * wurden) ist behoben, indem `xl:px-4` einmalig auf den Wrapper wandert und jeder Block
       * ein `xl:px-0`/`xl:py-0` bekommt - dieselbe Technik wie bei SummaryStat (xl:-Overrides
       * derselben Property gewinnen ab diesem Breakpoint, ohne die mobilen Klassen zu
       * entfernen). */}
      <div className="xl:flex xl:flex-wrap xl:items-center xl:gap-x-3 xl:gap-y-2 xl:px-4 xl:pb-1 xl:pt-3">
      {showScopeRow ? (
        <div className="flex gap-2 px-4 py-2.5 xl:order-1 xl:flex-none xl:px-0 xl:py-0">
          {viewOptions ? (
            <TaskViewSelect value={viewValue} options={viewOptions} onChange={onViewChange} className="flex-1 xl:w-[210px] xl:flex-none" />
          ) : !isManagerHere ? (
            <div className="relative min-w-0 flex-1 xl:w-[210px] xl:flex-none">
              <select
                value={state.myTasksOnly ? 'mine' : 'all'}
                onChange={(e) => (e.target.value === 'mine' ? selectMine() : selectAllTasks())}
                className={selectClass}
                data-focus-none
              >
                <option value="mine">{t('my_tasks_only')}</option>
                <option value="all">{t('scope_all_tasks')}</option>
              </select>
              <IconChevronDown width={13} height={13} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
            </div>
          ) : null}
          {showPropertyChips ? (
            <div className="relative min-w-0 flex-1 xl:w-[210px] xl:flex-none">
              <select
                value={state.propertyScope}
                onChange={(e) => selectScope(e.target.value)}
                className={selectClass}
                data-focus-none
              >
                <option value="all">{t('scope_all_properties')}</option>
                {allowedProps.map((p) => (
                  <option key={p.code} value={p.code}>{getPropertyDisplayName(p)}</option>
                ))}
              </select>
              <IconChevronDown width={13} height={13} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Punkt 5 (Runde 6) / Punkt 1 (Feinschliff Runde 7): auf Mobile weiterhin ein 4-Spalten-
       * Grid ueber die volle Breite - auf Desktop stattdessen eine kompakte, inhaltsbreite
       * Pillen-Reihe (`xl:flex xl:w-auto`) statt eines starr auf 560px gestreckten Grids, damit
       * die Tagesnavigation nicht breiter wirkt als ihr eigentlicher Inhalt.
       *
       * Feinschliff Runde 8 (Punkt 1): auf Desktop exakt dieselbe Hoehe (`xl:h-9`) und exakt
       * dieselbe Rundung (`xl:rounded-full`) wie Standortfilter/Aktionsbuttons in derselben
       * Zeile - vorher `rounded-control` (eckigere 12px-Rundung), das sichtbar von den
       * pillenfoermigen Nachbar-Controls abwich. Mobile behaelt `rounded-control`/die eigene
       * Hoehe unveraendert (kein `xl:`-Praefix wirkt unterhalb 1280px). */}
      {/* Desktop-Toolbar-Redesign (Punkt 3): auf Desktop keine gefuellte schwarze Pille mehr,
       * sondern kompakte TEXT-Tabs - aktiv nur ueber einen dunklen Unterstrich (`xl:border-b-2`)
       * + etwas fetterer Text gekennzeichnet, inaktiv vollstaendig ohne sichtbaren Rahmen/Hintergrund
       * (nur ein dezenter Hover). `xl:border-0 xl:border-b-2` cancelt gezielt nur die drei anderen
       * Seiten des mobilen `border`, die Unterstrichfarbe kommt aus derselben border-color-Klasse
       * wie zuvor die volle Umrandung (xl: gewinnt fuer denselben CSS-Property spaeter in der
       * generierten Stylesheet-Reihenfolge, exakt dieselbe Technik wie bei den bisherigen `xl:`-
       * Overrides in dieser Datei). Mobile bleibt die bisherige gefuellte Pille unveraendert. */}
      <div className="grid grid-cols-4 gap-1.5 px-4 pt-1 xl:order-2 xl:flex xl:w-auto xl:flex-none xl:gap-3 xl:px-0 xl:pt-0">
        {state.planningDays.map((d, i) => (
          <button
            key={d}
            type="button"
            onClick={() => selectDay(d)}
            aria-pressed={date === d}
            className={cn(
              'flex flex-col items-center rounded-control border px-2 py-1.5 text-center transition-colors xl:h-9 xl:flex-row xl:items-center xl:justify-center xl:rounded-none xl:border-0 xl:border-b-2 xl:bg-transparent xl:px-1 xl:py-0',
              date === d
                ? 'border-ink bg-ink text-warm-white xl:border-ink xl:bg-transparent xl:text-ink'
                : 'border-line bg-warm-white text-muted hover:text-ink xl:border-transparent xl:bg-transparent xl:text-muted xl:hover:text-ink xl:hover:border-line',
            )}
          >
            <span className={cn('truncate text-[12.5px] font-medium', date === d ? 'xl:font-semibold' : 'xl:font-normal')}>
              {i < DAY_LABEL_KEYS.length ? t(DAY_LABEL_KEYS[i]) : shortDayLabel(d, DAY_LOCALES[state.lang] || 'de-DE')}
            </span>
          </button>
        ))}
      </div>

      {/* Punkt 9 (Runde 6, jetzt Zeile 1 rechtsbuendig statt Zeile 2, siehe Kommentar oben):
       * Admin-/Manageraktionen kompakt hinter "Auswaehlen" + "Weitere Aktionen" statt dauerhaft
       * sichtbarer Einzelbuttons - fuer normale Housekeeper vollstaendig ausgeblendet.
       * "+ Aufgabe erstellen" ist bewusst NUR fuer Admin sichtbar (serverseitig ebenso
       * durchgesetzt, siehe api/manual-tasks.js). */}
      {isManagerHere ? (
        <div className="flex flex-wrap items-center gap-2 px-4 pt-3 xl:order-3 xl:ml-auto xl:flex-none xl:px-0 xl:pt-0">
          <Button variant={state.taskMultiSelect ? 'primary' : 'secondary'} size="sm" onClick={toggleTaskMultiSelect}>
            <IconCheckSquare width={14} height={14} aria-hidden="true" />
            {state.taskMultiSelect ? t('multiselect_on') : t('select_tasks_action')}
          </Button>
          {isAdmin ? (
            <Button variant="secondary" size="sm" onClick={openManualTaskForm}>
              <IconPlus width={14} height={14} aria-hidden="true" />
              {t('create_manual_task_action')}
            </Button>
          ) : null}
          <button
            type="button"
            onClick={() => setMoreActionsOpen(true)}
            aria-label={t('more_actions')}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line text-muted transition-colors hover:text-ink"
          >
            <span aria-hidden="true" className="text-[15px] leading-none tracking-[0.05em]">&bull;&bull;&bull;</span>
          </button>
        </div>
      ) : null}

      {/* Desktop-Toolbar-Redesign (Punkt 4/8): die Kennzahlen stehen jetzt standardmaessig IN
       * derselben Zeile wie Standort/Tagesnavigation, rechtsbuendig (`xl:ml-auto` - wirkt
       * unabhaengig davon, ob die Adminaktionen ueberhaupt gerendert werden, siehe deren eigenes
       * `xl:ml-auto` weiter oben) statt einer erzwungenen eigenen Zeile (`xl:basis-full` entfernt).
       * Der responsive Fallback (Punkt 12: bei zu wenig Platz darf NUR diese Gruppe in eine zweite
       * Zeile umbrechen) ergibt sich automatisch aus dem bereits vorhandenen `xl:flex-wrap` auf dem
       * Toolbar-Wrapper - als letztes Element in der Flex-Reihenfolge (`xl:order-4`) ist die
       * Kennzahlengruppe die einzige, die bei Platzmangel umbricht, waehrend Standort+Tagesnav
       * (order 1/2) immer in Zeile 1 bleiben. */}
      {gateVisibleCount > 0 ? (
        <div className="grid grid-cols-3 gap-2 px-4 pt-3 xl:order-4 xl:flex xl:flex-none xl:ml-auto xl:items-center xl:gap-5 xl:px-0 xl:pt-0">
          <SummaryStat
            value={summaryCleaningCount}
            label={t(summaryCleaningCount === 1 ? 'noun_cleaning_one' : 'noun_cleaning_many')}
            icon={IconSparkles}
            toneClass="text-type-turnover"
          />
          <SummaryStat
            value={summaryManualCount}
            label={t(summaryManualCount === 1 ? 'noun_task_one' : 'noun_task_many')}
            icon={IconTask}
            // Feinschliff Runde 8 (Punkt 3): "Aufgabe" ist keine Abreise-Reinigung, sondern der
            // neutrale, manuelle Aufgabentyp (siehe TaskCard.tsx#TYPE_LEFT_BORDER: type-manual) -
            // `text-type-departure` war ein bestehender Farbfehler (Abreise-Braunton statt des
            // neutralen Aufgaben-Akzents). Korrektur nur auf Desktop (`xl:`), damit Mobile hier
            // unveraendert bleibt, wie fuer dieses Feinschliff-Update gefordert.
            toneClass="text-type-departure xl:text-type-manual"
          />
          <SummaryStat value={summaryDoneCount} label={t('wf_done')} icon={IconCheck} toneClass="text-status-clean" />
        </div>
      ) : null}
      </div>

      {/* Punkt 11: eingeklappt per Default (kompakte Ein-Zeilen-Zusammenfassung), fuer normale
       * Housekeeper (isManagerHere=false) komplett ausgeblendet. Desktop-Admin-Layout Punkt 14:
       * dieser Block existiert ab xl NICHT mehr zusaetzlich im Hauptbereich (`xl:hidden`) - dieselben
       * Team-Daten (capacity/shortStaffName) erscheinen dort stattdessen kompakt in der neuen
       * rechten Admin-Sidebar (DesktopAdminSidebar.tsx, ueber dayOverviewFor() gespeist), keine
       * doppelte Teamdarstellung. */}
      {isManagerHere && capacity.length > 0 ? (
        <div className="mx-4 mt-3 rounded-card-lg border border-line bg-warm-white xl:hidden">
          <button
            type="button"
            onClick={() => setTeamOpen((v) => !v)}
            className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left"
          >
            <span className="flex min-w-0 items-center gap-1.5">
              <IconUsers width={13} height={13} className="shrink-0 text-muted" aria-hidden="true" />
              {teamOpen ? (
                <span className="text-[13px] font-medium text-ink">{t('capacity_title')}</span>
              ) : (
                <span className="truncate text-[13px] text-ink">
                  <span className="font-medium">{t('capacity_title_short')}</span>
                  {topCapacityEntry ? (
                    <span className="ml-2 text-muted">
                      {shortStaffName(topCapacityEntry.housekeeperName)} {topCapacityEntry.count}
                      {unassignedCapacityEntry ? ` · ${unassignedCapacityEntry.count} ${t('capacity_unassigned_short')}` : ''}
                    </span>
                  ) : null}
                </span>
              )}
            </span>
            <IconChevronDown width={14} height={14} className={cn('shrink-0 text-muted transition-transform', teamOpen && 'rotate-180')} aria-hidden="true" />
          </button>
          {teamOpen ? (
            <div className="flex flex-col gap-1.5 px-4 pb-3">
              {capacity.map((entry) => (
                <div key={entry.housekeeperId || 'unassigned'} className="flex items-center justify-between text-[13px]">
                  <span className="text-ink">{entry.housekeeperId ? shortStaffName(entry.housekeeperName) : t('unassigned')}</span>
                  <span className="text-muted">{countLabel(t, entry.count, 'noun_task_one', 'noun_task_many')}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {state.loading && gateVisibleCount === 0 && !state.tasksLoadError ? (
        <div className="px-4 py-10 text-center text-sm text-muted">{t('loading')}</div>
      ) : state.tasksLoadError ? (
        <div className="px-4 py-10 text-center">
          <p className="text-sm text-status-attention">{state.tasksLoadError}</p>
          <Button className="mt-4" size="sm" onClick={() => retryTasksLoad()}>
            {t('retry')}
          </Button>
        </div>
      ) : gateVisibleCount === 0 ? (
        <div className="px-4 py-10 text-center text-sm text-muted">{teamLeadHere ? teamLeadEmptyText : t('no_tasks')}</div>
      ) : state.taskMultiSelect ? (
        // Mehrfachauswahl (Bulk-Zuweisen) bleibt bewusst eine flache Liste ueber ALLE sichtbaren
        // Aufgaben statt der neuen Abschnitte - Punkt 12 "Assignment-Logik nicht veraendern".
        <div className="grid grid-cols-1 gap-3 px-4 pt-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-[repeat(auto-fill,minmax(340px,1fr))] xl:pt-2">
          {visible.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              lang={state.lang}
              selected={state.selectedTasks.has(task.id)}
              selectable
              shortName={shortStaffName}
              noticeState={cardNoticeState(task)}
              attentionState={cardAttentionState(task)}
              onOpen={() => openTask(task.id)}
            />
          ))}
        </div>
      ) : showTeamLeadBranch ? (
        // Briefing "Housekeeping-Dashboard anpassen" Punkt 4/5/6, erweitert um "Dashboard fuer
        // Teamleader optimieren": Teamleader/Standortverantwortliche/Admin sehen in 'home'/'open'
        // eigene, nach Zuweisungsstatus bzw. Handlungsbedarf sortierte Ausschnitte statt der
        // Standard-Reinigungen/Aufgaben-Trennung - dieselben Karten/Gruppen
        // (renderCleaningAndManualTaskGroups/renderDoneSection/TaskGroup), nur mit vorab anders
        // gefilterten Listen. Bestehende Zuweisungsrechte/Assignment-APIs bleiben unangetastet.
        <>
          {isAdmin && taskViewMode === 'home' && actionNeededTasks.length > 0 ? (
            <div className="mx-4 mt-4 rounded-card-lg border border-line bg-warm-white px-4 py-3">
              <p className="flex items-center gap-1.5 text-[13px] font-medium text-ink">
                {t('dashboard_action_needed')}
                <span className="text-status-attention">· {actionNeededTasks.length}</span>
              </p>
              <div className="mt-1.5 flex flex-col gap-0.5 text-[13px] text-muted">
                {adminUnassignedTasks.length > 0 ? <p>{t('dashboard_action_needed_unassigned_line', { n: adminUnassignedTasks.length })}</p> : null}
                {adminEarlyCheckinTasks.length > 0 ? (
                  <p>
                    {adminEarlyCheckinTasks.length === 1 && singleEarlyCheckinTime
                      ? t('dashboard_action_needed_early_checkin_line_time', { n: 1, time: singleEarlyCheckinTime })
                      : t('dashboard_action_needed_early_checkin_line', { n: adminEarlyCheckinTasks.length })}
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}

          {isAdmin && taskViewMode === 'open' ? (
            actionNeededTasks.length > 0 ? (
              <TaskGroup
                text={`${t('dashboard_action_needed')} · ${actionNeededTasks.length}`}
                count={actionNeededTasks.length}
                categoryLabel={t('dashboard_action_needed')}
                icon={IconTask}
                toneClass="text-status-attention"
                tasks={actionNeededTasks}
                locationGroups={toLocationGroups(actionNeededTasks, 'noun_task_one', 'noun_task_many')}
                renderCard={(task) => renderRoleTaskCard(task)}
              />
            ) : (
              <div className="px-4 py-10 text-center text-sm text-muted">{t('no_tasks')}</div>
            )
          ) : null}

          {locationManagerHere && taskViewMode === 'open' ? (
            locationUnassignedTasks.length > 0 ? (
              <TaskGroup
                text={`${t('dashboard_not_yet_assigned')} · ${locationUnassignedTasks.length}`}
                count={locationUnassignedTasks.length}
                categoryLabel={t('dashboard_not_yet_assigned')}
                icon={IconTask}
                toneClass="text-status-attention"
                tasks={locationUnassignedTasks}
                locationGroups={toLocationGroups(locationUnassignedTasks, 'noun_task_one', 'noun_task_many')}
                renderCard={(task) => renderRoleTaskCard(task)}
              />
            ) : (
              <div className="px-4 py-10 text-center text-sm text-muted">{t('no_tasks')}</div>
            )
          ) : null}

          {(isAdmin || locationManagerHere) && taskViewMode === 'home' ? (
            <>
              {locationManagerHere && locationUnassignedTasks.length > 0 ? (
                <TaskGroup
                  text={`${t('dashboard_not_yet_assigned')} · ${locationUnassignedTasks.length}`}
                  count={locationUnassignedTasks.length}
                  categoryLabel={t('dashboard_not_yet_assigned')}
                  icon={IconTask}
                  toneClass="text-status-attention"
                  tasks={locationUnassignedTasks}
                  locationGroups={toLocationGroups(locationUnassignedTasks, 'noun_task_one', 'noun_task_many')}
                  renderCard={(task) => renderRoleTaskCard(task)}
                />
              ) : null}
              {renderCleaningAndManualTaskGroups(
                locationManagerHere ? cleaningTasks.filter((task) => !locationUnassignedIds.has(task.id)) : cleaningTasks,
                locationManagerHere ? openManualTasks.filter((task) => !locationUnassignedIds.has(task.id)) : openManualTasks,
              )}
              {renderDoneSection(doneTasks)}
            </>
          ) : null}

          {/* Briefing "Dashboard fuer Teamleader optimieren" Punkt 5: "Offene Team-Aufgaben" zeigt
           * AUSSCHLIESSLICH die nicht zugewiesenen Team-Aufgaben des Tages, nach Standort gruppiert
           * (toMixedLocationGroups statt `null`, da die Liste Reinigungen UND Aufgaben mischt) -
           * bewusst OHNE die "Noch zu verteilen"/"Bereits zugewiesen"-Unterteilung, da in dieser
           * Ansicht ohnehin nur offene Aufgaben vorkommen (siehe Briefing). */}
          {teamLeadHere && taskViewMode === 'open' ? (
            teamUnassignedTasks.length > 0 ? (
              <TaskGroup
                text={`${t('dashboard_open_team_tasks')} · ${teamUnassignedTasks.length}`}
                count={teamUnassignedTasks.length}
                categoryLabel={t('dashboard_open_team_tasks')}
                icon={IconTask}
                toneClass="text-status-attention"
                tasks={teamUnassignedTasks}
                locationGroups={toMixedLocationGroups(teamUnassignedTasks)}
                renderCard={(task) => renderRoleTaskCard(task)}
              />
            ) : (
              <div className="px-4 py-10 text-center text-sm text-muted">{teamLeadEmptyText}</div>
            )
          ) : null}

          {/* Punkt 4: "Team" (Default) zeigt zuerst die noch nicht verteilten, dann die bereits
           * zugewiesenen Team-Aufgaben des Tages - beide Male nach Standort gruppiert. "Bereits
           * zugewiesen" ist per Default eingeklappt (renderAssignedSection/assignedOpen), damit
           * die noch offene Arbeit auf Mobile nicht nach unten verdraengt wird. */}
          {teamLeadHere && taskViewMode === 'home' ? (
            <>
              {teamUnassignedTasks.length > 0 ? (
                <TaskGroup
                  text={`${t('dashboard_not_yet_assigned')} · ${teamUnassignedTasks.length}`}
                  count={teamUnassignedTasks.length}
                  categoryLabel={t('dashboard_not_yet_assigned')}
                  icon={IconTask}
                  toneClass="text-status-attention"
                  tasks={teamUnassignedTasks}
                  locationGroups={toMixedLocationGroups(teamUnassignedTasks)}
                  renderCard={(task) => renderRoleTaskCard(task)}
                />
              ) : null}
              {renderAssignedSection(teamAssignedTasks, toMixedLocationGroups(teamAssignedTasks))}
              {renderDoneSection(teamDoneTasksToday, toMixedLocationGroups(teamDoneTasksToday))}
              {teamUnassignedTasks.length === 0 && teamAssignedTasks.length === 0 && teamDoneTasksToday.length === 0 ? (
                <div className="px-4 py-10 text-center text-sm text-muted">{teamLeadEmptyText}</div>
              ) : null}
            </>
          ) : null}

          {/* Punkt 6: "Meine Aufgaben" - dem eingeloggten Teamleader zugewiesene Aufgaben des Tages,
           * eigenstaendig berechnet (myOwnCleaningToday/myOwnManualToday/myOwnDoneToday, siehe
           * oben) statt ueber den globalen myTasksOnly-Renderpfad - derselbe Reinigungen-/Aufgaben-
           * Split wie im Standardpfad, jetzt zusaetzlich mit Standortgruppierung. */}
          {teamLeadHere && taskViewMode === 'mine' ? (
            <>
              {renderCleaningAndManualTaskGroups(myOwnCleaningToday, myOwnManualToday)}
              {renderDoneSection(myOwnDoneToday)}
              {myOwnCleaningToday.length === 0 && myOwnManualToday.length === 0 && myOwnDoneToday.length === 0 ? (
                <div className="px-4 py-10 text-center text-sm text-muted">{teamLeadEmptyText}</div>
              ) : null}
            </>
          ) : null}
        </>
      ) : (
        // Punkt 10: Reinigungen/Aufgaben/Fertig als eigene, klein beschriftete Abschnitte statt
        // einer einzigen gemischten Liste - "Fertig" per Default eingeklappt, damit erledigte
        // Elemente die noch offene Arbeit nicht verdraengen. Eine leere Kategorie wird komplett
        // weggelassen (kein grosser Empty-State). Genutzt fuer normale Housekeeper (mit/ohne Team)
        // UND fuer Teamleader/Standortverantwortliche/Admin im 'mine'-Modus (identisch zu vorher).
        <>
          {renderCleaningAndManualTaskGroups(cleaningTasks, openManualTasks)}
          {renderDoneSection(doneTasks)}
        </>
      )}

      {state.taskMultiSelect ? (
        <MultiSelectBar
          lang={state.lang}
          count={state.selectedTasks.size}
          onAssign={() => setBulkOpen(true)}
          onCancel={toggleTaskMultiSelect}
        />
      ) : null}

      <BulkAssignSheet
        open={bulkOpen}
        lang={state.lang}
        housekeepers={scopedHousekeepers}
        count={state.selectedTasks.size}
        shortName={shortStaffName}
        onClose={() => setBulkOpen(false)}
        onPick={(hk) => {
          bulkAssignTasks(Array.from(state.selectedTasks), { id: hk.id, name: hk.name });
          setBulkOpen(false);
        }}
      />

      <BottomSheet open={moreActionsOpen} onClose={() => setMoreActionsOpen(false)}>
        <h3 className="italic text-lg text-[#17160f]">{t('more_actions')}</h3>
        <div className="mt-3 flex flex-col divide-y divide-line border-y border-line">
          <button
            type="button"
            onClick={() => { setMoreActionsOpen(false); handleClearDay(); }}
            className="py-2.5 text-left text-[15px] text-ink transition-colors hover:text-sage"
          >
            {t('clear_day')}
          </button>
        </div>
      </BottomSheet>

      {/* Ursachenanalyse Punkt 12: die Detailansicht muss JEDE Aufgabe des Tages finden koennen,
       * auch wenn der Teamleader gerade eine nicht-eigene Karte aus "Team"/"Offene Team-Aufgaben"
       * oeffnet - `visible` (myTasksOnly-abhaengig) waere dafuer zu eng, `allTasksToday` ist eine
       * garantierte Obermenge fuer denselben Tag (siehe oben) und aendert fuer alle anderen Rollen
       * nichts, da `visible` dort ohnehin ⊆ `allTasksToday` ist. */}
      <TaskDetailSheet app={app} task={state.detailTaskId ? allTasksToday.find((task) => task.id === state.detailTaskId) || null : null} />
      <ManualTaskFormSheet app={app} />
    </div>
  );
}
