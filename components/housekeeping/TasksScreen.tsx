'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import type { HousekeepingApp } from '@/lib/housekeeping/useHousekeepingApp';
import type { ResolvedTask } from '@/lib/housekeeping/tasks';
import type { StaffUser } from '@/lib/housekeeping/types';
import { allowedProperties } from '@/lib/housekeeping/rooms';
import { getPropertyDisplayName } from '@/lib/housekeeping/api';
import { dayOverviewFor } from '@/lib/housekeeping/dayOverview';
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
    noticeForTask, isNoticeAcknowledgedBy, openManualTaskForm, shortStaffName,
    isTaskSeenByMe, isBookingChangeAckedByMe,
  } = app;
  const [bulkOpen, setBulkOpen] = useState(false);
  const [moreActionsOpen, setMoreActionsOpen] = useState(false);
  const [teamOpen, setTeamOpen] = useState(false);
  const [doneOpen, setDoneOpen] = useState(false);

  // Punkt 17 (Desktop-Admin-Layout): dieselbe Ableitung wie zuvor hier inline, jetzt in
  // lib/housekeeping/dayOverview.ts ausgelagert - die neue DesktopAdminSidebar.tsx nutzt exakt
  // dieselbe Funktion, keine zweite/abweichende Berechnung. Definitionen (Reinigungen/Aufgaben/
  // Fertig, Rollen/Berechtigungen) unveraendert, siehe dortige Kommentare.
  const { date, visible, cleaningTasks, openManualTasks, doneTasks, isAdmin, isManagerHere, capacity } = dayOverviewFor(app);
  const allowed = allowedProperties(state.user, state.properties.map((p) => p.code));
  const allowedProps = state.properties.filter((p) => allowed.includes(p.code));
  const topCapacityEntry = capacity.find((e) => e.housekeeperId);
  const unassignedCapacityEntry = capacity.find((e) => e.housekeeperId === null);

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
  const showScopeRow = !isManagerHere || showPropertyChips;

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

  return (
    <div className="pb-6">
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
          {!isManagerHere ? (
            <div className="relative min-w-0 flex-1 xl:w-[210px] xl:flex-none">
              <select
                value={state.myTasksOnly ? 'mine' : 'all'}
                onChange={(e) => (e.target.value === 'mine' ? selectMine() : selectAllTasks())}
                className={selectClass}
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
      {visible.length > 0 ? (
        <div className="grid grid-cols-3 gap-2 px-4 pt-3 xl:order-4 xl:flex xl:flex-none xl:ml-auto xl:items-center xl:gap-5 xl:px-0 xl:pt-0">
          <SummaryStat
            value={cleaningTasks.length}
            label={t(cleaningTasks.length === 1 ? 'noun_cleaning_one' : 'noun_cleaning_many')}
            icon={IconSparkles}
            toneClass="text-type-turnover"
          />
          <SummaryStat
            value={openManualTasks.length}
            label={t(openManualTasks.length === 1 ? 'noun_task_one' : 'noun_task_many')}
            icon={IconTask}
            // Feinschliff Runde 8 (Punkt 3): "Aufgabe" ist keine Abreise-Reinigung, sondern der
            // neutrale, manuelle Aufgabentyp (siehe TaskCard.tsx#TYPE_LEFT_BORDER: type-manual) -
            // `text-type-departure` war ein bestehender Farbfehler (Abreise-Braunton statt des
            // neutralen Aufgaben-Akzents). Korrektur nur auf Desktop (`xl:`), damit Mobile hier
            // unveraendert bleibt, wie fuer dieses Feinschliff-Update gefordert.
            toneClass="text-type-departure xl:text-type-manual"
          />
          <SummaryStat value={doneTasks.length} label={t('wf_done')} icon={IconCheck} toneClass="text-status-clean" />
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

      {state.loading && visible.length === 0 && !state.tasksLoadError ? (
        <div className="px-4 py-10 text-center text-sm text-muted">{t('loading')}</div>
      ) : state.tasksLoadError ? (
        <div className="px-4 py-10 text-center">
          <p className="text-sm text-status-attention">{state.tasksLoadError}</p>
          <Button className="mt-4" size="sm" onClick={() => retryTasksLoad()}>
            {t('retry')}
          </Button>
        </div>
      ) : visible.length === 0 ? (
        <div className="px-4 py-10 text-center text-sm text-muted">{t('no_tasks')}</div>
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
      ) : (
        // Punkt 10: Reinigungen/Aufgaben/Fertig als eigene, klein beschriftete Abschnitte statt
        // einer einzigen gemischten Liste - "Fertig" per Default eingeklappt, damit erledigte
        // Elemente die noch offene Arbeit nicht verdraengen. Eine leere Kategorie wird komplett
        // weggelassen (kein grosser Empty-State).
        <>
          {cleaningTasks.length > 0 ? (
            <TaskGroup
              text={countLabel(t, cleaningTasks.length, 'noun_cleaning_one', 'noun_cleaning_many')}
              count={cleaningTasks.length}
              categoryLabel={t('noun_cleaning_many')}
              icon={IconSparkles}
              toneClass="text-type-turnover"
              tasks={cleaningTasks}
              locationGroups={toLocationGroups(cleaningTasks, 'noun_cleaning_one', 'noun_cleaning_many')}
              renderCard={(task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  lang={state.lang}
                  selected={false}
                  selectable={false}
                  shortName={shortStaffName}
                  noticeState={cardNoticeState(task)}
                  attentionState={cardAttentionState(task)}
                  onOpen={() => openTask(task.id)}
                />
              )}
            />
          ) : null}

          {openManualTasks.length > 0 ? (
            <TaskGroup
              text={countLabel(t, openManualTasks.length, 'noun_task_one', 'noun_task_many')}
              count={openManualTasks.length}
              categoryLabel={t('noun_task_many')}
              icon={IconTask}
              // Feinschliff Runde 8 (Punkt 3/4): derselbe Farbtoken-Fix wie bei der Kennzahl oben,
              // fuer denselben Aufgabentyp - nur auf Desktop (`xl:`), Mobile unveraendert.
              toneClass="text-type-departure xl:text-type-manual"
              tasks={openManualTasks}
              locationGroups={toLocationGroups(openManualTasks, 'noun_task_one', 'noun_task_many')}
              renderCard={(task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  lang={state.lang}
                  selected={false}
                  selectable={false}
                  shortName={shortStaffName}
                  noticeState="none"
                  attentionState={cardAttentionState(task)}
                  onOpen={() => openTask(task.id)}
                />
              )}
            />
          ) : null}

          {doneTasks.length > 0 ? (
            <div className="mt-1">
              {/* Korrektur (UX-Feinschliff Runde 4, Punkt 4): exakt dieselbe Grundstruktur wie der
               * Reinigungen-/Aufgaben-Header oben (gleiche Hoehe/Typografie/Icon-Groesse/Abstaende/
               * Klickflaeche, siehe TaskGroup) - einziger Unterschied ist der Chevron rechts, weil
               * ausschliesslich dieser Bereich tatsaechlich auf-/zuklappbar ist. */}
              <button
                type="button"
                onClick={() => setDoneOpen((v) => !v)}
                className="flex w-full items-center justify-between gap-1.5 px-4 pt-4 pb-1 text-left"
              >
                <span className="flex items-center gap-1.5 text-[13px] font-medium text-ink xl:hidden">
                  <IconCheck width={14} height={14} className="shrink-0 text-status-clean" aria-hidden="true" />
                  {doneTasks.length} {t('section_done_suffix')}
                </span>
                {/* Desktop-Feinschliff (Claude-Befehl 2): dieselbe "[Icon] KATEGORIE Zahl"-Form wie
                 * TaskGroup oben ("FERTIG 2" statt "2 erledigt") - bestehendes IconCheck
                 * unveraendert wiederverwendet, Chevron/Auf-Zuklapp-Funktion unveraendert. */}
                <span className="hidden items-center gap-1.5 text-[11px] font-normal uppercase tracking-wide text-muted xl:flex">
                  <IconCheck width={13} height={13} className="shrink-0 text-status-clean" aria-hidden="true" />
                  {t('wf_done')}
                  <span className="font-medium normal-case text-ink">{doneTasks.length}</span>
                </span>
                <IconChevronDown width={14} height={14} className={cn('shrink-0 text-muted transition-transform', doneOpen && 'rotate-180')} aria-hidden="true" />
              </button>
              {doneOpen ? (
                <div className="grid grid-cols-1 gap-3 px-4 pt-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-[repeat(auto-fill,minmax(340px,1fr))]">
                  {doneTasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      lang={state.lang}
                      selected={false}
                      selectable={false}
                      shortName={shortStaffName}
                      noticeState="none"
                      attentionState={cardAttentionState(task)}
                      onOpen={() => openTask(task.id)}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
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

      <TaskDetailSheet app={app} task={state.detailTaskId ? visible.find((task) => task.id === state.detailTaskId) || null : null} />
      <ManualTaskFormSheet app={app} />
    </div>
  );
}
