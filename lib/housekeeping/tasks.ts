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
  ApaleoReservation, ApaleoUnit, CapacityEntry, DaySummary, DoubleupsState, Task, TaskAssignmentsState, TaskStatus, TaskType,
} from './types';

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
        tasks.push({
          id: taskId(propertyCode, unit.id, date, 'turnover', departingRes.id),
          propertyId: propertyCode, propertyCode, propertyName, unitId: unit.id, unitName, date, type: 'turnover',
          sourceReservationId: departingRes.id, departureReservationId: departingRes.id, nextReservationId: arrivingRes.id,
          departureTime: departingRes.departure || null, nextArrivalTime: arrivingRes.arrival || null,
          guestName: guestName(departingRes), nextGuestName: guestName(arrivingRes),
          guestCount: guestCount(arrivingRes), comment: reservationComment(arrivingRes),
          doubleupTypes: doubleup?.types || [], followingArrivalDate: null,
          forced: false, nights: null, condition: conditionNow,
        });
        continue;
      }

      if (departingRes) {
        const nextArrival = unitReservations
          .filter((r) => { const a = dateOnly(r.arrival); return !!a && a > date; })
          .sort((a, b) => (dateOnly(a.arrival) as string).localeCompare(dateOnly(b.arrival) as string))[0];
        tasks.push({
          id: taskId(propertyCode, unit.id, date, 'departure', departingRes.id),
          propertyId: propertyCode, propertyCode, propertyName, unitId: unit.id, unitName, date, type: 'departure',
          sourceReservationId: departingRes.id, departureReservationId: departingRes.id, nextReservationId: null,
          departureTime: departingRes.departure || null, nextArrivalTime: null,
          guestName: guestName(departingRes), nextGuestName: '',
          guestCount: guestCount(departingRes), comment: reservationComment(departingRes),
          doubleupTypes: doubleup?.types || [], followingArrivalDate: nextArrival ? dateOnly(nextArrival.arrival) : null,
          forced: false, nights: null, condition: conditionNow,
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
        });
      }
    }
  }

  return tasks;
}

const TYPE_TIER: Record<TaskType, number> = { turnover: 0, departure: 1, stayover: 2, extra: 3 };

/** Priorisierung innerhalb eines Tages (Punkt 9) - bewusst simple, deterministische Regeln statt
 * KI-Priorisierung: 1) Turnover, 2) Departure mit bekannter naher Folgeanreise, 3) sonstige
 * Departures, 4) Stayover/Extra. */
export function sortTasksForDay<T extends Task>(tasks: T[]): T[] {
  function tier(t: Task): number {
    if (t.type === 'departure' && t.followingArrivalDate) return 1;
    return TYPE_TIER[t.type];
  }
  return tasks.slice().sort((a, b) => {
    const diff = tier(a) - tier(b);
    if (diff !== 0) return diff;
    if (a.propertyCode !== b.propertyCode) return a.propertyCode.localeCompare(b.propertyCode);
    return a.unitName.localeCompare(b.unitName, undefined, { numeric: true });
  });
}

export interface ResolvedTask extends Task {
  status: TaskStatus;
  assignedUserId: string | null;
  assignedUserName: string | null;
  cleaningStartedAt: number | null;
  elapsedSeconds: number;
}

/** Fuehrt die rein aus Apaleo abgeleiteten Tasks mit dem persistierten Zuweisungs-/
 * Fortschrittszustand aus Redis zusammen - analog zu buildRooms(), das assignments[key] in jedes
 * abgeleitete Room-Objekt mischt. */
export function resolveTasks(tasks: Task[], assignments: TaskAssignmentsState, now: number): ResolvedTask[] {
  return tasks.map((task) => {
    const a = assignments[task.id];
    if (!a) {
      return { ...task, status: 'open', assignedUserId: null, assignedUserName: null, cleaningStartedAt: null, elapsedSeconds: 0 };
    }
    const elapsed = (a.elapsedSeconds || 0) + (a.cleaningStartedAt ? Math.round((now - a.cleaningStartedAt) / 1000) : 0);
    return {
      ...task, status: a.status, assignedUserId: a.housekeeperId, assignedUserName: a.housekeeperName,
      cleaningStartedAt: a.cleaningStartedAt, elapsedSeconds: elapsed,
    };
  });
}

export function daySummary(date: string, tasks: ResolvedTask[]): DaySummary {
  const dayTasks = tasks.filter((t) => t.date === date);
  return {
    date,
    total: dayTasks.length,
    assigned: dayTasks.filter((t) => t.status !== 'open').length,
    open: dayTasks.filter((t) => t.status === 'open').length,
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

/** Punkt 24: Inspektion bleibt fachlich unveraendert (immer erforderlich), aber zentral an einer
 * Stelle statt verstreut - eine spaetere Property-spezifische Konfiguration kann hier ansetzen,
 * ohne Aufrufstellen anzufassen. */
export function requiresInspection(_propertyCode: string): boolean {
  return true;
}
