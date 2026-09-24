'use client';

import { useEffect, useState } from 'react';
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
import {
  IconCheck, IconCheckSquare, IconChevronDown, IconChevronRight, IconClock, IconPlus, IconSparkles, IconTask, IconUsers,
} from '@/components/ui/icons';
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

/** Housekeeping-Mobile-Redesign: neutrale Count-Badge auf den Haupttabs ("Meine Aufgaben"/"Im Team
 * offen", siehe TasksScreen weiter unten) - feste 28px-Kreisflaeche in `highlight`/`highlight-ink`
 * (app/globals.css), bewusst UNABHAENGIG davon, ob der jeweilige Tab gerade aktiv (dunkler
 * Hintergrund) oder inaktiv (heller Hintergrund) ist, damit sie niemals wie ein Benachrichtigungs-/
 * Warnpunkt wirkt (keine der bestehenden Status-/Aufmerksamkeitsfarben). */
function TabCountBadge({ count }: { count: number }) {
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-highlight text-[12px] font-semibold tabular-nums text-highlight-ink">
      {count}
    </span>
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

/**
 * Korrektur "Admin-Desktop-Dashboard": das bisherige `xl:grid-cols-[repeat(auto-fill,minmax(340px,1fr))]`
 * erzeugt bei WENIGEN Karten pro Standort auf sehr breiten Bildschirmen zusaetzliche LEERE Spalten
 * (auto-fill legt so viele 340px-Spalten an, wie in den Container passen, unabhaengig von der
 * tatsaechlichen Kartenzahl) - genau das erzeugte den gemeldeten Eindruck "einspaltig mit viel
 * ungenutzter Flaeche rechts daneben", sobald ein Standort nur 1-2 Karten hat. Fuer den Admin-
 * Desktop-Bereich (siehe Verwendung unten, ausschliesslich `isAdmin`-gated) daher eine GEDECKELTE
 * Spaltenzahl (2 ab `xl`, 3 ab `2xl`) statt variabler auto-fill-Spalten - Karten fuellen die
 * Bildschirmbreite dadurch zuverlaessig, ohne bei sehr breiten Monitoren zu sehr auseinandergezogen
 * zu werden. Betrifft AUSSCHLIESSLICH die Admin-Desktop-Ansicht (siehe TaskGroup#cardGridClassName) -
 * Mobile, Teamleader und Standortverantwortlicher nutzen weiterhin exakt die bisherige Grid-Klasse.
 */
const ADMIN_DESKTOP_CARD_GRID_CLASS = 'grid grid-cols-1 gap-3 px-4 pt-1 sm:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3';

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
  text, count, categoryLabel, icon: Icon, toneClass, tasks, locationGroups, renderCard, cardGridClassName, headerRight,
}: {
  text: string; count: number; categoryLabel: string; icon?: typeof IconCheck; toneClass?: string;
  tasks: ResolvedTask[];
  locationGroups: { propertyCode: string; label: string; tasks: ResolvedTask[] }[] | null;
  renderCard: (task: ResolvedTask) => ReactNode;
  // Korrektur "Admin-Desktop-Dashboard": optionaler Override der Grid-Klasse, AUSSCHLIESSLICH von
  // der Admin-Desktop-Kartenansicht genutzt (siehe ADMIN_DESKTOP_CARD_GRID_CLASS unten) - ohne
  // Angabe unveraendertes Standardverhalten fuer alle anderen Aufrufer (Mobile, Teamleader,
  // Standortverantwortlicher, "Fertig"/"Bereits zugewiesen").
  cardGridClassName?: string;
  // Briefing "neue mobile Ansicht" Punkt 6: optionaler Slot rechts neben der Ueberschrift -
  // AUSSCHLIESSLICH vom Teamleader-Standortfilter neben "Noch zu verteilen" genutzt (siehe unten),
  // ohne Angabe unveraendertes Verhalten (keine Layout-/Abstandsaenderung) fuer alle anderen Aufrufer.
  headerRight?: ReactNode;
}) {
  const gridClass = cardGridClassName || 'grid grid-cols-1 gap-3 px-4 pt-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-[repeat(auto-fill,minmax(340px,1fr))]';
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
      <div className="flex items-center justify-between gap-2 pr-4">
        <p className="flex items-center gap-1.5 pl-4 pt-4 pb-1 text-[13px] font-medium text-ink xl:hidden">
          {Icon ? <Icon width={14} height={14} className={cn('shrink-0', toneClass)} aria-hidden="true" /> : null}
          {text}
        </p>
        <p className="hidden items-center gap-1.5 pl-4 pt-2 pb-1 text-[11px] font-normal uppercase tracking-wide text-muted xl:flex">
          {Icon ? <Icon width={13} height={13} className={cn('shrink-0', toneClass)} aria-hidden="true" /> : null}
          {categoryLabel}
          <span className="font-medium normal-case text-ink">{count}</span>
        </p>
        {headerRight ? <span className="shrink-0">{headerRight}</span> : null}
      </div>
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
    isTaskSeenByMe, isBookingChangeAckedByMe, claimTask, showToast,
  } = app;
  const [bulkOpen, setBulkOpen] = useState(false);
  const [moreActionsOpen, setMoreActionsOpen] = useState(false);
  const [teamOpen, setTeamOpen] = useState(false);
  const [doneOpen, setDoneOpen] = useState(false);
  // Briefing "Housekeeping-Dashboard anpassen": eine dritte, rein lokale Ansicht zusaetzlich zum
  // bestehenden `myTasksOnly` - ausschliesslich fuer Teamleader/Standortverantwortliche/Admin
  // genutzt (siehe elevatedHere unten). 'mine' spiegelt dabei exakt `myTasksOnly=true` (bestehender
  // Renderpfad bleibt fuer diesen Fall vollstaendig unveraendert), 'home'/'open' sind neue,
  // zusaetzliche Ansichten, die ausschliesslich mit bereits vorhandenen Daten arbeiten.
  const [taskViewMode, setTaskViewMode] = useState<'home' | 'mine' | 'open'>('home');
  // Housekeeping-Mobile-Redesign (Reinigungskraft ohne/mit Team, siehe housekeeperRedesignHere
  // unten): rein lokale Sortier-Auswahl fuer die neue "Offene Aufgaben"-Ansicht - betrifft
  // ausschliesslich die DARSTELLUNGSREIHENFOLGE dieser einen Liste, keine neue Prioritaets-/
  // Zuweisungslogik (siehe sortOpenTasksFor unten, das den bestehenden sortTasksForDay()-Rang fuer
  // 'arrival' unveraendert weiterverwendet). `claimingTaskId` verhindert lediglich doppeltes
  // Antippen desselben "Übernehmen"-Buttons waehrend die Anfrage laeuft - die eigentliche
  // Race-Sicherheit kommt weiterhin ausschliesslich vom atomaren HSETNX-Claim serverseitig
  // (api/task-assignments.js), hier geht es nur um UI-Feedback.
  const [openTasksSort, setOpenTasksSort] = useState<'arrival' | 'location' | 'apartment'>('arrival');
  const [claimingTaskId, setClaimingTaskId] = useState<string | null>(null);

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
  const elevatedHere = isAdmin || locationManagerHere || teamLeadHere;
  // Housekeeping-Mobile-Redesign (Reinigungskraft ohne/mit Team, aber NICHT deren Lead - Punkt 15
  // "Teamleader-Ansicht in diesem Schritt nicht anfassen"): da laut Rollenmodell (types.ts) nur
  // `role === 'housekeeper'` ueberhaupt admin/location_manager ausschliesst, deckt dieser eine
  // Schalter sowohl "mit Team" als auch "ohne Team" (frueher zwei getrennte Faelle,
  // plainTeamMemberHere/der generische else-Zweig) einheitlich ab - beide Faelle erhalten laut
  // Briefing exakt dieselbe neue Oberflaeche (Statuskarte/Tabs/eigene "Offene Aufgaben"-Ansicht).
  const housekeeperRedesignHere = state.user?.role === 'housekeeper' && !teamLeadHere;
  // Housekeeping-Mobile-Redesign (Teamleader-Erweiterung): der "reine" Teamleader (nicht
  // gleichzeitig Admin/Standortverantwortlicher - deren staerkerer Fokus hat weiterhin Vorrang,
  // siehe die if/else-if-Reihenfolge bei compactInfoLine unten) bekommt AB JETZT exakt dieselbe
  // neue Oberflaeche wie die Reinigungskraft (Statuskarte/Tabs/Tagesnav/Kennzahlen/Reinigungskarten)
  // - keine eigene, optisch abweichende Teamleader-Komponente. Unterschiede entstehen ausschliesslich
  // aus Inhalt (Team- statt Eigenanteil), Default-Tab ("Team Aufgaben" statt "Meine Aufgaben") und
  // dem weiterhin vorhandenen, aber kompakt integrierten Standortfilter (siehe showPropertyChips/
  // showScopeRow unten, die fuer diese Rolle unveraendert bleiben).
  const teamLeadRedesignHere = teamLeadHere && !isAdmin && !locationManagerHere;
  const newMobileUIHere = housekeeperRedesignHere || teamLeadRedesignHere;

  // Housekeeping-Mobile-Redesign (Teamleader-Erweiterung), Default-Tab-Korrektur: afterLogin()
  // (useHousekeepingApp.ts) setzt `myTasksOnly` fuer JEDEN Nutzer ohne managedProperties beim Login
  // auf `true` (Definition dort: `isManagerUser = isAdmin || managedPropertyCodes(...).length>0`) -
  // ein reiner Teamleader OHNE eigene Standortverantwortung ist kein "Manager" in diesem Sinne und
  // startet deshalb faelschlich mit `myTasksOnly=true` ("Meine Aufgaben" aktiv), obwohl per Vorgabe
  // "Team Aufgaben" (myTasksOnly=false) der Default sein soll. Einmalige Korrektur genau in dem
  // Moment, in dem `teamLeadRedesignHere` erstmals wahr wird (Properties/Rolle sind dann geladen) -
  // bewusst NICHT von `state.myTasksOnly` selbst abhaengig, sonst wuerde jedes spaetere, absichtliche
  // Antippen von "Meine Aufgaben" durch den Nutzer sofort wieder zurueckgesetzt.
  useEffect(() => {
    if (teamLeadRedesignHere && state.myTasksOnly) toggleMyTasksOnly();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamLeadRedesignHere]);

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

  // Housekeeping-Mobile-Redesign Punkt 2/9/13/14: die fuer eine Reinigungskraft (mit ODER ohne
  // eigenes Team) tatsaechlich per "Übernehmen" claimbaren offenen Aufgaben des Tages - exakt
  // dieselbe Bedingung wie serverseitig `canClaimTeamTask()` (api/task-assignments.js) UND wie
  // `tasksForDay()`s housekeeper-Zweig (useHousekeepingApp.ts): unassigned, und entweder OHNE
  // Team-Zuordnung (Property ohne konfiguriertes Standard-Team) ODER mit Zuordnung zu einem der
  // EIGENEN Teams. Direkt aus `openTasksToday` berechnet statt ueber `tasksForDay()`/`myTasksOnly`
  // (siehe dortiger Kommentar), damit die Zahl unabhaengig vom aktuell aktiven Tab (Statuskarte/
  // Tab-Badge sollen die Zahl auch zeigen, WAEHREND "Meine Aufgaben" aktiv ist) verfuegbar ist.
  const myTeamIdSet = new Set(myTeamMemberships.map((m) => m.teamId));
  const openClaimableTasksToday = sortTasksForDay(openTasksToday.filter((task) => {
    if (task.assignedUserId) return false;
    if (!task.assignedTeamId) return true;
    return myTeamIdSet.has(task.assignedTeamId);
  }));

  // Teamleader (Punkt 4): nur die Teams, in denen der Nutzer TATSAECHLICH Lead ist (nicht jede
  // blosse Mitgliedschaft) - "Team heute" zeigt bewusst nur das/die eigenen geleiteten Teams.
  const myLeadTeamIds = new Set(myTeamMemberships.filter((m) => m.isLeader).map((m) => m.teamId));
  const teamOpenTasksToday = openTasksToday.filter((task) => task.assignedTeamId && myLeadTeamIds.has(task.assignedTeamId));
  const teamUnassignedTasks = sortTasksForDay(teamOpenTasksToday.filter((task) => !task.assignedUserId));
  const teamAssignedTasks = sortTasksForDay(teamOpenTasksToday.filter((task) => !!task.assignedUserId));
  const teamDoneTasksToday = sortTasksForDay(
    allTasksToday.filter((task) => task.assignedTeamId && myLeadTeamIds.has(task.assignedTeamId) && task.status === 'completed'),
  );

  // "Meine Aufgaben" fuer den Teamleader (Punkt 12): bewusst NICHT mehr ueber das globale
  // `state.myTasksOnly` + den geteilten `tasksForDay()`-Renderpfad geloest (siehe Kommentar bei
  // selectViewHome oben) - direkt aus `openTasksToday`/`allTasksToday` gefiltert, exakt dieselbe
  // Definition ("meine Aufgaben" = dem eingeloggten Nutzer zugewiesen), nur ohne die
  // myTasksOnly-Kopplung.
  const myOwnCleaningToday = sortTasksForDay(openTasksToday.filter((task) => task.assignedUserId === state.user?.id && task.type !== 'manual'));
  const myOwnManualToday = sortTasksForDay(openTasksToday.filter((task) => task.assignedUserId === state.user?.id && task.type === 'manual'));
  const myOwnDoneToday = sortTasksForDay(allTasksToday.filter((task) => task.assignedUserId === state.user?.id && task.status === 'completed'));

  // Housekeeping-Mobile-Redesign (Teamleader-Erweiterung): der weiterhin vorhandene Standortfilter
  // (siehe showPropertyChips/das kompakte Auswahlfeld weiter unten) muss jetzt tatsaechlich
  // filtern, statt nur angezeigt zu werden - "Nach Auswahl eines Standortes werden ausschliesslich
  // die Aufgaben dieses Standortes angezeigt". Eine einzige Praedikatsfunktion statt verstreuter
  // Inline-Filter, ausschliesslich fuer die NEUEN, team-bezogenen Listen unten verwendet - die
  // bereits bestehenden, standortabhaengigen Ableitungen (cleaningTasks/openManualTasks/doneTasks
  // aus dayOverviewFor, locationUnassignedTasks/actionNeededTasks fuer Standortverantwortliche/
  // Admin) filtern laengst korrekt ueber `tasksForDay()`/`propertyScope` und bleiben unangetastet.
  function matchesPropertyScope(task: ResolvedTask): boolean {
    return state.propertyScope === 'all' || task.propertyCode === state.propertyScope;
  }
  const teamOpenTasksTodayScoped = teamOpenTasksToday.filter(matchesPropertyScope);
  const teamUnassignedTasksScoped = teamUnassignedTasks.filter(matchesPropertyScope);
  const teamAssignedTasksScoped = teamAssignedTasks.filter(matchesPropertyScope);
  const teamDoneTasksTodayScoped = teamDoneTasksToday.filter(matchesPropertyScope);
  const myOwnCleaningTodayScoped = myOwnCleaningToday.filter(matchesPropertyScope);
  const myOwnManualTodayScoped = myOwnManualToday.filter(matchesPropertyScope);
  const myOwnDoneTodayScoped = myOwnDoneToday.filter(matchesPropertyScope);

  // Punkt 7: die Reinigungen-/Aufgaben-/Fertig-Kennzahl bleibt bestehen, nur ihr SCOPE wechselt je
  // Rolle UND (fuer den Teamleader neu) je aktivem Tab ("Team Aufgaben"/"Meine Aufgaben", siehe
  // `newMobileUIHere`-Block unten) - "Meine Aufgaben" zeigt die eigenen Zahlen, "Team Aufgaben" die
  // Team-Zahlen, jeweils standortgefiltert. Fuer Standortverantwortliche/Admin ist
  // `cleaningTasks`/`openManualTasks`/`doneTasks` (siehe dayOverviewFor) weiterhin bereits korrekt
  // auf den aktuellen Standort-Scope begrenzt.
  const summaryCleaningCount = teamLeadRedesignHere
    ? (state.myTasksOnly ? myOwnCleaningTodayScoped.length : teamOpenTasksTodayScoped.filter((task) => task.type !== 'manual').length)
    : cleaningTasks.length;
  const summaryManualCount = teamLeadRedesignHere
    ? (state.myTasksOnly ? myOwnManualTodayScoped.length : teamOpenTasksTodayScoped.filter((task) => task.type === 'manual').length)
    : openManualTasks.length;
  const summaryDoneCount = teamLeadRedesignHere
    ? (state.myTasksOnly ? myOwnDoneTodayScoped.length : teamDoneTasksTodayScoped.length)
    : doneTasks.length;

  // Ursachenanalyse Punkt 12 (Fortsetzung siehe selectViewHome oben): die Lade-/Leer-/KPI-Sichtbar-
  // keitspruefung darf fuer den Teamleader in KEINEM Tab mehr `visible` (= tasksForDay(date),
  // myTasksOnly-abhaengig ueber den geteilten Renderpfad) verwenden - stattdessen exakt die Summe
  // der (standortgefilterten) Listen, die im jeweiligen Tab tatsaechlich gerendert werden (siehe
  // `newMobileUIHere`-Block unten). Nutzt jetzt `state.myTasksOnly` statt des alten, ausschliesslich
  // von Admin/Standortverantwortlichen genutzten `taskViewMode` (siehe deren eigener, unveraenderter
  // dreiteiliger Picker weiter unten).
  const teamLeadModeCount = state.myTasksOnly
    ? myOwnCleaningTodayScoped.length + myOwnManualTodayScoped.length + myOwnDoneTodayScoped.length
    : teamUnassignedTasksScoped.length + teamAssignedTasksScoped.length + teamDoneTasksTodayScoped.length;
  const gateVisibleCount = teamLeadRedesignHere ? teamLeadModeCount : visible.length;
  // Standortverantwortliche/Admin nutzen weiterhin ihren eigenen, unveraenderten dreiteiligen
  // Picker (Team/Standort/Uebersicht heute · Meine Aufgaben · Offen, `taskViewMode`) - der reine
  // Teamleader wird davon jetzt vollstaendig ausgenommen (`newMobileUIHere` faengt ihn weiter oben
  // im Renderbaum bereits ab, siehe dort), ihr 'mine'-Modus bleibt weiterhin der geteilte
  // Standardpfad (renderCleaningAndManualTaskGroups(cleaningTasks, openManualTasks) via `visible`/
  // `myTasksOnly`, siehe selectViewMineElevated oben).
  const showTeamLeadBranch = elevatedHere && !teamLeadRedesignHere && taskViewMode !== 'mine';

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
  } else if (newMobileUIHere) {
    // Housekeeping-Mobile-Redesign Punkt 4 (jetzt auch Teamleader, siehe teamLeadRedesignHere oben):
    // die neue Statuskarte (siehe unten) ersetzt diese einfache Textzeile fuer beide Rollen
    // vollstaendig - keine doppelte Anzeige derselben Zahlen.
    compactInfoLine = null;
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

  // Housekeeping-Mobile-Redesign Punkt 9: dieselbe Standortgruppierung wie toMixedLocationGroups(),
  // nur mit der fuer "Offene Aufgaben" verlangten kompakten Beschriftung ("LÆKE · 2 offen" statt
  // einer Typ-Aufschluesselung) - offene Aufgaben sind ohnehin ausschliesslich ueber ihren
  // Zuweisungsstatus definiert (siehe openClaimableTasksToday oben), eine Typ-Angabe waere hier
  // redundant.
  function toOpenLocationGroups(tasks: ResolvedTask[]) {
    if (!groupByLocation) return null;
    return groupTasksByProperty(tasks, orderedPropertyCodes).map((g) => ({
      propertyCode: g.propertyCode,
      label: `${g.propertyName} · ${g.tasks.length} ${t('open_tasks_group_suffix')}`,
      tasks: g.tasks,
    }));
  }

  // Housekeeping-Mobile-Redesign Punkt 10: "Anreisezeit (früh zuerst)" ist bereits exakt die
  // Reihenfolge, die die bestehende sortTasksForDay()-Prioritaet fuer eine Liste liefert, die
  // ausschliesslich offene Aufgaben enthaelt (alle Eintraege teilen sich denselben statusTier,
  // die tatsaechliche Reihenfolge kommt dort schon aus nextRequiredAtKey() = effektive Anreisezeit)
  // - openClaimableTasksToday ist deshalb fuer 'arrival' bereits fertig sortiert, keine zweite
  // Prioritaets-Implementierung noetig. "Standort"/"Apartment" sind rein darstellungsbezogene
  // Zusatz-Sortierungen dieser einen Liste, keine neue Task-Prioritaet.
  function applyOpenTasksSort(tasks: ResolvedTask[], sort: 'arrival' | 'location' | 'apartment'): ResolvedTask[] {
    if (sort === 'location') {
      return tasks.slice().sort((a, b) => a.propertyName.localeCompare(b.propertyName) || a.unitName.localeCompare(b.unitName, undefined, { numeric: true }));
    }
    if (sort === 'apartment') {
      return tasks.slice().sort((a, b) => a.unitName.localeCompare(b.unitName, undefined, { numeric: true }));
    }
    return tasks;
  }

  // Housekeeping-Mobile-Redesign Punkt 13: Wiederverwendung der bestehenden, bereits Race-
  // Condition-sicheren claimTask()-Aktion (HSETNX serverseitig, siehe api/task-assignments.js) -
  // hier ausschliesslich UI-Ablauf (kurzzeitige Sperre gegen Doppel-Tap + dezente Erfolgsmeldung).
  // Ob der Claim tatsaechlich erfolgreich war, wird NICHT aus einem Rueckgabewert von claimTask()
  // gelesen (die Aktion faengt Fehler bereits selbst ab und zeigt sie ueber runAction()/showToast
  // an, siehe useHousekeepingApp.ts) - stattdessen nach dem Await direkt am aktualisierten
  // state.taskAssignments geprueft: gehoert die Aufgabe jetzt dem eingeloggten Nutzer, hat der
  // Claim gewonnen (Punkt 13.2/13.6), sonst hat z. B. ein anderes Teammitglied gewonnen (Punkt
  // 13's "verstaendliche Meldung" kam in dem Fall bereits als Toast von runAction/dem 409-Fehler).
  async function handleClaimOpenTask(task: ResolvedTask) {
    setClaimingTaskId(task.id);
    await claimTask(task.id);
    setClaimingTaskId(null);
    if (state.taskAssignments[task.id]?.housekeeperId === state.user?.id) {
      showToast(t('claim_open_task_success'));
    }
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
  const teamLeadEmptyKey = teamLeadRedesignHere
    ? (state.myTasksOnly ? 'empty_my_tasks' : 'empty_team_tasks')
    : taskViewMode === 'mine' ? 'empty_my_tasks' : taskViewMode === 'open' ? 'empty_open_team_tasks' : 'empty_team_tasks';
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

  // Housekeeping-Mobile-Redesign Punkt 2/16: fuer eine Reinigungskraft (mit oder ohne Team) entfaellt
  // der Standortfilter komplett ("Meine Aufgaben"/"Offene Aufgaben" zeigen automatisch alle
  // relevanten Standorte, siehe openClaimableTasksToday/tasksForDay oben) - fuer Admin/
  // Standortverantwortliche/Teamleader bleibt er unveraendert bestehen.
  const showPropertyChips = allowedProps.length > 1 && !housekeeperRedesignHere;
  // Briefing "Housekeeping-Dashboard anpassen": vorher gab es fuer Admin/Standortverantwortliche
  // (isManagerHere) UEBERHAUPT keinen "Ansicht"-Picker (nur ggf. den Standortfilter) - jetzt
  // bekommen Admin/Standortverantwortliche/Teamleader (elevatedHere) ebenfalls einen eigenen
  // "Ansicht"-Picker (Team/Standort/Uebersicht heute · Meine Aufgaben · Offen), siehe unten.
  const showScopeRow = elevatedHere || !isManagerHere || showPropertyChips;

  // Briefing "neue mobile Ansicht" Punkt 6: derselbe kompakte Standortfilter wie zuvor (nur jetzt
  // nicht mehr zwischen Tabs/Tagesnav, sondern neben "Noch zu verteilen", siehe TaskGroup#headerRight
  // im Teamleader-Renderpfad unten) - eigene Funktion statt Inline-JSX, weil er an ZWEI Stellen
  // gebraucht wird (neben der Ueberschrift, wenn die Gruppe Eintraege hat; sonst als eigene, sehr
  // kompakte Zeile - "Noch zu verteilen" faellt sonst laut bestehender Konvention komplett weg,
  // wenn leer, was den Filter sonst unerreichbar machen wuerde).
  function renderTeamPropertyScopeSelect() {
    return (
      <div className="relative w-[132px] shrink-0">
        <select
          value={state.propertyScope}
          onChange={(e) => selectScope(e.target.value)}
          className="h-7 w-full appearance-none rounded-full border border-line bg-warm-white pl-3 pr-7 text-[12px] font-medium text-ink"
          data-focus-none
        >
          <option value="all">{t('scope_all_properties')}</option>
          {allowedProps.map((p) => (
            <option key={p.code} value={p.code}>{getPropertyDisplayName(p)}</option>
          ))}
        </select>
        <IconChevronDown width={11} height={11} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
      </div>
    );
  }

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
  if (locationManagerHere) {
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
  }
  // newMobileUIHere (Reinigungskraft UND jetzt auch der reine Teamleader, siehe oben) nutzt bewusst
  // KEINE der beiden bestehenden Picker-Varianten (TaskViewSelect-Dropdown/natives <select>) mehr -
  // siehe die neuen, grossen Tab-Buttons weiter unten im JSX, die direkt state.myTasksOnly umschalten.

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

  // Housekeeping-Mobile-Redesign Punkt 11/12/13: die bestehende TaskCard bleibt VOELLIG
  // unveraendert (kein neuer Claim-Button INNERHALB der Karte, siehe TaskCard.tsx#onOpen - das
  // ist der einzige Interaktionspunkt der Karte) - der prominente Early-Check-in-Hinweis und der
  // "Übernehmen"-Button sitzen als EIGENE Elemente ausserhalb/darunter. Punkt 12: bewusst KEIN
  // orangener Seitenstreifen o.ae. AUF der Karte selbst (das wuerde mit der bestehenden Buchungs-
  // aenderungs-Orange-Semantik kollidieren) - die Dringlichkeit wird stattdessen ueber die konkrete
  // Anreisezeit in einem separaten Banner-Element oberhalb der Karte kommuniziert, ausschliesslich
  // mit bereits vorhandenen Daten (task.hasEarlyCheckin/effectiveArrivalTime/bookedArrivalTime,
  // siehe tasks.ts) - keine neue Geschaeftslogik.
  function renderOpenTaskCard(task: ResolvedTask) {
    const isClaiming = claimingTaskId === task.id;
    return (
      <div key={task.id} className="flex flex-col gap-2">
        {task.hasEarlyCheckin ? (
          <div className="flex items-center gap-1.5 rounded-control border border-status-attention/30 bg-status-attention-bg px-3 py-2 text-[12.5px] font-medium text-status-attention">
            <IconClock width={14} height={14} className="shrink-0" aria-hidden="true" />
            <span>
              {t('early_checkin_prominent_time', { time: task.effectiveArrivalTime || task.bookedArrivalTime || '' })}
              {' · '}
              {t('early_checkin_prominent_title')}
            </span>
          </div>
        ) : null}
        {renderRoleTaskCard(task)}
        {/* Housekeeping-Mobile-Redesign (Feinschliff nach Zielbild) Punkt 12: hell mit dezenter
         * dunkler Kontur statt eines dominanten schwarzen Balkens - `variant="secondary"` als Basis
         * (bestehende Button-Komponente bleibt dabei fuer alle anderen Aufrufer unveraendert),
         * Kontur/Text hier gezielt auf `ink` angehoben statt des Standard-`muted`, damit der Button
         * trotz heller Flaeche klar als wichtige Aktion lesbar bleibt. */}
        <Button
          variant="secondary"
          className="w-full border-ink text-ink hover:bg-ink hover:text-warm-white"
          disabled={isClaiming}
          onClick={() => handleClaimOpenTask(task)}
        >
          {isClaiming ? t('loading') : t('claim_open_task_action')}
        </Button>
      </div>
    );
  }

  function renderCleaningAndManualTaskGroups(cleaningList: ResolvedTask[], manualList: ResolvedTask[], cardGridClassName?: string) {
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
            cardGridClassName={cardGridClassName}
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
            cardGridClassName={cardGridClassName}
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
      cardGridClassName?: string;
    },
  ) {
    if (list.length === 0) return null;
    const { open, onToggle, icon: Icon, toneClass, mobileLabel, categoryLabel, locationGroups, cardGridClassName } = opts;
    const gridClass = cardGridClassName || 'grid grid-cols-1 gap-3 px-4 pt-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-[repeat(auto-fill,minmax(340px,1fr))]';
    const cardGrid = (tasks: ResolvedTask[]) => (
      <div className={gridClass}>
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
    cardGridClassName?: string,
  ) {
    return renderCollapsibleGroup(doneList, {
      open: doneOpen,
      onToggle: () => setDoneOpen((v) => !v),
      icon: IconCheck,
      toneClass: 'text-status-clean',
      mobileLabel: `${doneList.length} ${t('section_done_suffix')}`,
      categoryLabel: t('wf_done'),
      locationGroups,
      cardGridClassName,
    });
  }

  return (
    <div className="pb-6">
      {compactInfoLine ? <p className="truncate px-4 pt-2 text-[12.5px] text-muted">{compactInfoLine}</p> : null}
      {/* Housekeeping-Mobile-Redesign (Nachbesserung): EINE ruhige, freundliche Statuskarte statt
       * einer Warn-/Dashboard-Kachel - bewusst NICHT `status-attention` (das ist der bestehende
       * Terracotta-/Orange-Ton fuer Abreise/Buchungsaenderung/Early-Check-in, siehe TaskCard.tsx -
       * eine neutrale Zusammenfassung darf diese Bedeutung nicht mitbenutzen), sondern der bereits
       * eigens dafuer definierte, sehr helle Neutralton `highlight` (#F3EDE2, app/globals.css) und
       * ohne eigene Kontur fuer einen leichteren, weniger "kachelhaften" Eindruck (Nachbesserung:
       * kompakteres Padding + kleinerer Radius `rounded-card` statt `rounded-card-lg`).
       * Sie bleibt in BEIDEN Tabs sichtbar (kein Verschwinden/Ersetzen durch einen zweiten,
       * andersfarbigen Banner) - nur Text und Tipp-Verhalten wechseln: in "Meine Aufgaben" fuehrt
       * Antippen direkt zu "Im Team offen" (Pfeil als Hinweis), dort selbst ist die Karte rein
       * informativ (kein Pfeil, kein Tap-Ziel, man ist ja schon dort). */}
      {newMobileUIHere ? (
        state.myTasksOnly ? (
          // "Meine Aufgaben" aktiv - fuer BEIDE Rollen exakt dieselbe tippbare Karte (Punkt "identische
          // Zusammenfassungskarte") - der einzige Unterschied ist, WELCHE Liste als "im Team noch
          // offen" gilt: fuer die Reinigungskraft alle claimbaren Aufgaben (openClaimableTasksToday),
          // fuer den Teamleader die noch unverteilten Aufgaben des eigenen, standortgefilterten Teams
          // (teamUnassignedTasksScoped) - Antippen fuehrt in beiden Faellen zum jeweils anderen Tab.
          <button
            type="button"
            onClick={selectAllTasks}
            className="mx-4 mt-2 flex w-[calc(100%-2rem)] items-center justify-between gap-3 rounded-card bg-highlight px-4 py-2.5 text-left"
          >
            <span className="flex flex-col items-start gap-0.5">
              <span className="text-[14px] font-medium text-ink">
                {t('status_card_cleanings_line', { count: countLabel(t, myOpenTasksCount, 'noun_cleaning_one', 'noun_cleaning_many') })}
              </span>
              <span className="text-[12.5px] text-muted">
                {/* "Arbeiten" nur, wenn sich die Zahl aus Reinigungen UND manuellen Aufgaben
                 * zusammensetzt - sind ausschliesslich Reinigungen offen, heisst es "Reinigungen"
                 * (dieselbe Unterscheidung wie auf der Team-Kartenvariante unten). */}
                {(() => {
                  const openList = teamLeadRedesignHere ? teamUnassignedTasksScoped : openClaimableTasksToday;
                  const n = openList.length;
                  if (n === 0) return t('status_card_team_done');
                  const allCleaning = openList.every((task) => task.type !== 'manual');
                  const nounKey = allCleaning
                    ? (n === 1 ? 'noun_cleaning_one' : 'noun_cleaning_many')
                    : (n === 1 ? 'noun_open_work_one' : 'noun_open_work_many');
                  return t(n === 1 ? 'status_card_team_open_singular' : 'status_card_team_open_plural', { n, noun: t(nounKey) });
                })()}
              </span>
            </span>
            <IconChevronRight width={16} height={16} className="shrink-0 text-muted" aria-hidden="true" />
          </button>
        ) : teamLeadRedesignHere ? (
          // "Team Aufgaben" (Default fuer Teamleader) - andere Informations-Hierarchie als bei der
          // Reinigungskraft (Punkt "andere Informations-Hierarchie"): zuerst die gesamte, dann die
          // noch unverteilte Teamlast, beide standortgefiltert (teamOpenTasksTodayScoped/
          // teamUnassignedTasksScoped) - dieselbe Kartenflaeche/derselbe Stil, nicht tippbar (es gibt
          // von hier aus kein weiteres Ziel, man sieht bereits die Default-Ansicht).
          <div className="mx-4 mt-2 flex w-[calc(100%-2rem)] flex-col items-start gap-0.5 rounded-card bg-highlight px-4 py-2.5 text-left">
            <span className="text-[14px] font-medium text-ink">
              {(() => {
                const n = teamOpenTasksTodayScoped.length;
                const allCleaning = teamOpenTasksTodayScoped.every((task) => task.type !== 'manual');
                const count = countLabel(
                  t, n,
                  allCleaning ? 'noun_cleaning_one' : 'noun_open_work_one',
                  allCleaning ? 'noun_cleaning_many' : 'noun_open_work_many',
                );
                return t('team_status_card_total_line', { count });
              })()}
            </span>
            <span className="text-[12.5px] text-muted">
              {(() => {
                const n = teamUnassignedTasksScoped.length;
                if (n === 0) return t('status_card_team_done');
                const allCleaning = teamUnassignedTasksScoped.every((task) => task.type !== 'manual');
                const count = countLabel(
                  t, n,
                  allCleaning ? 'noun_cleaning_one' : 'noun_open_work_one',
                  allCleaning ? 'noun_cleaning_many' : 'noun_open_work_many',
                );
                return t(n === 1 ? 'team_status_card_unassigned_singular' : 'team_status_card_unassigned_plural', { count });
              })()}
            </span>
          </div>
        ) : (
          <div className="mx-4 mt-2 flex w-[calc(100%-2rem)] flex-col items-start gap-0.5 rounded-card bg-highlight px-4 py-2.5 text-left">
            {openClaimableTasksToday.length > 0 ? (
              <>
                <span className="text-[14px] font-medium text-ink">
                  {(() => {
                    const n = openClaimableTasksToday.length;
                    const allCleaning = openClaimableTasksToday.every((task) => task.type !== 'manual');
                    const oneKey = allCleaning ? 'noun_cleaning_one' : 'noun_open_work_one';
                    const manyKey = allCleaning ? 'noun_cleaning_many' : 'noun_open_work_many';
                    const count = countLabel(t, n, oneKey, manyKey);
                    return n === 1 ? t('status_card_open_line_singular', { count }) : t('status_card_open_line_plural', { count });
                  })()}
                </span>
                <span className="text-[12.5px] text-muted">{t('status_card_open_help_line')}</span>
              </>
            ) : (
              <span className="text-[14px] font-medium text-ink">{t('status_card_team_done')}</span>
            )}
          </div>
        )
      ) : null}
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
      {housekeeperRedesignHere ? (
        // Housekeeping-Mobile-Redesign (Feinschliff nach Zielbild) Punkt 6: BEIDE Tabs bleiben
        // IMMER sichtbar, unabhaengig davon, welcher gerade aktiv ist - kein Zurueck-Pfeil, keine
        // optisch abweichende Unterseite beim Wechsel zu "Im Team offen" (nur die Statuskarte/Liste
        // darunter aendert ihren Inhalt, siehe oben/unten). Ersetzt fuer diese Rolle vollstaendig
        // das alte Dropdown/native <select> UND den Standortfilter (siehe showPropertyChips oben).
        // `selectedDay`/`state.propertyScope` bleiben dabei unberuehrt (selectMine/selectAllTasks
        // aendern ausschliesslich myTasksOnly, siehe oben) - Punkt 5.
        <div className="flex gap-2 px-4 pt-3 pb-2 xl:order-1 xl:flex-none xl:px-0 xl:py-0">
          <button
            type="button"
            onClick={selectMine}
            aria-pressed={state.myTasksOnly}
            className={cn(
              'flex flex-1 items-center justify-center gap-2 rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors',
              state.myTasksOnly ? 'border-ink bg-ink text-warm-white' : 'border-line bg-warm-white text-ink',
            )}
          >
            {t('my_tasks_only')}
            <TabCountBadge count={myOpenTasksCount} />
          </button>
          <button
            type="button"
            onClick={selectAllTasks}
            aria-pressed={!state.myTasksOnly}
            className={cn(
              'flex flex-1 items-center justify-center gap-2 rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors',
              !state.myTasksOnly ? 'border-ink bg-ink text-warm-white' : 'border-line bg-warm-white text-ink',
            )}
          >
            {t('open_team_tasks_tab')}
            <TabCountBadge count={openClaimableTasksToday.length} />
          </button>
        </div>
      ) : teamLeadRedesignHere ? (
        // Teamleader-Mobile-Redesign: identische Tab-Optik wie beim Reinigungskraft-Redesign oben
        // (gleiche Klassen, gleiche TabCountBadge) - nur Beschriftung/Reihenfolge/Zaehlung sind
        // rollenspezifisch ("Team Aufgaben" zuerst/Default statt "Meine Aufgaben"). Briefing
        // "neue mobile Ansicht" Punkt 6: der Standortfilter sitzt NICHT mehr hier zwischen Tabs und
        // Tagesnavigation, sondern weiter unten direkt neben der "Noch zu verteilen"-Ueberschrift
        // (siehe TaskGroup#headerRight in der Team-Aufgaben-Listenansicht) - dieselbe
        // `state.propertyScope`/`selectScope`-Logik, nur an anderer Stelle im JSX.
        <div className="flex gap-2 px-4 pt-3 pb-2 xl:order-1 xl:flex-none xl:px-0 xl:py-0">
          <button
            type="button"
            onClick={selectAllTasks}
            aria-pressed={!state.myTasksOnly}
            className={cn(
              'flex flex-1 items-center justify-center gap-2 rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors',
              !state.myTasksOnly ? 'border-ink bg-ink text-warm-white' : 'border-line bg-warm-white text-ink',
            )}
          >
            {t('team_tasks_tab')}
            <TabCountBadge count={teamOpenTasksTodayScoped.length} />
          </button>
          <button
            type="button"
            onClick={selectMine}
            aria-pressed={state.myTasksOnly}
            className={cn(
              'flex flex-1 items-center justify-center gap-2 rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors',
              state.myTasksOnly ? 'border-ink bg-ink text-warm-white' : 'border-line bg-warm-white text-ink',
            )}
          >
            {t('my_tasks_only')}
            <TabCountBadge count={myOwnCleaningTodayScoped.length + myOwnManualTodayScoped.length} />
          </button>
        </div>
      ) : showScopeRow ? (
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
              // Feinschliff (Nachbesserung): die Tagesauswahl bleibt fuer ALLE Rollen bei der
              // bisherigen, klaren schwarz/weiss-Markierung des aktiven Tages - explizit
              // gewuenschter Navigationsakzent, kein zweiter getoenter Zustand mehr fuer die
              // Reinigungskraft (das war der vorherige Versuch, hier bewusst zurueckgenommen).
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
          {/* Korrektur "Admin-Desktop-Dashboard" Punkt 3: auf Mobile bleibt der Kasten unveraendert
           * (gestapelte Zeilen) - ab `xl` wird er kompakt und horizontal: `xl:flex` verwandelt den
           * Kasten in eine einzeilige Reihe, `xl:contents` loest den inneren Detail-Wrapper in
           * eigenstaendige Flex-Kinder auf (jede Detailzeile wird dadurch ein eigenes Flex-Item
           * NEBEN der Ueberschrift, statt darunter gestapelt), `xl:flex-wrap` erlaubt einen Umbruch
           * bei schmaleren Desktop-Breiten statt eines erzwungenen Ueberlaufs. Nur `xl:`-Klassen -
           * am Mobile-Markup/-Verhalten aendert sich nichts. */}
          {isAdmin && taskViewMode === 'home' && actionNeededTasks.length > 0 ? (
            <div className="mx-4 mt-4 rounded-card-lg border border-line bg-warm-white px-4 py-3 xl:flex xl:flex-wrap xl:items-center xl:gap-x-4 xl:gap-y-1 xl:py-2.5">
              <p className="flex items-center gap-1.5 text-[13px] font-medium text-ink xl:shrink-0">
                {t('dashboard_action_needed')}
                <span className="text-status-attention">· {actionNeededTasks.length}</span>
              </p>
              <div className="mt-1.5 flex flex-col gap-0.5 text-[13px] text-muted xl:mt-0 xl:contents">
                {adminUnassignedTasks.length > 0 ? (
                  <p className="xl:whitespace-nowrap">{t('dashboard_action_needed_unassigned_line', { n: adminUnassignedTasks.length })}</p>
                ) : null}
                {adminEarlyCheckinTasks.length > 0 ? (
                  <p className="xl:whitespace-nowrap">
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
                cardGridClassName={ADMIN_DESKTOP_CARD_GRID_CLASS}
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
                isAdmin ? ADMIN_DESKTOP_CARD_GRID_CLASS : undefined,
              )}
              {renderDoneSection(doneTasks, null, isAdmin ? ADMIN_DESKTOP_CARD_GRID_CLASS : undefined)}
            </>
          ) : null}
        </>
      ) : teamLeadRedesignHere ? (
        // Teamleader-Mobile-Redesign: dieselben generischen Bausteine (TaskGroup/
        // toMixedLocationGroups/renderDoneSection/renderRoleTaskCard) wie beim Reinigungskraft-
        // Redesign oben, nur mit teamleader-eigenen, bereits standortgefilterten Listen (siehe
        // *Scoped-Konstanten oben) und anderer Informations-Hierarchie: "Team Aufgaben" (Default)
        // zeigt zuerst "Noch zu verteilen", dann "Zugewiesen", dann "Fertig" - "Meine Aufgaben"
        // zeigt AUSSCHLIESSLICH die dem Teamleader persoenlich zugewiesenen Aufgaben, identisch zur
        // Reinigungskraft-Darstellung oben (eine gemeinsame Ueberschrift statt getrennter
        // Reinigungen-/Aufgaben-Abschnitte).
        <>
          {state.myTasksOnly ? (
            <>
              {(() => {
                const myTasksMerged = sortTasksForDay([...myOwnCleaningTodayScoped, ...myOwnManualTodayScoped]);
                return myTasksMerged.length > 0 ? (
                  <TaskGroup
                    text={`${t('my_tasks_only')} · ${myTasksMerged.length}`}
                    count={myTasksMerged.length}
                    categoryLabel={t('my_tasks_only')}
                    tasks={myTasksMerged}
                    locationGroups={toMixedLocationGroups(myTasksMerged)}
                    renderCard={(task) => renderRoleTaskCard(task)}
                  />
                ) : null;
              })()}
              {renderDoneSection(myOwnDoneTodayScoped)}
            </>
          ) : (
            <>
              {teamUnassignedTasksScoped.length > 0 ? (
                <TaskGroup
                  text={`${t('dashboard_not_yet_assigned')} · ${teamUnassignedTasksScoped.length}`}
                  count={teamUnassignedTasksScoped.length}
                  categoryLabel={t('dashboard_not_yet_assigned')}
                  icon={IconTask}
                  toneClass="text-status-attention"
                  tasks={teamUnassignedTasksScoped}
                  locationGroups={toMixedLocationGroups(teamUnassignedTasksScoped)}
                  renderCard={(task) => renderRoleTaskCard(task)}
                  headerRight={showPropertyChips ? renderTeamPropertyScopeSelect() : null}
                />
              ) : showPropertyChips ? (
                // Briefing "neue mobile Ansicht" Punkt 6: der Filter darf nicht unerreichbar
                // werden, nur weil "Noch zu verteilen" laut bestehender Konvention bei 0 Eintraegen
                // komplett entfaellt (siehe TaskGroup oben) - eigene, ebenso kompakte Zeile statt.
                <div className="flex items-center justify-between gap-2 pr-4">
                  <p className="flex items-center gap-1.5 pl-4 pt-4 pb-1 text-[13px] font-medium text-ink">
                    <IconTask width={14} height={14} className="shrink-0 text-status-attention" aria-hidden="true" />
                    {t('dashboard_not_yet_assigned')} · 0
                  </p>
                  {renderTeamPropertyScopeSelect()}
                </div>
              ) : null}
              {teamAssignedTasksScoped.length > 0 ? (
                <TaskGroup
                  text={`${t('assigned_tasks_label')} · ${teamAssignedTasksScoped.length}`}
                  count={teamAssignedTasksScoped.length}
                  categoryLabel={t('assigned_tasks_label')}
                  tasks={teamAssignedTasksScoped}
                  locationGroups={toMixedLocationGroups(teamAssignedTasksScoped)}
                  renderCard={(task) => renderRoleTaskCard(task)}
                />
              ) : null}
              {renderDoneSection(teamDoneTasksTodayScoped, toMixedLocationGroups(teamDoneTasksTodayScoped))}
            </>
          )}
        </>
      ) : housekeeperRedesignHere ? (
        // Housekeeping-Mobile-Redesign Punkt 7/8/9/10/11/13: Reinigungskraft (mit ODER ohne
        // eigenes Team) - "Meine Aufgaben" nutzt weiterhin dieselben, bereits nach Standort
        // gruppierbaren Bausteine (TaskGroup/toMixedLocationGroups/renderDoneSection) wie der
        // bisherige Default-Pfad, nur mit EINER gemeinsamen "Meine Aufgaben · N"-Ueberschrift statt
        // der separaten Reinigungen-/Aufgaben-Abschnitte (Punkt 7). "Im Team offen" zeigt dieselbe
        // Statuskarte (siehe oben, jetzt inhaltlich umgeschaltet statt eines zweiten Banners),
        // darunter Sortierung/prominenter Early-Check-in-Hinweis/"Übernehmen" je Karte.
        <>
          {state.myTasksOnly ? (
            <>
              {(() => {
                const myTasksMerged = sortTasksForDay([...cleaningTasks, ...openManualTasks]);
                return myTasksMerged.length > 0 ? (
                  <TaskGroup
                    text={`${t('my_tasks_only')} · ${myTasksMerged.length}`}
                    count={myTasksMerged.length}
                    categoryLabel={t('my_tasks_only')}
                    tasks={myTasksMerged}
                    locationGroups={toMixedLocationGroups(myTasksMerged)}
                    renderCard={(task) => renderRoleTaskCard(task)}
                  />
                ) : null;
              })()}
              {renderDoneSection(doneTasks)}
            </>
          ) : (
            <>
              {/* Housekeeping-Mobile-Redesign (Feinschliff nach Zielbild) Punkt 11: kein zweiter,
               * andersfarbiger Banner mehr hier - die Statuskarte oben traegt die Zusammenfassung
               * bereits fuer diesen Tab. Punkt 10 (Sortierung): kompakter Wert+Chevron statt eines
               * beschrifteten Auswahlfelds - derselbe leichte Dropdown-Baustein (TaskViewSelect)
               * wie an anderer Stelle im Dashboard, nur rechtsbuendig und ohne umgebendes Label. */}
              {openClaimableTasksToday.length > 0 ? (
                <div className="flex justify-end px-4 pt-3">
                  <TaskViewSelect
                    value={openTasksSort}
                    options={[
                      { value: 'arrival', label: t('sort_option_arrival') },
                      { value: 'location', label: t('sort_option_location') },
                      { value: 'apartment', label: t('sort_option_apartment') },
                    ]}
                    onChange={(value) => setOpenTasksSort(value as 'arrival' | 'location' | 'apartment')}
                  />
                </div>
              ) : null}
              {(() => {
                const sortedOpen = applyOpenTasksSort(openClaimableTasksToday, openTasksSort);
                if (sortedOpen.length === 0) {
                  return <div className="px-4 py-10 text-center text-sm text-muted">{t('no_tasks')}</div>;
                }
                const gridClass = 'grid grid-cols-1 gap-3 px-4 pt-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-[repeat(auto-fill,minmax(340px,1fr))]';
                const locationGroups = toOpenLocationGroups(sortedOpen);
                if (locationGroups) {
                  return (
                    <div className="flex flex-col gap-1">
                      {locationGroups.map((group) => (
                        <div key={group.propertyCode}>
                          <p className="px-4 pb-1 pt-3 text-[12px] font-medium text-muted first:pt-1">{group.label}</p>
                          <div className={gridClass}>{group.tasks.map((task) => renderOpenTaskCard(task))}</div>
                        </div>
                      ))}
                    </div>
                  );
                }
                return <div className={gridClass}>{sortedOpen.map((task) => renderOpenTaskCard(task))}</div>;
              })()}
            </>
          )}
        </>
      ) : (
        // Punkt 10: Reinigungen/Aufgaben/Fertig als eigene, klein beschriftete Abschnitte statt
        // einer einzigen gemischten Liste - "Fertig" per Default eingeklappt, damit erledigte
        // Elemente die noch offene Arbeit nicht verdraengen. Eine leere Kategorie wird komplett
        // weggelassen (kein grosser Empty-State). Genutzt fuer Teamleader/Standortverantwortliche/
        // Admin im 'mine'-Modus (identisch zu vorher) - eine normale Reinigungskraft (mit/ohne
        // Team) nutzt jetzt den eigenen housekeeperRedesignHere-Zweig oben.
        <>
          {renderCleaningAndManualTaskGroups(cleaningTasks, openManualTasks, isAdmin ? ADMIN_DESKTOP_CARD_GRID_CLASS : undefined)}
          {renderDoneSection(doneTasks, null, isAdmin ? ADMIN_DESKTOP_CARD_GRID_CLASS : undefined)}
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
