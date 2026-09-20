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
  /** Wird von loadUnits()/loadUnitsForProperties() (beide ueber dieselbe paginierte Abfrage mit
   * `expand=property`) gesetzt - optional, weil aeltere Aufrufstellen/Tests das Feld nicht
   * garantieren. */
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
  /** Buchungszeitpunkt (live verifiziert: Top-Level-Feld, kein `bookingDate`/`createdAt`,
   * bereits ohne jedes `expand` in der Bulk-Abfrage vorhanden) - Quelle fuer "gebucht am". */
  created?: string;
  /** Booking-Id OHNE die Reservierungs-Sequenznummer (z. B. "WJBMFCDY" zu Reservierungs-`id`
   * "WJBMFCDY-1") - mehrere Reservierungen einer Mehrfachzimmer-Buchung teilen dieselbe
   * bookingId. Fuer die housekeeping-App ist weiterhin `id` die anzuzeigende "Buchungsnummer"
   * (matcht das bestehende Slack-Format "AUPZXZSN-1"), bookingId dient nur als interne Referenz. */
  bookingId?: string;
  /** Gebuchte Zusatzleistungen (nur gesetzt, wenn mit expand=services geladen, siehe
   * loadReservationsRangeForProperties) - Quelle fuer Early-Check-in/Late-Check-out-Erkennung
   * (service.code === 'ECI'/'LCO', live gegen Apaleo verifiziert). Bewusst ueber `code` statt `id`
   * geprueft, da `code` property-uebergreifend identisch ist ("ECI"/"LCO"), waehrend `id`
   * property-praefigiert ist (z. B. "LAEKE-LCO"). NIE anhand von `comment` erkennen (siehe
   * tasks.ts) - das Apaleo-Kommentarfeld enthaelt teils redundante/unzuverlaessige Freitext-Spuren
   * von Gaeste-Portal-Anfragen, die mit dem tatsaechlich gebuchten Service auseinanderlaufen koennen.
   */
  services?: { service?: { id?: string; code?: string; name?: string } }[];
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

/**
 * Kompakte, ausschliesslich aus echten Apaleo-Feldern abgeleitete Zusammenfassung EINER
 * Reservierung (Punkt "Reservierungsinformationen am Task") - fachliche Referenz war die
 * bestehende Slack-Reinigungsnachricht, die Felder selbst kommen aber ausschliesslich aus der
 * Apaleo-Reservierung (nie aus Freitext/Strings/Slack). Wird sowohl fuer die abreisende als auch
 * (bei Turnover) die ankommende Reservierung separat gebildet (siehe tasks.ts#reservationSummary)
 * - beide Datensaetze duerfen sich NIE vermischen (Punkt 4).
 */
export interface TaskReservationSummary {
  /** Apaleo-Reservierungs-`id` (z. B. "AUPZXZSN-1") - das ist die im Slack-Format gezeigte
   * "Buchungsnummer", NICHT die kuerzere bookingId. */
  reservationId: string;
  bookingId: string;
  /** ISO yyyy-mm-dd, aus `created` - null, falls Apaleo kein Erstellungsdatum liefert. */
  bookingDate: string | null;
  arrivalDate: string;
  departureDate: string;
  guestName: string;
  adults: number | null;
  /** Anzahl Kinder = Laenge von childAges - kein separates Apaleo-Feld dafuer. */
  childrenCount: number;
  childAges: number[];
}

/** Suchergebnis der Admin-Reservierungssuche (Punkt 5-8) - direkt aus einer live Apaleo-Suche
 * gemappt (api/reservation-search.js), NICHT aus den bereits geladenen vier Planungstagen. Traegt
 * zusaetzlich Property-/Unit-Identitaet, damit der Client pruefen kann, ob dafuer bereits ein
 * geladener Housekeeping-Task existiert (siehe ReservationSearchSheet.tsx). */
export interface ReservationSearchResult extends TaskReservationSummary {
  propertyCode: string;
  propertyName: string;
  unitId: string;
  unitName: string;
  status: string;
}

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
  /** Late Check-out auf der ABREISENDEN Reservierung gebucht (Apaleo `services[].service.code
   * === 'LCO'`, live verifiziert - NIE aus `comment` abgeleitet, siehe ApaleoReservation.services).
   * Property-uebergreifend einheitlich benannt (ALPILA/ALTUS/HUESLE/LAEKE-LCO teilen denselben
   * `code`). */
  hasLateCheckout: boolean;
  /** Early Check-in auf der ANKOMMENDEN (naechsten) Reservierung gebucht - nur bei
   * type==='turnover' ueberhaupt moeglich, da nur dort an diesem Tag eine Ankunft in genau diesem
   * Apartment stattfindet (siehe ApaleoReservation.services-Kommentar). */
  hasEarlyCheckin: boolean;
  /** Abreise-/Anreisezeit NACH Beruecksichtigung eines gebuchten Extras, aber VOR einem
   * moeglichen manuellen Admin-Override (Prioritaet 2 vor 3, siehe resolveTasks in tasks.ts fuer
   * Prioritaet 1). Format "HH:MM" (kein Datum, keine Zeitzone - rein die Uhrzeit fuer die
   * Planungsanzeige). bookedArrivalTime ist nur bei type==='turnover' gesetzt (sonst null, da an
   * allen anderen Tagen keine Ankunft in diesem Apartment stattfindet). */
  bookedDepartureTime: string;
  bookedArrivalTime: string | null;
  /** Reservierungsinformationen der fuer DIESEN Task massgeblichen Reservierung (Punkt 1-3):
   * departingRes fuer turnover/departure, occupiedRes fuer stayover, null fuer extra (keine
   * eigene Reservierung). Getrennt von `guestName`/`guestCount`/`comment` oben, die eine aeltere,
   * bewusst andere Konvention verfolgen (bei Turnover schon bisher die ANKOMMENDE Reservierung,
   * siehe Punkt 8) - dieses Feld hier ist immer eindeutig "die abreisende/aktuelle Belegung". */
  reservationInfo: TaskReservationSummary | null;
  /** NUR bei type==='turnover' gesetzt: die ankommende Folgereservierung, fuer die vorbereitet
   * wird (Punkt 4) - niemals mit reservationInfo vermischt (z. B. Babybett-Bedarf gehoert
   * eindeutig zur Anreise, nicht zur Abreise). */
  nextReservationInfo: TaskReservationSummary | null;
}

export type TaskStatus = 'open' | 'assigned' | 'in_progress' | 'paused' | 'inspection' | 'completed';

/** Ein Eintrag im Reinigungsverlauf (Punkt "Reinigungsverlauf") - wird an denselben
 * TaskAssignment-Datensatz angehaengt, auf dem `status`/`cleaningStartedAt`/`elapsedSeconds`
 * bereits liegen (KEIN zweiter, paralleler Speicherort). `action` ist bewusst ereignisbezogen
 * ("started" vs. "resumed") statt nur den Status zu spiegeln, damit die Verlaufszeile ohne
 * weitere Herleitung exakt den geforderten Text ("Reinigung gestartet" vs. "Fortgesetzt") tragen
 * kann. */
export type TaskHistoryAction = 'started' | 'paused' | 'resumed' | 'completed';

/** Nur bei 'started'/'resumed' gesetzt (Punkt "Startquelle speichern") - woher DIESER konkrete
 * Start ausgeloest wurde. Rein informativ fuer die Verlaufsanzeige, aendert nichts an Timer-/
 * Statuslogik. */
export type TaskStartSource = 'nfc' | 'manual';

export interface TaskHistoryEntry {
  action: TaskHistoryAction;
  at: number;
  byUserId: string;
  byUserName: string;
  source?: TaskStartSource;
}

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
  /** Chronologischer Reinigungsverlauf (start/pause/fortsetzen/abschluss) - additiv, aeltere
   * Eintraege ohne dieses Feld werden einfach als leerer Verlauf behandelt (siehe resolveTasks). */
  history?: TaskHistoryEntry[];
}

export type TaskAssignmentsState = Record<string, TaskAssignment | null>;

/**
 * Manueller Admin-Override der operativen Abreise-/Anreisezeit EINES Tasks (Redis
 * housekeeping:task_time_overrides, Key = Task-ID) - hoechste Prioritaetsstufe (1) vor einem
 * gebuchten Extra (2) und der Standardzeit (3), siehe tasks.ts#resolveTasks. Aendert NIEMALS die
 * zugrundeliegende Apaleo-Reservierung oder einen dort gebuchten Service (Late Check-out/Early
 * Check-in bleiben dort unangetastet und weiterhin einzeln sichtbar/nachvollziehbar) - rein ein
 * housekeeping-internes Anzeige-/Planungsfeld. Beide Zeiten sind unabhaengig voneinander optional
 * (nur Abreise, nur Anreise, oder beides ueberschrieben).
 */
export interface TaskTimeOverride {
  taskId: string;
  /** Format "HH:MM", jeweils nur gesetzt, wenn diese Seite tatsaechlich manuell ueberschrieben
   * wurde (fehlt das Feld, gilt fuer diese Seite weiterhin Prioritaet 2/3). */
  departureTime?: string;
  arrivalTime?: string;
  changedBy: string;
  changedByName: string;
  changedAt: number;
}

export type TaskTimeOverridesState = Record<string, TaskTimeOverride | null>;

/**
 * Interner "Wichtiger Hinweis" pro Task (Redis housekeeping:task_notices, Key = Task-ID) - eine
 * VOM Apaleo-Reservierungskommentar (task.comment) komplett getrennte Datenquelle: nie in die
 * Apaleo-Reservierung zurueckgeschrieben, nie von dort ueberschrieben. `id` ist bewusst identisch
 * zur (bereits deterministischen) Task-ID - ein Task hat hoechstens einen aktiven Hinweis. Jede
 * inhaltliche Aenderung erhoeht `version`; Lesebestaetigungen sind an eine EXAKTE Version
 * gekoppelt (siehe TaskNoticeAck) und werden dadurch automatisch ungueltig, sobald der Text
 * geaendert wird - kein separates "Bestaetigungen loeschen" noetig, ein reiner Versionsvergleich
 * genuegt (Server loescht alte Acks zusaetzlich aktiv, siehe api/task-notices.js, aber selbst ohne
 * das waere ein Ack mit alter Version nie mehr gueltig).
 */
export interface TaskNotice {
  id: string;
  taskId: string;
  text: string;
  version: number;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

export type TaskNoticesState = Record<string, TaskNotice | null>;

/** Lesebestaetigung EINES Users fuer EINE bestimmte Hinweis-Version (Redis
 * housekeeping:task_notice_acks, Key = "<taskId>|<userId>") - userbezogen, nie pauschal pro Task:
 * wird eine Aufgabe neu zugewiesen, gilt der Hinweis fuer die neue Person nicht automatisch als
 * gelesen (Punkt 5), da fuer sie schlicht kein Eintrag mit ihrer userId existiert. */
export interface TaskNoticeAck {
  userId: string;
  userName: string;
  noticeId: string;
  noticeVersion: number;
  acknowledgedAt: number;
}

/** Key = "<taskId>|<userId>", siehe TaskNoticeAck. */
export type TaskNoticeAcksState = Record<string, TaskNoticeAck | null>;

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
  inProgress: number;
  paused: number;
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

/**
 * NFC-Tag-Status EINES Apartments (Punkt "NFC-Verwaltung") - Admin-only, Key = "propertyCode|
 * unitId" (siehe api/_nfc.js#unitKey). Enthaelt bewusst NIE das Token selbst (weder Klartext
 * noch verschluesselt) - das wird nur bei "einrichten"/"ersetzen"/"URL kopieren"/"testen" ueber
 * eine eigene Aktion angefragt (siehe nfcApi.create/reveal in api.ts), nie in dieser Liste
 * mitgeliefert.
 */
export interface NfcTagStatus {
  active: boolean;
  createdAt: number;
  createdByName: string;
}

/** Key = "propertyCode|unitId". */
export type NfcTagStatusesState = Record<string, NfcTagStatus | undefined>;
