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
  ApaleoReservation, ApaleoUnit, AssignmentsState, DoubleupsState, Completion, BreakEntry, NfcTagStatusesState, Property,
  ReservationSearchResult, ReservationsState, StaffUser, TaskAssignmentsState, TaskNotice, TaskNoticeAck, TaskNoticeAcksState,
  TaskNoticesState, TaskStartSource, TaskTimeOverride, TaskTimeOverridesState,
} from './types';

// MINOR-Bump (2.3.0 -> 2.4.0): Reservierungsinformationen an Tasks (Buchungsnummer/Gast/
// Gaestezahl/Kinderalter/gebucht am, strikt getrennt Abreise vs. naechste Anreise bei Turnover)
// + Admin-Reservierungssuche live gegen Apaleo (textSearch, ueber alle Properties/Zeitraeume) -
// rein additiv (neue Task-Felder reservationInfo/nextReservationInfo, keine neuen Redis-Keys,
// keine Aenderung bestehender Datenformate). Die kompakte Task Card behaelt ihre bisherige
// Groesse (dieselbe Zeile wird nur inhaltlich angereichert, siehe TaskCard.tsx).
export const APP_VERSION = '2.4.0';

// Optionale lokale Ueberschreibung des Anzeigenamens pro Apaleo-Property-Code. Properties OHNE
// Eintrag hier werden trotzdem angezeigt (mit ihrem Namen aus Apaleo) - diese Map darf niemals
// dazu fuehren, dass eine von Apaleo gelieferte Property verschwindet, siehe getPropertyDisplayName().
export const PROPERTY_NAMES: Record<string, string> = {};

// Alle vier aktuellen UNIQUE-PLACES-Standorte heissen bei Apaleo "<Markenname> by UNIQUE PLACES".
const BRAND_NAME_SUFFIX = ' by UNIQUE PLACES';

/**
 * EINZIGE zentrale Stelle fuer Anzeigenamen von Properties - wird ueberall in der UI aufgerufen
 * (StaffHeader, PropertyChips, TasksScreen-Standortauswahl, Task.propertyName fuer Task-Karten),
 * statt an mehreren Stellen Strings zu kuerzen/ersetzen. Kuerzt NUR fuer die Darstellung - der
 * Apaleo-Code (property.code) bleibt ueberall sonst (Redis, Task-IDs, Berechtigungen) unveraendert
 * die alleinige Quelle der Wahrheit.
 *
 * Der gemeinsame Marken-Suffix wird generisch abgeschnitten, statt die kurzen Standortnamen (mit
 * ihren Sonderzeichen Ʌ/Æ/Ø/Ū) hier erneut von Hand nachzubauen - das waere fehleranfaellig (leicht
 * verwechselbare Unicode-Zeichen) und deckt zukuenftige Standorte mit demselben Namensschema
 * automatisch mit ab. PROPERTY_NAMES bleibt als expliziter Override moeglich (z. B. falls ein
 * kuenftiger Standort NICHT nach diesem Schema benannt ist). Ein Property ohne diesen Suffix
 * (unbekannt/anders benannt) behaelt seinen vollen, von Apaleo gelieferten Namen als Fallback -
 * es verschwindet also nie.
 */
export function getPropertyDisplayName(property: { code: string; name?: string }): string {
  const raw = PROPERTY_NAMES[property.code] || property.name || property.code;
  return raw.endsWith(BRAND_NAME_SUFFIX) ? raw.slice(0, -BRAND_NAME_SUFFIX.length) : raw;
}

export interface DoubleupTypeDef {
  id: string;
  label: 'doubleup_crib' | 'doubleup_sofabed' | 'doubleup_dog' | 'doubleup_extra';
}

// Icons dafuer: siehe components/ui/icons.tsx#DOUBLEUP_ICONS (id -> Outline-Icon-Komponente) -
// keine Emojis mehr (id dient dort direkt als Lookup-Schluessel, kein separates Icon-Feld noetig).
export const DOUBLEUP_TYPES: DoubleupTypeDef[] = [
  { id: 'crib', label: 'doubleup_crib' },
  { id: 'sofabed', label: 'doubleup_sofabed' },
  { id: 'dog', label: 'doubleup_dog' },
  { id: 'extra', label: 'doubleup_extra' },
];

export const FORCED_CLEAN_INTERVAL_NIGHTS = 2;
export const POLL_INTERVAL = 30000;

async function apaleo<T = unknown>(path: string, method?: string, body?: unknown): Promise<T> {
  const res = await fetch('/api/apaleo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, method: method || 'GET', body }),
  });
  const data = await res.json().catch(() => ({})) as Record<string, unknown>;
  if (!res.ok) {
    // Apaleo-Fehlerantworten sind nicht einheitlich (mal {message}, mal ASP.NET-ProblemDetails
    // {title, detail, errors}) - alle bekannten Formen werden hier durchgereicht, statt nur den
    // generischen HTTP-Status zu zeigen, damit ein zukuenftiger Apaleo-Fehler direkt in der UI
    // diagnostizierbar ist (dieser 422 mussten wir sonst erst live nachstellen, um die Ursache
    // - ungueltiges Datumsformat bzw. from>=to - ueberhaupt zu sehen).
    const detail = typeof data.detail === 'string' ? data.detail
      : typeof data.message === 'string' ? data.message
      : typeof data.title === 'string' ? data.title
      : typeof data.error === 'string' ? data.error
      : data.errors ? JSON.stringify(data.errors)
      : null;
    throw new Error(detail ? `Apaleo-Fehler ${res.status}: ${detail}` : `Apaleo-Fehler ${res.status}`);
  }
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
  // `name` bleibt hier bewusst der volle, unveraenderte Apaleo-Name (nicht gekuerzt) - die
  // Kuerzung fuer die Darstellung passiert einheitlich ueber getPropertyDisplayName() an den
  // tatsaechlichen Anzeigestellen, nicht schon beim Laden.
  return list.map((p) => ({ code: (p.id || p.code) as string, name: p.name || (p.id || p.code) as string }));
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
 * Units mehrerer Properties (Punkt 30/31). EIN Request PRO Property statt eines gebuendelten
 * Mehrfach-Property-Requests (siehe /inventory/v1/units-Kommentar zur 422-Historie unten).
 *
 * WICHTIG (Property-Zuordnungsfehler, nachtraeglich gefunden): der Property-QUERY-PARAMETER
 * (`propertyIds=<code>`) darf NIE als Beweis fuer die tatsaechliche Property-Zugehoerigkeit
 * einer zurueckgegebenen Unit dienen - selbst wenn der Filter serverseitig korrekt greift, ist
 * das eine Annahme ueber Apaleo-Verhalten, keine aus den Daten selbst gepruefte Tatsache. Die
 * vorherige Fassung stempelte bei fehlendem `property.code` blind den GERADE ITERIERTEN Code auf
 * jede zurueckgegebene Unit - griff der Filter aus irgendeinem Grund nicht (z. B. ignorierter/
 * falscher Parametername), wurden dadurch Units aus FREMDEN Properties fälschlich der gerade
 * abgefragten Property zugeschrieben (beobachtet: dieselbe Unit erschien unter mehreren
 * Standorten). `expand=property` laesst Apaleo die ECHTE Property jeder Unit explizit mitliefern
 * (dokumentierter, bereits an anderer Stelle dieser App genutzter Expand-Wert) - nur Units, deren
 * SO GELIEFERTE eigene Property mit dem angefragten Code uebereinstimmt, werden uebernommen; alles
 * andere wird verworfen statt geraten. So ist die Zuordnung unabhaengig davon korrekt, ob der
 * Query-Filter selbst zuverlaessig ist.
 */
export async function loadUnitsForProperties(propertyCodes: string[]): Promise<ApaleoUnit[]> {
  if (propertyCodes.length === 0) return [];
  const perProperty = await Promise.all(propertyCodes.map(async (code) => {
    const units = await apaleoPaged<ApaleoUnit>(
      `/inventory/v1/units?propertyIds=${encodeURIComponent(code)}&expand=property`,
      (data) => (data.units as ApaleoUnit[]) || (data.results as ApaleoUnit[]),
    );
    return units.filter((u) => (u.property?.code || u.property?.id) === code);
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
 *
 * WICHTIG (live gegen den echten Account reproduziert, zweiter Root Cause des 422): `from`/`to`
 * verlangen einen VOLLEN ISO-8601-Zeitpunkt - ein reines Datum ("2026-09-20" ohne Uhrzeit) wird
 * von Apaleo mit 422 "Invalid value provided" abgelehnt. Ausserdem muss `from` echt VOR `to`
 * liegen (ein gleicher Zeitpunkt fuer beide schlaegt mit 422 "condition was not met for From"
 * fehl) - `to` wird deshalb bewusst auf Mitternacht des Tages NACH toISO gesetzt (exklusive
 * Obergrenze), damit der komplette letzte Tag (inkl. spaeter An-/Abreisen an diesem Tag)
 * zuverlaessig eingeschlossen ist, statt sich auf eine Inklusiv-/Exklusiv-Annahme fuer Mitternacht
 * desselben Tages zu verlassen. Beides live mit echten Reservierungen bestaetigt.
 *
 * Wie bei loadUnitsForProperties(): der `propertyId`-Queryparameter wird NICHT als Beweis fuer
 * die tatsaechliche Property-Zugehoerigkeit einer Reservierung vertraut. Reservierungen liefern
 * ihre eigene `property` bereits ohne jedes `expand` mit (live bestaetigt), daher hier ausschliesslich
 * anhand DIESES vom Server selbst gelieferten Felds gefiltert - keine blinde Uebernahme des
 * angefragten Codes mehr fuer Datensaetze ohne (oder mit abweichender) eigener Property-Angabe.
 *
 * `expand=services` (live gegen den echten Account verifiziert, siehe Rechercheergebnis zu Early
 * Check-in/Late Check-out): liefert `services[].service.{id,code,name}` direkt eingebettet mit,
 * OHNE einen separaten GetReservationServices-Aufruf pro Reservierung - dieselbe Struktur wie
 * `expand=property` oben, nur fuer eine andere Apaleo-Relation.
 */
export async function loadReservationsRangeForProperties(
  propertyCodes: string[],
  fromISO: string,
  toISO: string,
): Promise<ApaleoReservation[]> {
  if (propertyCodes.length === 0) return [];
  const fromInstant = encodeURIComponent(`${fromISO}T00:00:00Z`);
  const toInstant = encodeURIComponent(`${addDaysISO(toISO, 1)}T00:00:00Z`);
  const perProperty = await Promise.all(propertyCodes.map(async (code) => {
    const reservations = await apaleoPaged<ApaleoReservation>(
      `/booking/v1/reservations?propertyId=${encodeURIComponent(code)}&dateFilter=Stay&from=${fromInstant}&to=${toInstant}&status=InHouse,Confirmed,CheckedOut&expand=services`,
      (data) => (data.reservations as ApaleoReservation[]) || (data.results as ApaleoReservation[]),
    );
    return reservations.filter((r) => (r.property?.code || r.property?.id) === code);
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
  startTimer: (taskId: string, startSource?: TaskStartSource) =>
    backendPost<{ taskAssignments: TaskAssignmentsState }>('task-assignments', { action: 'startTimer', taskId, startSource }),
  stopTimer: (taskId: string) => backendPost<{ taskAssignments: TaskAssignmentsState }>('task-assignments', { action: 'stopTimer', taskId }),
  complete: (taskId: string, requiresInspectionFlag: boolean) =>
    backendPost<{ taskAssignments: TaskAssignmentsState }>('task-assignments', { action: 'complete', taskId, requiresInspection: requiresInspectionFlag }),
  completeInspection: (taskId: string) =>
    backendPost<{ taskAssignments: TaskAssignmentsState }>('task-assignments', { action: 'completeInspection', taskId }),
};

export const completionsApi = {
  add: (entry: Omit<Completion, 'id'>) => backendPost('completions', { action: 'add', entry }),
};

export interface TaskNoticesData {
  notices: TaskNoticesState;
  acks: TaskNoticeAcksState;
}

export async function loadTaskNotices(): Promise<TaskNoticesData> {
  const data = await backendGet<{ notices?: TaskNoticesState; acks?: TaskNoticeAcksState }>('task-notices');
  return { notices: data.notices || {}, acks: data.acks || {} };
}

/** "Wichtiger Hinweis" pro Task (Punkt 3-8) - eigene Datenquelle, siehe api/task-notices.js fuer
 * die serverseitige Rechtepruefung (nur Admin/Standortverantwortlich duerfen set/remove, jeder
 * mit Property-Zugriff darf acknowledge). */
export const taskNoticesApi = {
  set: (taskId: string, text: string) => backendPost<{ notice: TaskNotice }>('task-notices', { action: 'set', taskId, text }),
  remove: (taskId: string) => backendPost<{ ok: true }>('task-notices', { action: 'remove', taskId }),
  acknowledge: (taskId: string) => backendPost<{ ack: TaskNoticeAck }>('task-notices', { action: 'acknowledge', taskId }),
};

export async function loadTaskTimeOverrides(): Promise<TaskTimeOverridesState> {
  const data = await backendGet<{ overrides?: TaskTimeOverridesState }>('task-time-overrides');
  return data.overrides || {};
}

/** Manueller Admin-Override der Abreise-/Anreisezeit (Prioritaet 1, siehe types.ts#TaskTimeOverride)
 * - siehe api/task-time-overrides.js fuer die serverseitige Rechtepruefung (nur Admin darf
 * schreiben; Standortverantwortliche und Housekeeper koennen den Stand nur lesen). */
export const taskTimeOverridesApi = {
  set: (taskId: string, times: { departureTime?: string; arrivalTime?: string }) =>
    backendPost<{ override: TaskTimeOverride }>('task-time-overrides', { action: 'set', taskId, ...times }),
  remove: (taskId: string) => backendPost<{ ok: true }>('task-time-overrides', { action: 'remove', taskId }),
};

export async function loadNfcTagStatuses(): Promise<NfcTagStatusesState> {
  const data = await backendGet<{ statuses?: NfcTagStatusesState }>('nfc-tags');
  return data.statuses || {};
}

/** NFC-Tag-Verwaltung (Punkt "NFC-Verwaltung") - ausschliesslich fuer Admin, serverseitig
 * durchgesetzt (siehe api/nfc-tags.js). Liefert bei create/replace/reveal die volle, fertig
 * zusammengesetzte URL (Origin wird serverseitig aus dem Request ermittelt, siehe
 * api/nfc-tags.js#originFromReq - funktioniert dadurch unveraendert in jeder Umgebung: lokal,
 * Preview-Deployments, Produktivdomain). */
export const nfcApi = {
  create: (propertyCode: string, unitId: string, unitName: string) =>
    backendPost<{ url: string; status: { active: true; createdAt: number; createdByName: string } }>(
      'nfc-tags', { action: 'create', propertyCode, unitId, unitName },
    ),
  reveal: (propertyCode: string, unitId: string) =>
    backendPost<{ url: string }>('nfc-tags', { action: 'reveal', propertyCode, unitId }),
  deactivate: (propertyCode: string, unitId: string) =>
    backendPost<{ ok: true }>('nfc-tags', { action: 'deactivate', propertyCode, unitId }),
  replace: (propertyCode: string, unitId: string, unitName: string) =>
    backendPost<{ url: string; status: { active: true; createdAt: number; createdByName: string } }>(
      'nfc-tags', { action: 'replace', propertyCode, unitId, unitName },
    ),
};

export interface NfcResolveResult {
  propertyCode: string;
  unitId: string;
  unitName: string;
}

/** NFC-Scan-Aufloesung (Punkt "NFC-Scan") - ruft die native Next.js-Route auf (nicht den
 * legacy /api/apaleo-Proxy), siehe app/api/nfc/[token]/route.ts. Wirft bei 401/403/404 einen
 * Error mit einem stabilen `code`-Feld, damit die aufrufende Seite gezielt zwischen "nicht
 * eingeloggt", "kein Zugriff" und "ungueltiger/deaktivierter Tag" unterscheiden kann. */
export class NfcResolveError extends Error {
  code: 'unauthenticated' | 'forbidden' | 'invalid';
  constructor(code: 'unauthenticated' | 'forbidden' | 'invalid') {
    super(code);
    this.code = code;
  }
}

export async function resolveNfcToken(token: string): Promise<NfcResolveResult> {
  const res = await fetch(`/api/nfc/${encodeURIComponent(token)}`, { cache: 'no-store' });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const code = data.error === 'unauthenticated' || data.error === 'forbidden' ? data.error : 'invalid';
    throw new NfcResolveError(code);
  }
  return res.json();
}

export const breaksApi = {
  start: (housekeeperId: string, housekeeperName: string) => backendPost('breaks', { action: 'start', housekeeperId, housekeeperName }),
  end: (housekeeperId: string) => backendPost('breaks', { action: 'end', housekeeperId }),
};

export const usersApi = {
  save: (user: Record<string, unknown>) => backendPost('users', { action: 'set', user }),
  remove: (username: string) => backendPost('users', { action: 'delete', username }),
};

/** Admin-Reservierungssuche (Punkt 5-9) - sucht live gegen Apaleo ueber alle Properties/Zeitraeume
 * hinweg (nicht nur die vier geladenen Planungstage), siehe api/reservation-search.js fuer die
 * serverseitige role==='admin'-Pruefung. */
export async function searchReservations(query: string): Promise<ReservationSearchResult[]> {
  const data = await backendPost<{ results?: ReservationSearchResult[] }>('reservation-search', { query });
  return data.results || [];
}
