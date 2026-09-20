'use client';

/**
 * API-Client fuer den echten Housekeeping-Betrieb - Fetch-Helfer und Konstanten 1:1 aus app.js
 * uebernommen (nur typisiert). Ruft ausschliesslich die BESTEHENDEN, unveraenderten
 * /api/*-Routen auf (api/apaleo.js, api/assignments.js, api/doubleups.js, api/users.js,
 * api/completions.js, api/breaks.js) - keine Aenderung an der Backend-Logik.
 *
 * Login/Logout/Session laufen ueber die bereits vorhandenen Next-nativen Routen
 * app/api/auth/{login,logout,me} (ohne `scope`, funktioniert fuer jede Rolle) - siehe
 * lib/housekeeping/auth.ts.
 */
import type {
  ApaleoReservation, ApaleoUnit, AssignmentsState, DoubleupsState, Completion, BreakEntry, Property, ReservationsState, StaffUser,
  TaskAssignmentsState,
} from './types';

// MINOR-Bump (2.0.0 -> 2.1.0): neue, rein additive Reinigungsplanung (Aufgaben/Task-Modell,
// Standortverantwortliche) neben der unveraenderten alten Zimmer-Logik - keine bestehenden
// Redis-Keys/Datenformate wurden geaendert oder geloescht (siehe migrateLegacyKey), daher kein
// MAJOR/Breaking-Bump.
export const APP_VERSION = '2.1.0';

// Optionale lokale Ueberschreibung des Anzeigenamens pro Apaleo-Property-Code. Properties OHNE
// Eintrag hier werden trotzdem angezeigt (mit ihrem Namen aus Apaleo) - diese Map darf niemals
// dazu fuehren, dass eine von Apaleo gelieferte Property verschwindet, siehe loadProperties().
export const PROPERTY_NAMES: Record<string, string> = {};

export interface DoubleupTypeDef {
  id: string;
  icon: string;
  label: 'doubleup_crib' | 'doubleup_sofabed' | 'doubleup_dog' | 'doubleup_extra';
}

export const DOUBLEUP_TYPES: DoubleupTypeDef[] = [
  { id: 'crib', icon: '\u{1F476}', label: 'doubleup_crib' },
  { id: 'sofabed', icon: '\u{1F6CB}\u{FE0F}', label: 'doubleup_sofabed' },
  { id: 'dog', icon: '\u{1F415}', label: 'doubleup_dog' },
  { id: 'extra', icon: '➕', label: 'doubleup_extra' },
];

export const FORCED_CLEAN_INTERVAL_NIGHTS = 2;
export const POLL_INTERVAL = 30000;

async function apaleo<T = unknown>(path: string, method?: string, body?: unknown): Promise<T> {
  const res = await fetch('/api/apaleo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, method: method || 'GET', body }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Apaleo-Fehler ${res.status}`);
  return data as T;
}

async function backendGet<T = unknown>(name: string): Promise<T> {
  const res = await fetch(`/api/${name}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Fehler ${res.status}`);
  return data as T;
}

async function backendPost<T = unknown>(name: string, payload: unknown): Promise<T> {
  const res = await fetch(`/api/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Fehler ${res.status}`);
  return data as T;
}

export async function loadProperties(): Promise<Property[]> {
  const data = await apaleo<{ properties?: { id?: string; code?: string; name?: string }[]; results?: { id?: string; code?: string; name?: string }[] }>(
    '/inventory/v1/properties?pageSize=200',
  );
  const list = data.properties || data.results || [];
  return list.map((p) => {
    const code = (p.id || p.code) as string;
    return { code, name: PROPERTY_NAMES[code] || p.name || code };
  });
}

export async function loadUnits(propertyCode: string): Promise<ApaleoUnit[]> {
  const data = await apaleo<{ units?: ApaleoUnit[]; results?: ApaleoUnit[] }>(
    `/inventory/v1/units?propertyIds=${encodeURIComponent(propertyCode)}&pageSize=500`,
  );
  return data.units || data.results || [];
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function addDaysISO(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function loadReservations(propertyCode: string): Promise<ReservationsState> {
  const today = todayISO();
  const tomorrow = addDaysISO(today, 1);
  const p = encodeURIComponent(propertyCode);
  const [inHouse, departToday, departTomorrow, arriveToday] = await Promise.all([
    apaleo<{ reservations?: ApaleoReservation[]; results?: ApaleoReservation[] }>(`/booking/v1/reservations?propertyId=${p}&status=InHouse&pageSize=500`),
    apaleo<{ reservations?: ApaleoReservation[]; results?: ApaleoReservation[] }>(`/booking/v1/reservations?propertyId=${p}&dateFilter=Departure&from=${today}&to=${today}&status=InHouse,CheckedOut&pageSize=500`),
    apaleo<{ reservations?: ApaleoReservation[]; results?: ApaleoReservation[] }>(`/booking/v1/reservations?propertyId=${p}&dateFilter=Departure&from=${tomorrow}&to=${tomorrow}&status=InHouse,Confirmed&pageSize=500`),
    apaleo<{ reservations?: ApaleoReservation[]; results?: ApaleoReservation[] }>(`/booking/v1/reservations?propertyId=${p}&dateFilter=Arrival&from=${today}&to=${today}&status=InHouse,Confirmed&pageSize=500`),
  ]);
  return {
    inHouse: inHouse.reservations || inHouse.results || [],
    departToday: departToday.reservations || departToday.results || [],
    departTomorrow: departTomorrow.reservations || departTomorrow.results || [],
    arriveToday: arriveToday.reservations || arriveToday.results || [],
  };
}

// Apaleo begrenzt pageSize dokumentiert auf maximal 200 (verifiziert live). Fuer die neue,
// standortuebergreifende Planung (mehrere Properties + 4-Tage-Fenster in einer Abfrage) koennen
// mehr als 200 Treffer anfallen, deshalb wird hier - anders als bei den obigen, unveraenderten
// Einzel-Property-Abfragen - tatsaechlich paginiert (durchlaeuft weitere Seiten, bis eine Seite
// weniger als pageSize Treffer liefert oder `count` erreicht ist).
const MAX_PAGE_SIZE = 200;
async function apaleoPaged<TItem>(
  pathBase: string,
  extractItems: (data: Record<string, unknown>) => TItem[] | undefined,
): Promise<TItem[]> {
  const sep = pathBase.includes('?') ? '&' : '?';
  const all: TItem[] = [];
  for (let page = 1; page <= 50; page += 1) {
    const data = await apaleo<Record<string, unknown>>(`${pathBase}${sep}pageSize=${MAX_PAGE_SIZE}&pageNumber=${page}`);
    const items = extractItems(data) || [];
    all.push(...items);
    const count = typeof data.count === 'number' ? data.count : undefined;
    if (items.length < MAX_PAGE_SIZE) break;
    if (typeof count === 'number' && all.length >= count) break;
  }
  return all;
}

/**
 * Units mehrerer Properties (Punkt 30/31). Live gegen den echten Account nachverifiziert: ein
 * EINZIGER Request mit mehreren kommagetrennten Property-Codes an /inventory/v1/units (wie
 * urspruenglich hier versucht) wird von Apaleo mit 422 abgelehnt - dieser Endpunkt akzeptiert
 * pro Anfrage nur GENAU EIN Property (exakt das bereits seit Monaten produktiv bewaehrte Muster
 * aus loadUnits() oben: propertyIds=<eine ID>). Deshalb hier bewusst EIN Request PRO Property,
 * parallel statt gebuendelt - langsamer als ein einzelner Request, aber die einzige tatsaechlich
 * verifizierte, funktionierende Form. `property` wird selbst gesetzt (keine Abhaengigkeit von
 * einem ungeprueften expand=property fuer den Mehrfach-Fall), da der Code je Anfrage ohnehin
 * schon weiss, zu welcher Property die zurueckgegebenen Units gehoeren.
 */
export async function loadUnitsForProperties(propertyCodes: string[]): Promise<ApaleoUnit[]> {
  if (propertyCodes.length === 0) return [];
  const perProperty = await Promise.all(propertyCodes.map(async (code) => {
    const units = await apaleoPaged<ApaleoUnit>(
      `/inventory/v1/units?propertyIds=${encodeURIComponent(code)}`,
      (data) => (data.units as ApaleoUnit[]) || (data.results as ApaleoUnit[]),
    );
    return units.map((u) => (u.property?.code ? u : { ...u, property: { ...u.property, code } }));
  }));
  return perProperty.flat();
}

/**
 * Reservierungen mehrerer Properties fuer einen Datumsbereich (Punkt 30/31). Aus demselben
 * Grund wie bei loadUnitsForProperties() ebenfalls EIN Request PRO Property statt eines
 * gebuendelten Mehrfach-Property-Requests - hier zusaetzlich mit dem bereits bewaehrten,
 * SINGULAREN Parameternamen `propertyId` (nicht `propertyIds`) aus der unveraenderten
 * loadReservations() oben, statt eines fuer diesen Endpunkt nie verifizierten Namens/Formats.
 * dateFilter=Stay deckt An-/Abreisen und laufende Aufenthalte im [fromISO, toISO]-Fenster in
 * einem Request pro Property ab, statt separater Arrival-/Departure-Abfragen pro Tag.
 */
export async function loadReservationsRangeForProperties(
  propertyCodes: string[],
  fromISO: string,
  toISO: string,
): Promise<ApaleoReservation[]> {
  if (propertyCodes.length === 0) return [];
  const perProperty = await Promise.all(propertyCodes.map(async (code) => {
    const reservations = await apaleoPaged<ApaleoReservation>(
      `/booking/v1/reservations?propertyId=${encodeURIComponent(code)}&dateFilter=Stay&from=${fromISO}&to=${toISO}&status=InHouse,Confirmed,CheckedOut`,
      (data) => (data.reservations as ApaleoReservation[]) || (data.results as ApaleoReservation[]),
    );
    return reservations.map((r) => (r.property?.code ? r : { ...r, property: { ...r.property, code } }));
  }));
  return perProperty.flat();
}

export interface BackendState {
  assignments: AssignmentsState;
  doubleups: DoubleupsState;
  users: StaffUser[];
  completions: Completion[];
  breaks: BreakEntry[];
}

export async function loadBackendState(): Promise<BackendState> {
  const [assignRes, doubleRes, usersRes, compRes, breakRes] = await Promise.all([
    backendGet<{ assignments: AssignmentsState }>('assignments'),
    backendGet<{ doubleups: DoubleupsState }>('doubleups'),
    backendGet<{ users: StaffUser[] }>('users'),
    backendGet<{ completions: Completion[] }>('completions'),
    backendGet<{ breaks: BreakEntry[] }>('breaks'),
  ]);
  return {
    assignments: assignRes.assignments || {},
    doubleups: doubleRes.doubleups || {},
    users: usersRes.users || [],
    completions: compRes.completions || [],
    breaks: breakRes.breaks || [],
  };
}

export async function setUnitCondition(unitId: string, condition: string): Promise<void> {
  await apaleo('/operations/v1/units-condition', 'PUT', { unitIds: [unitId], condition });
}

export const assignmentsApi = {
  set: (key: string, housekeeperId: string, housekeeperName: string) =>
    backendPost('assignments', { action: 'set', key, housekeeperId, housekeeperName }),
  clear: (key: string) => backendPost('assignments', { action: 'clear', key }),
  bulkSet: (keys: string[], housekeeperId: string, housekeeperName: string) =>
    backendPost('assignments', { action: 'bulkSet', keys, housekeeperId, housekeeperName }),
  clearProperty: (property: string) => backendPost('assignments', { action: 'clearProperty', property }),
  startTimer: (key: string, housekeeperId: string, housekeeperName: string) =>
    backendPost('assignments', { action: 'startTimer', key, housekeeperId, housekeeperName }),
  stopTimer: (key: string) => backendPost('assignments', { action: 'stopTimer', key }),
};

export const doubleupsApi = {
  set: (key: string, types: string[], note?: string) => backendPost('doubleups', { action: 'set', key, types, note: note || '' }),
  clear: (key: string) => backendPost('doubleups', { action: 'clear', key }),
};

export async function loadTaskAssignments(): Promise<TaskAssignmentsState> {
  const data = await backendGet<{ taskAssignments?: TaskAssignmentsState }>('task-assignments');
  return data.taskAssignments || {};
}

/** Taskbezogene Zuweisungen (Punkt 4/28) - Gegenstueck zu assignmentsApi, aber Key = Task-ID
 * statt Property+Zimmer. Siehe api/task-assignments.js fuer die serverseitige Rechtepruefung. */
export const taskAssignmentsApi = {
  claim: (taskId: string) => backendPost<{ taskAssignments: TaskAssignmentsState }>('task-assignments', { action: 'claim', taskId }),
  release: (taskId: string) => backendPost<{ taskAssignments: TaskAssignmentsState }>('task-assignments', { action: 'release', taskId }),
  assign: (taskId: string, housekeeperId: string, housekeeperName: string) =>
    backendPost<{ taskAssignments: TaskAssignmentsState }>('task-assignments', { action: 'assign', taskId, housekeeperId, housekeeperName }),
  bulkAssign: (taskIds: string[], housekeeperId: string, housekeeperName: string) =>
    backendPost<{ taskAssignments: TaskAssignmentsState }>('task-assignments', { action: 'bulkAssign', taskIds, housekeeperId, housekeeperName }),
  clearScope: (date: string, property: string) =>
    backendPost<{ taskAssignments: TaskAssignmentsState }>('task-assignments', { action: 'clearScope', date, property }),
  startTimer: (taskId: string) => backendPost<{ taskAssignments: TaskAssignmentsState }>('task-assignments', { action: 'startTimer', taskId }),
  stopTimer: (taskId: string) => backendPost<{ taskAssignments: TaskAssignmentsState }>('task-assignments', { action: 'stopTimer', taskId }),
  complete: (taskId: string, requiresInspectionFlag: boolean) =>
    backendPost<{ taskAssignments: TaskAssignmentsState }>('task-assignments', { action: 'complete', taskId, requiresInspection: requiresInspectionFlag }),
  completeInspection: (taskId: string) =>
    backendPost<{ taskAssignments: TaskAssignmentsState }>('task-assignments', { action: 'completeInspection', taskId }),
};

export const completionsApi = {
  add: (entry: Omit<Completion, 'id'>) => backendPost('completions', { action: 'add', entry }),
};

export const breaksApi = {
  start: (housekeeperId: string, housekeeperName: string) => backendPost('breaks', { action: 'start', housekeeperId, housekeeperName }),
  end: (housekeeperId: string) => backendPost('breaks', { action: 'end', housekeeperId }),
};

export const usersApi = {
  save: (user: Record<string, unknown>) => backendPost('users', { action: 'set', user }),
  remove: (username: string) => backendPost('users', { action: 'delete', username }),
};
