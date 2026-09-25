/**
 * Domain-Typen fuer den echten (Apaleo-/Redis-gestuetzten) Housekeeping-Betrieb - Gegenstueck
 * zu lib/types.ts, das nur fuer den fruehen UI-Prototyp mit Beispieldaten galt. Die Formen
 * hier spiegeln 1:1, was app.js bisher berechnet/verwendet hat (siehe buildRooms()).
 */

/**
 * Briefing "Team-/Benutzerverwaltung ueberarbeiten": DREI Rollen statt zwei.
 * `location_manager` (Standortverantwortlicher) ist jetzt ein EIGENER Rollenwert (vorher eine
 * reine Ableitung aus `managedProperties` auf einem `housekeeping`-User) - Teamleader bleibt
 * bewusst KEINE eigene Rolle, sondern eine Eigenschaft einer einzelnen Teammitgliedschaft (siehe
 * StaffUser.teamMemberships unten). Legacy-Datensaetze mit dem frueheren Wert `'housekeeping'`
 * (und dem noch aelteren, nie mehr geschriebenen `'housekeeper'`) bleiben gueltig - siehe
 * api/_users.js#normalizeRole, das jeden Nicht-Admin/Nicht-location_manager-Wert kompatibel auf
 * `'housekeeper'` abbildet.
 */
export type Role = 'admin' | 'location_manager' | 'housekeeper';

/** Eine einzelne Teammitgliedschaft mit optionalem Teamleader-Status (Briefing "Teamleader ist
 * eine Eigenschaft einer Teammitgliedschaft, keine eigene Rolle") - ein User kann Mitglied
 * mehrerer Teams gleichzeitig sein, in jedem davon unabhaengig Teamleader oder nicht. */
export interface TeamMembership {
  teamId: string;
  isLeader: boolean;
}

export interface StaffUser {
  id: string;
  username: string;
  name: string;
  email?: string;
  role: Role;
  /** 'alle' | 'all' = Zugriff auf alle Haeuser, sonst Liste von Property-Codes. Fuer
   * `location_manager` identisch mit `managedProperties` (ein Standortverantwortlicher sieht nur
   * seine eigenen Standorte, siehe UserFormSheet.tsx) - fuer `housekeeper` weiterhin die generelle
   * Sichtbarkeit (typischerweise 'alle' oder die Standorte seines Arbeitgebers). */
  properties: 'alle' | 'all' | string[];
  /**
   * Standortverantwortlich fuer diese Property-Codes - IMMER eine Teilmenge von `properties`
   * (server- und clientseitig durchgesetzt, siehe lib/housekeeping/permissions.ts). Bei
   * `role: 'location_manager'` ist dies die eigentliche Standort-Zustaendigkeit (dem Zielmodell-
   * Feld `propertyIds` entsprechend); bei `role: 'housekeeper'`/`'admin'` bleibt das Feld leer.
   * Admin hat implizit alle Rechte ueberall, unabhaengig von diesem Feld.
   */
  managedProperties?: string[];
  /**
   * Reinigungsteam-Mitgliedschaften (Briefing "Team-/Benutzerverwaltung ueberarbeiten") - ein User
   * kann Mitglied MEHRERER Teams gleichzeitig sein (Ersatz fuer die fruehere, auf ein einzelnes
   * Team begrenzte `housekeepingTeamId`/`teamRole`-Kombination). `isLeader` ist ausschliesslich
   * eine Eigenschaft DIESER Mitgliedschaft, niemals eine globale Eigenschaft des Users oder eine
   * eigene Rolle. Bewusst getrennt von `managedProperties`/`role==='location_manager'`
   * (Standortverantwortung = operative UNIQUE-PLACES-Zustaendigkeit fuer ein Property; Teamleader =
   * interne Disposition INNERHALB der eigenen Reinigungsfirma) - beide Zustaendigkeiten duerfen
   * sich nie vermischen. Fehlt dieses Feld auf einem aelteren Datensatz, wird es aus den
   * Legacy-Feldern `housekeepingTeamId`/`teamRole` synthetisiert (siehe
   * lib/housekeeping/permissions.ts#getTeamMemberships) - kein destruktiver Migrationsschritt
   * noetig.
   */
  teamMemberships?: TeamMembership[];
  /** @deprecated Vor der Mehrfach-Team-Unterstuetzung einzige Teamzugehoerigkeit eines Users -
   * wird nicht mehr neu geschrieben, aeltere Datensaetze werden weiterhin ueber
   * getTeamMemberships() gelesen (siehe teamMemberships-Kommentar oben). */
  housekeepingTeamId?: string;
  /** @deprecated siehe housekeepingTeamId. */
  teamRole?: 'member' | 'lead';
  /** Bevorzugte Sprache (Punkt 17, Team-Verwaltung) - wird bei erfolgreichem Login angewendet
   * (siehe useHousekeepingApp.ts#afterLogin), unabhaengig von der zuvor auf diesem Geraet per
   * Sprachauswahl-Pille gesetzten hk_lang. */
  lang?: 'de' | 'en' | 'pl' | 'ro';
  /** Fuer Team-Verwaltung (Punkt 17) - deaktivierte Benutzer koennen sich nicht mehr anmelden
   * (siehe lib/server/auth.ts#loginUser/verifyLogin), bestehende Sessions werden serverseitig
   * zusaetzlich sofort invalidiert (siehe api/_auth.js#invalidateUserSessions). */
  active?: boolean;
  /** Briefing "Einladungssystem": Lebenszyklus-Status unabhaengig von `active` - `invited` heisst
   * "Account existiert noch nicht, Einladung steht aus" (kein Login moeglich, kein passwordHash
   * gesetzt), `active`/`inactive` entsprechen `active: true|false`. Rein informativ fuer die
   * Anzeige (siehe status()-Ableitung in TeamScreen.tsx) - die tatsaechliche Login-Sperre bleibt
   * weiterhin `active === false` bzw. das Fehlen eines passwordHash. */
  status?: 'invited' | 'active' | 'inactive';
  firstName?: string;
  lastName?: string;
}

/**
 * Reinigungsfirma/Team (Housekeeping Teams) - reine Stammdaten, lebt ausschliesslich in dieser
 * App (Redis housekeeping:teams), NIE in Apaleo. Mitgliedschaft/Rolle liegt auf StaffUser
 * (teamMemberships), NICHT hier - so bleibt die bestehende Mitarbeiterverwaltung
 * (api/users.js/TeamScreen.tsx/UserFormSheet.tsx) die einzige Quelle der Wahrheit fuer Personen.
 */
export interface HousekeepingTeam {
  id: string;
  name: string;
  active: boolean;
  /** Briefing "Team-/Benutzerverwaltung ueberarbeiten": Standorte, denen dieses Team zugeordnet
   * ist - rein informativ/scoping (z. B. welche Standorte ein Teamleader bei einer Einladung
   * auswaehlen darf, siehe api/invitations.js), NICHT dasselbe wie
   * housekeeping:team_property_defaults (das bestimmt automatische Task-Zuordnung und bleibt
   * unveraendert). Fehlt bei aelteren Teams (`undefined`/`[]`) - wird von Admin nachgetragen. */
  propertyIds?: string[];
}

/** Briefing "Einladungssystem": sicherer, einmal verwendbarer Einladungs-Datensatz (Redis
 * housekeeping:invitations, Key = Invitation-Id) - der eigentliche Token wird NIE im Klartext
 * gespeichert, nur sein SHA-256-Hash (siehe api/_invitations.js). */
export interface Invitation {
  id: string;
  email: string;
  role: Role;
  propertyIds: string[];
  teamId: string | null;
  isLeader: boolean;
  lang: 'de' | 'en' | 'pl' | 'ro';
  invitedBy: string;
  invitedByName: string;
  createdAt: number;
  expiresAt: number;
  status: 'pending' | 'accepted' | 'revoked';
  acceptedAt?: number;
  userId?: string;
}

export type InvitationsState = Record<string, Invitation>;

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
  /** Bereits eingecheckt (Apaleo `status === 'InHouse'`, live verifiziert gegen die bestehenden
   * Reservierungsabfragen - siehe api.ts#loadReservations "status=InHouse,Confirmed,CheckedOut" -
   * andere live vorkommende Werte sind 'Confirmed' (noch nicht eingecheckt) und 'CheckedOut'
   * (bereits ausgecheckt); NIEMALS mit unserem eigenen Task-`status` verwechseln, siehe Punkt 23).
   * Rein informativ fuer die "✓ Eingecheckt"-Anzeige bei Turnover (Punkt "Buchungsaenderung
   * korrigieren") - fliesst bewusst NICHT in die Buchungsaenderungs-Erkennung ein
   * (api/booking-changes.js vergleicht weiterhin nur Anreise/Abreise/Einheit/Personenanzahl). */
  checkedIn: boolean;
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
  /** Automatische Uebersetzung von `manualDescription` (Briefing "automatische Uebersetzung frei
   * eingegebener operativer Texte") - 1:1 aus ManualTask.descriptionTranslation uebernommen. */
  manualDescriptionTranslation?: FreeTextTranslation;
  /** 1:1 aus ManualTask.extraEquipment uebernommen (Briefing "BABY-Business-Logik") - siehe dort. */
  extraEquipment?: ManualTask['extraEquipment'];
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
  /** Chronologischer Verlauf (abschliessen/wieder aktivieren) - additiv, analog zu
   * TaskAssignment.history. Aeltere Datensaetze ohne dieses Feld werden ueber die bestehenden
   * skalaren completedAt/completedByUserId/completedByUserName-Felder rekonstruiert (siehe
   * tasks.ts#manualTaskToResolvedTask), NIE ueberschrieben. */
  history?: TaskHistoryEntry[];
  /** Automatische Uebersetzung von `description` (Briefing "automatische Uebersetzung frei
   * eingegebener operativer Texte") - additiv, `description` bleibt unveraendert die Quelle der
   * Wahrheit. Fehlt bei aelteren, vor diesem Feature erstellten Aufgaben. */
  descriptionTranslation?: FreeTextTranslation;
  /** Briefing "BABY-Business-Logik" Punkt 3C/4/6: NUR bei einer automatisch aus einem gebuchten
   * Apaleo-Service erzeugten Aufgabe gesetzt (aktuell ausschliesslich `serviceCode: 'BABY'`, siehe
   * tasks.ts#computeExtraEquipmentNeeds) - fehlt bei jeder admin-erstellten Aufgabe. Traegt die
   * Herkunft (welche Reservierung/welcher Service hat die Aufgabe ausgeloest) fuer die
   * deterministische ID (api/manual-tasks.js#extraEquipmentTaskId) und den erneuten Sync-Abgleich
   * (Punkt 5 "keine Doppelaufgaben"/Punkt 8 "sauber entfernen, wenn BABY wieder storniert wird"),
   * OHNE eine zweite, parallele Task-Engine zu sein - die Aufgabe selbst bleibt ein ganz normaler
   * ManualTask (gleiche Felder/gleicher Workflow wie jede andere Aufgabe). */
  extraEquipment?: {
    category: 'extra_equipment';
    serviceCode: 'BABY';
    reservationId: string;
    /** "HH:MM" - Anreisezeit unter Beruecksichtigung von Early Check-in (Punkt 6), fuer die
     * Anzeige "Anreise HH:MM" auf der Aufgabenkarte/-detailansicht. */
    dueTime: string;
  };
}

export type ManualTasksState = Record<string, ManualTask | null>;

/**
 * Housekeeping-relevante Aenderung EINER Apaleo-Reservierung (Punkt "Buchungsaenderung sichtbar
 * machen") - Redis housekeeping:booking_change_snapshots (Baseline je reservationId) +
 * housekeeping:booking_changes (dieser Datensatz, letzte erkannte Aenderung je reservationId).
 * Nur die vier housekeeping-relevanten Felder (Anreise/Abreise/Einheit/Personenanzahl) werden
 * verglichen - jedes andere Reservierungsfeld wird ignoriert (Punkt "nur housekeeping-relevante
 * Aenderungen loggen"). Nur die JEWEILS zuletzt erkannte Aenderung wird gehalten (kein volles Log
 * noetig). Jedes *From/*To-Paar erscheint NUR, wenn sich genau dieses Feld tatsaechlich geaendert
 * hat (siehe api/booking-changes.js) - ein Paar mit identischen Werten wird serverseitig nie
 * geschrieben und zusaetzlich defensiv beim Lesen herausgefiltert (Schutz vor evtl. bereits
 * bestehenden Alt-Datensaetzen, ohne Redis-Daten zu loeschen).
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
  /** Erwachsene/Kinder getrennt (Nutzerfeedback: konkrete Deltas wie "2 Erw. · 1 Kind ->
   * 3 Erw. · 1 Kind" statt einer reinen Gesamtzahl) - beide Seiten (adultsFrom/-To bzw.
   * childrenFrom/-To) werden gemeinsam geschrieben, sobald SICH EINE der beiden geaendert hat,
   * damit die Detailansicht immer die volle Belegung beider Zeitpunkte zeigen kann, nicht nur das
   * einzelne geaenderte Teilfeld. `null`, wenn die jeweilige Zahl zu diesem Zeitpunkt nicht bekannt
   * war (kein "0" bei fehlenden Rohdaten). */
  adultsFrom?: number | null;
  adultsTo?: number | null;
  childrenFrom?: number | null;
  childrenTo?: number | null;
}

export type BookingChangeRecordsState = Record<string, BookingChangeRecord | null>;

export type TaskStatus = 'open' | 'assigned' | 'in_progress' | 'paused' | 'inspection' | 'completed';

/** Ein Eintrag im Reinigungsverlauf (Punkt "Reinigungsverlauf") - wird an denselben
 * TaskAssignment-Datensatz angehaengt, auf dem `status`/`cleaningStartedAt`/`elapsedSeconds`
 * bereits liegen (KEIN zweiter, paralleler Speicherort). `action` ist bewusst ereignisbezogen
 * ("started" vs. "resumed") statt nur den Status zu spiegeln, damit die Verlaufszeile ohne
 * weitere Herleitung exakt den geforderten Text ("Reinigung gestartet" vs. "Fortgesetzt") tragen
 * kann. */
export type TaskHistoryAction = 'started' | 'paused' | 'resumed' | 'completed' | 'reopened' | 'restarted' | 'unassigned';

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
  /** Briefing "Vorbereitung als Checkliste": erledigte Vorbereitungspunkte DIESES Tasks, Key = die
   * jeweilige DoubleupTypeDef-Id ('crib'/'sofabed'/'dog'/'extra', siehe lib/housekeeping/api.ts#
   * DOUBLEUP_TYPES) - additiv auf demselben TaskAssignment-Datensatz statt einer zweiten,
   * parallelen Redis-Struktur (derselbe Grundsatz wie bei `history`). Ein NICHT vorhandener
   * Eintrag bedeutet "noch offen"; es gibt bewusst keinen expliziten `completed: false`-Zustand -
   * ein Zuruecknehmen loescht den Eintrag einfach wieder (kein Bedarf, den Verlauf einer
   * Rueckgaengigmachung aufzuheben). */
  preparationCompletions?: PreparationCompletionsState;
}

export type TaskAssignmentsState = Record<string, TaskAssignment | null>;

/** EIN erledigter Vorbereitungspunkt (Briefing "Vorbereitung als Checkliste") - `itemId` ist die
 * DoubleupTypeDef-Id (aktuell 'crib'/'sofabed'/'dog'/'extra'), bewusst dieselbe Kennung wie beim
 * bestehenden manuellen Vorbereitungs-Flag (doubleupTypes) statt einer zweiten Taxonomie. Wer/wann
 * wird gespeichert (Punkt 10 "Berechtigungen und Audit"), aber housekeeper-seitig nicht prominent
 * angezeigt - nur Admin/Standortverantwortliche sehen es bei Bedarf. */
export interface PreparationCompletion {
  itemId: string;
  completedByUserId: string;
  completedByUserName: string;
  completedAt: number;
}

/** Key = itemId (DoubleupTypeDef-Id), EINGEBETTET auf TaskAssignment.preparationCompletions -
 * NICHT als eigener top-level Redis-Key/State (keine parallele Datenhaltung). */
export type PreparationCompletionsState = Record<string, PreparationCompletion>;

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

/** Ein Eintrag im Verschiebungsverlauf EINES TaskScheduleOverride (Punkt "Aenderungshistorie") -
 * liegt, analog zu TaskAssignment.history, direkt EINGEBETTET auf dem jeweiligen Override-Datensatz
 * statt in einer zweiten, globalen Audit-Struktur (Punkt "keine zweite Audit-Architektur"). */
export interface TaskScheduleHistoryEntry {
  from: string;
  to: string;
  changedBy: string;
  changedByName: string;
  changedAt: number;
}

/**
 * Manueller Admin-Override des GEPLANTEN Housekeeping-Tags EINES Tasks (Redis
 * housekeeping:task_schedule_overrides, Key = Task-ID) - komplett analog zu TaskTimeOverride, nur
 * fuer das Datum statt die Uhrzeit. Trennt sauber zwei Datumsbegriffe (Briefing Punkt 1):
 * `Task.date`/`ManualTask.date` bleiben das aus Apaleo abgeleitete bzw. urspruenglich gewaehlte
 * Quelldatum (NIE ueberschrieben) - `scheduledDate` hier ist der davon unabhaengige, tatsaechlich
 * geplante Reinigungs-/Aufgabentag. `propertyCode` wird serverseitig aus einer VERTRAUENSWUERDIGEN
 * Quelle ermittelt (Task-ID selbst bei Apaleo-abgeleiteten Tasks, sonst der bestehende
 * housekeeping:manual_tasks-Datensatz) und hier zusaetzlich gespeichert, weil eine manuelle
 * Aufgaben-ID (siehe api/manual-tasks.js: "manual_<ts>_<rand>") die Property anders als eine
 * Reinigungs-Task-ID NICHT selbst kodiert (siehe api/_permissions.js#propertyCodeFromTaskId-
 * Kommentar) - exakt dasselbe Muster wie bei BookingChangeRecord.propertyCode
 * (api/booking-changes.js), aus demselben Grund.
 *
 * `originalScheduledDate` ist das Quelldatum VOR der ALLERERSTEN Verschiebung und bleibt ueber
 * beliebig viele weitere Verschiebungen hinweg unveraendert (Briefing Punkt 3) - wird der Task
 * jemals wieder auf sein Quelldatum zurueckgestellt, wird der gesamte Override-Datensatz geloescht
 * (siehe api/task-schedule-overrides.js), ein erneutes Verschieben beginnt dann wieder frisch.
 */
export interface TaskScheduleOverride {
  taskId: string;
  propertyCode: string;
  scheduledDate: string;
  originalScheduledDate: string;
  changedBy: string;
  changedByName: string;
  changedAt: number;
  history: TaskScheduleHistoryEntry[];
}

export type TaskScheduleOverridesState = Record<string, TaskScheduleOverride | null>;

/**
 * Automatische Uebersetzung EINES frei eingegebenen operativen Textes (Briefing "automatische
 * Uebersetzung frei eingegebener operativer Texte") - additiv an TaskNotice/ManualTask angehaengt,
 * NIEMALS ein Ersatz fuer das jeweilige Quellfeld (text/description). `sourceText` ist eine
 * bewusste Kopie des Quelltextes zum Zeitpunkt der Uebersetzung (Punkt 2: "Originaltext MUSS immer
 * unveraendert gespeichert bleiben") - so bleibt "Original anzeigen" (Punkt 9) auch dann korrekt,
 * wenn das Quellfeld selbst spaeter durch eine erneute Bearbeitung ueberschrieben wird, ohne dass
 * die alte Uebersetzung dafuer extra aufgehoben werden muesste. `translations`/`translationStatus`
 * enthalten hoechstens die drei jeweils NICHT der Quellsprache entsprechenden Zielsprachen (Punkt
 * 4). Ein Fehlschlag einer einzelnen Sprache (`translationStatus[lang] === 'failed'`) blockiert nie
 * das Speichern des Quelltexts (Punkt 12) - Anzeige faellt dann auf `sourceText` zurueck.
 */
export type FreeTextLanguage = 'de' | 'en' | 'pl' | 'ro';

export interface FreeTextTranslation {
  sourceLanguage: FreeTextLanguage;
  sourceText: string;
  translations: Partial<Record<FreeTextLanguage, string>>;
  translationStatus: Partial<Record<FreeTextLanguage, 'ready' | 'failed'>>;
  translatedAt: number;
}

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
  /** Automatische Uebersetzung von `text` (Briefing "automatische Uebersetzung frei eingegebener
   * operativer Texte") - additiv, `text` bleibt unveraendert die einzige Quelle der Wahrheit.
   * Fehlt bei aelteren, vor diesem Feature erstellten Hinweisen (siehe FreeTextTranslation). */
  translation?: FreeTextTranslation;
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

/**
 * Briefing "Reinigungskarten ueberarbeiten" Punkt 5: haelt fest, dass GENAU dieser User die
 * Detailansicht DIESES Tasks tatsaechlich geoeffnet hat (Redis housekeeping:task_seen, Key =
 * "<taskId>|<userId>") - bewusst technisch GETRENNT von TaskNoticeAck/BookingChangeAck (Punkt 8:
 * "gesehen und zur Kenntnis genommen nicht vermischen"), da "gesehen" rein die Detailansicht
 * betrifft und mit keiner der beiden Bestaetigungs-Semantiken identisch ist. Wird NIE beim
 * blossen Laden/Scrollen der Aufgabenliste gesetzt, ausschliesslich beim tatsaechlichen Oeffnen
 * (siehe TaskDetailSheet.tsx). Vom GET-Endpoint bereits auf den eingeloggten User gefiltert
 * zurueckgegeben - der Client sieht deshalb nie den "gesehen"-Status anderer Benutzer.
 */
export interface TaskSeenRecord {
  taskId: string;
  userId: string;
  at: number;
}

/** Key = Task-ID (bereits userbezogen gefiltert vom Server, siehe api/task-views.js). */
export type TaskSeenState = Record<string, TaskSeenRecord | null>;

/**
 * Briefing "Reinigungskarten ueberarbeiten" Punkt 7/8: eigene, von TaskSeenRecord GETRENNTE
 * Bestaetigung "Buchungsänderung zur Kenntnis genommen" (Redis
 * housekeeping:task_booking_change_acks, Key = "<taskId>|<userId>") - `changedAt` verankert die
 * Bestaetigung an EXAKT die zum Zeitpunkt der Bestaetigung gueltige Aenderung (identisches Muster
 * wie TaskNoticeAck.noticeVersion): tritt DANACH eine neue, andere Buchungsaenderung ein (neues
 * `BookingChangeRecord.changedAt`), gilt die alte Bestaetigung automatisch nicht mehr, ohne dass
 * der Server aktiv etwas loeschen muesste - ein reiner Zeitstempelvergleich genuegt.
 */
export interface BookingChangeAck {
  taskId: string;
  userId: string;
  changedAt: number;
  ackedAt: number;
}

/** Key = Task-ID (bereits userbezogen gefiltert vom Server, siehe api/task-views.js). */
export type BookingChangeAcksState = Record<string, BookingChangeAck | null>;

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
/**
 * Eine Zeile einer Wäschereklamation (Briefing "Wäschereklamation erfassen") - bewusst eine
 * eigene, schlankere Form als LinenReportLine (keine estimatedQuantity, die hat bei einer
 * Reklamation keine Bedeutung). Wie bei LinenReportLine wird `itemName`/`unit` als Snapshot
 * mitgespeichert (Punkt "Traceability"), damit ein Bericht auch nach einer spaeteren
 * Umbenennung/Deaktivierung des Artikels verstaendlich bleibt. Nur Artikel mit `quantity > 0`
 * werden je gespeichert (siehe api/task-assignments.js#complete) - kein Eintrag mit Menge 0.
 */
export interface LinenComplaintLine {
  itemId: string;
  itemName: string;
  unit: string;
  quantity: number;
}

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
  /**
   * Wäschereklamation (Briefing "Wäschereklamation erfassen") - LOGISCH UND NUMERISCH GETRENNT
   * von `linenItems` (regulärer Verbrauch): eine reklamierte Menge fließt NIE in die
   * Verbrauchssumme ein und umgekehrt, auch wenn derselbe Artikel in beiden Listen vorkommt
   * (z. B. 3 Handtücher verbraucht, davon 1 zusätzlich reklamiert - nicht "2 verbraucht"). Immer
   * ein Array (leer, wenn keine Reklamation erfasst wurde) - optional nur fuer aeltere, vor
   * diesem Feature entstandene Datensaetze ohne dieses Feld.
   */
  laundryComplaints?: LinenComplaintLine[];
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
