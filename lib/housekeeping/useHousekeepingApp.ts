'use client';

/**
 * Zentraler State-/Aktions-Hook fuer den Housekeeping-Bereich - Uebersetzung des bisherigen
 * globalen `S`-Objekts + aller Aktionsfunktionen aus app.js nach React, ohne die Ablauflogik
 * zu aendern (gleiche Reihenfolge von Requests, gleiche Payload-Formen, gleiche
 * Zwangsreinigungs-/Zuweisungs-/Timer-/Doubleup-/Break-Semantik).
 *
 * Ein `stateRef` haelt immer den aktuellen Stand, damit asynchrone Aktionen (wie zuvor ueber
 * das mutable `S`-Objekt) nach einem `await` den frischesten Stand lesen, statt auf einen
 * veralteten geschlossenen Wert hereinzufallen.
 *
 * NEU (Konzept-Erweiterung "Reinigungsplanung"): Die App denkt nicht mehr primaer Property ->
 * Zimmer -> aktueller Zustand, sondern Datum -> Reinigungsauftraege -> Zuweisung -> Durchfuehrung
 * (siehe lib/housekeeping/tasks.ts). Das ist eine ADDITIVE Erweiterung - die bisherige, komplett
 * unveraendert erhaltene Rooms-/Assignments-/Timer-/Doubleup-Logik (state.units/reservations/
 * assignments/rooms()) bleibt vollstaendig bestehen und treibt jetzt die sekundaere "Alle
 * Apartments"-Ansicht (weiterhin fuer genau eine aktive Property). Die neue Planungsebene
 * (state.planningUnits/planningReservations/taskAssignments/tasks()) ist ein eigener,
 * standortuebergreifender Datenfluss daneben.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Lang } from './i18n';
import { translate } from './i18n';
import { buildShortNameMap } from './names';
import { fetchMe, login as loginRequest, logout as logoutRequest } from './auth';
import {
  DOUBLEUP_TYPES, POLL_INTERVAL, assignmentsApi, breaksApi, completionsApi, consumablesApi, doubleupsApi,
  getPropertyDisplayName, housekeepingTeamsApi, incidentPhotosApi, incidentsApi, linenItemsApi, loadBackendState,
  loadConsumableItems, loadHousekeepingTeams, loadIntegrationsStatus, loadLinenItems, loadManualTasks, loadNfcTagStatuses,
  loadProperties, loadReservations, loadReservationsRangeForProperties, loadTaskAssignments, loadTaskNotices,
  loadTaskScheduleOverrides, loadTaskTimeOverrides, loadTaskViews, loadUnits, loadUnitsForProperties, manualTasksApi, nfcApi,
  setUnitCondition, syncBookingChanges, taskAssignmentsApi, taskNoticesApi, taskScheduleOverridesApi, taskTimeOverridesApi,
  taskViewsApi, usersApi, type IntegrationsStatus, type ManualTaskCreateInput, type ReportIncidentInput,
} from './api';
import { allowedProperties, buildRooms, roomKey, todayISO, addDaysISO } from './rooms';
import { managedPropertyCodes } from './permissions';
import { dayHeadingLabel } from './dayLabel';
import {
  buildTasks, canRescheduleTask, capacityForDay, computeExtraEquipmentNeeds, daySummary, manualTaskToResolvedTask,
  nextArrivalDateForTask, requiredPreparationItemIds, requiresInspection, resolveTasks, sortTasksForDay,
  taskGenerationDays, teamCapacityForDay,
  type ResolvedTask, type TeamContext,
} from './tasks';
import type {
  ApaleoReservation, ApaleoUnit, AssignmentsState, BookingChangeAcksState, BookingChangeRecordsState, BreakEntry,
  CapacityEntry, Completion,
  ConsumableItem, ConsumableReport, DaySummary, DoubleupsState, HousekeepingIncident, HousekeepingTeam, LinenItem,
  ManualTask, ManualTasksState, NfcTagStatusesState, Property, ReservationsState, Room, RoomFilter, StaffUser,
  TaskAssignmentsState, TaskNotice, TaskNoticeAcksState, TaskNoticesState, TaskScheduleOverridesState, TaskSeenState,
  TaskStartSource, TaskTeamOverridesState, TaskTimeOverridesState, TeamCapacityEntry, TeamPropertyDefaultsState,
} from './types';

/** Key-Schema exakt wie api/_nfc.js#unitKey - EINZIGE Stelle im Client, die dieses Format kennt. */
function nfcUnitKey(propertyCode: string, unitId: string): string {
  return `${propertyCode}|${unitId}`;
}

export type AuthScreen = 'checking' | 'login' | 'app';
// 'settings' ist bewusst KEIN Bottom-Nav-Eintrag (siehe StaffNavBar#ITEMS) - nur ueber das
// Profilmenue (SettingsSheet) erreichbar, analog zu 'team' aber ohne eigenen Tab.
export type NavId = 'tasks' | 'rooms' | 'stats' | 'team' | 'settings';

interface AppState {
  authScreen: AuthScreen;
  lang: Lang;
  user: StaffUser | null;
  loginError: string;
  loading: boolean;
  /** Fehlermeldung, wenn das Laden von Zimmern/Reservierungen fuer die aktive Property
   * fehlgeschlagen ist (z. B. Apaleo-Fehler) - bleibt sichtbar bis zu einem erfolgreichen
   * "Erneut versuchen", statt nur als fluechtiger Toast zu verschwinden. */
  roomsLoadError: string | null;
  properties: Property[];
  activeProperty: string | null;
  units: ApaleoUnit[];
  reservations: ReservationsState;
  assignments: AssignmentsState;
  doubleups: DoubleupsState;
  users: StaffUser[];
  completions: Completion[];
  breaks: BreakEntry[];
  myRoomsOnly: boolean;
  filter: RoomFilter;
  multiSelect: boolean;
  selectedRooms: Set<string>;
  detailRoomKey: string | null;
  onBreak: boolean;
  toast: string | null;
  now: number;
  activeNav: NavId;

  // --- Reinigungsplanung (Heute+3, standortuebergreifend) ---
  /** Die 4 betrachteten Kalendertage [heute, heute+1, heute+2, heute+3]. */
  planningDays: string[];
  /** Einer von planningDays - welcher Tag gerade in der Aufgaben-Ansicht sichtbar ist. */
  selectedDay: string;
  /** 'all' = Alle Standorte (innerhalb der eigenen Berechtigung), sonst ein Property-Code. */
  propertyScope: string;
  /** Default true fuer Housekeeper ("Meine Aufgaben"), false fuer Admin ("Alle Standorte") -
   * siehe afterLogin(). */
  myTasksOnly: boolean;
  planningUnits: ApaleoUnit[];
  planningReservations: ApaleoReservation[];
  taskAssignments: TaskAssignmentsState;
  /** Housekeeping Teams (Reinigungsfirmen) - Stammdaten + Property-Standardzuordnung + evtl.
   * Task-Overrides (siehe lib/housekeeping/tasks.ts#TeamContext/resolveTasks). Getrennt von
   * taskAssignments geladen/gehalten, da Team- und Personen-Zuweisung zwei unabhaengige
   * Datenquellen sind (siehe types.ts#StaffUser-Kommentar). */
  teams: HousekeepingTeam[];
  teamPropertyDefaults: TeamPropertyDefaultsState;
  taskTeamOverrides: TaskTeamOverridesState;
  /** "Wichtiger Hinweis" pro Task + userbezogene Lesebestaetigungen (Key "<taskId>|<userId>") -
   * eigene, vom Apaleo-Reservierungskommentar getrennte Datenquelle (Punkt 3-8). */
  taskNotices: TaskNoticesState;
  taskNoticeAcks: TaskNoticeAcksState;
  /** Briefing "Reinigungskarten ueberarbeiten" Punkt 5/8: zwei bewusst GETRENNTE, userbezogene
   * Aufmerksamkeits-Zustaende - "gesehen" (taskSeen, Key = Task-ID, bereits vom Server auf den
   * eingeloggten User gefiltert) und "Buchungsaenderung zur Kenntnis genommen"
   * (bookingChangeAcks, ebenso Key = Task-ID) - niemals dasselbe Feld, siehe types.ts. */
  taskSeen: TaskSeenState;
  bookingChangeAcks: BookingChangeAcksState;
  /** Manueller Admin-Override der Abreise-/Anreisezeit (Prioritaet 1), Key = Task-ID - eigene,
   * vom Apaleo-Reservierungskommentar/gebuchten Service getrennte Datenquelle. */
  taskTimeOverrides: TaskTimeOverridesState;
  /** Manueller Admin-Override des GEPLANTEN Housekeeping-Tags ("Tag ändern", Briefing), Key =
   * Task-ID - komplett unabhaengig vom aus Apaleo abgeleiteten Quelldatum (Task.date), siehe
   * lib/housekeeping/tasks.ts#resolveTasks/scheduledDate. */
  taskScheduleOverrides: TaskScheduleOverridesState;
  /** NFC-Tag-Status je Apartment (Punkt "NFC-Verwaltung", Admin-only) - Key = "propertyCode|
   * unitId" (siehe nfcUnitKey oben). Wird nicht beim Login vorgeladen (nur fuer Admins relevant,
   * selten benoetigt), sondern erst, wenn die NFC-Einstellungen tatsaechlich geoeffnet werden. */
  nfcTags: NfcTagStatusesState;
  nfcTagsLoading: boolean;
  tasksLoadError: string | null;
  taskMultiSelect: boolean;
  selectedTasks: Set<string>;
  detailTaskId: string | null;

  /** Manuell von Admin erstellte Aufgaben (Punkt "Admin kann Aufgaben erstellen") - Key = eigene
   * stabile ID (siehe api/manual-tasks.js), NICHT Teil von taskAssignments (kein Reinigungs-
   * Workflow). Offene UND erledigte Aufgaben werden immer beide geladen/aufgeloest - die
   * Aufgabenliste (TasksScreen) gruppiert sie selbst in "Aufgaben"/"Fertig"-Abschnitte, statt sie
   * hinter einem Filter zu verstecken (Punkt "Kennzahlen/Sections", loest den frueheren admin-
   * only Offen/Erledigt-Toggle ab). */
  manualTasks: ManualTasksState;
  manualTaskFormOpen: boolean;
  /** Bekannte housekeeping-relevante Buchungsaenderungen je reservationId (Punkt "Buchungs-
   * aenderung sichtbar machen") - siehe api/booking-changes.js. */
  bookingChanges: BookingChangeRecordsState;

  /** "Vorfall melden" (Briefing) - eigenes, von detailTaskId unabhaengiges Sheet: kann sowohl
   * standalone (Nav/Einstellungen, ohne Vorauswahl) als auch aus der Task-Detailansicht heraus
   * geoeffnet werden (dann mit `incidentPresetTaskId` vorbelegt, Punkt 4 "Apartment nicht
   * nochmals auswaehlen"). */
  incidentSheetOpen: boolean;
  incidentPresetTaskId: string | null;

  /** "Melden"-Sammelpunkt (Briefing "Vorfall melden"/"Verbrauch melden" nicht als zwei eigene
   * Bottom-Nav-Punkte) - oeffnet ein kleines Auswahl-Sheet, das seinerseits eines der beiden
   * bestehenden Sheets oeffnet. */
  reportMenuOpen: boolean;

  /** Waesche & Bettsachen (Briefing "Waescheverbrauch erfassen") - je Standort konfigurierte
   * Artikelliste, global geladen (wie teams) - siehe lib/housekeeping/linen.ts fuer die
   * Schaetzregel-Anwendung. `linenCompletionTaskId` ersetzt den bisherigen SOFORTIGEN
   * finishTask()-Aufruf: ist er gesetzt, zeigt die App das verpflichtende Formular VOR dem
   * eigentlichen Abschluss (siehe openLinenCompletion in diesem Hook). */
  linenItems: LinenItem[];
  linenCompletionTaskId: string | null;

  /** Verbrauchsmaterial (Briefing "Verbrauch melden") - bewusst getrennte Liste/Sheet, rein
   * standortbezogen (kein Task-/Apartmentbezug, siehe ReportConsumableSheet.tsx). */
  consumableItems: ConsumableItem[];
  consumableReportOpen: boolean;

  /** Einstellungen > Meldungen & Betrieb (admin-only Uebersichten) - wie nfcTags NICHT beim Login
   * vorgeladen, sondern erst lazy beim tatsaechlichen Oeffnen der jeweiligen Ansicht. */
  incidents: HousekeepingIncident[];
  incidentsLoading: boolean;
  consumableReports: ConsumableReport[];
  consumableReportsLoading: boolean;

  /** Einstellungen > Integrationen - reine "konfiguriert"-Statusflags, siehe
   * api/integrations-status.js. `null` = noch nicht geladen. */
  integrationsStatus: IntegrationsStatus | null;
  integrationsStatusLoading: boolean;
}

function readLang(): Lang {
  if (typeof window === 'undefined') return 'de';
  const stored = window.localStorage.getItem('hk_lang');
  return stored === 'en' || stored === 'pl' || stored === 'ro' ? stored : 'de';
}
function readActiveProperty(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem('hk_active_property');
}

function initialState(): AppState {
  return {
    authScreen: 'checking',
    lang: readLang(),
    user: null,
    loginError: '',
    loading: false,
    roomsLoadError: null,
    properties: [],
    activeProperty: readActiveProperty(),
    units: [],
    reservations: { inHouse: [], departToday: [], departTomorrow: [], arriveToday: [] },
    assignments: {},
    doubleups: {},
    users: [],
    completions: [],
    breaks: [],
    myRoomsOnly: true,
    filter: 'all',
    multiSelect: false,
    selectedRooms: new Set(),
    detailRoomKey: null,
    onBreak: false,
    toast: null,
    now: Date.now(),
    activeNav: 'tasks',

    planningDays: [],
    selectedDay: todayISO(),
    propertyScope: 'all',
    myTasksOnly: true,
    planningUnits: [],
    planningReservations: [],
    taskAssignments: {},
    teams: [],
    teamPropertyDefaults: {},
    taskTeamOverrides: {},
    taskNotices: {},
    taskNoticeAcks: {},
    taskSeen: {},
    bookingChangeAcks: {},
    taskTimeOverrides: {},
    taskScheduleOverrides: {},
    nfcTags: {},
    nfcTagsLoading: false,
    tasksLoadError: null,
    taskMultiSelect: false,
    selectedTasks: new Set(),
    detailTaskId: null,
    manualTasks: {},
    manualTaskFormOpen: false,
    bookingChanges: {},
    incidentSheetOpen: false,
    incidentPresetTaskId: null,
    reportMenuOpen: false,
    linenItems: [],
    linenCompletionTaskId: null,
    consumableItems: [],
    consumableReportOpen: false,
    incidents: [],
    incidentsLoading: false,
    consumableReports: [],
    consumableReportsLoading: false,
    integrationsStatus: null,
    integrationsStatusLoading: false,
  };
}

export function useHousekeepingApp() {
  const [state, setState] = useState<AppState>(initialState);
  const stateRef = useRef(state);
  // Haelt den Ref nach jedem Render synchron (statt waehrend des Renders selbst zu schreiben,
  // was React als Nebeneffekt im Render-Pfad ablehnt) - die wenigen Stellen, an denen eine
  // Aktion den frischesten Stand noch VOR dem naechsten Render braucht (z. B. direkt vor einem
  // `await`), aktualisieren stateRef.current dort weiterhin explizit selbst.
  useEffect(() => {
    stateRef.current = state;
  });

  const patch = useCallback((partial: Partial<AppState> | ((s: AppState) => Partial<AppState>)) => {
    setState((prev) => ({ ...prev, ...(typeof partial === 'function' ? partial(prev) : partial) }));
  }, []);

  // Liest bewusst `state.lang` (nicht stateRef) - `t()` wird waehrend des Renders aufgerufen und
  // muss deshalb den Wert DIESES Renders sehen, nicht den zeitversetzt per Effekt gespiegelten.
  const t = useCallback(
    (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate(state.lang, key, vars),
    [state.lang],
  );

  const showToast = useCallback((msg: string) => {
    patch({ toast: msg });
    setTimeout(() => {
      if (stateRef.current.toast === msg) patch({ toast: null });
    }, 2200);
  }, [patch]);

  /** Punkt "Reinigungskräfte standardmäßig nur mit Vornamen anzeigen" - reine Darstellungsschicht
   * (siehe lib/housekeeping/names.ts), der gespeicherte volle Name bleibt unveraendert. Die
   * Kurzname-Zuordnung wird einmal ueber ALLE geladenen Benutzer gebildet (nicht pro Aufruf neu),
   * damit eine Kollision (z. B. zwei "Anna") ueberall konsistent gleich aufgeloest wird - admin-
   * only Bereiche (Teamverwaltung/Benutzerprofil) rufen diese Funktion bewusst nicht auf und
   * zeigen weiterhin den vollen Namen. */
  const shortNameMap = useMemo(() => buildShortNameMap(state.users.map((u) => u.name)), [state.users]);
  const shortStaffName = useCallback((name: string | null | undefined): string => {
    if (!name) return '';
    return shortNameMap.get(name) || name.trim().split(/\s+/)[0] || name;
  }, [shortNameMap]);

  const loadBackend = useCallback(async () => {
    const backend = await loadBackendState();
    const user = stateRef.current.user;
    const onBreak = user ? backend.breaks.some((b) => b.housekeeperId === user.id && b.end === null) : false;
    patch({ ...backend, onBreak });
  }, [patch]);

  const refreshAll = useCallback(async () => {
    const activeProperty = stateRef.current.activeProperty;
    if (!activeProperty) return;
    const [units, reservations] = await Promise.all([loadUnits(activeProperty), loadReservations(activeProperty), loadBackend()]);
    patch({ units, reservations, roomsLoadError: null });
  }, [loadBackend, patch]);

  // Faengt Fehler beim Laden von Zimmern/Reservierungen (z. B. ein Apaleo-Fehler fuer die
  // gewaehlte Property) als dauerhaft sichtbaren Fehlerzustand ab, statt sie unbehandelt aus
  // selectProperty()/afterLogin() durchschlagen zu lassen - das hielt den Rooms-Screen zuvor
  // unbegrenzt bei "Lade Daten..." fest, weil der `loading`-Reset danach nie erreicht wurde.
  const loadRoomsData = useCallback(async () => {
    try {
      await refreshAll();
    } catch (err) {
      patch({ roomsLoadError: err instanceof Error ? err.message : String(err) });
    }
  }, [patch, refreshAll]);

  const retryLoad = useCallback(async () => {
    patch({ loading: true });
    await loadRoomsData();
    patch({ loading: false });
  }, [loadRoomsData, patch]);

  // --- Reinigungsplanung: Datenfluss ---
  // Laedt Units + Reservierungen fuer Heute+3 gebuendelt ueber ALLE im aktuellen Scope
  // (propertyScope) erlaubten Properties (siehe api.ts#loadUnitsForProperties/
  // loadReservationsRangeForProperties - je EIN Request statt einem pro Property/Tag/Unit,
  // Punkt 30/31). tasks() leitet daraus bei jedem Render die eigentlichen Auftraege ab (siehe
  // lib/housekeeping/tasks.ts), analog zu rooms()/buildRooms() oben.
  const loadPlanningData = useCallback(async () => {
    const user = stateRef.current.user;
    const properties = stateRef.current.properties;
    const propertyScope = stateRef.current.propertyScope;
    const allowed = allowedProperties(user, properties.map((p) => p.code));
    const scopeCodes = propertyScope === 'all' ? allowed : (allowed.includes(propertyScope) ? [propertyScope] : []);
    const today = todayISO();
    const days = [0, 1, 2, 3].map((n) => addDaysISO(today, n));
    // Bugfix "Verschobene Reinigung verschwindet nach Tageswechsel" (siehe tasks.ts#
    // taskGenerationDays): die Apaleo-Abfrage muss auch die NICHT sichtbaren Ruecklauftage
    // abdecken, sonst fehlt buildTasks() unten das Reservierungsdatum einer kuerzlich verschobenen
    // Reinigung komplett, sobald ihr Quelldatum aus dem sichtbaren Fenster gerutscht ist.
    const fetchDays = taskGenerationDays(days);
    if (scopeCodes.length === 0) {
      const [teamsData, linenItems, consumableItems] = await Promise.all([loadHousekeepingTeams(), loadLinenItems(), loadConsumableItems()]);
      patch({
        planningUnits: [], planningReservations: [], taskAssignments: {}, taskNotices: {}, taskNoticeAcks: {},
        taskSeen: {}, bookingChangeAcks: {},
        taskTimeOverrides: {}, taskScheduleOverrides: {}, planningDays: days, manualTasks: {}, bookingChanges: {},
        teams: teamsData.teams, teamPropertyDefaults: teamsData.propertyDefaults, taskTeamOverrides: teamsData.taskTeamOverrides,
        linenItems, consumableItems,
      });
      return;
    }
    const [
      units, reservations, taskAssignments, noticesData, taskTimeOverrides, taskScheduleOverrides, teamsData, linenItems,
      consumableItems, manualTasks, viewsData,
    ] = await Promise.all([
        loadUnitsForProperties(scopeCodes),
        loadReservationsRangeForProperties(scopeCodes, fetchDays[0], days[3]),
        loadTaskAssignments(),
        loadTaskNotices(),
        loadTaskTimeOverrides(),
        loadTaskScheduleOverrides(),
        loadHousekeepingTeams(),
        loadLinenItems(),
        loadConsumableItems(),
        loadManualTasks(),
        loadTaskViews(),
        loadBackend(),
      ]);
    // Buchungsaenderungen (Punkt "Buchungsaenderung sichtbar machen"): rein informative
    // Zusatzfunktion - ein Fehler hier darf die eigentliche Aufgabenplanung nicht blockieren,
    // deshalb eigenes try/catch statt im Promise.all oben.
    let bookingChanges: BookingChangeRecordsState = stateRef.current.bookingChanges;
    try {
      const syncInput = reservations.map((r) => ({
        id: r.id,
        arrival: r.arrival || null,
        departure: r.departure || null,
        unitId: r.unit?.id || r.unit?.code || null,
        propertyCode: r.property?.code || r.property?.id || '',
        // Nutzerfeedback "Buchung geändert" Punkt: Erwachsene/Kinder getrennt statt einer
        // Gesamtzahl (siehe api/booking-changes.js) - `children` ist nur bekannt, wenn auch
        // `adults` bekannt ist (dieselbe Konvention wie zuvor bei tasks.ts#guestCount).
        adults: typeof r.adults === 'number' ? r.adults : null,
        children: typeof r.adults === 'number' ? (r.childrenAges?.length || 0) : null,
      })).filter((r) => r.propertyCode);
      if (syncInput.length > 0) bookingChanges = await syncBookingChanges(syncInput);
    } catch {
      // still, siehe Kommentar oben - vorheriger Stand bleibt erhalten.
    }
    // Briefing "BABY-Business-Logik" Punkt 3C/4/5/8/10: Fall 1/2/3A/3B (Reinigung existiert und ist
    // noch nicht abgeschlossen) deckt requiredPreparationItemIds() bereits live ab, siehe dort -
    // hier wird NUR der komplementaere Fall (keine passende Reinigung ODER bereits abgeschlossen)
    // als separate `Zusatzausstattung`-Aufgabe mit dem Server abgeglichen. Rein informativ wie der
    // Buchungsaenderungs-Sync oben - ein Fehler hier darf die Aufgabenplanung nicht blockieren.
    let manualTasksState: ManualTasksState = manualTasks;
    try {
      if (scopeCodes.length > 0) {
        const propertyNames: Record<string, string> = {};
        for (const p of properties) propertyNames[p.code] = p.name || p.code;
        const needs = computeExtraEquipmentNeeds({ propertyNames, units, reservations, days, taskAssignments });
        const evaluatedReservationIds = reservations.map((r) => r.id);
        manualTasksState = (await manualTasksApi.syncExtraEquipment(needs, evaluatedReservationIds, scopeCodes)).manualTasks;
      }
    } catch {
      // still, siehe Kommentar oben - vorheriger Stand bleibt erhalten.
    }
    patch({
      planningUnits: units, planningReservations: reservations, taskAssignments,
      taskNotices: noticesData.notices, taskNoticeAcks: noticesData.acks, taskTimeOverrides, taskScheduleOverrides,
      taskSeen: viewsData.seen, bookingChangeAcks: viewsData.changeAcks,
      planningDays: days,
      teams: teamsData.teams, teamPropertyDefaults: teamsData.propertyDefaults, taskTeamOverrides: teamsData.taskTeamOverrides,
      linenItems, consumableItems, manualTasks: manualTasksState, bookingChanges,
    });
  }, [loadBackend, patch]);

  // Gleiches Muster wie loadRoomsData/roomsLoadError oben, fuer die jetzt primaere
  // Aufgaben-Ansicht: ein fehlgeschlagener Request haengt nie unbegrenzt bei "Lade Daten...",
  // sondern zeigt eine dauerhafte Fehlermeldung mit Retry.
  const loadTasksData = useCallback(async () => {
    try {
      await loadPlanningData();
      patch({ tasksLoadError: null });
    } catch (err) {
      patch({ tasksLoadError: err instanceof Error ? err.message : String(err) });
    }
  }, [loadPlanningData, patch]);

  const retryTasksLoad = useCallback(async () => {
    patch({ loading: true });
    await loadTasksData();
    patch({ loading: false });
  }, [loadTasksData, patch]);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startPolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => {
      if (!stateRef.current.user || document.hidden) return;
      // Nur die gerade sichtbare Ansicht aktualisieren (Punkt 31: keine unnoetigen Requests).
      if (stateRef.current.activeNav === 'tasks') {
        loadTasksData();
      } else if (stateRef.current.activeNav === 'rooms' && stateRef.current.activeProperty) {
        refreshAll().catch(() => {});
      }
    }, POLL_INTERVAL);
    if (!tickRef.current) {
      // Wie zuvor in app.js: der Sekunden-Tick (fuer laufende Timer) rendert nur neu, wenn eine
      // Ansicht mit sichtbarem Timer aktiv ist - auf Team/Statistik ist der Tick irrelevant.
      tickRef.current = setInterval(() => {
        if (
          stateRef.current.activeNav === 'rooms' || stateRef.current.activeNav === 'tasks' ||
          stateRef.current.detailRoomKey || stateRef.current.detailTaskId
        ) {
          patch({ now: Date.now() });
        }
      }, 1000);
    }
  }, [loadTasksData, patch, refreshAll]);

  useEffect(() => () => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (tickRef.current) clearInterval(tickRef.current);
  }, []);

  const afterLogin = useCallback(async () => {
    patch({ authScreen: 'app', activeNav: 'tasks', loading: true });
    try {
      const properties = await loadProperties();
      const allowed = allowedProperties(stateRef.current.user, properties.map((p) => p.code));
      let activeProperty = stateRef.current.activeProperty;
      if (!activeProperty || !allowed.includes(activeProperty)) activeProperty = allowed[0] || null;
      if (activeProperty) window.localStorage.setItem('hk_active_property', activeProperty);
      // Punkt 3/6: Admin UND Standortverantwortliche (managedProperties nicht leer) starten auf
      // "Alle" (Ueberblick ueber ihr Team/ihre Haeuser), eine normale Reinigungskraft ohne eigene
      // Standortverantwortung auf "Meine Aufgaben".
      const isAdminUser = stateRef.current.user?.role === 'admin';
      const isManagerUser = isAdminUser || managedPropertyCodes(stateRef.current.user, allowed).length > 0;
      patch({ properties, activeProperty, myTasksOnly: !isManagerUser, propertyScope: 'all' });
      stateRef.current = { ...stateRef.current, properties, activeProperty, myTasksOnly: !isManagerUser, propertyScope: 'all' };
      await loadTasksData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err));
    }
    patch({ loading: false });
    startPolling();
  }, [loadTasksData, patch, showToast, startPolling]);

  const tryRestoreSession = useCallback(async () => {
    patch({ authScreen: 'checking' });
    try {
      const data = await fetchMe();
      if (data.authenticated && data.user) {
        patch({ user: data.user });
        stateRef.current = { ...stateRef.current, user: data.user };
        await afterLogin();
        return;
      }
      patch({ user: null, authScreen: 'login' });
    } catch {
      patch({ user: null, authScreen: 'login' });
    }
  }, [afterLogin, patch]);

  useEffect(() => {
    // Als Microtask entkoppelt, damit der erste setState-Aufruf in tryRestoreSession() nicht
    // mehr synchron im Effekt-Body selbst passiert (React empfiehlt, Zustandsaenderungen aus
    // einem Effekt heraus asynchron/ueber Callbacks auszuloesen statt sie direkt aufzurufen).
    queueMicrotask(() => {
      tryRestoreSession();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doLogin = useCallback(async (identifier: string, password: string) => {
    patch({ loginError: '', loading: true });
    try {
      const user = await loginRequest(identifier, password);
      patch({ user });
      stateRef.current = { ...stateRef.current, user };
      await afterLogin();
    } catch (err) {
      patch({ loginError: err instanceof Error ? err.message : t('login_error') });
    }
    patch({ loading: false });
  }, [afterLogin, patch, t]);

  const doLogout = useCallback(async () => {
    await logoutRequest();
    if (pollRef.current) clearInterval(pollRef.current);
    patch({
      user: null, authScreen: 'login', units: [], detailRoomKey: null, roomsLoadError: null,
      planningUnits: [], planningReservations: [], taskAssignments: {}, tasksLoadError: null, detailTaskId: null,
    });
  }, [patch]);

  const selectProperty = useCallback(async (code: string) => {
    window.localStorage.setItem('hk_active_property', code);
    patch({ activeProperty: code, loading: true, roomsLoadError: null });
    stateRef.current = { ...stateRef.current, activeProperty: code };
    await loadRoomsData();
    patch({ loading: false });
  }, [loadRoomsData, patch]);

  const setLang = useCallback((lang: Lang) => {
    window.localStorage.setItem('hk_lang', lang);
    patch({ lang });
  }, [patch]);

  const setActiveNav = useCallback((id: NavId) => {
    patch({ activeNav: id, multiSelect: false, selectedRooms: new Set(), taskMultiSelect: false, selectedTasks: new Set() });
  }, [patch]);

  const setFilter = useCallback((filter: RoomFilter) => patch({ filter }), [patch]);
  const toggleMyRooms = useCallback(() => patch((s) => ({ myRoomsOnly: !s.myRoomsOnly })), [patch]);
  const toggleMultiSelect = useCallback(() => patch((s) => ({ multiSelect: !s.multiSelect, selectedRooms: new Set<string>() })), [patch]);

  const toggleRoomSelection = useCallback((key: string) => {
    patch((s) => {
      const next = new Set(s.selectedRooms);
      if (next.has(key)) next.delete(key); else next.add(key);
      return { selectedRooms: next };
    });
  }, [patch]);

  const openRoom = useCallback((key: string) => {
    if (stateRef.current.multiSelect) {
      toggleRoomSelection(key);
    } else {
      patch({ detailRoomKey: key });
    }
  }, [patch, toggleRoomSelection]);

  const closeModal = useCallback(() => patch({ detailRoomKey: null }), [patch]);

  // Liest bewusst `state` (nicht stateRef) - wird waehrend des Renders aufgerufen (RoomsScreen
  // etc.) und muss deshalb den Wert DIESES Renders sehen, siehe Begruendung bei `t()` oben.
  const rooms = useCallback((): Room[] => {
    if (!state.activeProperty) return [];
    return buildRooms({
      activeProperty: state.activeProperty,
      units: state.units,
      reservations: state.reservations,
      assignments: state.assignments,
      doubleups: state.doubleups,
      now: state.now,
    });
  }, [state.activeProperty, state.units, state.reservations, state.assignments, state.doubleups, state.now]);

  // Faengt Fehler jeder Aktion ab und zeigt sie als Toast - entspricht dem globalen try/catch,
  // das in app.js rund um den gesamten Event-Delegation-Handler lag (jede Aktion dort landete bei
  // einem Fehler in `showToast(err.message)`). Ohne dieses Pendant wuerden Serverfehler (z. B.
  // "Zimmer bereits vergeben", Berechtigungsfehler) hier lautlos als unhandled rejection verpuffen.
  const runAction = useCallback(async (fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err));
    }
  }, [showToast]);

  const assignRoom = useCallback(async (key: string, hk: { id: string; name: string }) => {
    await runAction(async () => {
      await assignmentsApi.set(key, hk.id, hk.name);
      await loadBackend();
    });
  }, [loadBackend, runAction]);

  const unassignRoom = useCallback(async (key: string) => {
    await runAction(async () => {
      await assignmentsApi.clear(key);
      await loadBackend();
    });
  }, [loadBackend, runAction]);

  const bulkAssign = useCallback(async (keys: string[], hk: { id: string; name: string }) => {
    await runAction(async () => {
      await assignmentsApi.bulkSet(keys, hk.id, hk.name);
      patch({ multiSelect: false, selectedRooms: new Set() });
      await loadBackend();
      showToast(t('saved'));
    });
  }, [loadBackend, patch, runAction, showToast, t]);

  const clearAllAssignments = useCallback(async () => {
    const property = stateRef.current.activeProperty;
    if (!property) return;
    await runAction(async () => {
      await assignmentsApi.clearProperty(property);
      await loadBackend();
    });
  }, [loadBackend, runAction]);

  const startTimer = useCallback(async (room: Room) => {
    const user = stateRef.current.user;
    const hkId = room.assignment ? room.assignment.housekeeperId : user?.id;
    const hkName = room.assignment ? room.assignment.housekeeperName : user?.name;
    if (!hkId || !hkName) return;
    await runAction(async () => {
      await assignmentsApi.startTimer(room.key, hkId, hkName);
      await loadBackend();
    });
  }, [loadBackend, runAction]);

  const pauseTimer = useCallback(async (room: Room) => {
    await runAction(async () => {
      await assignmentsApi.stopTimer(room.key);
      await loadBackend();
    });
  }, [loadBackend, runAction]);

  const finishClean = useCallback(async (room: Room) => {
    patch({ loading: true });
    try {
      const user = stateRef.current.user;
      const activeProperty = stateRef.current.activeProperty;
      // Keine Inspektion in diesem Betrieb - direkt auf "Clean" statt auf den Zwischenzustand
      // "CleanToBeInspected" (siehe tasks.ts#requiresInspection).
      await setUnitCondition(room.unitId, 'Clean');
      await completionsApi.add({
        property: activeProperty || '', room: room.number,
        housekeeperId: room.assignment ? room.assignment.housekeeperId : user?.id || '',
        housekeeperName: room.assignment ? room.assignment.housekeeperName : user?.name || '',
        type: 'clean', durationSeconds: room.elapsed, finishedAt: Date.now(),
      });
      await assignmentsApi.clear(room.key);
      await refreshAll();
      patch({ detailRoomKey: null });
      showToast(t('saved'));
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err));
    }
    patch({ loading: false });
  }, [patch, refreshAll, showToast, t]);

  const completeInspection = useCallback(async (room: Room) => {
    patch({ loading: true });
    try {
      await setUnitCondition(room.unitId, 'Clean');
      await refreshAll();
      patch({ detailRoomKey: null });
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err));
    }
    patch({ loading: false });
  }, [patch, refreshAll, showToast]);

  const toggleDoubleType = useCallback(async (room: Room, typeId: string) => {
    await runAction(async () => {
      const current = room.doubleup?.types ? room.doubleup.types.slice() : [];
      const idx = current.indexOf(typeId);
      if (idx >= 0) current.splice(idx, 1); else current.push(typeId);
      if (current.length === 0) await doubleupsApi.clear(room.key);
      else await doubleupsApi.set(room.key, current, room.doubleup?.note);
      await loadBackend();
    });
  }, [loadBackend, runAction]);

  const finishDoubleup = useCallback(async (room: Room) => {
    await runAction(async () => {
      const user = stateRef.current.user;
      const activeProperty = stateRef.current.activeProperty;
      await doubleupsApi.clear(room.key);
      await completionsApi.add({
        property: activeProperty || '', room: room.number, housekeeperId: user?.id || '', housekeeperName: user?.name || '',
        type: 'doubleup', durationSeconds: 0, finishedAt: Date.now(),
      });
      await loadBackend();
      showToast(t('saved'));
    });
  }, [loadBackend, runAction, showToast, t]);

  const toggleBreak = useCallback(async () => {
    const user = stateRef.current.user;
    if (!user) return;
    await runAction(async () => {
      if (stateRef.current.onBreak) await breaksApi.end(user.id);
      else await breaksApi.start(user.id, user.name);
      await loadBackend();
    });
  }, [loadBackend, runAction]);

  const saveUser = useCallback(async (userForm: Record<string, unknown>) => {
    await runAction(async () => {
      await usersApi.save(userForm);
      await loadBackend();
      showToast(t('saved'));
    });
  }, [loadBackend, runAction, showToast, t]);

  const deleteUser = useCallback(async (username: string) => {
    await runAction(async () => {
      await usersApi.remove(username);
      await loadBackend();
    });
  }, [loadBackend, runAction]);

  // --- Housekeeping Teams (Reinigungsfirmen) - Admin-only Schreibaktionen, siehe
  // api/housekeeping-teams.js. Laden erfolgt bereits gebuendelt in loadPlanningData().
  const saveTeam = useCallback(async (team: { id?: string; name: string; active?: boolean }) => {
    await runAction(async () => {
      const { teams } = await housekeepingTeamsApi.saveTeam(team);
      patch({ teams });
      showToast(t('saved'));
    });
  }, [patch, runAction, showToast, t]);

  const setTeamPropertyDefault = useCallback(async (propertyCode: string, teamId: string | null) => {
    await runAction(async () => {
      const { propertyDefaults } = await housekeepingTeamsApi.setPropertyDefault(propertyCode, teamId);
      patch({ teamPropertyDefaults: propertyDefaults });
      showToast(t('saved'));
    });
  }, [patch, runAction, showToast, t]);

  const setTaskTeam = useCallback(async (taskId: string, teamId: string | null) => {
    await runAction(async () => {
      const { taskTeamOverrides } = await housekeepingTeamsApi.setTaskTeam(taskId, teamId);
      patch({ taskTeamOverrides });
      showToast(t('saved'));
    });
  }, [patch, runAction, showToast, t]);

  // --- "Vorfall melden" (Briefing) - `openIncidentReport(taskId)` mit taskId wird aus der
  // Task-Detailansicht aufgerufen (Reinigung bereits vorausgewaehlt, Punkt 4), ohne Argument aus
  // Nav/Einstellungen (Reinigung muss im Formular selbst gewaehlt werden, Punkt 3).
  const openIncidentReport = useCallback((taskId?: string) => {
    patch({ incidentSheetOpen: true, incidentPresetTaskId: taskId || null });
  }, [patch]);

  const closeIncidentReport = useCallback(() => {
    patch({ incidentSheetOpen: false, incidentPresetTaskId: null });
  }, [patch]);

  // Eigene Fehlerbehandlung statt runAction() (das Formular muss bei einem Fehler selbst
  // reagieren koennen - z. B. den Upload-Button wieder aktivieren - statt nur einen Toast zu
  // zeigen und stumm weiterzulaufen).
  const uploadIncidentPhoto = useCallback(async (taskId: string, dataUrl: string): Promise<string | null> => {
    try {
      const { url } = await incidentPhotosApi.upload(taskId, dataUrl);
      return url;
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err));
      return null;
    }
  }, [showToast]);

  const reportIncident = useCallback(async (input: ReportIncidentInput): Promise<{ incident: HousekeepingIncident; slackDelivered: boolean } | null> => {
    try {
      return await incidentsApi.report(input);
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err));
      return null;
    }
  }, [showToast]);

  // --- Reinigungsplanung: abgeleitete Auswahl + Aktionen ---

  // Liest bewusst `state` (nicht stateRef), siehe Begruendung bei rooms()/t() oben.
  const resolvedTasksAll = useCallback((): ResolvedTask[] => {
    const propertyNames = Object.fromEntries(state.properties.map((p) => [p.code, getPropertyDisplayName(p)]));
    const today = state.planningDays[0] || todayISO();
    // Bugfix "Verschobene Reinigung verschwindet nach Tageswechsel": zusaetzliche, nicht sichtbare
    // Ruecklauftage mitgeben (siehe tasks.ts#taskGenerationDays) - ohne sie wuerde buildTasks() das
    // Apaleo-Quelldatum eines kuerzlich verschobenen Tasks nicht mehr finden, sobald es aus dem
    // sichtbaren Fenster gerutscht ist, und der Task trotz gueltigem Override auf einen sichtbaren
    // Tag gar nicht erst erzeugen.
    const raw = buildTasks({
      propertyNames, units: state.planningUnits, reservations: state.planningReservations,
      doubleups: state.doubleups, days: taskGenerationDays(state.planningDays), today, bookingChanges: state.bookingChanges,
    });
    const teamsById = Object.fromEntries(state.teams.map((tm) => [tm.id, tm]));
    const teamContext: TeamContext = { overrides: state.taskTeamOverrides, propertyDefaults: state.teamPropertyDefaults, teamsById };
    const resolved = resolveTasks(raw, state.taskAssignments, state.taskTimeOverrides, state.now, teamContext, state.taskScheduleOverrides);
    // Manuelle Aufgaben (Punkt "Admin kann Aufgaben erstellen") - eigener Merge-Pfad statt durch
    // resolveTasks()/TaskAssignmentsState, siehe tasks.ts#manualTaskToResolvedTask. IMMER alle
    // (offen UND erledigt) - die Aufgabenliste (TasksScreen) gruppiert Reinigungen/Aufgaben/Fertig
    // selbst in eigene Abschnitte, statt erledigte Aufgaben hinter einem Filter zu verstecken.
    const manual = Object.values(state.manualTasks)
      .filter((mt): mt is ManualTask => !!mt)
      .map((mt) => manualTaskToResolvedTask(mt, state.taskScheduleOverrides[mt.id] || null));
    return [...resolved, ...manual];
  }, [
    state.properties, state.planningUnits, state.planningReservations, state.doubleups, state.planningDays,
    state.taskAssignments, state.taskTimeOverrides, state.taskScheduleOverrides, state.now, state.teams,
    state.taskTeamOverrides, state.teamPropertyDefaults, state.bookingChanges, state.manualTasks,
  ]);

  /** Aufgaben eines Tages, ungefiltert von "Meine Aufgaben" - fuer Tageszusammenfassung/
   * Kapazitaetsuebersicht, die immer den vollen Stand des Tages zeigen sollen. Briefing
   * "Tag ändern" (Punkt 13): filtert nach `scheduledDate` (dem tatsaechlich geplanten Tag), NICHT
   * nach `date` (dem unveraenderten Quelldatum) - das ist die einzige Stelle, an der eine
   * Verschiebung tatsaechlich wirkt, siehe tasks.ts#ResolvedTask-Kommentar. Dadurch reagieren alle
   * Tagesansichten (Zaehler/Kartenliste/Team-Auslastung) sofort auf eine Verschiebung, ohne
   * Reload - derselbe bestehende State-/Neuberechnungs-Mechanismus wie ueberall sonst. */
  const tasksForDayAll = useCallback((date: string): ResolvedTask[] => {
    return resolvedTasksAll().filter((task) => task.scheduledDate === date);
  }, [resolvedTasksAll]);

  /** Sichtbare, priorisierte Aufgabenliste fuer die Aufgaben-Ansicht - respektiert
   * "Meine Aufgaben" (Punkt 3/14). */
  const tasksForDay = useCallback((date: string): ResolvedTask[] => {
    const all = tasksForDayAll(date);
    const scoped = state.myTasksOnly && state.user ? all.filter((task) => task.assignedUserId === state.user!.id) : all;
    return sortTasksForDay(scoped);
  }, [state.myTasksOnly, state.user, tasksForDayAll]);

  const daySummaryFor = useCallback((date: string): DaySummary => daySummary(date, tasksForDayAll(date)), [tasksForDayAll]);
  const capacityFor = useCallback((date: string): CapacityEntry[] => capacityForDay(date, tasksForDayAll(date)), [tasksForDayAll]);
  /** Team-Ebene der Team-/Kapazitaetsuebersicht (Briefing "Team-Auslastung") - Admin sieht alle
   * Teams, ein Team-Lead nur das eigene (Filterung hier statt in der UI, damit kein anderer
   * Aufrufer versehentlich fremde Team-Zahlen sieht). */
  const teamCapacityFor = useCallback((date: string): TeamCapacityEntry[] => {
    const all = teamCapacityForDay(date, tasksForDayAll(date));
    const user = state.user;
    if (!user || user.role === 'admin') return all;
    if (user.teamRole === 'lead' && user.housekeepingTeamId) return all.filter((e) => e.teamId === user.housekeepingTeamId);
    return [];
  }, [state.user, tasksForDayAll]);

  /** Aktuelle Tagesbelastung je Housekeeper fuer EIN konkretes Property (Punkt 20) - anders als
   * capacityFor() (ganzer Scope) auf genau das Property des gerade betrachteten Tasks
   * eingegrenzt, damit die "Zuweisen an"-Ansicht die richtige Auslastung fuer dieses Haus zeigt. */
  const workloadForPropertyDay = useCallback((propertyCode: string, date: string): Record<string, number> => {
    const workload: Record<string, number> = {};
    for (const task of tasksForDayAll(date)) {
      if (task.propertyCode !== propertyCode || !task.assignedUserId) continue;
      workload[task.assignedUserId] = (workload[task.assignedUserId] || 0) + 1;
    }
    return workload;
  }, [tasksForDayAll]);

  const selectDay = useCallback((date: string) => {
    patch({ selectedDay: date, taskMultiSelect: false, selectedTasks: new Set() });
  }, [patch]);

  const selectPropertyScope = useCallback(async (scope: string) => {
    patch({ propertyScope: scope, loading: true, taskMultiSelect: false, selectedTasks: new Set() });
    stateRef.current = { ...stateRef.current, propertyScope: scope };
    await loadTasksData();
    patch({ loading: false });
  }, [loadTasksData, patch]);

  const toggleMyTasksOnly = useCallback(() => patch((s) => ({ myTasksOnly: !s.myTasksOnly })), [patch]);
  const toggleTaskMultiSelect = useCallback(
    () => patch((s) => ({ taskMultiSelect: !s.taskMultiSelect, selectedTasks: new Set<string>() })),
    [patch],
  );

  const toggleTaskSelection = useCallback((id: string) => {
    patch((s) => {
      const next = new Set(s.selectedTasks);
      if (next.has(id)) next.delete(id); else next.add(id);
      return { selectedTasks: next };
    });
  }, [patch]);

  const openTask = useCallback((id: string) => {
    if (stateRef.current.taskMultiSelect) toggleTaskSelection(id);
    else patch({ detailTaskId: id });
  }, [patch, toggleTaskSelection]);

  const closeTaskModal = useCallback(() => patch({ detailTaskId: null }), [patch]);

  const claimTask = useCallback(async (id: string) => {
    await runAction(async () => {
      const { taskAssignments } = await taskAssignmentsApi.claim(id);
      patch({ taskAssignments });
    });
  }, [patch, runAction]);

  const releaseTask = useCallback(async (id: string) => {
    await runAction(async () => {
      const { taskAssignments } = await taskAssignmentsApi.release(id);
      patch({ taskAssignments });
    });
  }, [patch, runAction]);

  const assignTask = useCallback(async (id: string, hk: { id: string; name: string }) => {
    await runAction(async () => {
      const { taskAssignments } = await taskAssignmentsApi.assign(id, hk.id, hk.name);
      patch({ taskAssignments });
    });
  }, [patch, runAction]);

  const bulkAssignTasks = useCallback(async (ids: string[], hk: { id: string; name: string }) => {
    await runAction(async () => {
      const { taskAssignments } = await taskAssignmentsApi.bulkAssign(ids, hk.id, hk.name);
      patch({ taskAssignments, taskMultiSelect: false, selectedTasks: new Set() });
      showToast(t('saved'));
    });
  }, [patch, runAction, showToast, t]);

  // Punkt 22: bezieht sich auf den aktuell gewaehlten Tag + Property-Scope, nicht mehr pauschal
  // auf das ganze Property.
  const clearDayAssignments = useCallback(async () => {
    const date = stateRef.current.selectedDay;
    const property = stateRef.current.propertyScope;
    await runAction(async () => {
      const { taskAssignments } = await taskAssignmentsApi.clearScope(date, property);
      patch({ taskAssignments });
    });
  }, [patch, runAction]);

  const startTaskTimer = useCallback(async (id: string, startSource?: TaskStartSource) => {
    await runAction(async () => {
      const { taskAssignments } = await taskAssignmentsApi.startTimer(id, startSource);
      patch({ taskAssignments });
    });
  }, [patch, runAction]);

  const pauseTaskTimer = useCallback(async (id: string) => {
    await runAction(async () => {
      const { taskAssignments } = await taskAssignmentsApi.stopTimer(id);
      patch({ taskAssignments });
    });
  }, [patch, runAction]);

  /**
   * Reinigung abschliessen - erweitert um Waescheverbrauch (Briefing "Waescheverbrauch erfassen"):
   * `linenItems` ist optional und leer, wenn fuer dieses Property keine Waescheartikel konfiguriert
   * sind (siehe linenItemsForProperty/openLinenCompletion unten) - in dem Fall verhaelt sich diese
   * Funktion exakt wie zuvor. Der eigentliche Abschluss bleibt EIN einziger Aufruf
   * (taskAssignmentsApi.complete) - kein zweiter, paralleler Abschlussmechanismus.
   */
  const finishTask = useCallback(async (
    task: ResolvedTask,
    linenItems?: { itemId: string; estimatedQuantity: number | null; actualQuantity: number }[],
  ) => {
    patch({ loading: true });
    try {
      const user = stateRef.current.user;
      // Punkt 23: unser Task-Status (unten) und der Apaleo Unit Condition Aufruf sind bewusst
      // getrennt. Keine Inspektion in diesem Betrieb (siehe requiresInspection()) - eine
      // abgeschlossene Reinigung setzt die Unit direkt auf "Clean" statt auf den
      // Zwischenzustand "CleanToBeInspected".
      await setUnitCondition(task.unitId, 'Clean');
      await completionsApi.add({
        property: task.propertyCode, room: task.unitName,
        housekeeperId: task.assignedUserId || user?.id || '',
        housekeeperName: task.assignedUserName || user?.name || '',
        type: 'clean', durationSeconds: task.elapsedSeconds, finishedAt: Date.now(),
      });
      const { taskAssignments } = await taskAssignmentsApi.complete(
        task.id, requiresInspection(task.propertyCode), linenItems, requiredPreparationItemIds(task),
      );
      patch({ taskAssignments, detailTaskId: null, linenCompletionTaskId: null });
      showToast(t('saved'));
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err));
    }
    patch({ loading: false });
  }, [patch, showToast, t]);

  /** Aktive Waescheartikel fuer GENAU dieses Property, sortiert (siehe LinenItem#sortOrder). */
  const linenItemsForProperty = useCallback((propertyCode: string): LinenItem[] => {
    return state.linenItems.filter((item) => item.active && item.propertyIds.includes(propertyCode)).sort((a, b) => a.sortOrder - b.sortOrder);
  }, [state.linenItems]);

  /** Punkt "Reinigung beenden": ist fuer dieses Property KEIN Waescheartikel konfiguriert, bleibt
   * das Verhalten unveraendert (sofortiger Abschluss, migration-light) - sonst oeffnet sich das
   * verpflichtende Formular (LinenCompletionSheet.tsx), das seinerseits finishTask() MIT den
   * erfassten Mengen aufruft. Wird das Formular abgebrochen, bleibt der Timer unangetastet, da
   * finishTask() in diesem Fall schlicht nie aufgerufen wird. */
  const openLinenCompletion = useCallback((task: ResolvedTask) => {
    if (linenItemsForProperty(task.propertyCode).length === 0) {
      finishTask(task);
      return;
    }
    patch({ linenCompletionTaskId: task.id });
  }, [finishTask, linenItemsForProperty, patch]);

  const closeLinenCompletion = useCallback(() => patch({ linenCompletionTaskId: null }), [patch]);

  const saveLinenItem = useCallback(async (item: Partial<LinenItem> & { name: string; unit: string }) => {
    await runAction(async () => {
      const { items } = await linenItemsApi.saveItem(item);
      patch({ linenItems: items });
      showToast(t('saved'));
    });
  }, [patch, runAction, showToast, t]);

  const reorderLinenItems = useCallback(async (orderedIds: string[]) => {
    await runAction(async () => {
      const { items } = await linenItemsApi.reorder(orderedIds);
      patch({ linenItems: items });
    });
  }, [patch, runAction]);

  // --- Verbrauchsmaterial (Briefing "Verbrauch melden") - bewusst getrennt von Waesche/
  // Bettsachen: eigene Liste, eigenes Sheet, kein Task-/Apartmentbezug.
  const consumableItemsForProperty = useCallback((propertyCode: string): ConsumableItem[] => {
    return state.consumableItems.filter((item) => item.active && item.propertyIds.includes(propertyCode)).sort((a, b) => a.sortOrder - b.sortOrder);
  }, [state.consumableItems]);

  const openConsumableReport = useCallback(() => patch({ consumableReportOpen: true, reportMenuOpen: false }), [patch]);
  const closeConsumableReport = useCallback(() => patch({ consumableReportOpen: false }), [patch]);

  const submitConsumableReport = useCallback(async (propertyCode: string, items: { itemId: string; quantity: number }[]) => {
    try {
      const { report } = await consumablesApi.report(propertyCode, items);
      return report;
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err));
      return null;
    }
  }, [showToast]);

  const saveConsumableItem = useCallback(async (item: Partial<ConsumableItem> & { name: string; unit: string }) => {
    await runAction(async () => {
      const { items } = await consumablesApi.saveItem(item);
      patch({ consumableItems: items });
      showToast(t('saved'));
    });
  }, [patch, runAction, showToast, t]);

  const reorderConsumableItems = useCallback(async (orderedIds: string[]) => {
    await runAction(async () => {
      const { items } = await consumablesApi.reorder(orderedIds);
      patch({ consumableItems: items });
    });
  }, [patch, runAction]);

  // --- "Melden"-Sammelpunkt (Punkt 14) - siehe StaffNavBar.tsx/ReportMenuSheet.tsx.
  const openReportMenu = useCallback(() => patch({ reportMenuOpen: true }), [patch]);
  const closeReportMenu = useCallback(() => patch({ reportMenuOpen: false }), [patch]);

  const completeTaskInspection = useCallback(async (task: ResolvedTask) => {
    patch({ loading: true });
    try {
      await setUnitCondition(task.unitId, 'Clean');
      const { taskAssignments } = await taskAssignmentsApi.completeInspection(task.id);
      patch({ taskAssignments, detailTaskId: null });
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err));
    }
    patch({ loading: false });
  }, [patch, showToast]);

  // Briefing "Wieder aktivieren": admin-only (serverseitig erzwungen, siehe
  // api/task-assignments.js#reopen). Bewusst NICHT ueber patch({ detailTaskId: null }) das Sheet
  // schliessen (anders als z. B. finishTask) - Punkt "Wieder geöffnet"-Hinweis soll direkt in
  // derselben Detailansicht sichtbar werden. Der Wechsel aus dem "Fertig"-Bereich zurueck in die
  // aktive Sektion inkl. Tageszaehler passiert automatisch ueber die bestehende, state-getriebene
  // Neuberechnung (resolvedTasksAll/tasksForDayAll), da hier nur `taskAssignments` gepatcht wird -
  // kein zusaetzlicher Reload/Sonderpfad noetig.
  const reopenTask = useCallback(async (taskId: string) => {
    await runAction(async () => {
      const { taskAssignments } = await taskAssignmentsApi.reopen(taskId);
      patch({ taskAssignments });
      showToast(t('reopen_done_toast'));
    });
  }, [patch, runAction, showToast, t]);

  const toggleTaskDoubleType = useCallback(async (task: ResolvedTask, typeId: string) => {
    await runAction(async () => {
      const key = roomKey(task.propertyCode, task.unitName);
      const current = task.doubleupTypes.slice();
      const idx = current.indexOf(typeId);
      if (idx >= 0) current.splice(idx, 1); else current.push(typeId);
      if (current.length === 0) await doubleupsApi.clear(key);
      else await doubleupsApi.set(key, current);
      await loadBackend();
    });
  }, [loadBackend, runAction]);

  /** Briefing "Vorbereitung als Checkliste": schaltet EINEN Punkt der Checkliste um (erledigt/
   * offen) - taskbezogen persistiert (siehe api/task-assignments.js#togglePreparation), bewusst
   * GETRENNT von toggleTaskDoubleType oben (das aendert das apartment-/roomweite "muss vorbereitet
   * werden"-Flag, dieses hier den taskbezogenen "ist bereits erledigt"-Status). */
  const togglePreparationItem = useCallback(async (taskId: string, itemId: string) => {
    await runAction(async () => {
      const { taskAssignments } = await taskAssignmentsApi.togglePreparation(taskId, itemId);
      patch({ taskAssignments });
    });
  }, [patch, runAction]);

  const finishTaskDoubleup = useCallback(async (task: ResolvedTask) => {
    await runAction(async () => {
      const user = stateRef.current.user;
      const key = roomKey(task.propertyCode, task.unitName);
      await doubleupsApi.clear(key);
      await completionsApi.add({
        property: task.propertyCode, room: task.unitName, housekeeperId: user?.id || '', housekeeperName: user?.name || '',
        type: 'doubleup', durationSeconds: 0, finishedAt: Date.now(),
      });
      await loadBackend();
      showToast(t('saved'));
    });
  }, [loadBackend, runAction, showToast, t]);

  // --- Manuell erstellte Aufgaben (Punkt "Admin kann Aufgaben erstellen") - admin-only Anlegen,
  // Erledigen durch zugewiesene Person oder Standortverantwortliche (serverseitig durchgesetzt,
  // siehe api/manual-tasks.js). Kein Timer/Pause/Team - siehe tasks.ts#manualTaskToResolvedTask.
  const openManualTaskForm = useCallback(() => patch({ manualTaskFormOpen: true }), [patch]);
  const closeManualTaskForm = useCallback(() => patch({ manualTaskFormOpen: false }), [patch]);

  const createManualTask = useCallback(async (input: ManualTaskCreateInput) => {
    await runAction(async () => {
      // Briefing "automatische Uebersetzung frei eingegebener operativer Texte" Punkt 3: state.lang
      // (die tatsaechlich angezeigte App-Sprache) ist die zuverlaessige Quellsprache fuer die
      // automatische Uebersetzung von `description` - der Aufrufer muss das nicht selbst wissen.
      const { manualTasks } = await manualTasksApi.create({ ...input, sourceLanguage: input.sourceLanguage || state.lang });
      patch({ manualTasks, manualTaskFormOpen: false });
      showToast(t('saved'));
    });
  }, [patch, runAction, showToast, t, state.lang]);

  // Schliesst die Detailansicht bewusst NICHT (anders als finishTask()) - Punkt 3: nach dem
  // Erledigen soll "✓ Aufgabe erledigt" inkl. Mitarbeiter/Zeitpunkt direkt in derselben Ansicht
  // sichtbar bleiben, statt das Sheet sofort zu schliessen.
  const completeManualTask = useCallback(async (taskId: string) => {
    await runAction(async () => {
      const { manualTasks } = await manualTasksApi.complete(taskId);
      patch({ manualTasks });
      showToast(t('saved'));
    });
  }, [patch, runAction, showToast, t]);

  // Briefing "Wieder aktivieren" (manuelle Aufgabe) - siehe reopenTask() oben fuer den analogen
  // Fall bei Reinigungen; hier genauso admin-only serverseitig erzwungen (api/manual-tasks.js).
  const reopenManualTask = useCallback(async (taskId: string) => {
    await runAction(async () => {
      const { manualTasks } = await manualTasksApi.reopen(taskId);
      patch({ manualTasks });
      showToast(t('reopen_done_toast'));
    });
  }, [patch, runAction, showToast, t]);

  /** Wiederhergestellt (UX-Feinschliff-Korrektur): ermittelt GENAU die eine laufende/pausierte
   * Reinigung des eingeloggten Nutzers - Grundlage fuer den kontextabhaengigen Pause/Fortsetzen-
   * Hinweis rechts oben im Header (StaffHeader.tsx#CleaningPauseButton). Niemals eine manuelle
   * Aufgabe (die hat keinen Reinigungs-Timer, siehe tasks.ts#manualTaskToResolvedTask). */
  const activeCleaningTask = useCallback((): ResolvedTask | null => {
    const user = state.user;
    if (!user) return null;
    const candidates = resolvedTasksAll().filter((t) =>
      t.type !== 'manual' && t.assignedUserId === user.id && (t.status === 'in_progress' || t.status === 'paused'));
    if (candidates.length === 0) return null;
    const running = candidates.filter((t) => t.status === 'in_progress');
    const pool = running.length > 0 ? running : candidates;
    const lastActivityAt = (t: ResolvedTask) => (t.history.length > 0 ? t.history[t.history.length - 1].at : (t.cleaningStartedAt || 0));
    return pool.slice().sort((a, b) => lastActivityAt(b) - lastActivityAt(a))[0];
  }, [state.user, resolvedTasksAll]);

  // --- "Wichtiger Hinweis" (Punkt 3-8): eigene, vom Apaleo-Reservierungskommentar getrennte
  // Datenquelle. noticeAckKey() spiegelt exakt api/_task-notices.js#ackKey ("<taskId>|<userId>").
  function noticeAckKey(taskId: string, userId: string): string {
    return `${taskId}|${userId}`;
  }

  const noticeForTask = useCallback(
    (taskId: string): TaskNotice | null => state.taskNotices[taskId] || null,
    [state.taskNotices],
  );

  /** Punkt 5/6: true, wenn kein Hinweis existiert ODER GENAU dieser User GENAU die aktuelle
   * Version bestaetigt hat - eine Bestaetigung einer frueheren Version (vor einer Bearbeitung)
   * oder einer anderen Person zaehlt nicht. */
  const isNoticeAcknowledgedBy = useCallback((taskId: string, userId: string | null | undefined): boolean => {
    const notice = state.taskNotices[taskId];
    if (!notice) return true;
    if (!userId) return false;
    const ack = state.taskNoticeAcks[noticeAckKey(taskId, userId)];
    return !!ack && ack.noticeVersion === notice.version;
  }, [state.taskNotices, state.taskNoticeAcks]);

  const saveTaskNotice = useCallback(async (taskId: string, text: string) => {
    await runAction(async () => {
      // Punkt 3: state.lang (aktuell angezeigte App-Sprache) ist die Quellsprache der
      // automatischen Uebersetzung - siehe api/task-notices.js#set.
      const { notice } = await taskNoticesApi.set(taskId, text, state.lang);
      patch((s) => ({ taskNotices: { ...s.taskNotices, [taskId]: notice } }));
      showToast(t('saved'));
    });
  }, [patch, runAction, showToast, t, state.lang]);

  /** Punkt 12: admin-seitiger Retry einer fehlgeschlagenen Uebersetzung ("Übersetzung erneut
   * versuchen") - aendert weder Text noch Version noch Acks. */
  const retryTaskNoticeTranslation = useCallback(async (taskId: string) => {
    await runAction(async () => {
      const { notice } = await taskNoticesApi.retryTranslation(taskId);
      patch((s) => ({ taskNotices: { ...s.taskNotices, [taskId]: notice } }));
    });
  }, [patch, runAction]);

  const removeTaskNotice = useCallback(async (taskId: string) => {
    await runAction(async () => {
      await taskNoticesApi.remove(taskId);
      patch((s) => ({ taskNotices: { ...s.taskNotices, [taskId]: null } }));
    });
  }, [patch, runAction]);

  const acknowledgeTaskNotice = useCallback(async (taskId: string) => {
    await runAction(async () => {
      const { ack } = await taskNoticesApi.acknowledge(taskId);
      patch((s) => ({ taskNoticeAcks: { ...s.taskNoticeAcks, [noticeAckKey(taskId, ack.userId)]: ack } }));
    });
  }, [patch, runAction]);

  // --- Briefing "Reinigungskarten ueberarbeiten" Punkt 5/7/8: "gesehen" (Detailansicht
  // tatsaechlich geoeffnet) und "Buchungsaenderung zur Kenntnis genommen" - zwei bewusst
  // getrennte, userbezogene Zustaende (siehe types.ts#TaskSeenRecord/BookingChangeAck). Beide
  // Server-Antworten sind bereits auf den eingeloggten User gefiltert (Key = Task-ID), daher hier
  // ohne noticeAckKey()-Praefix.
  const isTaskSeenByMe = useCallback((taskId: string): boolean => !!state.taskSeen[taskId], [state.taskSeen]);

  const markTaskSeen = useCallback(async (taskId: string) => {
    if (state.taskSeen[taskId]) return;
    try {
      const { seen } = await taskViewsApi.markSeen(taskId);
      patch((s) => ({ taskSeen: { ...s.taskSeen, [taskId]: seen } }));
    } catch {
      // Punkt 5 ist eine rein informative Zusatzfunktion - ein fehlgeschlagener Schreibversuch
      // (z. B. kurzzeitig offline) darf die Detailansicht selbst nicht stoeren; der gruene Punkt
      // bleibt dann beim naechsten Laden schlicht weiterhin sichtbar.
    }
  }, [state.taskSeen, patch]);

  /** Punkt 7/8: true, wenn keine Buchungsaenderung vorliegt ODER GENAU dieser User GENAU die
   * aktuell gueltige Aenderung (task.bookingChange.changedAt) bestaetigt hat - eine Bestaetigung
   * einer AELTEREN Aenderung (vor einer erneuten, spaeteren Aenderung) zaehlt nicht, analog zu
   * isNoticeAcknowledgedBy()/noticeVersion oben. */
  const isBookingChangeAckedByMe = useCallback((task: ResolvedTask): boolean => {
    if (!task.bookingChange) return true;
    const ack = state.bookingChangeAcks[task.id];
    return !!ack && ack.changedAt === task.bookingChange.changedAt;
  }, [state.bookingChangeAcks]);

  const acknowledgeBookingChange = useCallback(async (taskId: string) => {
    await runAction(async () => {
      const { ack } = await taskViewsApi.acknowledgeChange(taskId);
      patch((s) => ({ bookingChangeAcks: { ...s.bookingChangeAcks, [taskId]: ack } }));
    });
  }, [patch, runAction]);

  // --- Manueller Zeiten-Override (Prioritaet 1 vor gebuchtem Extra/Standard) - nur Admin darf
  // schreiben (serverseitig erzwungen, siehe api/task-time-overrides.js), Standortverantwortliche
  // und Housekeeper sehen den Stand nur (kein UI-Einstiegspunkt fuer sie, siehe TaskDetailSheet).
  const saveTaskTimeOverride = useCallback(async (taskId: string, times: { departureTime?: string; arrivalTime?: string }) => {
    await runAction(async () => {
      const { override } = await taskTimeOverridesApi.set(taskId, times);
      patch((s) => ({ taskTimeOverrides: { ...s.taskTimeOverrides, [taskId]: override } }));
      showToast(t('saved'));
    });
  }, [patch, runAction, showToast, t]);

  const removeTaskTimeOverride = useCallback(async (taskId: string) => {
    await runAction(async () => {
      await taskTimeOverridesApi.remove(taskId);
      patch((s) => ({ taskTimeOverrides: { ...s.taskTimeOverrides, [taskId]: null } }));
    });
  }, [patch, runAction]);

  // --- "Tag ändern" (Briefing): manueller Planungs-Override des geplanten Housekeeping-Tags -
  // nur Admin darf schreiben (serverseitig erzwungen, siehe api/task-schedule-overrides.js).
  // `nextArrivalDate` wird 1:1 aus tasks.ts#nextArrivalDateForTask durchgereicht, damit der Server
  // die "nicht nach der naechsten Anreise"-Regel pruefen kann, ohne selbst Apaleo aufzurufen.
  const rescheduleTask = useCallback(async (
    taskId: string, scheduledDate: string, nextArrivalDate?: string | null, hadAssignee?: boolean,
  ) => {
    await runAction(async () => {
      const { override, taskAssignment, manualTask } = await taskScheduleOverridesApi.set(taskId, scheduledDate, nextArrivalDate);
      // Briefing "Bei Verschiebung Zuweisung immer aufheben": der Server hebt eine bestehende
      // Zuweisung bei einer tatsaechlichen Tagesaenderung IMMER auf und liefert den aktualisierten
      // Datensatz gleich mit zurueck - hier direkt in den ohnehin schon vorhandenen State gepatcht
      // (derselbe Mechanismus, den Timer-/Reopen-Aktionen bereits nutzen), Team-Auslastung/
      // Tageszaehler aktualisieren sich dadurch automatisch (reine Ableitung aus diesem State,
      // siehe lib/housekeeping/tasks.ts#resolveTasks/capacityForDay).
      patch((s) => ({
        taskScheduleOverrides: { ...s.taskScheduleOverrides, [taskId]: override },
        taskAssignments: taskAssignment ? { ...s.taskAssignments, [taskId]: taskAssignment } : s.taskAssignments,
        manualTasks: manualTask ? { ...s.manualTasks, [taskId]: manualTask } : s.manualTasks,
      }));
      // Punkt 11: dezenter Hinweis mit derselben Tagesbeschriftung ("Heute"/"Morgen"/"Mo 21.") wie
      // die Tagesnavigation. Der Zusatz "Zuweisung aufgehoben" erscheint nur, wenn tatsaechlich
      // jemand zugewiesen war (sonst waere er irrefuehrend) - eine bestehende Zuweisung gilt fuer
      // die urspruengliche Tagesplanung und wird bei einer Verschiebung serverseitig IMMER entfernt.
      const label = dayHeadingLabel(t, stateRef.current.lang, scheduledDate, stateRef.current.planningDays);
      showToast(t(hadAssignee ? 'schedule_change_saved_unassigned' : 'schedule_change_saved', { date: label }));
    });
  }, [patch, runAction, showToast, t]);

  const resetTaskSchedule = useCallback(async (taskId: string) => {
    await runAction(async () => {
      const { taskAssignment, manualTask } = await taskScheduleOverridesApi.remove(taskId);
      patch((s) => ({
        taskScheduleOverrides: { ...s.taskScheduleOverrides, [taskId]: null },
        taskAssignments: taskAssignment ? { ...s.taskAssignments, [taskId]: taskAssignment } : s.taskAssignments,
        manualTasks: manualTask ? { ...s.manualTasks, [taskId]: manualTask } : s.manualTasks,
      }));
    });
  }, [patch, runAction]);

  // --- NFC-Tag-Verwaltung (Admin-only) - anders als die uebrigen Aktionen NICHT ueber
  // runAction() (das schluckt Rueckgabewerte), da die aufrufende Komponente die frisch erzeugte/
  // abgefragte URL direkt zum Anzeigen/Kopieren braucht.
  const loadNfcTags = useCallback(async () => {
    patch({ nfcTagsLoading: true });
    try {
      const nfcTags = await loadNfcTagStatuses();
      patch({ nfcTags, nfcTagsLoading: false });
    } catch (err) {
      patch({ nfcTagsLoading: false });
      showToast(err instanceof Error ? err.message : String(err));
    }
  }, [patch, showToast]);

  const createNfcTag = useCallback(async (propertyCode: string, unitId: string, unitName: string): Promise<string | null> => {
    try {
      const { url, status } = await nfcApi.create(propertyCode, unitId, unitName);
      patch((s) => ({ nfcTags: { ...s.nfcTags, [nfcUnitKey(propertyCode, unitId)]: status } }));
      return url;
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err));
      return null;
    }
  }, [patch, showToast]);

  const revealNfcTag = useCallback(async (propertyCode: string, unitId: string): Promise<string | null> => {
    try {
      const { url } = await nfcApi.reveal(propertyCode, unitId);
      return url;
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err));
      return null;
    }
  }, [showToast]);

  const deactivateNfcTag = useCallback(async (propertyCode: string, unitId: string): Promise<boolean> => {
    try {
      await nfcApi.deactivate(propertyCode, unitId);
      patch((s) => ({ nfcTags: { ...s.nfcTags, [nfcUnitKey(propertyCode, unitId)]: undefined } }));
      return true;
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err));
      return false;
    }
  }, [patch, showToast]);

  const replaceNfcTag = useCallback(async (propertyCode: string, unitId: string, unitName: string): Promise<string | null> => {
    try {
      const { url, status } = await nfcApi.replace(propertyCode, unitId, unitName);
      patch((s) => ({ nfcTags: { ...s.nfcTags, [nfcUnitKey(propertyCode, unitId)]: status } }));
      return url;
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err));
      return null;
    }
  }, [patch, showToast]);

  // --- Einstellungen > Meldungen & Betrieb / Integrationen (admin-only, siehe SettingsScreen.tsx)
  // - dieselbe Lazy-Load-Idee wie bei den NFC-Tags oben: selten benoetigt, deshalb erst beim
  // tatsaechlichen Oeffnen der jeweiligen Ansicht geladen, nicht beim Login.
  const loadIncidentsList = useCallback(async () => {
    patch({ incidentsLoading: true });
    try {
      const incidents = await incidentsApi.list();
      patch({ incidents, incidentsLoading: false });
    } catch (err) {
      patch({ incidentsLoading: false });
      showToast(err instanceof Error ? err.message : String(err));
    }
  }, [patch, showToast]);

  const loadConsumableReportsList = useCallback(async () => {
    patch({ consumableReportsLoading: true });
    try {
      const consumableReports = await consumablesApi.listReports();
      patch({ consumableReports, consumableReportsLoading: false });
    } catch (err) {
      patch({ consumableReportsLoading: false });
      showToast(err instanceof Error ? err.message : String(err));
    }
  }, [patch, showToast]);

  const loadIntegrationsStatusInfo = useCallback(async () => {
    patch({ integrationsStatusLoading: true });
    try {
      const integrationsStatus = await loadIntegrationsStatus();
      patch({ integrationsStatus, integrationsStatusLoading: false });
    } catch (err) {
      patch({ integrationsStatusLoading: false });
      showToast(err instanceof Error ? err.message : String(err));
    }
  }, [patch, showToast]);

  return {
    state, t, roomKey, shortStaffName,
    rooms, DOUBLEUP_TYPES,
    setLang, doLogin, doLogout, selectProperty, retryLoad, setActiveNav, setFilter, toggleMyRooms,
    toggleMultiSelect, toggleRoomSelection, openRoom, closeModal, showToast,
    assignRoom, unassignRoom, bulkAssign, clearAllAssignments, startTimer, pauseTimer,
    finishClean, completeInspection, toggleDoubleType, finishDoubleup, toggleBreak,
    saveUser, deleteUser,
    saveTeam, setTeamPropertyDefault, setTaskTeam,
    openIncidentReport, closeIncidentReport, uploadIncidentPhoto, reportIncident,
    linenItemsForProperty, openLinenCompletion, closeLinenCompletion, saveLinenItem, reorderLinenItems,
    consumableItemsForProperty, openConsumableReport, closeConsumableReport, submitConsumableReport,
    saveConsumableItem, reorderConsumableItems, openReportMenu, closeReportMenu,

    // Reinigungsplanung
    tasksForDay, tasksForDayAll, daySummaryFor, capacityFor, teamCapacityFor, workloadForPropertyDay, retryTasksLoad,
    selectDay, selectPropertyScope, toggleMyTasksOnly,
    toggleTaskMultiSelect, toggleTaskSelection, openTask, closeTaskModal,
    claimTask, releaseTask, assignTask, bulkAssignTasks, clearDayAssignments,
    startTaskTimer, pauseTaskTimer, finishTask, completeTaskInspection, reopenTask,
    toggleTaskDoubleType, togglePreparationItem, finishTaskDoubleup,

    // Manuell erstellte Aufgaben
    openManualTaskForm, closeManualTaskForm, createManualTask, completeManualTask, reopenManualTask,

    // Kontextabhaengiger Pause/Fortsetzen-Hinweis im Header (StaffHeader.tsx)
    activeCleaningTask,

    // Wichtiger Hinweis
    noticeForTask, isNoticeAcknowledgedBy, saveTaskNotice, removeTaskNotice, acknowledgeTaskNotice, retryTaskNoticeTranslation,

    // Briefing "Reinigungskarten ueberarbeiten": "gesehen" + "Buchungsaenderung zur Kenntnis
    // genommen" - zwei getrennte userbezogene Zustaende.
    isTaskSeenByMe, markTaskSeen, isBookingChangeAckedByMe, acknowledgeBookingChange,

    // Manueller Zeiten-Override
    saveTaskTimeOverride, removeTaskTimeOverride,

    // "Tag ändern" (manueller Planungs-Override des geplanten Housekeeping-Tags)
    rescheduleTask, resetTaskSchedule,

    // NFC-Tag-Verwaltung
    loadNfcTags, createNfcTag, revealNfcTag, deactivateNfcTag, replaceNfcTag,

    // Einstellungen > Meldungen & Betrieb / Integrationen
    loadIncidentsList, loadConsumableReportsList, loadIntegrationsStatusInfo,
  };
}

export type HousekeepingApp = ReturnType<typeof useHousekeepingApp>;
export type { ResolvedTask };
