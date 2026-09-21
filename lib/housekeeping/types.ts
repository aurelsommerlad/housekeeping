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
  /**
   * Reinigungsfirmen-Zugehoerigkeit (Housekeeping Teams) - bewusst KEINE Erweiterung von `role`
   * (bleibt exakt 'admin' | 'housekeeping') und bewusst getrennt von `managedProperties`
   * (Standortverantwortung = operative UNIQUE-PLACES-Zustaendigkeit fuer ein Property; teamRole
   * 'lead' = interne Disposition INNERHALB der eigenen Reinigungsfirma - beide Rechte duerfen
   * sich nie vermischen, ein User kann beides, eins von beiden oder keins haben). Ein User ist zu
   * jedem Zeitpunkt Mitglied HOECHSTENS EINES Teams. `teamRole` ist nur gueltig, wenn
   * `housekeepingTeamId` gesetzt ist (serverseitig durchgesetzt, siehe api/_users.js).
   */
  housekeepingTeamId?: string;
  /** 'member' = normales Teammitglied, 'lead' = Team-Verantwortlicher (bleibt global weiterhin
   * `role: 'housekeeping'`, siehe housekeepingTeamId-Kommentar). */
  teamRole?: 'member' | 'lead';
  /** Bevorzugte Sprache (Punkt 17, Team-Verwaltung) - wird bei erfolgreichem Login angewendet
   * (siehe useHousekeepingApp.ts#afterLogin), unabhaengig von der zuvor auf diesem Geraet per
   * Sprachauswahl-Pille gesetzten hk_lang. */
  lang?: 'de' | 'en' | 'pl' | 'ro';
  /** Fuer Team-Verwaltung (Punkt 17) - deaktivierte Benutzer koennen sich nicht mehr anmelden
   * (siehe lib/server/auth.ts#loginUser/verifyLogin). */
  active?: boolean;
}

/**
 * Reinigungsfirma/Team (Housekeeping Teams) - reine Stammdaten, lebt ausschliesslich in dieser
 * App (Redis housekeeping:teams), NIE in Apaleo. Mitgliedschaft/Rolle liegt auf StaffUser
 * (housekeepingTeamId/teamRole), NICHT hier - so bleibt die bestehende Mitarbeiterverwaltung
 * (api/users.js/TeamScreen.tsx/UserFormSheet.tsx) die einzige Quelle der Wahrheit fuer Personen.
 */
export interface HousekeepingTeam {
  id: string;
  name: string;
  active: boolean;
}

/**
 * Manuelle Ausnahme von der Standard-Team-Zuweisung EINES konkreten Tasks (Redis
 * housekeeping:task_team_overrides, Key = Task-ID) - analog zu TaskTimeOverride. Fehlt ein
 * Eintrag fuer eine Task-ID, gilt das ueber TeamPropertyDefaultsState konfigurierte Standard-Team
 * der Property (siehe lib/housekeeping/tasks.ts#resolveTasks). `teamId: null` ist ein
 * ausdruecklicher "kein Team"-Override (unterscheidet sich von "kein Override vorhanden" - dort
 * greift weiterhin der Property-Standard). NIE nach Apaleo geschrieben.
 */
export interface TaskTeamOverride {
  taskId: string;
  teamId: string | null;
  teamName: string;
  changedBy: string;
  changedByName: string;
  changedAt: number;
}

export type TaskTeamOverridesState = Record<string, TaskTeamOverride | null>;

/** Konfiguriertes Standard-Team je Property (Redis housekeeping:team_property_defaults, Key =
 * Property-Code, Wert = Team-Id) - ausschliesslich housekeeping-intern, wird NIE nach Apaleo
 * geschrieben (siehe Briefing "Housekeeping Teams"). Neue Reinigungsauftraege dieser Property
 * werden ohne weiteres Zutun diesem Team zugeordnet (siehe resolveTasks). */
export type TeamPropertyDefaultsState = Record<string, string>;

/** Team-Ebene der Team-/Kapazitaetsuebersicht (Punkt "Team-Auslastung") - `perPerson` verwendet
 * dieselbe CapacityEntry-Form wie die bestehende personenbezogene Uebersicht, nur je Team
 * gruppiert statt property-/tagesweit ueber alle Personen hinweg. `teamId: null` buendelt alle
 * Aufgaben ohne jede Team-Zuordnung (Properties ohne konfiguriertes Standard-Team). */
export interface TeamCapacityEntry {
  teamId: string | null;
  teamName: string;
  total: number;
  perPerson: CapacityEntry[];
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
  /** `dates[].serviceDate` (live gegen den echten Account verifiziert, `expand=services` liefert
   * dieses Feld bereits mit, siehe Punkt 12 der Feinschliff-Analyse) - das tatsaechliche
   * Leistungsdatum JEDER gebuchten Instanz dieses Service, z. B. mehrere Eintraege bei einem ueber
   * mehrere Tage gebuchten INTERCLEAN. Fehlt bei Services, die nicht datumsgenau gebucht sind. */
  services?: { service?: { id?: string; code?: string; name?: string }; dates?: { serviceDate?: string }[] }[];
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
export type TaskType = 'turnover' | 'departure' | 'stayover' | 'extra' | 'manual';

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
  /** Tatsaechlich in Apaleo gebuchte Hund-/Babybett-Zusatzleistung DIESER Reservierung
   * (service.code === 'HUND'/'BABY', live gegen alle vier Properties verifiziert - siehe
   * tasks.ts#hasBookedService). Bewusst getrennt von `Task.doubleupTypes` (der manuell in
   * Housekeeping gesetzten Vorbereitung) - beide Datenquellen duerfen sich nie vermischen oder
   * gegenseitig ueberschreiben (Punkt "gebucht vs. manuell"). */
  hasDog: boolean;
  hasCrib: boolean;
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
  /** NUR bei type==='manual' gesetzt (Punkt "Admin-Aufgabe") - Titel/Beschreibung der manuell
   * erstellten Aufgabe. Bewusst NICHT ueber `comment`/`guestName` mitgefuehrt, da diese Felder an
   * anderer Stelle als "Gaestekommentar" beschriftet angezeigt werden - eine manuelle Aufgabe hat
   * fachlich weder Gast noch Reservierung. */
  manualTitle?: string;
  manualDescription?: string;
  /** Housekeeping-relevante Aenderung der zugrundeliegenden Apaleo-Reservierung seit dem letzten
   * bekannten Stand (Punkt "Buchungsaenderung sichtbar machen") - `null`, wenn keine relevante
   * Aenderung bekannt ist oder der Task keine eigene Reservierung hat (manual/extra). Wird beim
   * Zusammenfuehren in resolveTasks() aus dem separat gespeicherten housekeeping:*-Snapshot-
   * Vergleich ergaenzt (siehe tasks.ts#applyBookingChanges), NIE aus Apaleo selbst berechnet (Apaleo
   * liefert nur den aktuellen Stand, siehe types.ts#BookingChangeRecord). */
  bookingChange: BookingChangeRecord | null;
}

/**
 * Manuell von Admin erstellte, operative Aufgabe (Punkt "Admin kann Aufgaben erstellen") - KEIN
 * Apaleo-Bezug, KEIN Reinigungs-Workflow (kein Timer/Start/Pause), Redis housekeeping:manual_tasks,
 * Key = eigene stabile ID (siehe api/_manual-tasks.js). Bewusst nicht in TaskType 'extra'
 * hineingebogen - 'extra' bleibt die bestehende, tagesbezogene Doubleup-Ableitung (siehe
 * lib/housekeeping/tasks.ts#buildTasks), waehrend eine manuelle Aufgabe Titel/Beschreibung/Datum
 * traegt und ueber beliebig viele Tage hinweg bestehen bleibt, bis sie erledigt wird.
 */
export type ManualTaskStatus = 'open' | 'completed';

export interface ManualTask {
  id: string;
  propertyCode: string;
  propertyName: string;
  /** `null` = standortweite Aufgabe ohne bestimmtes Apartment (Punkt 2 "Apartment optional"). */
  unitId: string | null;
  unitName: string | null;
  date: string;
  title: string;
  description: string;
  assignedUserId: string | null;
  assignedUserName: string | null;
  status: ManualTaskStatus;
  createdByUserId: string;
  createdByUserName: string;
  createdAt: number;
  completedByUserId?: string;
  completedByUserName?: string;
  completedAt?: number;
}

export type ManualTasksState = Record<string, ManualTask | null>;

/**
 * Housekeeping-relevante Aenderung EINER Apaleo-Reservierung (Punkt "Buchungsaenderung sichtbar
 * machen") - Redis housekeeping:booking_change_snapshots (Baseline je reservationId) +
 * housekeeping:booking_changes (dieser Datensatz, letzte erkannte Aenderung je reservationId).
 * Nur die drei housekeeping-relevanten Felder (Anreise/Abreise/Einheit) werden verglichen - jedes
 * andere Reservierungsfeld wird ignoriert (Punkt "nur housekeeping-relevante Aenderungen
 * loggen"). Nur die JEWEILS zuletzt erkannte Aenderung wird gehalten (kein volles Log noetig).
 */
export interface BookingChangeRecord {
  reservationId: string;
  changedAt: number;
  arrivalFrom?: string;
  arrivalTo?: string;
  departureFrom?: string;
  departureTo?: string;
  unitFrom?: string;
  unitTo?: string;
}

export type BookingChangeRecordsState = Record<string, BookingChangeRecord | null>;

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

/**
 * Housekeeping-Vorfall (Briefing "Vorfall melden") - Redis housekeeping:incidents, Key = Incident-
 * Id. `status` ist bewusst breiter typisiert als der aktuell einzig erzeugte Wert 'reported'
 * (Punkt 13 "Vorbereitung fuer spaeter": eine spaetere Admin-Uebersicht kann den Status direkt
 * auf 'in_progress'/'done' setzen, ohne Datenmodell/Typen aendern zu muessen). `propertyId`/
 * `unitId`/`reservationId`/`taskType`/`taskDate` sind ausschliesslich serverseitig aus der taskId
 * geparst (siehe api/_permissions.js), NIEMALS vom Client uebernommen - `propertyName`/`unitName`
 * sind reine, nicht sicherheitsrelevante Anzeigefelder (siehe api/_incidents.js-Kommentar).
 */
export type IncidentStatus = 'reported' | 'open' | 'in_progress' | 'done';
export type SlackDeliveryStatus = 'pending' | 'sent' | 'failed' | 'skipped';

export interface HousekeepingIncident {
  id: string;
  taskId: string;
  propertyId: string;
  unitId: string;
  reservationId: string | null;
  reportedByUserId: string;
  reportedByUserName: string;
  housekeepingTeamId: string | null;
  housekeepingTeamName: string | null;
  description: string;
  /** Max. 5 (Punkt 5), bereits vor dem Upload client-seitig komprimiert - Vercel-Blob-URLs, nie
   * Base64/Binaerdaten. */
  photoUrls: string[];
  createdAt: number;
  status: IncidentStatus;
  propertyName: string;
  unitName: string;
  taskType: TaskType;
  taskTypeLabel: string;
  taskDate: string;
  /** Getrennt von der Speicherung behandelt (Punkt 11) - 'skipped', wenn keine Slack-Webhook-URL
   * konfiguriert ist, 'failed' bei einem tatsaechlichen Zustellfehler. Die App zeigt in beiden
   * Faellen trotzdem die normale Erfolgsbestaetigung (der Vorfall IST gespeichert, siehe Punkt 10) -
   * nur eben ohne die (dann schlicht falsche) Behauptung "Slack informiert". */
  slackDeliveryStatus: SlackDeliveryStatus;
  slackError?: string | null;
}

/**
 * Waeschverbrauch beim Reinigungsabschluss (Briefing "Waescheverbrauch erfassen") - bewusst
 * GETRENNT von Verbrauchsmaterial (ConsumableItem unten): Waesche/Bettsachen sind an eine
 * KONKRETE Reinigung/Apartment gebunden (Pflichtfeld beim Abschluss), Verbrauchsmaterial ist rein
 * standortbezogen. Beide Konzepte duerfen sich laut Briefing nie vermischen.
 *
 * `estimationRule` ist absichtlich eine einfache, geschlossene Regelmenge (keine Verbrauchs-
 * Engine) - siehe lib/housekeeping/linen.ts#estimateLinenQuantity. 'none' bzw. fehlende Daten
 * fuehren zu "Geschaetzt: -", nie zu einem erfundenen Wert.
 */
export type LinenEstimationRule =
  | { type: 'none' }
  | { type: 'perGuest'; multiplier: number }
  | { type: 'perAdult'; multiplier: number }
  | { type: 'fixed'; quantity: number };

export interface LinenItem {
  id: string;
  name: string;
  unit: string;
  active: boolean;
  /** Bestimmt die Reihenfolge im Formular/in der Verwaltung - niedrigster Wert zuerst. */
  sortOrder: number;
  propertyIds: string[];
  estimationRule?: LinenEstimationRule;
}

/** Verbrauchsmaterial (Briefing "Verbrauch melden") - KEIN estimationRule (dafuer gibt es beim
 * standortbezogenen Verbrauch keine sinnvolle Gaeste-/Reservierungsbasis), sonst dieselbe Form
 * wie LinenItem (eigene Liste, eigener Redis-Hash - siehe api/_consumables.js). */
export interface ConsumableItem {
  id: string;
  name: string;
  unit: string;
  active: boolean;
  sortOrder: number;
  propertyIds: string[];
}

/** Eine Zeile im Completion Report - `itemName`/`unit` werden bewusst als Snapshot mitgespeichert
 * (Briefing Punkt 8), damit ein spaeterer Bericht auch nach einer Umbenennung/Loeschung des
 * Artikels noch verstaendlich bleibt. `actualQuantity` ist ausschliesslich `number` (nie null) -
 * ein unvollstaendiger Report kann laut serverseitiger Validierung gar nicht erst entstehen. */
export interface LinenReportLine {
  itemId: string;
  itemName: string;
  unit: string;
  estimatedQuantity: number | null;
  actualQuantity: number;
}

/**
 * Historischer Snapshot EINES Reinigungsabschlusses (Redis housekeeping:cleaning_completion_
 * reports, Key = Report-Id) - wird ausschliesslich serverseitig UND ausschliesslich gemeinsam mit
 * dem eigentlichen `status: 'completed'`-Uebergang erzeugt (siehe api/task-assignments.js#complete,
 * "keinen zweiten parallelen Abschlussmechanismus"). `taskId` bleibt nach Ablauf des Heute+3-
 * Fensters nicht mehr auflösbar - deshalb traegt dieser Datensatz propertyId/unitId/taskType
 * bereits selbst, statt sie spaeter ueber die (dann verschwundene) Task nachzuschlagen.
 */
export interface CleaningCompletionReport {
  id: string;
  taskId: string;
  propertyId: string;
  unitId: string;
  reservationId: string | null;
  completedByUserId: string;
  completedByUserName: string;
  housekeepingTeamId: string | null;
  completedAt: number;
  linenItems: LinenReportLine[];
}

export interface ConsumableReportLine {
  itemId: string;
  itemName: string;
  unit: string;
  quantity: number;
}

/** Redis housekeeping:consumable_reports, Key = Report-Id - bewusst OHNE unitId/taskId (Briefing
 * Punkt 13: Verbrauchsmaterial ist rein standortbezogen, nie apartment-/reinigungsbezogen). */
export interface ConsumableReport {
  id: string;
  propertyId: string;
  reportedByUserId: string;
  reportedByUserName: string;
  housekeepingTeamId: string | null;
  createdAt: number;
  items: ConsumableReportLine[];
}
