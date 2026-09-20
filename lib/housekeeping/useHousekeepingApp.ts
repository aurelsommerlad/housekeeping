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
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Lang } from './i18n';
import { translate } from './i18n';
import { fetchMe, login as loginRequest, logout as logoutRequest } from './auth';
import {
  DOUBLEUP_TYPES, POLL_INTERVAL, assignmentsApi, breaksApi, completionsApi, doubleupsApi,
  loadBackendState, loadProperties, loadReservations, loadUnits, setUnitCondition, usersApi,
} from './api';
import { allowedProperties, buildRooms, roomKey } from './rooms';
import type {
  ApaleoUnit, AssignmentsState, BreakEntry, Completion, DoubleupsState, Property, ReservationsState,
  Room, RoomFilter, StaffUser,
} from './types';

export type AuthScreen = 'checking' | 'login' | 'app';
export type NavId = 'rooms' | 'doubleup' | 'stats' | 'rules' | 'team';

interface AppState {
  authScreen: AuthScreen;
  lang: Lang;
  user: StaffUser | null;
  loginError: string;
  loading: boolean;
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
    activeNav: 'rooms',
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
    patch({ units, reservations });
  }, [loadBackend, patch]);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startPolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => {
      if (!stateRef.current.user || !stateRef.current.activeProperty || document.hidden) return;
      refreshAll().catch(() => {});
    }, POLL_INTERVAL);
    if (!tickRef.current) {
      // Wie zuvor in app.js: der Sekunden-Tick (fuer den laufenden Timer) rendert nur neu, wenn
      // die Zimmerliste oder das Zimmer-Detail sichtbar ist - auf Team/Regeln/Statistik ist der
      // Tick fuer die Anzeige irrelevant.
      tickRef.current = setInterval(() => {
        if (stateRef.current.activeNav === 'rooms' || stateRef.current.detailRoomKey) {
          patch({ now: Date.now() });
        }
      }, 1000);
    }
  }, [patch, refreshAll]);

  useEffect(() => () => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (tickRef.current) clearInterval(tickRef.current);
  }, []);

  const afterLogin = useCallback(async () => {
    patch({ authScreen: 'app', activeNav: 'rooms', loading: true });
    try {
      const properties = await loadProperties();
      const allowed = allowedProperties(stateRef.current.user, properties.map((p) => p.code));
      let activeProperty = stateRef.current.activeProperty;
      if (!activeProperty || !allowed.includes(activeProperty)) activeProperty = allowed[0] || null;
      if (activeProperty) window.localStorage.setItem('hk_active_property', activeProperty);
      patch({ properties, activeProperty });
      stateRef.current = { ...stateRef.current, properties, activeProperty };
      await refreshAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err));
    }
    patch({ loading: false });
    startPolling();
  }, [patch, refreshAll, showToast, startPolling]);

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
    patch({ user: null, authScreen: 'login', units: [], detailRoomKey: null });
  }, [patch]);

  const selectProperty = useCallback(async (code: string) => {
    window.localStorage.setItem('hk_active_property', code);
    patch({ activeProperty: code, loading: true });
    stateRef.current = { ...stateRef.current, activeProperty: code };
    await refreshAll();
    patch({ loading: false });
  }, [patch, refreshAll]);

  const setLang = useCallback((lang: Lang) => {
    window.localStorage.setItem('hk_lang', lang);
    patch({ lang });
  }, [patch]);

  const setActiveNav = useCallback((id: NavId) => {
    patch({ activeNav: id, multiSelect: false, selectedRooms: new Set() });
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

  return {
    state, t, roomKey,
    rooms, DOUBLEUP_TYPES,
    setLang, doLogin, doLogout, selectProperty, setActiveNav, setFilter, toggleMyRooms,
    toggleMultiSelect, toggleRoomSelection, openRoom, closeModal, showToast,
    assignRoom, unassignRoom, bulkAssign, clearAllAssignments, startTimer, pauseTimer,
    finishClean, completeInspection, toggleDoubleType, finishDoubleup, toggleBreak,
    saveUser, deleteUser,
  };
}

export type HousekeepingApp = ReturnType<typeof useHousekeepingApp>;
