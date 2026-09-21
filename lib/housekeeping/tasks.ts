/**
 * Reinigungsauftrags-Ableitung (Punkt 4/7/8/9): Datum -> Reinigungsauftraege -> Zuweisung ->
 * Durchfuehrung, statt Property -> Zimmer -> aktueller Zimmerzustand. Tasks werden REIN aus
 * Apaleo-Reservierungen fuer Heute+3 abgeleitet (deterministische ID, siehe taskId()) und tragen
 * selbst keinen Zuweisungs-/Fortschrittszustand - der liegt getrennt in TaskAssignment
 * (housekeeping:task_assignments, siehe api/task-assignments.js), gemaess Punkt 23 (Task-Status
 * = unser Workflow, Apaleo Unit Condition = PMS-Zustand, beides bewusst getrennt).
 *
 * Die bestehende Zwangsreinigungsregel (siehe rooms.ts#buildRooms) wird fuer HEUTE exakt
 * unveraendert uebernommen (inkl. echtem Apaleo-Zustand). Fuer zukuenftige Tage kann der Apaleo-
 * Zustand naturgemaess nicht im Voraus bekannt sein (Punkt 7) - dort wird ausschliesslich die
 * deterministische Naechte-/Abreise-Bedingung ausgewertet und als GEPLANTE (nicht bestaetigte)
 * Zwangsreinigung markiert (task.forced), damit Personalplanung trotzdem moeglich ist.
 */
import { FORCED_CLEAN_INTERVAL_NIGHTS } from './api';
import { addDaysISO, unitCondition } from './rooms';
import type {
  ApaleoReservation, ApaleoUnit, CapacityEntry, DaySummary, DoubleupsState, Task, TaskAssignmentsState, TaskHistoryEntry,
  TaskReservationSummary, TaskStatus, TaskTimeOverride, TaskTimeOverridesState, TaskType,
} from './types';

/** Standardzeiten (Prioritaet 3, ohne gebuchtes Extra/Override) - siehe Briefing Punkt 1.
 * EXPORTIERT, damit die Einstellungen-Seite (StandardTimesScreen.tsx) exakt diese Werte rein
 * informativ anzeigen kann, statt sie dort ein zweites Mal als Literal zu duplizieren - EINE
 * Quelle der Wahrheit fuer diese Business Rule (siehe Briefing "Standardzeiten": bewusst noch
 * keine dynamische Konfigurationsquelle daneben). */
export const STANDARD_DEPARTURE_TIME = '10:00';
export const STANDARD_ARRIVAL_TIME = '16:00';
/** Late Check-out/Early Check-in verschieben die jeweilige Zeit auf 13:00 (Prioritaet 2) - die
 * Stunde selbst steht bei Apaleo NICHT strukturiert am gebuchten Service (live verifiziert: weder
 * am Service noch an der gebuchten Instanz existiert ein Zeitfeld, nur ein Datum), sondern ist
 * eine reine UNIQUE-PLACES-Geschaeftsregel (siehe Service-Beschreibungstext "bis maximal/fruehestens
 * ab 13:00 Uhr") - deshalb hier bewusst als benannte Konstante hinterlegt statt aus Apaleo geraten.
 */
export const EXTRA_TIME = '13:00';

/** Apaleo-Servicecode ('ECI'/'LCO'/'HUND'/'BABY') statt `id` (property-praefigiert, z. B.
 * "LAEKE-LCO") oder `name`/`description` (Freitext, siehe HUESLE-OTHER-Decoy in der Recherche) -
 * property-uebergreifend einheitlich und robust gegen Namensaenderungen. NIEMALS `comment`
 * heranziehen. 'HUND' (Hund-Gebuehr) und 'BABY' (Babybett) live gegen alle vier Properties
 * (HUESLE/LAEKE/ALPILA/ALTUS) verifiziert - identischer Code ueberall. */
function hasBookedService(r: ApaleoReservation | undefined, code: 'ECI' | 'LCO' | 'HUND' | 'BABY'): boolean {
  return !!r?.services?.some((s) => s.service?.code === code);
}

/** "HH:MM" -> Minuten seit Mitternacht, fuer Sortierung/Fensterberechnung. */
function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map((n) => parseInt(n, 10));
  return (h || 0) * 60 + (m || 0);
}

function dateOnly(dt?: string): string | null {
  return dt ? String(dt).slice(0, 10) : null;
}

function guestName(r: ApaleoReservation): string {
  return [r.primaryGuest?.firstName, r.primaryGuest?.lastName].filter(Boolean).join(' ');
}

function guestCount(r: ApaleoReservation): number | null {
  if (typeof r.adults !== 'number') return null;
  return r.adults + (r.childrenAges?.length || 0);
}

function reservationComment(r: ApaleoReservation): string {
  return r.comment || r.booker?.comment || '';
}

/** Reservierungsinformationen (Punkt 1) ausschliesslich aus echten Apaleo-Feldern - `created` fuer
 * "gebucht am", `id` (nicht `bookingId`) als anzuzeigende Buchungsnummer (siehe
 * types.ts#TaskReservationSummary). `hasDog`/`hasCrib` beziehen sich ausschliesslich auf DIESE
 * eine Reservierung `r` - bei Turnover wird diese Funktion separat fuer die abreisende und die
 * ankommende Reservierung aufgerufen, die beiden Ergebnisse werden nie vermischt. */
function reservationSummary(r: ApaleoReservation): TaskReservationSummary {
  return {
    reservationId: r.id,
    bookingId: r.bookingId || r.id,
    bookingDate: dateOnly(r.created),
    arrivalDate: dateOnly(r.arrival) || '',
    departureDate: dateOnly(r.departure) || '',
    guestName: guestName(r),
    adults: typeof r.adults === 'number' ? r.adults : null,
    childrenCount: r.childrenAges?.length || 0,
    childAges: r.childrenAges || [],
    hasDog: hasBookedService(r, 'HUND'),
    hasCrib: hasBookedService(r, 'BABY'),
  };
}

function resUnitId(r: ApaleoReservation): string | undefined {
  return r.unit?.id || r.unit?.code;
}

function unitPropertyCode(u: ApaleoUnit, fallback: string): string {
  return u.property?.code || u.property?.id || fallback;
}

function nightsSince(arrivalIso: string, refIso: string): number {
  const a = new Date(`${arrivalIso}T00:00:00`);
  const ref = new Date(`${refIso}T00:00:00`);
  return Math.round((ref.getTime() - a.getTime()) / 86400000);
}

/**
 * Deterministische, stabile Task-ID (Punkt 5): identische Eingaben ergeben bei jedem Reload
 * exakt dieselbe ID, damit eine Zuweisung (Redis-Key = Task-ID) den Reload uebersteht, statt bei
 * jedem Fetch neu erfunden zu werden. Menschenlesbar gehalten (kein Hash) - hilft beim Debugging
 * und ist als Redis-Hash-Feld genauso gueltig wie jeder andere String.
 */
export function taskId(propertyCode: string, unitId: string, date: string, type: TaskType, sourceReservationId: string | null): string {
  return `${propertyCode}|${unitId}|${date}|${type}|${sourceReservationId || 'none'}`;
}

export interface BuildTasksInput {
  /** Property-Code -> Anzeigename, fuer die Ableitung selbst nur als Fallback benoetigt (Units/
   * Reservierungen tragen ihre Property bereits selbst, siehe ApaleoUnit.property/
   * ApaleoReservation.property). */
  propertyNames: Record<string, string>;
  units: ApaleoUnit[];
  reservations: ApaleoReservation[];
  doubleups: DoubleupsState;
  /** Die zu betrachtenden Kalendertage, z. B. [heute, heute+1, heute+2, heute+3]. */
  days: string[];
  today: string;
}

export function buildTasks({ propertyNames, units, reservations, doubleups, days, today }: BuildTasksInput): Task[] {
  // Keine Filterung nach Tagen hier: eine Reservierung, die keinen der betrachteten Tage direkt
  // als An-/Abreise beruehrt, kann trotzdem als laufender Aufenthalt (Stayover) relevant sein -
  // die eigentliche Tageszuordnung passiert weiter unten pro Tag.
  const resByUnit = new Map<string, ApaleoReservation[]>();
  for (const r of reservations) {
    const uid = resUnitId(r);
    if (!uid) continue;
    if (!resByUnit.has(uid)) resByUnit.set(uid, []);
    resByUnit.get(uid)!.push(r);
  }

  const tasks: Task[] = [];

  for (const unit of units) {
    const propertyCode = unitPropertyCode(unit, '');
    if (!propertyCode) continue;
    const propertyName = propertyNames[propertyCode] || propertyCode;
    const unitName = String(unit.name || unit.id || unit.unitGroup?.name || '?');
    const unitReservations = resByUnit.get(unit.id) || [];
    const doubleupKey = `${propertyCode}_${unitName}`;
    const doubleup = doubleups[doubleupKey];
    const conditionNow = unitCondition(unit);

    for (const date of days) {
      const isToday = date === today;
      const departingRes = unitReservations.find((r) => dateOnly(r.departure) === date);
      const arrivingRes = unitReservations.find((r) => dateOnly(r.arrival) === date);

      if (departingRes && arrivingRes) {
        // Punkt 5/6: LCO IMMER von der ABREISENDEN Reservierung, ECI IMMER von der ANKOMMENDEN
        // (naechsten) Reservierung - niemals beide von derselben Reservierung lesen.
        const hasLateCheckout = hasBookedService(departingRes, 'LCO');
        const hasEarlyCheckin = hasBookedService(arrivingRes, 'ECI');
        tasks.push({
          id: taskId(propertyCode, unit.id, date, 'turnover', departingRes.id),
          propertyId: propertyCode, propertyCode, propertyName, unitId: unit.id, unitName, date, type: 'turnover',
          sourceReservationId: departingRes.id, departureReservationId: departingRes.id, nextReservationId: arrivingRes.id,
          departureTime: departingRes.departure || null, nextArrivalTime: arrivingRes.arrival || null,
          guestName: guestName(departingRes), nextGuestName: guestName(arrivingRes),
          guestCount: guestCount(arrivingRes), comment: reservationComment(arrivingRes),
          doubleupTypes: doubleup?.types || [], followingArrivalDate: null,
          forced: false, nights: null, condition: conditionNow,
          hasLateCheckout, hasEarlyCheckin,
          bookedDepartureTime: hasLateCheckout ? EXTRA_TIME : STANDARD_DEPARTURE_TIME,
          bookedArrivalTime: hasEarlyCheckin ? EXTRA_TIME : STANDARD_ARRIVAL_TIME,
          // Punkt 4: strikt getrennt - reservationInfo IMMER von departingRes, nextReservationInfo
          // IMMER von arrivingRes, nie vermischt.
          reservationInfo: reservationSummary(departingRes), nextReservationInfo: reservationSummary(arrivingRes),
        });
        continue;
      }

      if (departingRes) {
        const nextArrival = unitReservations
          .filter((r) => { const a = dateOnly(r.arrival); return !!a && a > date; })
          .sort((a, b) => (dateOnly(a.arrival) as string).localeCompare(dateOnly(b.arrival) as string))[0];
        const hasLateCheckout = hasBookedService(departingRes, 'LCO');
        tasks.push({
          id: taskId(propertyCode, unit.id, date, 'departure', departingRes.id),
          propertyId: propertyCode, propertyCode, propertyName, unitId: unit.id, unitName, date, type: 'departure',
          sourceReservationId: departingRes.id, departureReservationId: departingRes.id, nextReservationId: null,
          departureTime: departingRes.departure || null, nextArrivalTime: null,
          guestName: guestName(departingRes), nextGuestName: '',
          guestCount: guestCount(departingRes), comment: reservationComment(departingRes),
          doubleupTypes: doubleup?.types || [], followingArrivalDate: nextArrival ? dateOnly(nextArrival.arrival) : null,
          forced: false, nights: null, condition: conditionNow,
          hasLateCheckout, hasEarlyCheckin: false,
          bookedDepartureTime: hasLateCheckout ? EXTRA_TIME : STANDARD_DEPARTURE_TIME,
          bookedArrivalTime: null,
          reservationInfo: reservationSummary(departingRes), nextReservationInfo: null,
        });
        continue;
      }

      const occupiedRes = unitReservations.find((r) => {
        const arr = dateOnly(r.arrival);
        const dep = dateOnly(r.departure);
        return !!arr && !!dep && arr <= date && date < dep;
      });

      if (occupiedRes) {
        const arrivalDate = dateOnly(occupiedRes.arrival) as string;
        const nights = nightsSince(arrivalDate, date);
        const departsNextDay = unitReservations.some((r) => dateOnly(r.departure) === addDaysISO(date, 1));
        const meetsNightsRule = nights >= FORCED_CLEAN_INTERVAL_NIGHTS && nights % FORCED_CLEAN_INTERVAL_NIGHTS === 0 && !departsNextDay;
        // Heute: bestehende Regel exakt (inkl. echtem Apaleo-Zustand). Zukunft: Zustand nicht
        // vorhersagbar, siehe Datei-Kommentar oben - nur die deterministische Bedingung zaehlt.
        const forced = isToday ? conditionNow === 'Dirty' && meetsNightsRule : meetsNightsRule;
        if (forced) {
          tasks.push({
            id: taskId(propertyCode, unit.id, date, 'stayover', occupiedRes.id),
            propertyId: propertyCode, propertyCode, propertyName, unitId: unit.id, unitName, date, type: 'stayover',
            sourceReservationId: occupiedRes.id, departureReservationId: null, nextReservationId: null,
            departureTime: null, nextArrivalTime: null,
            guestName: guestName(occupiedRes), nextGuestName: '',
            guestCount: guestCount(occupiedRes), comment: reservationComment(occupiedRes),
            doubleupTypes: doubleup?.types || [], followingArrivalDate: null,
            forced: true, nights, condition: conditionNow,
            hasLateCheckout: false, hasEarlyCheckin: false,
            bookedDepartureTime: STANDARD_DEPARTURE_TIME, bookedArrivalTime: null,
            reservationInfo: reservationSummary(occupiedRes), nextReservationInfo: null,
          });
          continue;
        }
      }

      // EXTRA (Punkt 6): Zusatzausstattung ohne begleitende Reinigung an diesem Tag. Doubleups
      // sind nicht datiert (siehe api/doubleups.js - aktueller Zustand, keine Datumsdimension),
      // daher nur fuer HEUTE sinnvoll als eigener Task ableitbar; an allen anderen Tagen haengt
      // die Zusatzausstattung (falls die Buchung dann noch/wieder aktuell ist) ohnehin an einem
      // der obigen Tasks (doubleupTypes-Feld), sofern an dem Tag eine Reinigung ansteht.
      if (isToday && doubleup?.types?.length) {
        tasks.push({
          id: taskId(propertyCode, unit.id, date, 'extra', null),
          propertyId: propertyCode, propertyCode, propertyName, unitId: unit.id, unitName, date, type: 'extra',
          sourceReservationId: null, departureReservationId: null, nextReservationId: null,
          departureTime: null, nextArrivalTime: null,
          guestName: '', nextGuestName: '', guestCount: null, comment: doubleup.note || '',
          doubleupTypes: doubleup.types, followingArrivalDate: null,
          forced: false, nights: null, condition: conditionNow,
          hasLateCheckout: false, hasEarlyCheckin: false,
          bookedDepartureTime: STANDARD_DEPARTURE_TIME, bookedArrivalTime: null,
          reservationInfo: null, nextReservationInfo: null,
        });
      }
    }
  }

  return tasks;
}

const TYPE_TIER: Record<TaskType, number> = { turnover: 0, departure: 1, stayover: 2, extra: 3 };

export interface ResolvedTask extends Task {
  status: TaskStatus;
  assignedUserId: string | null;
  assignedUserName: string | null;
  cleaningStartedAt: number | null;
  elapsedSeconds: number;
  completedAt: number | null;
  history: TaskHistoryEntry[];
  /** Aktiver manueller Override (Prioritaet 1) - `null`, wenn keiner gesetzt ist. */
  timeOverride: TaskTimeOverride | null;
  /** Operative Abreise-/Anreisezeit NACH Anwendung der vollen Prioritaetskette (1: Override, 2:
   * gebuchtes Extra, 3: Standard), Format "HH:MM". effectiveArrivalTime ist nur bei
   * type==='turnover' gesetzt. */
  effectiveDepartureTime: string;
  effectiveArrivalTime: string | null;
  /** true, wenn GENAU diese Seite manuell ueberschrieben wurde (fuer die "Geaenderte Zeit"-
   * Kennzeichnung, Punkt 9/14). */
  departureOverridden: boolean;
  arrivalOverridden: boolean;
  /** Reinigungsfenster in Minuten (effectiveArrivalTime - effectiveDepartureTime), nur bei
   * type==='turnover' gesetzt - negativ/0 bedeutet ein kritisches/nicht vorhandenes Fenster
   * (Punkt 15). */
  cleaningWindowMinutes: number | null;
  /** Kritischer Turnover (Punkt 4/15): das TATSAECHLICHE operative Fenster (nach Override) ist
   * <= 0 Minuten - deckt sowohl den gebuchten LCO+ECI-Fall (13:00->13:00) als auch einen durch
   * einen Override versehentlich erzeugten Konflikt ab, ohne die beiden Faelle separat pflegen zu
   * muessen. */
  timeConflict: boolean;
}

/** Fuehrt die rein aus Apaleo abgeleiteten Tasks mit dem persistierten Zuweisungs-/
 * Fortschrittszustand UND dem manuellen Zeiten-Override aus Redis zusammen - analog zu
 * buildRooms(), das assignments[key] in jedes abgeleitete Room-Objekt mischt. */
export function resolveTasks(
  tasks: Task[],
  assignments: TaskAssignmentsState,
  overrides: TaskTimeOverridesState,
  now: number,
): ResolvedTask[] {
  return tasks.map((task) => {
    const a = assignments[task.id];
    const override = overrides[task.id] || null;
    const effectiveDepartureTime = override?.departureTime || task.bookedDepartureTime;
    const effectiveArrivalTime = task.type === 'turnover' ? (override?.arrivalTime || task.bookedArrivalTime) : null;
    const cleaningWindowMinutes = task.type === 'turnover' && effectiveArrivalTime
      ? timeToMinutes(effectiveArrivalTime) - timeToMinutes(effectiveDepartureTime)
      : null;
    const timeMeta = {
      timeOverride: override,
      effectiveDepartureTime,
      effectiveArrivalTime,
      departureOverridden: !!override?.departureTime,
      arrivalOverridden: !!override?.arrivalTime,
      cleaningWindowMinutes,
      timeConflict: cleaningWindowMinutes !== null && cleaningWindowMinutes <= 0,
    };
    if (!a) {
      return {
        ...task, ...timeMeta, status: 'open', assignedUserId: null, assignedUserName: null,
        cleaningStartedAt: null, elapsedSeconds: 0, completedAt: null, history: [],
      };
    }
    const elapsed = (a.elapsedSeconds || 0) + (a.cleaningStartedAt ? Math.round((now - a.cleaningStartedAt) / 1000) : 0);
    return {
      ...task, ...timeMeta, status: a.status, assignedUserId: a.housekeeperId, assignedUserName: a.housekeeperName,
      cleaningStartedAt: a.cleaningStartedAt, elapsedSeconds: elapsed, completedAt: a.completedAt || null,
      history: a.history || [],
    };
  });
}

/** Priorisierung innerhalb eines Tages - kombiniert den Bearbeitungsstatus (Punkt "Sortierung
 * innerhalb eines Tages": kritische Turnovers/Zeitkonflikte zuerst, dann laufend, pausiert,
 * offen/zugewiesen, zuletzt fertig) mit der bestehenden Typ-/Zeitpriorisierung (Punkt 9/15): 1)
 * Turnover, 2) Departure mit bekannter naher Folgeanreise, 3) sonstige Departures, 4)
 * Stayover/Extra - und darunter nach der EFFEKTIVEN Anreisezeit (ein ECI-Turnover um 13:00 kommt
 * vor einem regulaeren um 16:00). Ein abgeschlossener kritischer Turnover gilt nicht mehr als
 * dringend und sinkt wie jede andere fertige Aufgabe ans Ende. */
export function sortTasksForDay(tasks: ResolvedTask[]): ResolvedTask[] {
  function statusTier(t: ResolvedTask): number {
    if (t.status === 'completed') return 5;
    if (t.timeConflict) return 1;
    if (t.status === 'in_progress') return 2;
    if (t.status === 'paused') return 3;
    return 4;
  }
  function typeTier(t: ResolvedTask): number {
    if (t.type === 'departure' && t.followingArrivalDate) return 1;
    return TYPE_TIER[t.type];
  }
  function arrivalMinutes(t: ResolvedTask): number {
    return t.type === 'turnover' && t.effectiveArrivalTime ? timeToMinutes(t.effectiveArrivalTime) : Number.MAX_SAFE_INTEGER;
  }
  return tasks.slice().sort((a, b) => {
    const st = statusTier(a) - statusTier(b);
    if (st !== 0) return st;
    const tt = typeTier(a) - typeTier(b);
    if (tt !== 0) return tt;
    const am = arrivalMinutes(a) - arrivalMinutes(b);
    if (am !== 0) return am;
    if (a.propertyCode !== b.propertyCode) return a.propertyCode.localeCompare(b.propertyCode);
    return a.unitName.localeCompare(b.unitName, undefined, { numeric: true });
  });
}

export function daySummary(date: string, tasks: ResolvedTask[]): DaySummary {
  const dayTasks = tasks.filter((t) => t.date === date);
  return {
    date,
    total: dayTasks.length,
    assigned: dayTasks.filter((t) => t.status === 'assigned').length,
    open: dayTasks.filter((t) => t.status === 'open').length,
    inProgress: dayTasks.filter((t) => t.status === 'in_progress').length,
    paused: dayTasks.filter((t) => t.status === 'paused').length,
    completed: dayTasks.filter((t) => t.status === 'completed').length,
    turnover: dayTasks.filter((t) => t.type === 'turnover').length,
  };
}

/** Team-/Kapazitaetsuebersicht (Punkt 12): Anzahl Aufgaben je Housekeeper an diesem Tag, plus
 * "Nicht zugewiesen" als letzter Eintrag (housekeeperId: null). */
export function capacityForDay(date: string, tasks: ResolvedTask[]): CapacityEntry[] {
  const dayTasks = tasks.filter((t) => t.date === date);
  const map = new Map<string, CapacityEntry>();
  let unassigned = 0;
  for (const t of dayTasks) {
    if (!t.assignedUserId) { unassigned += 1; continue; }
    const existing = map.get(t.assignedUserId);
    if (existing) existing.count += 1;
    else map.set(t.assignedUserId, { housekeeperId: t.assignedUserId, housekeeperName: t.assignedUserName || '', count: 1 });
  }
  const list = Array.from(map.values()).sort((a, b) => b.count - a.count);
  if (unassigned > 0) list.push({ housekeeperId: null, housekeeperName: '', count: unassigned });
  return list;
}

/** Kein Inspektions-Schritt in diesem Betrieb (fachliche Klarstellung) - eine abgeschlossene
 * Reinigung ist direkt fertig, der Apaleo-Unit-Status wird direkt auf "Clean" gesetzt statt ueber
 * einen Zwischenzustand "CleanToBeInspected". Zentral an einer Stelle statt verstreut - eine
 * spaetere Property-spezifische Wiedereinfuehrung koennte hier ansetzen, ohne Aufrufstellen
 * anzufassen. */
export function requiresInspection(_propertyCode: string): boolean {
  return false;
}
