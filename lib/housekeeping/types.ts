/**
 * Domain-Typen fuer den echten (Apaleo-/Redis-gestuetzten) Housekeeping-Betrieb - Gegenstueck
 * zu lib/types.ts, das nur fuer den fruehen UI-Prototyp mit Beispieldaten galt. Die Formen
 * hier spiegeln 1:1, was app.js bisher berechnet/verwendet hat (siehe buildRooms()).
 */

export type Role = 'admin' | 'housekeeping';

export interface StaffUser {
  id: string;
  username: string;
  name: string;
  email?: string;
  role: Role;
  /** 'alle' | 'all' = Zugriff auf alle Haeuser, sonst Liste von Property-Codes. */
  properties: 'alle' | 'all' | string[];
}

export interface Property {
  code: string;
  name: string;
}

export interface ApaleoUnit {
  id: string;
  name?: string;
  condition?: string | { cleaningStatus?: string };
  unitGroup?: { name?: string };
}

export interface ApaleoReservation {
  id: string;
  unit?: { id?: string; code?: string };
  arrival?: string;
  departure?: string;
  comment?: string;
  booker?: { comment?: string };
  primaryGuest?: { firstName?: string; lastName?: string };
}

export interface ReservationsState {
  inHouse: ApaleoReservation[];
  departToday: ApaleoReservation[];
  departTomorrow: ApaleoReservation[];
  arriveToday: ApaleoReservation[];
}

export interface Assignment {
  housekeeperId: string;
  housekeeperName: string;
  since?: number;
  cleaningStartedAt: number | null;
  elapsedSeconds: number;
}

export type AssignmentsState = Record<string, Assignment | null>;

export interface Doubleup {
  types: string[];
  note?: string;
  updatedAt?: number;
}

export type DoubleupsState = Record<string, Doubleup | null>;

export interface Completion {
  id: string;
  property: string;
  room: string;
  housekeeperId: string;
  housekeeperName: string;
  type: 'clean' | 'doubleup';
  startedAt?: number | null;
  finishedAt: number;
  durationSeconds: number;
}

export interface BreakEntry {
  housekeeperId: string;
  housekeeperName: string;
  start: number;
  end: number | null;
  durationSeconds: number;
}

/** Ergebnis von buildRooms() - 1:1 Feldnamen wie zuvor in app.js, plus rein additive,
 * abgeleitete Anzeige-Felder fuer das Redesign (arrivesTodayFlag/stayover/workflowStatus). */
export interface Room {
  key: string;
  unitId: string;
  number: string;
  condition: string;
  occupied: boolean;
  currentRes?: ApaleoReservation;
  departsTodayFlag: boolean;
  departsTomorrowFlag: boolean;
  arrivesTodayRes?: ApaleoReservation;
  /** Neu (rein additiv): fuer die Turnover-Zeile im Redesign. */
  arrivesTodayFlag: boolean;
  stayover: boolean;
  nights: number | null;
  forced: boolean;
  assignment: Assignment | null;
  doubleup: Doubleup | null;
  running: boolean;
  elapsed: number;
  comment: string;
  guestName: string;
}

export type RoomFilter = 'all' | 'forced' | 'dirty' | 'inspect' | 'clean' | 'doubleup';

/** Feingranulare Workflow-Status aus Housekeeper-Sicht (rein abgeleitete Anzeigeschicht -
 * aendert nichts an room.condition/forced/running, siehe lib/housekeeping/rooms.ts). */
export type WorkflowStatus = 'locked' | 'forced' | 'inspect' | 'done' | 'running' | 'paused' | 'assigned' | 'open';
