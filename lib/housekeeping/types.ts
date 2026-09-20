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
  /**
   * Standortverantwortlich fuer diese Property-Codes - IMMER eine Teilmenge von `properties`
   * (server- und clientseitig durchgesetzt, siehe lib/housekeeping/permissions.ts). Keine eigene
   * Rolle: ein housekeeping-User mit managedProperties bleibt gleichzeitig normale
   * Reinigungskraft und ist nur fuer genau diese Standorte zusaetzlich Standortverantwortlicher
   * (kann dort Aufgaben anderer einsehen/zuweisen). Admin hat implizit alle Rechte ueberall,
   * unabhaengig von diesem Feld.
   */
  managedProperties?: string[];
  /** Bevorzugte Sprache (Punkt 17, Team-Verwaltung) - wird bei erfolgreichem Login angewendet
   * (siehe useHousekeepingApp.ts#afterLogin), unabhaengig von der zuvor auf diesem Geraet per
   * Sprachauswahl-Pille gesetzten hk_lang. */
  lang?: 'de' | 'en' | 'pl' | 'ro';
  /** Fuer Team-Verwaltung (Punkt 17) - deaktivierte Benutzer koennen sich nicht mehr anmelden
   * (siehe lib/server/auth.ts#loginUser/verifyLogin). */
  active?: boolean;
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
  /** Nur gesetzt, wenn ueber loadUnitsForProperties() (mehrere Properties gebuendelt) geladen -
   * die bestehende einzelne loadUnits(propertyCode) braucht das nicht, dort ist die Property
   * durch den Aufrufkontext ohnehin bekannt. */
  property?: { id?: string; code?: string; name?: string };
}

export interface ApaleoReservation {
  id: string;
  unit?: { id?: string; code?: string };
  /** Nur bei mehreren Properties gebuendelt geladenen Reservierungen gesetzt (siehe ApaleoUnit). */
  property?: { id?: string; code?: string; name?: string };
  arrival?: string;
  departure?: string;
  comment?: string;
  booker?: { comment?: string };
  primaryGuest?: { firstName?: string; lastName?: string };
  adults?: number;
  childrenAges?: number[];
  status?: string;
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

/**
 * Reinigungsauftrag als zentrale Planungs-Entitaet (Punkt 4): eindeutig ueber
 * Property+Unit+Datum+Typ+ausloesende Reservierung, NICHT dauerhaft ueber Property+Zimmer -
 * dasselbe Apartment kann an verschiedenen Tagen unterschiedliche Tasks/Zuweisungen haben.
 * Rein aus Apaleo abgeleitet (deterministische ID, siehe lib/housekeeping/tasks.ts#taskId) -
 * traegt selbst keinen Zuweisungs-/Fortschrittszustand, der liegt getrennt in
 * TaskAssignment (Redis, siehe lib/housekeeping/api.ts#taskAssignmentsApi).
 */
export type TaskType = 'turnover' | 'departure' | 'stayover' | 'extra';

export interface Task {
  /** Deterministisch, siehe lib/housekeeping/tasks.ts#taskId - bei jedem Reload identisch. */
  id: string;
  propertyId: string;
  propertyCode: string;
  propertyName: string;
  unitId: string;
  unitName: string;
  /** ISO yyyy-mm-dd - der Tag, fuer den dieser Auftrag geplant ist. */
  date: string;
  type: TaskType;
  /** Reservierung, aus der dieser Task abgeleitet wurde (Abreise fuer turnover/departure, die
   * aktuelle Belegung fuer stayover). */
  sourceReservationId: string | null;
  departureReservationId: string | null;
  /** Folgereservierung bei Turnover - das Apartment wird fuer DIESEN Gast vorbereitet. */
  nextReservationId: string | null;
  departureTime: string | null;
  nextArrivalTime: string | null;
  /** Name des abreisenden Gasts (Kontext, z. B. Zeile "Bleiber"/Departure-Karten). */
  guestName: string;
  /** Name des ankommenden Gasts bei Turnover - fuer den wird vorbereitet. */
  nextGuestName: string;
  /** Gaesteanzahl der jeweils relevanten Reservierung (Folgereservierung bei Turnover, sonst
   * aktuelle/abreisende). */
  guestCount: number | null;
  /** Kommentar/Sonderwunsch der jeweils relevanten Reservierung - bei Turnover bewusst der der
   * FOLGEreservierung (Punkt 8), da fuer diesen Gast vorbereitet wird. */
  comment: string;
  /** Zusatzausstattung (Babybett/Schlafsofa/Hund/Extra) - aus der bestehenden Doubleup-Logik
   * uebernommen (lib/housekeeping/api.ts#DOUBLEUP_TYPES), nicht parallel neu erfunden. */
  doubleupTypes: string[];
  /** Naechste geplante Anreise nach dieser Abreise, falls keine Same-Day-Folgereservierung
   * (fuer die "Naechste Anreise: 23.09."-Zeile bei einfachen Abreisen). */
  followingArrivalDate: string | null;
  /** Zwangsreinigung (bestehende Regel, siehe lib/housekeeping/rooms.ts#buildRooms) - nur bei
   * type==='stayover' relevant. */
  forced: boolean;
  nights: number | null;
  /** Aktueller Apaleo-Zimmerzustand (Snapshot) - rein informativ, siehe Punkt 23: Apaleo-
   * Zustand und unser Task-Status sind bewusst getrennt. */
  condition: string;
}

export type TaskStatus = 'open' | 'assigned' | 'in_progress' | 'inspection' | 'completed';

/**
 * Persistierter Zuweisungs-/Fortschrittszustand eines Tasks (Redis, Key = Task-ID) - Gegenstueck
 * zum alten, property+zimmer-permanenten Assignment. `status` ist UNSER operativer Workflow,
 * unabhaengig vom Apaleo Unit Condition (Punkt 23).
 */
export interface TaskAssignment {
  taskId: string;
  housekeeperId: string;
  housekeeperName: string;
  since: number;
  status: TaskStatus;
  cleaningStartedAt: number | null;
  elapsedSeconds: number;
  completedAt?: number;
}

export type TaskAssignmentsState = Record<string, TaskAssignment | null>;

/** Planungshorizont Heute+3 (Punkt 2) - ein Eintrag pro Kalendertag. */
export interface PlanningDay {
  date: string;
  label: 'today' | 'tomorrow' | 'plus2' | 'plus3';
}

export interface DaySummary {
  date: string;
  total: number;
  assigned: number;
  open: number;
  completed: number;
  turnover: number;
}

export interface CapacityEntry {
  housekeeperId: string | null;
  housekeeperName: string;
  count: number;
}

/** Feingranulare Workflow-Status aus Housekeeper-Sicht (rein abgeleitete Anzeigeschicht -
 * aendert nichts an room.condition/forced/running, siehe lib/housekeeping/rooms.ts). */
export type WorkflowStatus = 'locked' | 'forced' | 'inspect' | 'done' | 'running' | 'paused' | 'assigned' | 'open';
