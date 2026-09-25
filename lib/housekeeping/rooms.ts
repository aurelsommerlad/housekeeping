/**
 * Zimmer-/Statistik-Berechnung - 1:1 aus app.js#buildRooms/statsFor uebernommen (gleiche
 * Feldnamen, gleiche Zwangsreinigungs-/Turnover-Logik), nur um rein additive, abgeleitete
 * Anzeige-Felder fuers Redesign ergaenzt (arrivesTodayFlag/stayover/WorkflowStatus). Es wird
 * an der eigentlichen Bedingung/Berechnung nichts geaendert.
 */
import { FORCED_CLEAN_INTERVAL_NIGHTS } from './api';
import type {
  ApaleoReservation, ApaleoUnit, AssignmentsState, Completion, DoubleupsState, ReservationsState, Room, StaffUser, WorkflowStatus,
} from './types';

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function addDaysISO(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function dateOnly(dtStr?: string): string | null {
  if (!dtStr) return null;
  return String(dtStr).slice(0, 10);
}
function nightsSince(arrivalIso: string, refIso: string): number {
  const a = new Date(`${arrivalIso}T00:00:00`);
  const r = new Date(`${refIso}T00:00:00`);
  return Math.round((r.getTime() - a.getTime()) / 86400000);
}

export function formatDuration(seconds: number): string {
  seconds = Math.max(0, Math.round(seconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function roomKey(propertyCode: string, roomNumber: string): string {
  return `${propertyCode}_${roomNumber}`;
}

/** 1:1 aus buildRooms() extrahiert (reiner Refactor, keine Verhaltensaenderung) - jetzt auch von
 * lib/housekeeping/tasks.ts wiederverwendet, damit beide denselben Apaleo-Unit-Condition-Zugriff
 * teilen statt ihn zweimal separat nachzubilden.
 *
 * Bugfix (Nutzerfeedback "alle Apartments stehen auf Fertig"): las bisher das nie existierende
 * Top-Level-Feld `u.condition` - live gegen den echten Account verifiziert liegt der Zustand
 * tatsaechlich unter `u.status.condition` (siehe types.ts#ApaleoUnit). Der Lesefehler fiel nie
 * als Absturz auf, sondern liess JEDE Einheit auf den 'Clean'-Default zurueckfallen - unabhaengig
 * vom echten PMS-Zustand. */
export function unitCondition(u: ApaleoUnit): string {
  return u.status?.condition || 'Clean';
}

export function allowedProperties(user: StaffUser | null, propertyCodes: string[]): string[] {
  if (!user) return [];
  if (user.properties === 'alle' || user.properties === 'all') return propertyCodes;
  return Array.isArray(user.properties) ? user.properties : [];
}

export interface BuildRoomsInput {
  activeProperty: string;
  units: ApaleoUnit[];
  reservations: ReservationsState;
  assignments: AssignmentsState;
  doubleups: DoubleupsState;
  now: number;
}

export function buildRooms({ activeProperty, units, reservations, assignments, doubleups, now }: BuildRoomsInput): Room[] {
  const today = todayISO();
  const byUnit: Record<string, ApaleoReservation> = {};
  for (const r of reservations.inHouse) {
    const uid = r.unit && (r.unit.id || r.unit.code);
    if (uid) byUnit[uid] = r;
  }
  const departsToday = new Set(reservations.departToday.map((r) => r.unit && (r.unit.id || r.unit.code)).filter(Boolean) as string[]);
  const departsTomorrow = new Set(reservations.departTomorrow.map((r) => r.unit && (r.unit.id || r.unit.code)).filter(Boolean) as string[]);
  const arrivesTodayMap: Record<string, ApaleoReservation> = {};
  for (const r of reservations.arriveToday) {
    const uid = r.unit && (r.unit.id || r.unit.code);
    if (uid) arrivesTodayMap[uid] = r;
  }

  return units
    .map((u): Room => {
      const number = u.name || u.id || u.unitGroup?.name || '?';
      const key = roomKey(activeProperty, number);
      const condition = unitCondition(u);
      const currentRes = byUnit[u.id];
      const occupied = !!currentRes;
      const departsTodayFlag = departsToday.has(u.id);
      const departsTomorrowFlag = departsTomorrow.has(u.id);
      const arrivesTodayRes = arrivesTodayMap[u.id];
      const arrivesTodayFlag = !!arrivesTodayRes;

      let nights: number | null = null;
      if (currentRes?.arrival) nights = nightsSince(dateOnly(currentRes.arrival) as string, today);

      const forced = condition === 'Dirty' && occupied && nights !== null && nights >= FORCED_CLEAN_INTERVAL_NIGHTS &&
        nights % FORCED_CLEAN_INTERVAL_NIGHTS === 0 && !departsTodayFlag && !departsTomorrowFlag;

      const assignment = assignments[key] || null;
      const doubleup = doubleups[key] || null;
      const running = !!(assignment && assignment.cleaningStartedAt);
      const elapsed = assignment
        ? (assignment.elapsedSeconds || 0) + (running ? Math.round((now - (assignment.cleaningStartedAt as number)) / 1000) : 0)
        : 0;

      let comment = '';
      if (departsTodayFlag && arrivesTodayRes) comment = arrivesTodayRes.comment || arrivesTodayRes.booker?.comment || '';
      else if (currentRes) comment = currentRes.comment || '';

      return {
        key, unitId: u.id, number: String(number), condition,
        occupied, currentRes, departsTodayFlag, departsTomorrowFlag, arrivesTodayRes,
        arrivesTodayFlag, stayover: occupied && !departsTodayFlag && !arrivesTodayFlag,
        nights, forced, assignment, doubleup, running, elapsed, comment,
        guestName: currentRes
          ? [currentRes.primaryGuest?.firstName, currentRes.primaryGuest?.lastName].filter(Boolean).join(' ')
          : '',
      };
    })
    .sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));
}

/** Grober PMS-Zustand (fuer bestehende Filter/Regeln) - unveraendert wie roomStatusClass zuvor. */
export function roomConditionClass(room: Room): 'locked' | 'forced' | 'running' | 'inspect' | 'dirty' | 'clean' {
  if (room.condition === 'OutOfService' || room.condition === 'OutOfOrder') return 'locked';
  if (room.forced) return 'forced';
  if (room.running) return 'running';
  if (room.condition === 'CleanToBeInspected') return 'inspect';
  if (room.condition === 'Dirty') return 'dirty';
  return 'clean';
}

/**
 * Feingranularer Workflow-Status aus Housekeeper-Sicht fuers Redesign (Briefing: Offen /
 * Zugewiesen / In Reinigung / Pause / Fertig). Rein abgeleitet aus den bestehenden Feldern -
 * aendert nichts an room.condition/forced/running/assignment selbst.
 */
export function workflowStatus(room: Room): WorkflowStatus {
  if (room.condition === 'OutOfService' || room.condition === 'OutOfOrder') return 'locked';
  if (room.condition === 'CleanToBeInspected') return 'inspect';
  if (room.condition === 'Clean') return 'done';
  if (room.forced) return 'forced';
  if (room.running) return 'running';
  if (room.assignment && (room.assignment.elapsedSeconds || 0) > 0) return 'paused';
  if (room.assignment) return 'assigned';
  return 'open';
}

export interface StatsResult {
  count: number;
  avg: number;
  fastest: number;
  list: Completion[];
}

export function statsFor(completions: Completion[], activeProperty: string, range: 'today' | 'month' | 'year'): StatsResult {
  const now = new Date();
  const list = completions.filter((c) => c.property === activeProperty && c.type === 'clean');
  const filtered = list.filter((c) => {
    const d = new Date(c.finishedAt);
    if (range === 'today') return d.toDateString() === now.toDateString();
    if (range === 'month') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    return d.getFullYear() === now.getFullYear();
  });
  const durations = filtered.map((c) => c.durationSeconds).filter((s) => s > 0);
  const avg = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
  const fastest = durations.length ? Math.min(...durations) : 0;
  return { count: filtered.length, avg, fastest, list: filtered };
}
