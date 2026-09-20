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
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Lang } from './i18n';
import { translate } from './i18n';
import { fetchMe, login as loginRequest, logout as logoutRequest } from './auth';
import {
  DOUBLEUP_TYPES, POLL_INTERVAL, assignmentsApi, breaksApi, completionsApi, doubleupsApi, getPropertyDisplayName,
  loadBackendState, loadProperties, loadReservations, loadReservationsRangeForProperties,
  loadTaskAssignments, loadTaskNotices, loadTaskTimeOverrides, loadUnits, loadUnitsForProperties, setUnitCondition,
  taskAssignmentsApi, taskNoticesApi, taskTimeOverridesApi, usersApi,
} from './api';
import { allowedProperties, buildRooms, roomKey, todayISO, addDaysISO } from './rooms';
import {
  buildTasks, capacityForDay, daySummary, requiresInspection, resolveTasks, sortTasksForDay,
  type ResolvedTask,
} from './tasks';
import type {
  ApaleoReservation, ApaleoUnit, AssignmentsState, BreakEntry, CapacityEntry, Completion, DaySummary, DoubleupsState,
  Property, ReservationsState, Room, RoomFilter, StaffUser, TaskAssignmentsState, TaskNotice, TaskNoticeAcksState,
  TaskNoticesState, TaskTimeOverridesState,
} from './types';

export type AuthScreen = 'checking' | 'login' | 'app';
export type NavId = 'tasks' | 'rooms' | 'stats' | 'team';

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
  /** "Wichtiger Hinweis" pro Task + userbezogene Lesebestaetigungen (Key "<taskId>|<userId>") -
   * eigene, vom Apaleo-Reservierungskommentar getrennte Datenquelle (Punkt 3-8). */
  taskNotices: TaskNoticesState;
  taskNoticeAcks: TaskNoticeAcksState;
  /** Manueller Admin-Override der Abreise-/Anreisezeit (Prioritaet 1), Key = Task-ID - eigene,
   * vom Apaleo-Reservierungskommentar/gebuchten Service getrennte Datenquelle. */
  taskTimeOverrides: TaskTimeOverridesState;
  tasksLoadError: string | null;
  taskMultiSelect: boolean;
  selectedTasks: Set<string>;
  detailTaskId: string | null;
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
    taskNotices: {},
    taskNoticeAcks: {},
    taskTimeOverrides: {},
    tasksLoadError: null,
    taskMultiSelect: false,
    selectedTasks: new Set(),
    detailTaskId: null,
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
    if (scopeCodes.length === 0) {
      patch({
        planningUnits: [], planningReservations: [], taskAssignments: {}, taskNotices: {}, taskNoticeAcks: {},
        taskTimeOverrides: {}, planningDays: days,
      });
      return;
    }
    const [units, reservations, taskAssignments, noticesData, taskTimeOverrides] = await Promise.all([
      loadUnitsForProperties(scopeCodes),
      loadReservationsRangeForProperties(scopeCodes, days[0], days[3]),
      loadTaskAssignments(),
      loadTaskNotices(),
      loadTaskTimeOverrides(),
      loadBackend(),
    ]);
    patch({
      planningUnits: units, planningReservations: reservations, taskAssignments,
      taskNotices: noticesData.notices, taskNoticeAcks: noticesData.acks, taskTimeOverrides, planningDays: days,
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
      // Punkt 3: Admin startet auf "Alle Standorte", Housekeeper (inkl. Standortverantwortliche,
      // die bleiben gleichzeitig normale Reinigungskraft) auf "Meine Aufgaben".
      const isAdminUser = stateRef.current.user?.role === 'admin';
      patch({ properties, activeProperty, myTasksOnly: !isAdminUser, propertyScope: 'all' });
      stateRef.current = { ...stateRef.current, properties, activeProperty, myTasksOnly: !isAdminUser, propertyScope: 'all' };
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
      await setUnitCondition(room.unitId, 'CleanToBeInspected');
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

  // --- Reinigungsplanung: abgeleitete Auswahl + Aktionen ---

  // Liest bewusst `state` (nicht stateRef), siehe Begruendung bei rooms()/t() oben.
  const resolvedTasksAll = useCallback((): ResolvedTask[] => {
    const propertyNames = Object.fromEntries(state.properties.map((p) => [p.code, getPropertyDisplayName(p)]));
    const today = state.planningDays[0] || todayISO();
    const raw = buildTasks({
      propertyNames, units: state.planningUnits, reservations: state.planningReservations,
      doubleups: state.doubleups, days: state.planningDays, today,
    });
    return resolveTasks(raw, state.taskAssignments, state.taskTimeOverrides, state.now);
  }, [
    state.properties, state.planningUnits, state.planningReservations, state.doubleups, state.planningDays,
    state.taskAssignments, state.taskTimeOverrides, state.now,
  ]);

  /** Aufgaben eines Tages, ungefiltert von "Meine Aufgaben" - fuer Tageszusammenfassung/
   * Kapazitaetsuebersicht, die immer den vollen Stand des Tages zeigen sollen. */
  const tasksForDayAll = useCallback((date: string): ResolvedTask[] => {
    return resolvedTasksAll().filter((task) => task.date === date);
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

  const startTaskTimer = useCallback(async (id: string) => {
    await runAction(async () => {
      const { taskAssignments } = await taskAssignmentsApi.startTimer(id);
      patch({ taskAssignments });
    });
  }, [patch, runAction]);

  const pauseTaskTimer = useCallback(async (id: string) => {
    await runAction(async () => {
      const { taskAssignments } = await taskAssignmentsApi.stopTimer(id);
      patch({ taskAssignments });
    });
  }, [patch, runAction]);

  const finishTask = useCallback(async (task: ResolvedTask) => {
    patch({ loading: true });
    try {
      const user = stateRef.current.user;
      // Punkt 23: unser Task-Status (unten) und der Apaleo Unit Condition Aufruf sind bewusst
      // getrennt - dieselbe, unveraenderte Apaleo-Aktion wie zuvor bei finishClean().
      await setUnitCondition(task.unitId, 'CleanToBeInspected');
      await completionsApi.add({
        property: task.propertyCode, room: task.unitName,
        housekeeperId: task.assignedUserId || user?.id || '',
        housekeeperName: task.assignedUserName || user?.name || '',
        type: 'clean', durationSeconds: task.elapsedSeconds, finishedAt: Date.now(),
      });
      const { taskAssignments } = await taskAssignmentsApi.complete(task.id, requiresInspection(task.propertyCode));
      patch({ taskAssignments, detailTaskId: null });
      showToast(t('saved'));
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err));
    }
    patch({ loading: false });
  }, [patch, showToast, t]);

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
      const { notice } = await taskNoticesApi.set(taskId, text);
      patch((s) => ({ taskNotices: { ...s.taskNotices, [taskId]: notice } }));
      showToast(t('saved'));
    });
  }, [patch, runAction, showToast, t]);

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

  return {
    state, t, roomKey,
    rooms, DOUBLEUP_TYPES,
    setLang, doLogin, doLogout, selectProperty, retryLoad, setActiveNav, setFilter, toggleMyRooms,
    toggleMultiSelect, toggleRoomSelection, openRoom, closeModal, showToast,
    assignRoom, unassignRoom, bulkAssign, clearAllAssignments, startTimer, pauseTimer,
    finishClean, completeInspection, toggleDoubleType, finishDoubleup, toggleBreak,
    saveUser, deleteUser,

    // Reinigungsplanung
    tasksForDay, daySummaryFor, capacityFor, workloadForPropertyDay, retryTasksLoad,
    selectDay, selectPropertyScope, toggleMyTasksOnly,
    toggleTaskMultiSelect, toggleTaskSelection, openTask, closeTaskModal,
    claimTask, releaseTask, assignTask, bulkAssignTasks, clearDayAssignments,
    startTaskTimer, pauseTaskTimer, finishTask, completeTaskInspection,
    toggleTaskDoubleType, finishTaskDoubleup,

    // Wichtiger Hinweis
    noticeForTask, isNoticeAcknowledgedBy, saveTaskNotice, removeTaskNotice, acknowledgeTaskNotice,

    // Manueller Zeiten-Override
    saveTaskTimeOverride, removeTaskTimeOverride,
  };
}

export type HousekeepingApp = ReturnType<typeof useHousekeepingApp>;
export type { ResolvedTask };
