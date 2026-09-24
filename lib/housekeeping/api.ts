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
  ApaleoReservation, ApaleoUnit, AssignmentsState, BookingChangeAck, BookingChangeAcksState, BookingChangeRecordsState,
  DoubleupsState, Completion, BreakEntry,
  ConsumableItem, ConsumableReport, HousekeepingIncident, HousekeepingTeam, Invitation, InvitationsState, LinenItem,
  ManualTask, ManualTasksState,
  NfcTagStatusesState, Property, ReservationSearchResult, ReservationsState, Role, StaffUser, TaskAssignment,
  TaskAssignmentsState,
  TaskNotice, TaskNoticeAck, TaskNoticeAcksState, TaskNoticesState, TaskScheduleOverride, TaskScheduleOverridesState,
  TaskSeenRecord, TaskSeenState, TaskStartSource, TaskTeamOverridesState, TaskTimeOverride, TaskTimeOverridesState,
  TeamPropertyDefaultsState,
} from './types';
import type { Lang } from './i18n';
import type { ExtraEquipmentNeed } from './tasks';

// MINOR-Bump (2.5.0 -> 2.6.0): TaskCard-Redesign - klare Informationshierarchie (Apartment+Standort,
// Typ+Arbeitsstatus, Zeitfenster, Gast/Buchung+Extras) statt vieler gleichwertiger Badges/Zeilen,
// "Zugewiesen"-Badge und die doppelte Namensanzeige entfernt, Arbeitsstatus (Laeuft/Pausiert)
// ersetzt bei aktiver Reinigung die normale Zuweisungsanzeige. Reine Darstellung/Layout (siehe
// TaskCard.tsx) - Task-Ableitung/Zuweisung/Timer/Zeiten-Logik unveraendert; die kompakte Karte
// ist gegenueber 2.5.0 fuer jeden Aufgabenzustand gleich hoch oder niedriger (Playwright-
// Hoehenvergleich vor/nach der Aenderung), nie hoeher.
// MINOR-Bump (2.6.0 -> 2.7.0): TaskDetailSheet-Redesign - dieselbe Informationshierarchie wie die
// neue TaskCard statt einer langen, formularartigen Ansicht: kompakter Kopf (Typ-Badge, Zeitfenster
// prominent mit Edit-Icon statt Textlink, LCO/ECI/Konflikt/Override kompakt mit Tooltip-Detail
// statt ausgeschriebener Zusatzzeilen), eine schlichte Zuweisungszeile statt "Zugewiesen"-Badge,
// Reservierungen bei Turnover zweispaltig (Desktop/Tablet) statt hoher Tabelle, Reservierungs-
// kommentar ohne technisches "|||"-Trennzeichen (nur Darstellung, Apaleo-Originalwert unveraendert),
// aufklappbarer Reinigungsverlauf, dezenter Schliessen-Button oben rechts statt grossem Button
// unten, EIN einheitlicher Reinigungsstatus-/Primaeraktion-Block (Start/Pause/Fortsetzen/
// Abschliessen) statt zweier fast identischer Kopien fuer Admin/Housekeeper - nutzt ausschliesslich
// die bereits vorhandenen Timer-/Zuweisungs-Funktionen, jetzt auch fuer Admin/Standortverantwortliche
// sichtbar (der Server erlaubte startTimer/stopTimer/release fuer sie bereits zuvor, siehe
// api/task-assignments.js, nur die UI zeigte dafuer bislang keinen Button). Reine Darstellung -
// Task-Ableitung, Zuweisung, Timer, Pausen, NFC, Notices und Zeiten-Overrides unveraendert.
// MINOR-Bump (2.7.0 -> 2.8.0): TaskCard - Gastname+Buchungsnummer auf der kompakten Karte durch
// eine housekeeping-relevantere Belegungsanzeige ersetzt: bei Turnover strikt getrennt Abreise-
// Belegung (aus task.reservationInfo) links und Anreise-Belegung (aus task.nextReservationInfo)
// rechts, je "N Erw. · N Kinder" (abgekuerzt, ohne Gesamtzahl, ohne Kinderalter - das bleibt der
// Detailansicht vorbehalten), mit neuen IconExit/IconEnter (kein Flugzeug-Symbol, dieselbe
// Outline-Sprache). Bei reiner Abreise nur die abreisende Seite, bei Zwischenreinigung neutral
// ohne Richtungssymbol. Gastname/Buchungsnummer bleiben unveraendert vollstaendig in der
// Detailansicht und der Reservierungssuche. Reine Darstellung (siehe TaskCard.tsx) - gegen einen
// git-gestashten Vorher/Nachher-Vergleich verifiziert: die Kartenhoehe ist fuer jeden geprueften
// Zustand exakt identisch geblieben, nie hoeher.
// PATCH-Bump (2.8.0 -> 2.8.1): TaskCard - Belegungsanzeige mit kleinen "Abreise"/"Anreise"-Labels
// statt eines verbindenden Pfeils zwischen den beiden Check-out-/Check-in-Icons (die reine
// Icon-Bedeutung war ohne Beschriftung nicht eindeutig genug). Reine Darstellung (siehe
// OccupancyBlock/OccupancyLine in TaskCard.tsx) - Belegungs-Mapping/-Trennung Abreise vs. Anreise
// unveraendert. Um die durch die zusaetzliche Labelzeile noetigen ~4px auszugleichen, wurde der
// aeussere Zeilenabstand der Karte minimal reduziert (gap-2 -> gap-1.5) - gegen einen git-
// gestashten Vorher/Nachher-Vergleich verifiziert: die Kartenhoehe ist fuer jeden geprueften
// Zustand identisch oder niedriger geblieben, nie hoeher.
// MINOR-Bump (2.8.1 -> 2.9.0): TaskDetailSheet - operativer unterer Bereich neu strukturiert.
// "Zuweisen an" + "Reinigungsstatus" zu einer "Reinigung"-Zeile zusammengefuehrt (Name + kompakter
// Status auf einer Zeile, Auslastung als Subline); der Zuweisungs-Picker (unveraendert dieselbe
// Logik) ist jetzt nur noch fuer Admin/Standortverantwortlich per Klick/Chevron aufklappbar statt
// dauerhaft sichtbar. "Zusatzausstattung" in "Vorbereitung" umbenannt (nur fuer TaskDetailSheet -
// RoomDetailSheet/DoubleupScreen behalten ihre eigene Bezeichnung). Ein einzelner breiter
// "Primary Action"-Button je Status ersetzt den fruesheren Elapsed-Zeit-Block (Start/Pause+
// Abschliessen/Fortsetzen/abgeschlossen-Anzeige) - reine Button-Reorganisation, es wird
// ausschliesslich bestehende Timer-/Status-/Zuweisungslogik wiederverwendet. Der "Wichtiger
// Hinweis"-Doppel-Plus-Darstellungsfehler (Icon + textinternes "+ ") ist behoben. Der grosse
// "Schliessen"-Button am Ende wurde entfernt (Header-X/Backdrop schliessen weiterhin). Vertikale
// Abstaende zwischen den Abschnitten vereinheitlicht/reduziert. Reservierungsdaten, Zeiten,
// Turnover-Logik und der bereits ueberarbeitete obere Teil der Detailansicht sind unveraendert.
// MINOR-Bump (2.9.0 -> 2.10.0): oberer Bereich der Aufgabenplanung (Header + TasksScreen)
// kompakter, damit die erste Aufgabenkarte auf dem Smartphone moeglichst ohne Scrollen sichtbar
// ist. Header zeigt "Housekeeping" (Appname) statt der einzelnen aktiven Property - der Standort
// wird ausschliesslich ueber den Standortfilter dargestellt; Sprachauswahl aus dem Header entfernt
// (lebt bereits im Profilmenue/SettingsSheet), Pause kompakt als "[Pause]"/"[In Pause]". In
// TasksScreen: "Meine Aufgaben"/"Alle"/Standortfilter zu einer Chip-Zeile zusammengefuehrt (fuer
// Admin/Standortverantwortliche ohne "Meine Aufgaben", passend zu ihrem Alle-Standardeinstieg);
// Tagesnavigation zeigt fuer die hinteren beiden Tage konkrete Wochentag+Datum-Labels statt "+N
// Tage"; der lange Status-Aufzaehlungssatz wurde durch eine kompakte Kennzahlenzeile ersetzt
// (Werte mit 0 ausgeblendet, voller Satz bleibt fuer Screenreader erhalten); Mehrfachauswahl/
// "Zuweisungen dieses Tages aufheben" leben jetzt hinter "Auswaehlen"/"Weitere Aktionen" statt
// dauerhaft sichtbarer Buttons; Team-Auslastung ist per Default eingeklappt (kompakte
// Ein-Zeilen-Zusammenfassung) und fuer normale Housekeeper weiterhin komplett ausgeblendet.
// Zusaetzlich: der initiale "Meine Aufgaben ja/nein"-Default beruecksichtigt jetzt auch
// Standortverantwortliche ohne Admin-Rolle (managedProperties nicht leer) - sie starten wie Admin
// auf "Alle" statt auf "Meine Aufgaben". Reine Darstellungs-/Default-Aenderung im oberen Bereich -
// Task-Ermittlung, Zuweisung, Timer, Pausen, Status, NFC, Reservierungsdaten, Zeiten-Overrides,
// Extras und das Berechtigungssystem selbst sind unveraendert.
// MINOR-Bump (2.10.0 -> 2.11.0): TaskCard-Belegungszeile um gebuchte Apaleo-Extras (Hund/
// Babybett) erweitert - live gegen alle vier Properties (HUESLE/LAEKE/ALPILA/ALTUS) verifiziert:
// service.code === 'HUND'/'BABY' ist ueberall identisch. Die Services waren bereits Teil der
// bestehenden Task-Pipeline (loadReservationsRangeForProperties laedt ohnehin expand=services,
// siehe hasBookedService() fuer ECI/LCO) - keine zusaetzlichen Apaleo-Requests noetig.
// ABREISE zeigt ausschliesslich Extras der abreisenden Reservierung, ANREISE ausschliesslich die
// der ankommenden Folgereservierung (types.ts#TaskReservationSummary.hasDog/hasCrib, je einmal
// separat pro Reservierung gebildet, tasks.ts#reservationSummary) - niemals vermischt. Die
// bestehende, manuell in Housekeeping gesetzte "Vorbereitung" (task.doubleupTypes) bleibt eine
// eigene Datenquelle; TaskCard blendet dort einen Hund-/Babybett-Eintrag aus, wenn derselbe schon
// als gebuchtes Apaleo-Extra angezeigt wird, damit nie dasselbe Icon doppelt auf einer Karte
// erscheint. Rein additiv in derselben Zeile (kein neues Layout-Element) - Kartenhoehe fuer jeden
// geprueften Zustand vor/nach der Aenderung identisch (Playwright-Vergleich). Detailansicht zeigt
// zusaetzlich "Gebuchte Extras" je Reservierung als eigener, explizit gekennzeichneter Block.
// PATCH-Bump (2.11.0 -> 2.11.1): Feinschliff oberer Bereich (Header/TasksScreen) - reine
// Typografie-/Icon-Anpassungen, keine Struktur-/Logikaenderung. "Housekeeping" im Header ca. 20%
// kleiner (15px -> 12px, dieselbe bereits vorhandene Groesse wie die Sekundaerzeile darunter statt
// einer neuen). Farbige Statuspunkte in der Kennzahlenzeile durch monochrome Outline-Icons aus dem
// bestehenden Set ersetzt (IconChecklist/IconCircle/IconPlay/IconPause/IconCheck/IconLayers,
// dieselbe currentColor-/Strichstaerke-1.6-Sprache wie ueberall sonst) - Zahlen bleiben das visuell
// dominante Element. "Auswaehlen"-Button mit neuem IconCheckSquare (Checkbox-Symbol, bewusst nicht
// IconCheck wiederverwendet, das andernorts "erledigt" bedeutet). Team-Zeile mit IconUsers-Praefix
// und kompakterer Zusammenfassung (Vorname statt vollem Namen, sofern eindeutig; "N offen" statt
// "Offen N") - die aufgeklappte Ansicht zeigt weiterhin immer den vollen Namen. Pause-Button mit
// Play-/Pause-Icon je nach Zustand (nicht nur Farbe). Keine neue Icon-Library, keine Hoehen-/
// Layoutaenderung an Buttons/Zeilen.
// PATCH-Bump (2.11.1 -> 2.11.2): (1) Nur noch "Live"-Properties werden geladen (siehe
// loadProperties() oben, `status=Live`) - echte Apaleo-Test-Properties (z. B. "Test run", status
// "Test") erscheinen dadurch nicht mehr in der operativen Reinigungsplanung; archivierte
// Properties liefert Apaleo ohnehin standardmaessig nicht zurueck. (2) Alle sichtbaren
// deutschsprachigen UI-Texte (i18n.ts#de sowie die Fehlermeldungen der api/*.js-Routen und die
// PWA-Manifest-Beschreibung) auf korrekte deutsche Umlaute/Eszett umgestellt (ae->ä, oe->ö, ue->ü,
// ss->ß wo orthografisch korrekt) - die Dateien sind UTF-8, eine ASCII-Umschreibung war nie
// erforderlich. Reine Text-/Datenfilter-Korrektur, keine Aenderung an Business-Logik, IDs,
// Variablennamen oder technischen Konstanten.
// PATCH-Bump (2.11.2 -> 2.11.3): Bugfix "Reinigung abschliessen" (Apaleo 422). setUnitCondition()
// sendete bisher `{ unitIds: [...], condition }` an PUT /operations/v1/units-condition - das
// entspricht nicht dem tatsaechlichen Apaleo-Schema (live verifiziert: `unitsConditions:
// [{ id, condition }]`) und wurde deshalb zuverlaessig mit 422 abgelehnt, unabhaengig vom Wert.
// Bestand unveraendert bereits im alten app.js. Fachliche Klarstellung dabei umgesetzt: dieser
// Betrieb hat keinen Inspektions-Schritt (requiresInspection() liefert jetzt immer false) - eine
// abgeschlossene Reinigung setzt die Apaleo-Unit direkt auf "Clean" statt auf den
// Zwischenzustand "CleanToBeInspected". Betrifft sowohl den Aufgaben- als auch den
// Apartments-Bildschirm (finishTask/finishClean). Ausserdem: "Housekeeping" im Header nutzt jetzt
// dieselbe Marken-Typografie wie Login-/Admin-Einrichtungsseite (kraeftiges "UNIQUE PLACES",
// Bereichsname darunter klein/tracked/grossgeschrieben).
// MINOR-Bump (2.11.3 -> 2.12.0): Housekeeping Teams (Reinigungsfirmen) - neues, rein
// housekeeping-internes Zwischenglied zwischen Property und Person: ein Task kann jetzt zusaetzlich
// zu assignedUserId einem Team (HousekeepingTeam) zugeordnet sein - automatisch ueber ein
// konfigurierbares Standard-Team je Property (housekeeping:team_property_defaults, NIE nach Apaleo
// geschrieben), optional manuell ueberschrieben pro Task (housekeeping:task_team_overrides). Kein
// neuer globaler Rollenwert (Role bleibt 'admin' | 'housekeeping') - stattdessen ein team-internes
// `teamRole: 'member' | 'lead'` auf StaffUser, bewusst getrennt von managedProperties (siehe
// types.ts#StaffUser). Der bestehende atomare Self-Claim (HSETNX, siehe api/task-assignments.js)
// wurde NICHT dupliziert, sondern lediglich um eine Team-Gate-Pruefung ergaenzt: ein Team-Task kann
// nur von Mitgliedern des zugeordneten Teams (oder Admin/Standortverantwortlichen) geclaimt werden,
// ein Team Lead darf zusaetzlich freie Team-Cleanings an eigene Teammitglieder verteilen/umverteilen
// und deren Zuweisung wieder freigeben - ausschliesslich innerhalb des eigenen Teams, serverseitig
// erzwungen. Neu ausserdem: ein deaktivierter Benutzer (`active === false`) wird jetzt auch bei
// bereits bestehender Session direkt in api/task-assignments.js gesperrt (vorher nur beim Login).
// Neue Einstellungen-Unterseite "Reinigungsfirmen & Teams" (HousekeepingTeamsScreen.tsx) fuer
// Admin (alle Teams, Property-Standardzuordnung) und Team Lead (nur eigenes Team) - reine
// Aufsatz-Ansicht auf dem bestehenden Team-Screen/UserFormSheet.tsx (Team+Rolle als neue Felder
// dort), keine zweite parallele Mitarbeiterverwaltung.
// MINOR-Bump (2.12.0 -> 2.13.0): "Vorfall melden" - neue, allen Housekeeping-Benutzern zugaengliche
// Funktion, um einen bei der Reinigung festgestellten Vorfall (Foto + kurze Beschreibung) an
// UNIQUE PLACES zu melden. Speicherung (Redis housekeeping:incidents) und Slack-Zustellung
// (SLACK_INCIDENT_WEBHOOK_URL, api/_slack.js) sind bewusst getrennte Schritte - ein voruebergehend
// nicht erreichbares Slack kostet nie einen bereits gespeicherten Vorfall (slackDeliveryStatus).
// Fotos landen auf Vercel Blob (neue Abhaengigkeit @vercel/blob), NIE als Base64 in Redis, mit
// unerratbaren Dateinamen. Alle sicherheitsrelevanten Felder (Property/Unit/Datum/Typ/
// Buchungsnummer) werden serverseitig faelschungssicher aus der taskId geparst (siehe
// api/_permissions.js), nie vom Client uebernommen.
// Navigation: "Apartments"/"Statistik" sind jetzt an dieselbe "elevated"-Bedingung gebunden
// (Admin/Standortverantwortlich/Team Lead, siehe permissions.ts#isElevatedHousekeepingUser) - ein
// normaler Housekeeper sieht dafuer "Vorfall melden" an der frei gewordenen Position; fuer
// "elevated" Benutzer bleibt die Bottom-Nav bei 4 Punkten, "Vorfall melden" ist dort stattdessen
// ueber die Einstellungen erreichbar (kein fuenfter gleichwertiger Bottom-Nav-Punkt). Nebenbei
// behoben: ein Team Lead (kein Admin) konnte den SettingsScreen zuvor gar nicht erreichen
// (SettingsSheet/app/page.tsx pruefte hart auf role==='admin').
// MINOR-Bump (2.13.0 -> 2.14.0): zwei bewusst getrennte neue Funktionen fuer Waesche/Bettsachen
// einerseits und Verbrauchsmaterial andererseits - nie vermischt, weder in der UI noch im
// Datenmodell. (1) "Reinigung abschliessen" oeffnet jetzt zwingend zuerst "Waescheverbrauch
// erfassen" (LinenCompletionSheet.tsx): pro Property administrierbare Waeschepositionen
// (housekeeping:linen_items, api/_linen.js/api/linen-items.js) mit optionaler, bewusst einfacher
// Schaetzregel (none/perGuest/perAdult/fixed, siehe lib/housekeeping/linen.ts - ausdruecklich OHNE
// Bettenzahl/Apartmenttyp, da dafuer keine verlaessliche Datenquelle existiert). Der Schaetzwert
// ("Geschaetzt: n") wird nur dezent angezeigt und NIE automatisch in die Ist-Menge uebernommen
// (QuantityStepper.tsx unterscheidet technisch zwischen null="noch nicht eingegeben" und 0="aktiv
// als Null erfasst"). Die bestehende complete-Action in api/task-assignments.js wurde NICHT
// dupliziert, sondern serverseitig um eine Vorab-Validierung erweitert: Task=completed ist jetzt
// technisch nur erreichbar, wenn fuer jede aktuell aktive Waescheposition eine Ist-Menge vorliegt;
// bei Ablehnung bleiben Status/Timer unveraendert (kein Teil-Fortschritt). Bei Erfolg wird
// zusaetzlich ein unveraenderlicher CleaningCompletionReport-Snapshot gespeichert (u.a. itemName/
// unit zum jeweiligen Zeitpunkt, damit spaetere Auswertungen auch nach Umbenennung eines Artikels
// nachvollziehbar bleiben - eine Geschaetzt/Tatsaechlich-Auswertung ist bewusst noch nicht gebaut).
// (2) Neue, komplett eigenstaendige Funktion "Verbrauch melden" (ReportConsumableSheet.tsx): rein
// standortbezogen, OHNE Apartment-/Reinigungsbezug (kein unitId/taskId im ConsumableReport) - fuer
// klassisches Verbrauchsmaterial (Toilettenpapier, Kaffeekapseln, etc.), ebenfalls pro Property
// administrierbar (housekeeping:consumable_items, api/_consumables.js/api/consumables.js). Hat ein
// Benutzer nur Zugriff auf einen Standort, wird dieser automatisch vorausgewaehlt; bei mehreren
// muss aktiv ausgewaehlt werden. Version 1 bewusst ohne Bestandsfuehrung/Schwellenwerte - reine
// Protokollierung (wer/welches Team/wann/welcher Standort/welche Menge). Beide neuen Meldewege
// loesen ausdruecklich KEINE Slack-Nachricht aus (Slack bleibt "Vorfall melden" vorbehalten).
// Navigation: um nicht weiter Bottom-Nav-Punkte anzuhaeufen, wurden "Vorfall melden" und
// "Verbrauch melden" fuer normale Housekeeper unter einem gemeinsamen "Melden"-Sammelpunkt
// (ReportMenuSheet.tsx) zusammengefasst statt als zwei gleichrangige Nav-Buttons. Admin-Verwaltung
// beider neuer Kataloge teilt sich eine gemeinsame UI (ItemCatalogSettingsScreen.tsx/
// ItemFormSheet.tsx) unter den neuen Einstellungen-Punkten "Waesche & Bettsachen"/
// "Verbrauchsmaterial"; wie bei allen bisherigen Katalogen gilt: kein Hard-Delete, nur
// Deaktivieren (active=false), damit historische Reports verstaendlich bleiben.
// MINOR-Bump (2.14.0 -> 2.15.0): Informationsarchitektur des gesamten Admin-/Einstellungsbereichs
// neu geordnet - keine neue Businesslogik, ausschliesslich Navigation/UI. Die fruehere flache
// Liste in SettingsScreen.tsx ist einer Startseite mit nur noch 6 uebergeordneten Kategorien
// gewichen (Housekeeping / Standorte & Apartments / Teams & Benutzer / Meldungen & Betrieb /
// Integrationen / App & System), zentral beschrieben in lib/housekeeping/settingsNav.ts (id/
// titleKey/descriptionKey/icon/requiredRole/category) statt in der Komponente hartcodiert - das
// bereitet eine spaetere "Einstellungen durchsuchen"-Suche vor, ohne sie schon zu bauen. Neu unter
// "Standorte & Apartments": ein Property (identifiziert ausschliesslich ueber den stabilen Apaleo-
// Code, nie ueber den Anzeigenamen) oeffnet eine eigene Unterseite mit allen dafuer relevanten
// Einstellungen (Apartments/Wäsche & Bettsachen/Verbrauchsmaterial/Reinigungsteam/NFC-Tags) - die
// bestehenden Screens (ItemCatalogSettingsScreen/NfcSettingsScreen/HousekeepingTeamsScreen) wurden
// dafuer NICHT dupliziert, sondern um einen rein filternden `propertyFilter`-Prop erweitert.
// "Team & Berechtigungen" und "Reinigungsfirmen & Teams" stehen nicht mehr gleichrangig nebeneinander,
// sondern buendeln sich unter "Teams & Benutzer" - dort ergaenzen zwei neue, rein lesende
// Uebersichten ("Berechtigungen", "Standortzuordnungen") die bestehende Mitarbeiterverwaltung, beide
// ausschliesslich aus bereits geladenen Daten abgeleitet, ohne neue Rollen-/Rechte-Engine. "Vorfall
// melden"/"Verbrauch melden" sind als AKTIONEN aus dem Admin-Bereich verschwunden (das sind
// operative Housekeeper-Funktionen) - fuer elevated Nutzer (die "Melden" nicht in der Bottom-Nav
// haben) bleibt der Zugang ueber das allgemeine Profilmenue (SettingsSheet) erhalten. Stattdessen
// zeigt "Meldungen & Betrieb" jetzt echte, bisher ungenutzte Ansichten auf bereits gespeicherte
// Daten (api/_incidents.js#getAllIncidents existierte bereits unbenutzt, api/_consumables.js hat
// ein neues, ebenso simples getAllReports() erhalten) - kein Fantasie-Screen ohne echten Inhalt.
// "Integrationen" zeigt fuer Apaleo/Slack ausschliesslich, ob die noetigen Umgebungsvariablen
// gesetzt sind (api/integrations-status.js) - niemals Secrets/Tokens/Webhook-URLs selbst. Bewusst
// NICHT gebaut: ein "Reinigungsablauf"-Punkt (keine echten Einstellungen dahinter) und ein
// eigenstaendiger "Housekeeping"-Punkt je Property (dessen einzige Inhalte bereits die vier
// anderen Property-Zeilen waeren) - beides waere eine leere Fantasie-Einstellung gewesen. Alle
// bestehenden serverseitigen role/property-Pruefungen je API-Route bleiben unveraendert; diese
// Navigation ist ausschliesslich Client-UX.
// PATCH-Bump (2.15.0 -> 2.15.1): Visuelles Redesign des gesamten Einstellungs-/Adminbereichs nach
// dem tatsaechlichen UNIQUE-PLACES-Owner-Center-Designsystem (https://github.com/aurelsommerlad/
// owner-center, Source of Truth per Repository-Analyse, nicht geschaetzt) - keine Aenderung an
// Informationsarchitektur, Routing oder Berechtigungen (siehe vorheriger Bump), ausschliesslich
// Markup/Styling. Neues, wiederverwendbares Layoutsystem in components/housekeeping/admin/
// (AdminPage/AdminSection/AdminField/AdminBadge/AdminRow/AdminTable/adminFormStyles), 1:1 von den
// tatsaechlichen Owner-Center-Komponenten uebertragen (u. a. src/app/admin/(protected)/
// properties/[id]/page.tsx als Vorlage fuer Seitenkopf/Card-Aufbau, AdminStatusBadge fuer
// Status-Pillen). Basis-Design-Tokens (Farben/Radien/Schatten/Inter als einziger Font) waren
// bereits aus einer frueheren Runde 1:1 uebernommen - das Owner-Center-eigene Admin-Pattern
// verwendet bewusst KEINE kursive Serifenschrift (Fraunces bleibt dem eigentuemerseitigen Bereich
// dort vorbehalten), daher bekommen auch die Housekeeping-Einstellungen jetzt durchgaengig
// Sans-Ueberschriften (`text-2xl font-semibold`) statt der bisherigen kursiven Titelzeile. Die
// Einstellungsstartseite zeigt jetzt 3 gruppierte Cards mit Zeilen (HOUSEKEEPING/VERWALTUNG/
// SYSTEM) statt 6 Einzelkacheln; jede Unterseite traegt einen Zurueck-Link mit dem TATSAECHLICHEN
// Namen der Elternseite (Owner-Center-Pattern "← Objekte") statt eines generischen "Zurueck",
// auf Desktop zusaetzlich eine dezente volle Breadcrumb-Zeile. Mobile bleibt bewusst einspaltig
// mit kompakten Zeilen statt horizontal gequetschter Desktop-Layouts.
// MINOR-Bump (2.15.1 -> 2.16.0): Reinigung/Aufgabe klar getrennt (Feinschliff-Analyse, 13 Punkte).
// (1) Neuer TaskType 'manual' (eigener Neutralton --color-type-manual + IconTask, nie nur ueber
// Farbe) fuer admin-erstellte, nicht aus Apaleo abgeleitete Aufgaben - bestehender TaskType
// 'extra' (Doubleup-Ableitung) bleibt unveraendert bestehen und heisst in Deutsch jetzt
// "Zusatzausstattung" statt "Aufgabe" (Namenskonflikt mit dem neuen Typ aufgeloest). (2/3/4) Admin
// kann ueber "+ Aufgabe erstellen" (TasksScreen) eine Aufgabe mit Standort/optionalem Apartment/
// Datum/Titel/Beschreibung/optionaler Zuweisung anlegen (housekeeping:manual_tasks, api/manual-
// tasks.js, admin-only); kein Reinigungs-Workflow (kein Timer/Pause), Primaeraktion "Aufgabe
// erledigen", Offen/Erledigt-Filter fuer Admin (betrifft ausschliesslich manuelle Aufgaben, nie
// Reinigungen). (5) Statistik jetzt ausschliesslich Admin: StaffNavBar+app/page.tsx-Guard UND
// serverseitig - api/completions.js lieferte GET bisher JEDEM eingeloggten User alle
// Abschlussdaten aller Standorte (Sicherheitsluecke), liefert Nicht-Admins jetzt bewusst HTTP 200
// mit leerer Liste (kein 403, um loadBackendState() fuer alle nicht abzureissen). (6) TaskDetail-
// Sheet: doppelte Zuweisungszeile entfernt (Zuweisung gehoert eindeutig zur "Reinigung"-Sektion).
// (7) Notice-Card: Start blockiert jetzt per Klick-Guard statt disabled-Button + dauerhaftem Text;
// stattdessen einmaliger Toast + kurze visuelle Hervorhebung/Scroll zur Notice-Card. (8) Buchungs-
// nummer + "gebucht am" kompakt in einer Zeile. (9) Buchungsaenderungen (Anreise/Abreise/Einheit)
// sichtbar: neuer Snapshot-Vergleich (housekeeping:booking_change_snapshots/-changes, api/booking-
// changes.js) - Apaleo liefert nur den aktuellen Stand, der Vorzustand wird hier erstmals selbst
// gespeichert; dezentes Icon auf der Karte, Vorher/Nachher in der Detailansicht. (10) "Meine
// Aufgaben"/Standortfilter sind jetzt echte unabhaengige Dimensionen (vorher setzte JEDE
// Standortauswahl "Meine Aufgaben" zurueck) - zwei eigene, klein beschriftete Gruppen "Ansicht"/
// "Standort" statt einer gemischten Chip-Zeile. (11) Neuer, separater Pause-Button im Header nur
// bei aktiver eigener Reinigung (in_progress/paused) - der bestehende, davon unabhaengige
// Pausen-Button ("Pause von der Arbeit", toggleBreak) bleibt unveraendert. (12) Zwischenreinigung
// entsteht nur noch bei gebuchtem Apaleo-Service `INTERCLEAN` fuer GENAU den Tag (Leistungsdatum
// aus `services[].dates[].serviceDate`, live verifiziert bereits im bestehenden `expand=services`
// enthalten, kein zusaetzlicher Request) - die alte, naechtebasierte Zwangsreinigungsregel wurde
// entfernt (FORCED_CLEAN_INTERVAL_NIGHTS-Nutzung in tasks.ts). Reine Additive/Refactoring-Aenderung
// an der bestehenden Turnover-/Abreise-/Timer-/Zuweisungs-/Notice-/Team-Logik - nichts davon wurde
// umgebaut.
//
// 2.17.0 - UX-Feinschliff Runde 2 (kompakterer oberer Bereich, ohne Business-Logik/Berechtigungen
// neu aufzubauen): (1) globaler Pause-Button im Header VOLLSTAENDIG entfernt (nicht nur
// ausgeblendet) - Pause/Fortsetzen bleibt unveraendert Teil der Reinigungs-Detailansicht, manuelle
// Aufgaben haben weiterhin keinerlei Pausenfunktion; der davon unabhaengige "Pause von der
// Arbeit"-Button bleibt bestehen. (2) Mitarbeiter werden im gesamten operativen Bereich (Task
// Cards, Zuweisung, Team-Kurzansicht, Reinigungsstatus, "erledigt von") standardmaessig nur mit
// Vornamen angezeigt (z. B. "Aurel" statt "Aurel Sommerlad"), bei Vornamens-Kollisionen automatisch
// als "Vorname N." disambiguiert (lib/housekeeping/names.ts) - der gespeicherte Name aendert sich
// nicht, Admin-Bereiche (Teamverwaltung/Benutzerprofil) zeigen weiterhin den vollen Namen. (3)
// Wichtiger-Hinweis-Karte konkurriert nicht mehr mit dem "Reinigung starten"-Button: die Karte
// selbst zeigt Hinweistext + "Gelesen und verstanden", der Button bleibt an seiner Position,
// ist bis zur Bestaetigung disabled (mit dezentem Tooltip/Hinweistext) und bleibt per
// Klick-Guard weiterhin antippbar, um zur Notice-Card zu scrollen/sie hervorzuheben. (4) Filterzeile
// "Ansicht"/"Standort" (zwei Chip-Gruppen) ersetzt durch eine kompakte Zeile mit zwei Auswahlfeldern
// ("Meine Aufgaben ▾"/"Alle Standorte ▾") - beide Filterdimensionen bleiben technisch unabhaengig
// voneinander. (5) Tagesnavigation kompakter, gleichmaessig ueber eine Zeile verteilt (unveraendert
// vier Tage). (6)-(9) KPI-Zeile ersetzt durch genau drei Kennzahlen "Reinigungen"/"Aufgaben"/
// "Fertig" (Icon direkt neben der Zahl, keine eigene Flaeche), rein aus den bereits nach Tag/
// Ansicht/Standort gefilterten Daten abgeleitet - "pausiert"/"Turnover" sind keine eigenen
// Top-Level-Kennzahlen mehr, bleiben aber auf der einzelnen Task Card sichtbar. (10) Aufgabenliste
// in drei kleine, ruhige Abschnitte "REINIGUNGEN"/"AUFGABEN"/"FERTIG" gruppiert (dezenter Farbakzent
// wie die zugehoerige Kennzahl), "FERTIG" per Default eingeklappt, leere Abschnitte werden komplett
// weggelassen; der bisherige admin-only Offen/Erledigt-Umschalter fuer manuelle Aufgaben entfaellt
// dadurch (manuelle Aufgaben werden serverseitig nie nach Status gefiltert, keine
// Berechtigungsaenderung). (11)/(12) Task Cards, Apaleo-Mapping, Turnover-/INTERCLEAN-Ermittlung,
// Reservierungsdaten, ECI/LCO, NFC, Zuweisungslogik, Timer und Notice-Bestaetigungslogik wurden
// dabei nicht angefasst - reine Darstellungs-/Kompaktheitsaenderung, die weiterhin exakt Tag/
// Ansicht/Standort/Berechtigungen respektiert.
//
// 2.17.1 - Korrektur zweier Regressionen aus 2.17.0, sonst unveraendert: (1) beim Entfernen des
// GLOBALEN/permanenten Header-Pause-Buttons wurde versehentlich auch der davon zu unterscheidende,
// rein KONTEXTABHAENGIGE Reinigungsstatus rechts oben mit ausgebaut - dieser existiert wieder
// exakt dann, wenn der eingeloggte Mitarbeiter eine laufende ("Pause") oder pausierte
// ("Fortsetzen") eigene Reinigung hat (app.activeCleaningTask(), StaffHeader.tsx#
// CleaningPauseButton), sonst weiterhin nichts - nutzt dieselben startTaskTimer/pauseTaskTimer-
// Aktionen wie zuvor, kein zweiter Timer-Mechanismus. (2) die farbigen Grossbuchstaben-Section-
// Header "REINIGUNGEN"/"AUFGABEN"/"FERTIG" ueber den Kartenlisten sind einer ruhigen Anzahl-Zeile
// in normaler Textfarbe gewichen ("3 Reinigungen"/"1 Aufgabe"/"Fertig · 2", mit korrekter
// Singular-/Pluralform), hoechstens begleitet vom kleinen, bereits bestehenden Kennzahl-Icon im
// dezenten Akzent der jeweiligen Kategorie. Filter, Tagesnavigation, Kennzahlen-Zeile, Task Cards
// und Fachlogik unveraendert.
//
// 2.17.2 - Vier gezielte Korrekturen, sonst unveraendert: (1) den linken "Pause von der
// Arbeit"-Button (toggleBreak/onBreak) aus dem Header entfernt - er wirkte neben dem
// kontextabhaengigen Reinigungs-Pause-Hinweis rechts wie ein zweites, verwechselbares
// "Pause"-Element; die zugrunde liegende Pause-von-der-Arbeit-Logik selbst bleibt erhalten, nur
// ihr Aufruf im Header entfaellt. (2)+(3) Akzent-Icon fuer "Reinigungen" (KPI-Zeile UND
// Abschnitts-Header) von IconLayers auf ein neu gezeichnetes, stilistisch passendes
// Sparkles/Cleaning-Outline-Icon (IconSparkles, icons.tsx) umgestellt, Farbe von Sage auf
// dasselbe dezente Turnover-Rot/Terracotta (--color-type-turnover, bereits bestehender Token,
// keine neue Farbe) - ausschliesslich Icon-Akzent, Text bleibt text-ink. (4) "Fertig" nutzt jetzt
// exakt dieselbe visuelle Grundstruktur (Hoehe/Typografie/Icon-Groesse/Abstaende/Klickflaeche) wie
// der Reinigungen-/Aufgaben-Header, lediglich mit Chevron rechts (einzig aufklappbarer Bereich).
// (5) korrekte Singular-/Pluralform an ALLEN betroffenen Stellen (KPI-Zeile unter der
// Tagesnavigation, Reinigungen-/Aufgaben-Abschnittsheader, Team-Auslastung) durch eine einzige
// gemeinsame Hilfsfunktion (countLabel(), TasksScreen.tsx) statt hartcodierter Strings - "1
// Reinigung"/"1 Aufgabe" statt zuvor faelschlich "1 Reinigungen"/"1 Aufgaben". Filter,
// Tagesnavigation, Task Cards, Detailansicht, Notice/Zuweisung/Timer/Workflows, INTERCLEAN und
// Apaleo-Integration unveraendert.
//
// 2.18.0 - Desktop-Optimierung des Housekeeping-Dashboards fuer Admin/grosse Bildschirme, rein
// responsives Layout-Refactoring ab dem Breakpoint `xl:` (Tailwind-Standard, >= 1280px) -
// unterhalb von 1280px bleibt jede bestehende Klasse unveraendert (mechanisch geprueft: an jeder
// geaenderten Stelle wurden ausschliesslich neue, mit `xl:` praefixierte Utility-Klassen an die
// bestehende Klassenliste ANGEHAENGT, nie eine bestehende Klasse entfernt/ersetzt), Mobile-
// Struktur/Reihenfolge/Task-Ermittlung/Business-Logik unangetastet. (1) Header und TasksScreen
// erhalten ab xl einen zentrierten Content-Container (max-width 1560px) statt endloser
// Vollbreite auf sehr grossen Monitoren. (2) Header: aus dem bisherigen Such-Icon wird ab xl ein
// kompaktes, wie ein Suchfeld aussehendes Element (oeffnet weiterhin dieselbe, bestehende
// ReservationSearchSheet - keine zweite Suchimplementierung), das mobile Icon bleibt darunter
// unveraendert sichtbar. (3) Standortfilter, Tagesnavigation, Kennzahlenzeile und Admin-Aktionen
// (bisher vier separate, volle Breite nutzende Mobile-Bloecke) werden ab xl zu einer kompakten
// Desktop-Steuerungszeile zusammengefasst (Standort-Select ~260px, Tagesnavigation als
// ~560px breiter Segmented Control, Kennzahlen kompakt/inline rechts, Admin-Aktionen als eigene
// rechtsbuendige Zeile darunter) - ausschliesslich per CSS Flex/`order`, keine Komponenten-
// Duplizierung. (4) Team-Auslastung ist ab xl ein kompaktes, inhaltsbreites Element statt eines
// fast bildschirmbreiten Balkens. (5) Reinigungen-/Aufgaben-/Fertig-Kartenraster nutzen ab xl
// eine minmax(340px,1fr)-Grid-Regel statt fester 3-Spalten, damit Cards auf sehr breiten
// Monitoren nicht unnoetig auseinandergezogen werden (Task Card selbst unveraendert). Punkt
// "Gruppierung nach Mitarbeiter auf Desktop" wurde geprueft, aber NICHT umgesetzt: eine echte,
// responsive Gruppierung (flache Liste auf Mobile, gruppiert nach Zuweisung auf Desktop) liesse
// sich mit der bestehenden Datenstruktur zwar fachlich berechnen, erfordert aber entweder eine
// zusaetzliche, per CSS ein-/ausgeblendete zweite Rendering-Variante der Reinigungskarten oder
// clientseitige Breakpoint-Erkennung per JS - beides ein groesserer struktureller Eingriff, der
// laut Vorgabe zunaechst nur berichtet, nicht implementiert werden sollte.
//
// 2.19.0 - Desktop-Admin-/Dispositionslayout (>= 1280px, `xl:`), reines Layout-Refactoring auf
// Basis von app/page.tsx als CSS-Grid (Spalten Navigation/Hauptbereich/Sidebar, Zeilen Header/
// PropertyChips/Body) - unterhalb xl bleibt exakt der bisherige `flex flex-col`-Mobile-Stapel
// bestehen (mechanisch per Diff geprueft: an jeder geaenderten Stelle wurden ausschliesslich
// neue `xl:`-Klassen an bestehende Klassenlisten angehaengt, nie eine bestehende entfernt/
// ersetzt). (1) Neue schmale linke Desktop-Navigation (DesktopNavRail.tsx) ersetzt ab xl die
// mobile Bottom Navigation (StaffNavBar.tsx bekommt `xl:hidden`) - beide nutzen jetzt dieselbe,
// aus StaffNavBar.tsx ausgelagerte Item-/Berechtigungsliste (lib/housekeeping/navItems.ts), keine
// zweite Navigationslogik. (2) Neue rechte Admin-Sidebar (DesktopAdminSidebar.tsx, nur xl, nur
// auf der Aufgabenplanung UND fuer Standortverantwortliche/Team-Leads/Admin) zeigt kompakt
// Tages-Kennzahlen, Team (Klick auf "Team" fuer Admin oeffnet die bestehende Teamansicht,
// setActiveNav) und einen ehrlichen, leeren "Operations"-Slot (der Operations Monitor existiert
// in dieser Codebasis noch nicht - bewusst keine erfundenen Findings). Ersetzt die bisherige
// Team-Auslastung im Hauptbereich, die dort jetzt `xl:hidden` ist (keine doppelte
// Teamdarstellung) - beide Ansichten lesen dieselbe, neu ausgelagerte dayOverviewFor()-Funktion
// (lib/housekeeping/dayOverview.ts, 1:1 identische Ableitung wie zuvor inline in TasksScreen.tsx).
// (3) Der gesamte Layout-Container ist auf max-width 1800px zentriert, damit die Ansicht auf
// 1920/2560px nicht auseinandergezogen wirkt; das Reinigungen-/Aufgaben-/Fertig-Kartenraster
// bleibt bei der bereits bestehenden minmax(340px,1fr)-Regel. Verifiziert per Sourcecode-Diff-
// Audit sowie einem temporaeren, vor dem Commit wieder entfernten CSS-Grid-Smoketest (Playwright-
// Screenshots bei 375/390/430/1280/1440/1920/2560px) - Mobile-Darstellung/-Verhalten
// unveraendert, Business-Logik (Apaleo/Task-Ermittlung/INTERCLEAN/Assignments/Timer/Notice/
// Berechtigungen) nicht angefasst.
//
// Feinschliff Runde 7 (nur `xl:`-Klassen, dieselbe Additiv-Technik wie oben, kein Mobile-
// Eingriff): (1) Desktop-Steuerungszeile im Hauptbereich neu geordnet - Zeile 1 jetzt Standort +
// Tagesnavigation + Admin-Aktionen (rechtsbuendig), Zeile 2 die drei Kennzahlen darunter statt
// wie zuvor Kennzahlen/Aktionen vermischt in umgekehrter Reihenfolge; die durch mehrere direkte
// Flex-Geschwister jeweils eigene `px-4` verdoppelten Randabstaende sind behoben (Padding jetzt
// einmalig auf dem Wrapper, `xl:px-0` auf den einzelnen Bloecken). (2) Tagesnavigation auf
// Desktop nicht mehr auf 560px gestreckt, sondern kompakte, inhaltsbreite Pillenreihe. (3) Rechte
// Admin-Sidebar von 320px auf 288px verschmalert, die "HEUTE"-Kennzahlensektion (Duplikat der
// Kennzahlenzeile im Hauptbereich) entfernt, "TEAM"-Ueberschrift und Team-Link zu einem einzigen
// klickbaren Element zusammengefuehrt (kein doppeltes "Team"), der noch nicht implementierte
// "Operations"-Platzhalter ausgeblendet statt dauerhaft "Noch nicht verfuegbar" zu zeigen -
// Sidebar beginnt jetzt in Grid-Zeile 3 (statt ueber die volle Hoehe), Header spannt dafuer
// Spalte 2 UND 3, damit Sidebar und Hauptbereich auf derselben Zeile/Achse starten. (4) Linke
// Desktop-Navigation minimal breiter (96px statt 80px), aktive Markierung jetzt eine Flaeche um
// Icon+Label zusammen statt nur hinter dem Icon. (5) Reinigungskarten auf Desktop mit etwas mehr
// Innenraum (18px Padding, etwas mehr Zeilenabstand) fuer schnellere Erfassbarkeit, Kartenbreite/
// Mobile-Masse unveraendert. Erneut per Sourcecode-Diff-Audit + temporaerem CSS-Grid-Smoketest
// (375/390/430/1280/1440/1920/2560px, vor dem Commit entfernt) verifiziert - keine Aenderung an
// Business-Logik, Mobile-Darstellung oder -Verhalten.
//
// Feinschliff Runde 8 (nur `xl:`-Klassen bzw. neue, ausschliesslich Desktop-sichtbare Elemente,
// kein Mobile-Eingriff): (1) Toolbar exakt ausgerichtet - Tagesnav-Pillen haben auf Desktop jetzt
// dieselbe Hoehe/Rundung (`xl:h-9 xl:rounded-full`) wie Standortfilter/Aktionsbuttons, vorher wich
// ihre `rounded-control`-Eckung sichtbar ab. (2) Doppeltes Plus am "Aufgabe erstellen"-Button
// behoben - die i18n-Strings enthielten bereits ein eigenes "+ " zusaetzlich zum ohnehin schon
// gerenderten Plus-Icon; das "+ " ist jetzt aus allen 4 Sprachen entfernt, das bestehende
// Icon bleibt einziger Plus-Indikator. (3) Farbfehler bei der "Aufgabe"-Kennzahl/-Sektion
// korrigiert - nutzte `text-type-departure` (Abreise-Braunton) statt des dafuer vorgesehenen
// neutralen `text-type-manual`-Akzents (siehe TaskCard.tsx#TYPE_LEFT_BORDER); Korrektur nur per
// `xl:`-Override, Mobile zeigt bewusst weiterhin den unveraenderten Ausgangszustand. (4) Neuer,
// admin-only Desktop-Navigationspunkt "Einstellungen" unten in der linken Navigationsleiste
// (DesktopNavRail.tsx), durch eine feine Trennlinie von der operativen Hauptnavigation abgesetzt -
// routet auf denselben bestehenden, bereits abgesicherten `activeNav: 'settings'`-Screen
// (SettingsScreen.tsx), keine zweite Einstellungs-Implementierung. Bewusst NICHT Teil der mit der
// mobilen StaffNavBar geteilten `navItems.ts`-Liste, da ein dortiger Eintrag auch in der mobilen
// Bottom Navigation erschienen waere - die mobile Navigation bleibt dadurch unveraendert
// (weiterhin 4 Eintraege). Verifiziert per Sourcecode-Diff-Audit (nur additive
// `xl:`-Klassen bzw. das neue, isolierte Nav-Element betroffen) + temporaerem CSS-Grid-Smoketest
// (Produktionsbuild, 1280/1440/1920/2560px, vor dem Commit entfernt) + Playwright-Regressionslauf
// der echten Login-Seite bei 375/390/430/1280/1440/1920/2560px ohne Konsolenfehler.
//
// MINOR-Bump (2.21.0 -> 2.22.0): "Tag ändern" - Admin kann Reinigungen (Turnover/Abreise/
// INTERCLEAN) UND manuelle Aufgaben auf einen anderen Tag innerhalb des bestehenden 4-Tage-
// Planungsfensters (Heute+3) verschieben, ohne die zugrundeliegende Apaleo-Reservierung
// (Anreise/Abreise/Unit/Service/Kommentar) jemals zu beruehren - Apaleo bleibt Source of Truth.
//
// Analyse vor der Implementierung (siehe ausfuehrliche Kommentare in den jeweiligen Dateien):
// Task-IDs sind bereits deterministisch aus dem QUELLDATUM gebildet (taskId() in tasks.ts,
// "<propertyCode>|<unitId>|<date>|<type>|<sourceReservationId>") und werden bei jedem Apaleo-Sync
// exakt an diesem einen Tag neu abgeleitet - eine Verschiebung aendert diese ID nie, sondern setzt
// ausschliesslich einen neuen `scheduledDate`-Wert (housekeeping:task_schedule_overrides, neue
// Route api/task-schedule-overrides.js, komplett analog zu task-time-overrides.js). Alle
// Tagesansichten (tasksForDay/daySummary/capacityForDay/teamCapacityForDay) filtern jetzt nach
// `scheduledDate` statt `date` - dadurch verschwindet ein verschobener Task sofort vom alten Tag
// und erscheint sofort am neuen, OHNE Dopplung (per Node-Testskript verifiziert, siehe unten).
//
// Datenmodell (types.ts#TaskScheduleOverride): `scheduledDate` (aktuell geplant),
// `originalScheduledDate` (Quelldatum vor der ERSTEN Verschiebung, bleibt ueber beliebig viele
// weitere Verschiebungen unveraendert), `changedBy`/`changedByName`/`changedAt` + eingebettetes
// `history[]` (jede Verschiebung protokolliert, kein zweites Audit-System). Wird wieder exakt auf
// das Quelldatum zurueckgestellt, loescht der Server den Override komplett (Normalfall: Quell- und
// geplantes Datum sind identisch).
//
// Berechtigungen (Punkt 4): nur Admin darf schreiben (serverseitig in
// api/task-schedule-overrides.js erzwungen, admin-only Aktion 'set'/'remove'), jeder mit
// Property-Zugriff darf lesen - Standortverantwortliche/Team-Leads/Housekeeper sehen die
// Verschiebung, koennen sie aber nicht durchfuehren (kein Stift-Icon im UI).
//
// Status-Guard (Punkt 12): eine laufende/pausierte/abgeschlossene Reinigung (bzw. eine erledigte
// Aufgabe) kann nicht mehr verschoben werden (canRescheduleTask() in tasks.ts, serverseitig anhand
// des frischen Redis-Standes erneut geprueft, nicht nur clientseitig).
//
// Kollisionslogik (Punkt 6/7): TaskDetailSheet.tsx zeigt vor dem Speichern die Abreise-/Naechste-
// Anreise-Zeiten, warnt bei Kollision (Termin = naechste Anreise) und blockiert das Speichern hart,
// wenn der gewaehlte Tag NACH der naechsten Anreise liegt - sowohl clientseitig (Save-Button
// deaktiviert) als auch serverseitig (dieselbe String-Vergleichslogik in
// api/task-schedule-overrides.js, ohne dass die Route selbst Apaleo aufruft).
//
// Buchungsaenderungs-Interaktion (Punkt 16): die bestehende Buchungsaenderungs-Erkennung
// (api/booking-changes.js, unveraendert) wird NICHT dupliziert - TaskDetailSheet.tsx kreuzt
// lediglich `bookingChange.departureFrom` gegen einen evtl. noch vorhandenen Schedule-Override auf
// den DAMALIGEN Task (Best-Effort-Rekonstruktion der alten ID), damit ein bestehender manueller
// Override nicht kommentarlos verschwindet, wenn sich die Reservierung danach in Apaleo aendert.
//
// UI: dezentes "Verschoben"-Icon (bestehendes IconRefresh) auf TaskCard neben Status/Zuweisung,
// "Geplant für"/"Verschoben · ursprünglich ..." in TaskDetailSheet mit Admin-Edit-Stift (analog
// zum bestehenden Zeiten-Editor - kein neues "•••"-Menue), Schnellauswahl aus den 4 Planungstagen
// + bestehender nativer Date-Picker fuer "Anderes Datum" (bewusst auf das 4-Tage-Fenster begrenzt,
// siehe Analyse-Kommentar in api/task-schedule-overrides.js), dezenter Toast nach dem Speichern
// ("Auf {Tag} verschoben · Zuweisung bleibt bestehen" nur, wenn tatsaechlich zugewiesen war).
//
// Bugfix im Zuge der Analyse: api/task-assignments.js#clearScope ("Zuweisungen dieses Tages
// aufheben") filterte bislang nach dem in der Task-ID eingebetteten Quelldatum statt dem
// tatsaechlich sichtbaren/geplanten Tag - haette nach einer Verschiebung den falschen Tag
// getroffen bzw. den richtigen verfehlt. Jetzt beruecksichtigt die Route denselben
// Schedule-Override wie die Anzeige.
//
// Verifiziert per tsc/eslint/build + einem eigenstaendigen Node-Testskript (16 pruefbare
// Logikfaelle: Verschiebung je Reinigungstyp/Aufgabe, stabile Task-ID, originalScheduledDate ueber
// mehrere Verschiebungen, Zuweisung bleibt bestehen, Tageszaehler/Dedupe, Status-Sperre, Kollisions-
// /Blockierlogik) + Playwright-Regression der Login-Seite. Admin-only-Durchsetzung, Redis-
// Persistenz und Apaleo-Unveraendertheit sind per Code-Review verifiziert (kein Apaleo-Zugriff in
// der neuen Route, siehe dortiger Kommentar) - ein voller Login-/Redis-/Apaleo-Rundlauf ist in
// diesem Sandbox mangels Zugangsdaten nicht moeglich (bestehende Einschraenkung dieser Umgebung).
// v2.23.0 - zwei unabhaengige Themen in einer Runde:
//
// (1) Desktop-Toolbar-Redesign (>= 1280px, ausschliesslich `xl:`-Klassen, Mobile/Tablet
// unveraendert): Standortfilter/Tagesnavigation/Kennzahlen zu EINER kompakten Zeile
// zusammengefuehrt statt zweier Zeilen. Der Standortfilter-Select ist auf ~230px verschmaelert
// (weiterhin ein echtes `<select>`, Funktion unveraendert). Die Tagesnavigation ist von grossen
// gefuellten Pillen-Buttons zu schlichten TEXT-Tabs geworden: aktiv = etwas fetterer Text +
// dunkler Unterstrich (`xl:border-b-2`), inaktiv = kein sichtbarer Rahmen/Hintergrund, nur ein
// dezenter Hover - dieselbe Tagesauswahl-Logik (selectDay) unveraendert. Die drei Kennzahlen
// (Reinigungen/Aufgaben/Fertig) stehen jetzt standardmaessig IN derselben Zeile (rechtsbuendig
// via `xl:ml-auto`, vorher eine erzwungene eigene Zeile mit `xl:basis-full`) - der responsive
// Fallback (bei zu wenig Platz bricht NUR die Kennzahlengruppe in eine zweite Zeile um) ergibt
// sich automatisch aus dem bereits vorhandenen `xl:flex-wrap`, da die Kennzahlen als letztes
// Element in der Flex-Reihenfolge (`xl:order-4`) auch als erstes umbrechen. Admin-Aktionen
// (Auswaehlen/+ Aufgabe erstellen/•••) bleiben bewusst an ihrer bisherigen Position (separate,
// spaetere Entscheidung). Die "3 Reinigungen"/"1 Aufgabe"-Abschnittsueberschriften ueber den
// Karten bleiben bestehen (andere Funktion: Abschnittsanfang vs. Tages-Kennzahl in der Toolbar),
// sind auf Desktop aber kleiner/ruhiger (kleinere, normalgewichtige, gedaempfte Schrift statt
// medium/text-ink) und ruecken naeher an die Toolbar heran (`xl:pt-2` statt `pt-4`), da keine
// zweite, redundante Kennzahlenzeile mehr direkt darueber steht. Keine Aenderung an Apaleo,
// Redis, Task-Ableitung, Zuweisung, Timern oder Rollen - ausschliesslich Desktop-CSS.
//
// (2) "Wieder aktivieren" (Reaktivierung einer abgeschlossenen Reinigung/Aufgabe), admin-only:
// vorab analysiert, ob startedAt/completedAt/Pausen als einzelne Felder gespeichert sind - JA
// (TaskAssignment.cleaningStartedAt/elapsedSeconds/completedAt sind Skalare) - aber der
// bestehende elapsedSeconds-Akkumulator schliesst jede Phase mit cleaningStartedAt===null (also
// auch die Luecke zwischen einem "completed" und einem spaeteren "reopened"/erneuten Start)
// bereits automatisch von der aktiven Zeit aus, ohne jede Aenderung an der Akkumulationslogik -
// ein neues sessions[]-Schema war deshalb NICHT noetig (verifiziert per Node-Testskript, siehe
// unten). Neue Server-Aktionen: api/task-assignments.js#reopen (nur Admin, nur bei
// status==='completed', setzt 'assigned' wenn ein housekeeperId vorhanden ist sonst 'open', NIE
// 'in_progress' - der normale Start-/NFC-Weg bleibt Pflicht) und api/manual-tasks.js#reopen
// (analog, setzt 'open'). Beide haengen einen neuen `'reopened'`-Verlaufseintrag an denselben,
// bestehenden Verlaufsmechanismus an (KEIN zweites Audit-System). `TaskHistoryAction` um
// 'reopened'/'restarted' erweitert - startTimer erkennt einen unmittelbar vorausgehenden
// 'reopened'-Eintrag und protokolliert den naechsten Start als 'restarted' ("Reinigung erneut
// gestartet") statt faelschlich 'resumed'. `claimTask()` bekam einen Fallback fuer den Fall, dass
// ein reaktivierter, aber unzugewiesener Task bereits einen Redis-Datensatz besitzt (status:
// 'open') - der bisherige reine HSETNX-Pfad blieb dabei fuer den haeufigen Fall (brandneuer Task)
// unangetastet. `assign` bewahrt jetzt elapsedSeconds/history eines bestehenden Datensatzes statt
// sie blind zu ueberschreiben (relevant, sobald nach einer Reaktivierung neu zugewiesen wird).
// `ManualTask` bekam ein additives `history?: TaskHistoryEntry[]` (mirror von
// TaskAssignment.history) - `manualTaskToResolvedTask()` bevorzugt es, faellt bei aelteren
// Datensaetzen ohne dieses Feld weiterhin auf die synthetisierten skalaren Felder zurueck. Neues,
// rein abgeleitetes `ResolvedTask.reopened` (true, wenn der letzte Verlaufseintrag 'reopened'
// ist) treibt sowohl das dezente TaskCard-Badge (bestehendes IconRefresh, verschwindet
// automatisch wieder nach dem naechsten Start/Neustart) als auch die Detailansicht ("Wieder
// geöffnet · Name · HH:MM Uhr" in der Reinigung-Sektion). UI: neuer "Wieder aktivieren"-Button
// (admin-only, `isAdmin` - bewusst NICHT `isManager`, Standortverantwortliche/Team-Leads/
// Housekeeper duerfen laut Vorgabe nicht reaktivieren) unter dem deaktivierten
// "abgeschlossen"-Button in TaskDetailSheet.tsx, mit spezifischem Bestaetigungsdialog fuer
// Reinigung und Aufgabe. Nebenbei behobener Bug: die "Aufgabe erledigt"-Anzeige verwendete
// bislang `history[0]` (den ALLERERSTEN Verlaufseintrag) statt des letzten 'completed'-Eintrags -
// nach einem Reopen+erneutem Abschluss haette das faelschlich die Daten der ERSTEN statt der
// AKTUELLEN Fertigstellung gezeigt. Ebenso zeigt "In Reinigung · seit HH:MM" nach einem
// Reopen+Neustart jetzt die Startzeit DIESER Sitzung statt des historischen allerersten Starts.
// Bestehende Redis-Daten bleiben unangetastet - ausschliesslich additive Felder/Aktionen, keine
// Migration, keine Loeschung. Reopening aendert nie das geplante Datum (komplett unabhaengig von
// "Tag ändern") und ruft nie Apaleo auf.
//
// Verifiziert per tsc/eslint/build + einem eigenstaendigen Node-Testskript (25 pruefbare
// Logikfaelle: canReopenTask-Statusgate, Reopen mit/ohne Zuweisung, Verlaufslaenge/-reihenfolge,
// reopened-Flag-Ableitung inkl. automatischem Zuruecksetzen nach Neustart, elapsedSeconds-
// Ausschluss der Reopen-Luecke, zweite Fertigstellung nach Neustart, manuelle Aufgabe mit/ohne
// persistiertes history[]) + Source-Diff-Audit (jede zuvor mobile-relevante Klasse in
// TasksScreen.tsx bleibt woertlich erhalten) + Playwright-Regression der Login-Seite bei
// 375/1280/1920px (keine Konsolenfehler). Ein voller Login-/Redis-/Apaleo-Rundlauf durch die
// eigentliche Planungsansicht ist in dieser Sandbox mangels Zugangsdaten weiterhin nicht moeglich
// (bestehende Einschraenkung dieser Umgebung, siehe fruehere Versionskommentare).
// v2.24.0 - UI-Politur in drei Schritten, ausdruecklich ohne Layout-/Business-Logik-Aenderungen:
//
// (1) Globaler Fokus-/Hover-Reset (app/globals.css): der bislang sichtbare BLAUE Ring bei Hover/
// Klick/Fokus kam vom Browser-Standard-Outline (`-webkit-focus-ring-color`), nicht von einer
// eigenen Farbklasse (im gesamten Code existierte kein einziges "blue"-Utility) - viele direkt im
// JSX geschriebene <button>/<a>/<select>-Elemente (Tagesnav-Tabs, Edit-Stifte, "•••"-Menu,
// Chevron-Toggles, Standortfilter-<select>, Sprachpillen u. v. a.) hatten schlicht KEINE eigene
// Fokusdarstellung und fielen deshalb auf den Browser zurueck; die bereits vorhandenen
// gemeinsamen UI-Primitiven (Button/Card/Chip/PropertySwitcher/Header) hatten dagegen laengst
// einen korrekten salbeifarbenen `focus-visible:ring-sage` und sind unveraendert. Zentrale Loesung:
// EIN globales Regelpaar in app/globals.css - `outline:none` fuer alle interaktiven Elemente,
// ausschliesslich uber `:focus-visible` ersetzt durch einen duennen (2px), versetzten (2px Offset)
// Salbeiton (`--color-sage`, #87977E); bewusst KEIN blindes globales `outline:none` ohne Ersatz -
// `:focus-visible` matcht bei Chromium/Firefox zuverlaessig fuer Tastaturfokus, i. d. R. NICHT fuer
// einen reinen Mausklick, wodurch Keyboard Accessibility vollstaendig erhalten bleibt, waehrend ein
// Mausklick keinen dauerhaften Ring mehr hinterlaesst (per Playwright-Screenshot-Vergleich
// Maus-Klick vs. Tab-Taste verifiziert). `!important` ist hier bewusst gesetzt, da Tailwind v4
// selbst pro Element bereits Ring-/Outline-bezogene Custom Properties anlegt und einzelne
// Utility-Klassen (z. B. `outline-none`) sonst einzelne Teileigenschaften der Outline-Kurzschreibweise
// uneinheitlich gewinnen liessen. Ein optionaler `[data-focus-dark]`-Hook fuer einen dunkleren
// Forest-Ton (`--color-forest`, #52664E) auf sehr dunklen/gefuellten Flaechen steht bereit, wird
// aber (noch) nirgends gesetzt, da der bestehende 2px-Offset bereits auf JEDER Flaeche ausreichend
// Kontrast zur hellen Seitenflaeche liefert.
//
// (2) Feinschliff der Desktop-Toolbar (TasksScreen.tsx, weiterhin ausschliesslich `xl:`, Mobile
// unveraendert): Standortfilter auf ~210px verschmaelert (echtes <select>, Funktion unveraendert),
// die Abschnittsueberschriften ueber den Kartenreihen ("3 Reinigungen") zeigen ab `xl` zusaetzlich
// eine zweite, per `xl:hidden`/`hidden xl:flex` umgeschaltete Kurzform "[Icon] REINIGUNGEN 3" /
// "[Icon] AUFGABEN 1" / "[Icon] FERTIG 2" (Kategorie-Label vor der Zahl, GENAU dieselben,
// bestehenden Icons/Werte, keine neue Ableitung) - die bisherige Mobile-Zeile bleibt exakt
// bestehen. Tagesnav/KPI-Zeile/schwarze "Heute"-Flaeche waren bereits in der Vorrunde entfernt/auf
// Text-Tabs umgestellt und blieben unangetastet.
//
// (3) Task-Card-Feinschliff (TaskCard.tsx/TaskDetailSheet.tsx): die fruehere, rein Tooltip-basierte
// (nur bei Hover erkennbare) "Verschoben"-Kennzeichnung auf der Karte wurde durch eine IMMER
// sichtbare, kompakte Sekundaerinfo in der bestehenden Zeitzeile ersetzt ("verschoben von 22.09."
// statt eines reinen Icons) - Kartenhoehe/-layout unveraendert (dieselbe TimeFlag-Badge-Reihe wie
// LCO/ECI/Zeitkonflikt/Buchungsaenderung, die bereits per Flex-Wrap ohne Hoehenwachstum umbricht).
// Die ausfuehrliche Vorher/Nachher-Information bleibt exklusiv der Detailansicht vorbehalten, dort
// jetzt praeziser als "Termin geändert · 22.09. → 23.09." (vorher nur das Ursprungsdatum ohne
// Zieldatum). Bestaetigt: die Karte selbst zeigte nie ein "GEPLANT FÜR"-Verwaltungslabel oder einen
// dauerhaft sichtbaren Edit-Stift (das Datum wird ausschliesslich ueber den bereits bestehenden
// Stift in der Detailansicht geaendert) - keine unnoetigen Datenfeld-Label wie "ZUGEWIESEN AN"/
// "ABREISEZEIT"/"STATUS" auf der Karte, Icon/Position/Kontext vermitteln die Bedeutung bereits.
//
// Verifiziert per tsc/eslint/build + Source-Diff-Audit (jede zuvor mobile-relevante Klasse in
// TasksScreen.tsx/TaskCard.tsx bleibt woertlich erhalten) + Playwright-Screenshots der Login-Seite:
// Mausklick auf Sprachpille/Submit-Button zeigt keinerlei Ring, Tab-Navigation durch Eingabefeld/
// Anmelden-Button/Sprachpillen zeigt durchgehend den duennen salbeifarbenen Fokusring, keine
// Konsolenfehler. Ein voller Login-/Redis-/Apaleo-Rundlauf durch Toolbar/Task-Card selbst ist in
// dieser Sandbox mangels Zugangsdaten weiterhin nicht moeglich (bestehende Einschraenkung).
// v2.25.0 - Statuskorrektur bei "Wieder aktiviert"/"Termin verschoben" + Zuweisungslogik bei
// Terminverschiebung (Briefing "Bitte korrigiere zwei Punkte..."). Ausschliesslich Status-Icons
// und Assignment-Logik betroffen - Kartengroesse/-layout, Typografie, Farben, Tagesnavigation,
// Desktop-Toolbar, Mobile-Layout, Apaleo-Daten, Reopen-/Timer-History unangetastet.
//
// (1) Zwei unterschiedliche fachliche Zustaende brauchten zwei unterschiedliche Icons statt
// zweimal desselben IconRefresh-Symbols: neu IconRotateCcw ("Wieder aktiviert", ein umlaufender
// Gegenuhrzeiger-Pfeil) und IconCalendarClock ("Termin verschoben", Kalenderflaeche mit kleiner
// Uhr) in icons.tsx - beide teilen Groesse/Strichstaerke/currentColor mit dem bestehenden
// Icon-System, keine farbigen Hintergruende. In TaskCard.tsx erscheinen beide bei Bedarf
// nebeneinander im Status-Kopfbereich (vor WorkStatus), je mit eigenem Tooltip + role="img"/
// aria-label ("Wieder aktiviert" / "Termin verschoben" - i18n-Keys reopened_badge_label/
// rescheduled_badge_label). Die zuvor in der letzten Runde eingefuehrte, sichtbare
// "verschoben von {Datum}"-Textzeile in der Zeitzeile wurde wieder entfernt (Rueckkehr zu
// Icon+Tooltip, TimeLine()-Struktur sonst unveraendert).
//
// (2)-(6) Wird eine Reinigung oder manuelle Aufgabe auf einen ANDEREN Tag verschoben (oder per
// "Zuruecksetzen" wieder auf den urspruenglichen Tag gestellt), wird eine bestehende
// Personalzuweisung jetzt IMMER automatisch aufgehoben (api/task-schedule-overrides.js, neue
// Hilfsfunktion buildUnassignedRecord) - die Zuweisung galt fuer die urspruengliche
// Tagesplanung, ein anderer Durchfuehrungstag braucht eine neue Entscheidung. Betrifft
// Abreisereinigung/Turnover/INTERCLEAN/sonstige Reinigungstypen ebenso wie manuelle Aufgaben.
// Ablauf bei erfolgreicher Terminaenderung: (1) neues scheduledDate speichern, (2) bestehende
// Zuweisung entfernen (Status auf 'open', housekeeperId/-Name geleert bzw. bei manuellen
// Aufgaben assignedUserId/-Name auf null), (3) Aufgabe erscheint am neuen Tag als "Nicht
// zugewiesen", (4) Tages-/Team-Zaehler aktualisieren sich reaktiv aus dem gepatchten State (kein
// separater Reload noetig), (5)+(6) je ein Audit-Eintrag fuer Terminaenderung und fuer die
// aufgehobene Zuweisung. Datumsaenderung und Zuweisungs-Entfernung laufen dabei gebuendelt in
// einer MULTI/EXEC-Transaktion (kein WATCH - siehe Kommentar an buildUnassignedRecord) -
// schlaegt eine Pruefung vorher fehl, wird ueberhaupt nichts geschrieben, die bestehende
// Zuweisung bleibt unangetastet.
//
// (3)/(7) Kein paralleles Audit-System: die Zuweisungs-Aufhebung haengt lediglich einen neuen
// history-Eintrag (action: 'unassigned', types.ts#TaskHistoryAction erweitert) an das bestehende,
// bereits genutzte history[]-Array an - vorherige Eintraege (Reopen-/Timer-Verlauf) bleiben
// vollstaendig erhalten und unveraendert sichtbar (TaskDetailSheet.tsx, neuer i18n-Key
// history_unassigned). Laufende/pausierte Reinigungen bleiben weiterhin grundsaetzlich nicht
// verschiebbar (unveraenderte bestehende Regel).
//
// Verifiziert per tsc/eslint/build (alle sauber) + eigenstaendiges Node-Integrationstest-Skript
// (require.cache-Mocking von _redis/_auth/_users/_permissions, echter Route-Handler ohne Live-
// Redis) mit 30 Assertions ueber 6 Szenarien: zugewiesene Reinigung verschieben (Zuweisung
// atomar geleert, History korrekt angehaengt, Redis-Persistenz bestaetigt), bereits unzugewiesene
// Reinigung verschieben (kein unnoetiger Zuweisungs-Schreibzugriff), manuelle Aufgabe verschieben
// (assignedUserId/-Name geleert), Zuruecksetzen auf Ursprungsdatum (Zuweisung ebenfalls geleert),
// nicht existierende Aufgabe (404, keinerlei Schreibzugriff), laufende Reinigung (409, Zuweisung
// unveraendert). Source-Diff-Audit bestaetigt: ausschliesslich die acht fachlich betroffenen
// Dateien (icons.tsx, TaskCard.tsx, TaskDetailSheet.tsx, types.ts, i18n.ts, api.ts,
// useHousekeepingApp.ts, api/task-schedule-overrides.js) geaendert - keine Kartengroessen-,
// Layout-, Typografie-, Farb-, Tagesnavigations-, Toolbar- oder Mobile-Layout-Aenderungen.
// v2.26.0 - Briefing "DEPARTURE/TURNOVER vereinheitlichen": Darstellung und Prioritaetsverstaendnis
// beider Reinigungstypen angeglichen - die internen Task-Types 'turnover'/'departure' selbst
// bleiben unveraendert (Datenmodelle NICHT zusammengefuehrt).
//
// (1)/(6) Beide teilen sich jetzt dieselbe dezente Kartenfarbe (die bisherige Turnover-Farbe,
// rot/terracotta) statt getrennt Beige (Abreise) vs. Rot (Turnover) - task-status-config.ts:
// TASK_TYPE_CONFIG.departure verwendet nun woertlich dieselben Ton-Klassen wie .turnover
// (toneClass/toneBgClass/toneBorderClass/dotClass), TaskCard.tsx#TYPE_LEFT_BORDER ebenso fuer den
// "Fertig"-Zustand. Der Unterschied bleibt ausschliesslich ueber das Label erkennbar, keine
// zweite Farbcodierung. `--color-type-departure` (app/globals.css) bleibt als CSS-Variable
// bestehen, da sie unabhaengig davon weiterhin fuer die "Aufgaben"-Kennzahl auf Mobile
// (TasksScreen.tsx) gebraucht wird - dort bewusst nicht veraendert.
//
// (2) TURNOVER heisst in der UI jetzt "Abreise & Anreise" statt "Turnover" (i18n-Key
// type_turnover, DE/EN/PL/RO) - der interne Type-Wert 'turnover' ist davon unberuehrt.
//
// (3) Same-Day-Turnover zeigt weiterhin "Abreisezeit → Anreisezeit" plus ABREISE/ANREISE-
// Belegungszeile - unveraendert, ECI/LCO/manuelle Time-Overrides werden wie bisher beruecksichtigt
// (TaskCard.tsx#TimeLine/OccupancyLine, keine Aenderung an dieser Ableitung noetig).
//
// (4)/(5) Bei DEPARTURE steht an der Stelle, an der beim Turnover die Anreisezeit stuende, jetzt
// dieselbe Informationslogik als Text: "10:00 → Nächste Anreise 24.09." bzw., falls keine
// zukuenftige Reservierung bekannt ist, "10:00 → Keine nächste Anreise" (neuer i18n-Key
// next_arrival_inline, no_next_arrival gekuerzt) - beide bewusst durchgehend dezent/`text-muted`,
// nicht alarmierend. Die dadurch redundant gewordene, vormals separate rechtsbuendige "Nächste
// Anreise"-Anzeige auf der Task Card wurde entfernt (TaskDetailSheet.tsx unveraendert, dort keine
// Redundanz).
//
// (7) INTERCLEAN (type 'stayover' mit gebuchtem INTERCLEAN-Service) bleibt vollstaendig
// unveraendert - eigener Stil, eigenes Label "Zwischenreinigung", nicht Teil dieser Angleichung.
//
// (8) tasks.ts#sortTasksForDay: die operative Prioritaet zwischen Turnover und Departure wird
// nicht mehr aus dem Type selbst abgeleitet (bisher TYPE_TIER: turnover immer vor departure),
// sondern aus dem tatsaechlichen naechsten Zeitpunkt, zu dem das Apartment bezugsfertig sein muss
// (neue Funktion nextRequiredAtKey(), ein sortierbarer "YYYY-MM-DD HH:MM"-Schluessel) - Same-Day-
// Turnover: die heutige effektive Anreisezeit (ECI/Override bereits beruecksichtigt); Departure mit
// bekannter Folgebelegung: der naechste Anreisetag. Beide Typen bilden jetzt EINEN gemeinsamen
// Rang (statt zwei getrennter TYPE_TIER-Werte), Stayover/Extra/Manual bleiben unveraendert eigene,
// niedrigere Raenge. Effekt: eine Departure mit sehr naher Folgeanreise sortiert jetzt vor einer
// Departure ohne/mit ferner Folgeanreise (vorher beide gleichrangig) - die bestehende Risk Engine
// wurde dafuer NUR an der einen Stelle angepasst, an der TURNOVER bisher pauschal Vorrang hatte,
// keine sonstige Neuentwicklung.
//
// (9) Kennzahlen: keine Aenderung noetig - eine separate "Turnover"-Kennzahl existierte im
// Dashboard/TasksScreen ohnehin nicht (nur die uebergeordnete Kategorie "Reinigungen"), DaySummary.
// turnover bleibt intern fuer Auswertungszwecke bestehen, wird aber nirgends als eigene UI-
// Kennzahl angezeigt.
//
// Verifiziert per tsc/eslint/build (alle sauber) + eigenstaendigem Node-Logiktest fuer
// sortTasksForDay() (6 Szenarien: Turnover vs. nahe/ferne/unbekannte Departure-Folgeanreise,
// Reinigung-nach-Abreise-Familie vor Stayover/Extra/Manual, Statusrang und Zeitkonflikt bleiben
// unveraendert vorrangig) + Source-Diff-Audit (ausschliesslich TaskCard.tsx/i18n.ts/
// task-status-config.ts/tasks.ts geaendert - keine Kartengroesse/-layout, Tagesnavigation,
// Desktop-Toolbar, Mobile-Layout oder Apaleo-Datenanbindung betroffen).
// v2.27.0 - Briefing "Reinigungskarten ueberarbeiten": Standort-Gruppierung, zwei neue
// userbezogene Aufmerksamkeits-Punkte (gesehen/Buchungsaenderung) und ein prominenter
// Babybett-Vorbereitungshinweis fuer Same-Day-Anreisen. Bestehende Business-Logik (Task-
// Ermittlung, Assignment, Timer, INTERCLEAN, Permissions, Apaleo-Integration) unveraendert.
//
// (1)/(2) TasksScreen.tsx: bei "Alle Standorte" werden Reinigungen/Aufgaben jetzt zusaetzlich
// nach der ECHTEN Apaleo Property-ID (task.propertyCode, niemals Unit-Namen/String-Matching) in
// kleine, ruhige Standortgruppen unterteilt (neue reine Funktion groupTasksByProperty) - dieselbe,
// bereits bestehende dringlichkeitsbasierte Sortierung (sortTasksForDay) bleibt INNERHALB jeder
// Gruppe exakt erhalten, keine neue parallele Prioritaetslogik. Ist bereits ein einzelner Standort
// ausgewaehlt, entfaellt die zusaetzliche Ueberschrift (redundant). Gruppenreihenfolge folgt der
// bestehenden Standort-Picker-Reihenfolge.
//
// (5)/(7)/(8) Neuer, bewusst von "Wichtiger Hinweis" GETRENNTER Aufmerksamkeits-Punkt oben rechts
// auf der Task Card: gruen = fuer den eingeloggten Benutzer noch nie in der Detailansicht
// geoeffnet (neues, userbezogenes housekeeping:task_seen, gesetzt ausschliesslich beim
// tatsaechlichen Oeffnen der Detailansicht - nie beim Laden/Scrollen des Dashboards), orange =
// Buchungsaenderung noch nicht bestaetigt (neues housekeeping:task_booking_change_acks, an den
// exakten Aenderungszeitstempel gekoppelt, damit eine SPAETERE neue Aenderung automatisch wieder
// unbestaetigt ist). Buchungsaenderung hat immer Vorrang vor "ungesehen" (nie beide Punkte
// gleichzeitig). Neue Route api/task-views.js (+ Helfer api/_task-views.js, identisches Muster
// wie api/task-notices.js) - "gesehen" und "Buchungsaenderung bestaetigt" bleiben zwei technisch
// getrennte Datenquellen. Der bisherige, inline in der Zeitzeile stehende "Buchung geändert"-Text
// wurde entfernt (jetzt ausschliesslich der orange Punkt) - die Zeitzeile ist wieder
// ausschliesslich operative Zeitinformation. Die Detailansicht zeigt weiterhin nur tatsaechlich
// geaenderte Werte (jetzt mit aufgeloestem Apartmentnamen statt roher Unit-ID) plus eine neue,
// dezente "Änderung zur Kenntnis genommen"-Aktion.
//
// (9)-(11) Babybett-Vorbereitung: bei einer Same-Day-Anreise (Turnover) mit gebuchtem
// Apaleo-Service BABY auf der ANKOMMENDEN Reservierung erscheint rechts unten im ANREISE-Block ein
// eigenes, etwas groesseres Crib-Icon (kein Text auf der kompakten Karte) - ersetzt dort die
// bisherige kleine Inline-Anzeige (die weiterhin fuer die ABREISE-Seite unveraendert gilt). Hund
// bleibt unveraendert je Seite inline neben der Gaestezahl. BABY wird weiterhin ausschliesslich aus
// dem gebuchten Apaleo-Service abgeleitet, nie aus Kinderzahl/-alter/Gaestezahl - eine BABY-Buchung
// nur auf der abreisenden Reservierung loest keinen Anreise-Vorbereitungshinweis aus. IF-Reinigung
// (Team) bleibt unveraendert auf der Karte sichtbar.
//
// Verifiziert per tsc/eslint/build (alle sauber) + zwei eigenstaendigen Node-Integrationstests:
// 16 Assertions fuer api/task-views.js (markSeen/acknowledgeChange, userbezogene Isolation,
// server-seitig ermittelter Aenderungszeitstempel statt Client-Wert, Property-Zugriffspruefung
// fuer abgeleitete UND manuelle Task-IDs) sowie eine erneute Bestaetigung der bestehenden
// sortTasksForDay()-Prioritaet (unveraendert). Source-Diff-Audit bestaetigt: ausschliesslich
// TaskCard.tsx/TaskDetailSheet.tsx/TasksScreen.tsx/api.ts/i18n.ts/types.ts/
// useHousekeepingApp.ts sowie die zwei neuen API-Dateien geaendert - keine Aenderung an
// Kartengroesse/Mobile-Layout/Task-Ermittlung/Assignment-Logik/Apaleo-Integration.
// v2.27.1 - Bugfix: "Buchung geändert"-Detailkarte zeigte "NaN.NaN." statt des Datums.
// change.arrivalFrom/-To/departureFrom/-To (BookingChangeRecord) sind die rohen Apaleo-Felder
// r.arrival/r.departure - volle ISO-Datumszeiten, keine reinen Datumsstrings. formatDayMonth()
// in TaskDetailSheet.tsx haengte "T00:00:00" direkt an eine bereits vollstaendige ISO-Datumszeit
// an, was ein ungueltiges Datum ergab - jetzt wird zuerst auf "YYYY-MM-DD" normalisiert
// (slice(0, 10), bei einem bereits reinen Datumsstring wirkungslos).
//
// v2.28.0 - MINOR: automatische Uebersetzung frei eingegebener operativer Texte ("Wichtiger
// Hinweis", Beschreibung einer manuellen Aufgabe) in die vier App-Sprachen (DE/EN/PL/RO).
// Architektur: neuer, additiver Typ FreeTextTranslation (types.ts) mit sourceLanguage/sourceText/
// translations/translationStatus/translatedAt - haengt an TaskNotice.translation bzw.
// ManualTask.descriptionTranslation, NIEMALS ein Ersatz fuer text/description (Originaltext bleibt
// unveraendert die alleinige Quelle der Wahrheit, keine Migration bestehender Datensaetze noetig).
// Provider hinter einer kleinen serverseitigen Abstraktion (api/_translate.js#translateTextBatch/
// buildFreeTextTranslation) versteckt - aktuell Anthropic Messages API per rohem fetch (kein neues
// npm-Package, konsistent zum bestehenden "kein SDK"-Muster), striktes Anti-Halluzinations-
// System-Prompt (keine Infos hinzufuegen/entfernen, Zahlen/Uhrzeiten/Eigennamen/Codes
// unveraendert lassen). Neue, aktuell bewusst leere Terminologie-Schicht (api/_translation-
// glossary.js) fuer spaeter feste Uebersetzungen einzelner Housekeeping-Begriffe. Quellsprache =
// die aktuell im Client angezeigte App-Sprache (state.lang) - server-seitig neu mitgesendet bei
// task-notices.js#set und manual-tasks.js#create, Fallback 'de'. Uebersetzungen entstehen
// ausschliesslich beim Speichern (nie live beim Oeffnen der Detailansicht); jede inhaltliche
// Bearbeitung eines Hinweises (die die bestehende Versions-/Bestaetigungs-Invalidierung ohnehin
// unveraendert durchlaeuft) erzeugt alle Uebersetzungen neu aus dem neuen Text - alte
// Uebersetzungen werden nie mit neuem Quelltext kombiniert. Anzeige faellt bei fehlender/
// fehlgeschlagener Uebersetzung immer automatisch auf den Originaltext zurueck (nie eine leere
// Notiz); ein neuer, dezenter "Original anzeigen"/"Übersetzung anzeigen"-Umschalter erscheint nur,
// wenn die aktuelle Sprache von der Quellsprache abweicht. Admin/Standortverantwortliche sehen bei
// einer fehlgeschlagenen Uebersetzung zusaetzlich einen kurzen Hinweis mit "Übersetzung erneut
// versuchen" (neue task-notices.js-Aktion 'retryTranslation' - aendert weder Text noch Version
// noch Bestaetigungen). Ein nicht erreichbarer/fehlerhaft antwortender Provider blockiert nie das
// Speichern des Originaltexts (Fehler werden ausschliesslich als translationStatus:'failed' pro
// Zielsprache abgebildet). Normale UI-i18n-Texte (i18n.ts) durchlaufen weiterhin unveraendert das
// bestehende System und werden nie an den Uebersetzungs-Provider geschickt. Neue Environment
// Variable ANTHROPIC_API_KEY (ausschliesslich serverseitig, siehe README.md) - ohne gesetzten Wert
// gilt jede Zielsprache als fehlgeschlagen, der Originaltext wird trotzdem normal gespeichert.
// Scoping-Hinweis: es existiert aktuell keine "Aufgabe bearbeiten"-Aktion fuer manuelle Aufgaben -
// die Uebersetzung einer Aufgabenbeschreibung entsteht daher ausschliesslich bei der Erstellung;
// keine neue Bearbeiten-Funktion wurde dafuer eingefuehrt.
// Verifiziert per tsc/eslint/build (alle sauber) sowie einem eigenstaendigen Node-Integrationstest
// (36 Assertions: DE-Quelltext -> EN/PL/RO, Anzeige je nach state.lang inkl. Fallback auf das
// Original bei fehlender/fehlgeschlagener Uebersetzung, Provider unerreichbar/Provider-Fehler
// blockieren das Speichern nicht, Bearbeitung erzeugt neue Uebersetzungen UND loescht alte
// Bestaetigungen, Admin-Retry aendert weder Text/Version/Bestaetigungen, manuelle Aufgabe wird
// ebenfalls uebersetzt, i18n.ts referenziert den Uebersetzungs-Provider nicht) gegen
// api/task-notices.js und api/manual-tasks.js mit gemocktem Redis/fetch (kein Live-Redis/
// -Anthropic in der Sandbox). Keine Aenderung an Kartengroesse/Mobile-Layout/bestehender
// Housekeeping-Logik, keine geloeschten Daten.
// v2.28.1 - Feinschliff Task Card (Nutzerfeedback): "Termin verschoben"/"Wieder aktiviert" stehen
// jetzt direkt neben dem Typ-Label (z. B. "Abreise") statt neben Zuweisung/Team. Die "Neu"/
// "Buchung geändert"-Aufmerksamkeitspunkte nutzen eigene, minimal hellere Farbtoene (--color-dot-new/
// --color-dot-changed, globals.css) statt der dunkleren status-clean/status-progress-Toene, die
// weiterhin unveraendert fuer die eigentlichen Reinigungsstatus-Anzeigen gelten. Die Ansicht-/
// Standort-<select> in TasksScreen.tsx zeigen keinen Fokusring mehr (neues `data-focus-none`-Opt-out
// vom globalen Fokusring-Fallback in globals.css) - alle anderen Elemente sind unveraendert.
// v2.29.0 - MINOR: Reinigungsdetailansicht ueberarbeitet (Informationshierarchie/Gruppierung,
// keine bestehende Business-Logik veraendert). Kopf: Typ-Label + "Termin verschoben"/"Wieder
// aktiviert" + Team/Reinigungskraft (WorkStatus, wiederverwendet aus TaskCard.tsx) in einer Zeile,
// darunter die kompakte ABREISE/ANREISE-Belegungszeile (OccupancyLine, ebenfalls wiederverwendet)
// sowie ein neuer "Neu"/"Buchung geändert"-Aufmerksamkeitshinweis oben rechts (dieselbe, bereits
// bestehende Logik wie auf der Karte). "Reservierung" + "Reservierungskommentar" zu einem
// gemeinsamen "Buchung"-Bereich zusammengefuehrt (Kommentar als sekundaere Information mit eigenem
// Sprechblasen-Icon statt eigener Karte) - kein Apaleo-Deeplink ergaenzt, da keine zuverlaessige
// Web-URL/ID-Logik dafuer existiert. "Buchung geändert" bekommt eine helle orangene
// Akzentflaeche (status-progress-Ton) statt einer neutralen Karte, kuerzeres Aktionslabel "Zur
// Kenntnis nehmen" sowie einen sichtbaren "Zur Kenntnis genommen"-Zustand nach Bestaetigung.
// "Wichtiger Hinweis" deutlich staerker hervorgehoben (helle Terracotta-Akzentflaeche,
// GROSSGESCHRIEBENER Titel) und zeigt bei einer angezeigten automatischen Uebersetzung zusaetzlich
// dezent "Automatisch übersetzt" (neues Globus-Icon, nur wenn tatsaechlich eine Uebersetzung fuer
// die aktuelle Sprache vorliegt - keine Fake-Anzeige). "Team"/"Reinigung"/"Vorbereitung" zu einem
// gemeinsamen "Arbeitsauftrag"-Abschnitt zusammengefuehrt (Team und Reinigungskraft als zwei
// getrennt beschriftete Felder, nebeneinander auf Desktop); die Vorbereitungs-Chips zeigen
// zusaetzlich ein per Apaleo-Service (BABY) gebuchtes Babybett/einen gebuchten Hund immer als aktiv
// (mit Hinweistext "Diese Vorbereitung basiert auf den gebuchten Apaleo-Extras"), unabhaengig vom
// separaten manuellen Flag - beide Datenquellen bleiben technisch weiterhin getrennt
// (toggleTaskDoubleType unveraendert). "Reinigung starten" bleibt die eindeutige primaere Aktion;
// "Vorfall melden" ist jetzt sichtbar sekundaer (Outline, auf Desktop links daneben statt
// gestapelt darunter) - der bereits bestehende disabled-Button-Mechanismus fuer einen
// unbestaetigten wichtigen Hinweis (inkl. Hervorhebung der Notice-Card) ist unveraendert. Keine
// Aenderung an Statuslogik/Rechten/APIs/Datenmodell (ausser der bereits zuvor eingefuehrten,
// rein additiven FreeTextTranslation) und keine Aenderung am mobilen Dashboard/den Task-Cards
// (nur TaskCard.tsx#WorkStatus/OccupancyLine wurden fuer die Wiederverwendung exportiert, ihr
// eigenes Verhalten/Aussehen ist unveraendert). Verifiziert per tsc/eslint/build (alle sauber).
// v2.30.0 - MINOR: UX-Optimierung Reinigungsdetail - drei zusammenhaengende Punkte. (1) Der
// schwarze Toast, der bisher direkt neben dem "Reinigung starten"-Button erschien, wenn der
// wichtige Hinweis noch unbestaetigt war, ist entfernt. Der Button bleibt sichtbar, aber optisch
// deaktiviert (unveraendert); ein Tap scrollt stattdessen sanft zur WICHTIGER-HINWEIS-Karte und
// hebt sie kurz hervor (warme, nicht-rote Akzentflaeche). Solange der Hinweis unbestaetigt ist,
// steht dort dauerhaft "Bitte bestätige diesen Hinweis. Danach kannst du die Reinigung starten." -
// nach der Bestaetigung verschwindet dieser Text, die Hervorhebung endet und der Button wird
// aktiv, OHNE zurueckzuscrollen (die Reinigungskraft entscheidet selbst, wann sie weitermacht).
// Die serverseitige Sperre in api/task-assignments.js#startTimer ist unveraendert. (2) "Vorbereitung"
// ist jetzt eine echte, pro Aufgabe abhakbare Checkliste statt reiner Anzeige-Chips: ein per
// Apaleo-Service (BABY) gebuchtes Babybett sowie alle manuell gesetzten Vorbereitungs-Flags
// (siehe tasks.ts#requiredPreparationItemIds) erscheinen als antippbare Zeilen (min. 44px,
// Haken/Kreis-Icon statt Warnfarbe); ein NUR gebuchter Hund ohne manuelles Flag bleibt bewusst
// reine Gaesteinformation und wird NICHT Teil der Checkliste. Der Erledigt-Status wird ueber die
// neue Aktion 'togglePreparation' persistiert - additiv auf demselben TaskAssignment-Datensatz
// (preparationCompletions: {itemId: {completedByUserId, completedByUserName, completedAt}}), also
// weiterhin ausschliesslich unter housekeeping:task_assignments, kein neuer Redis-Key. Ein Abhaken
// beansprucht die Aufgabe nie implizit (housekeeperId bleibt null, bis sie tatsaechlich gestartet
// wird) - canTouchOwnAssignment() behandelt einen Datensatz ohne Zuweisung dafuer wie einen
// fehlenden Datensatz (jede Person mit Property-Zugriff darf togglen), sonst haette nicht einmal
// dieselbe Person ihr eigenes erstes Abhaken rueckgaengig machen koennen. "Reinigung abschließen"
// ist jetzt zusaetzlich (client- UND serverseitig in api/task-assignments.js#complete, per
// client-deklariertem requiredPreparationIds - derselbe Vertrauensrahmen wie das bereits
// bestehende requiresInspection/linenItems) blockiert, solange Pflichtpunkte offen sind: Tap
// scrollt zur Checkliste, hebt sie hervor und zeigt dort "Bitte erledige zuerst alle
// Vorbereitungen. Danach kannst du die Reinigung abschließen." - eine offene Vorbereitung
// blockiert AUSSCHLIESSLICH den Abschluss, niemals den Start (beide Sperren sind bewusst
// unabhaengig). Manuelle Aufgaben (Typ 'manual') haben weiterhin keinerlei Vorbereitungs-Workflow.
// (3) Der "Arbeitsauftrag"-Abschnitt hat jetzt eine eigene, dezente Hintergrundflaeche
// (bg-type-stayover-bg, #EDF1EA - bereits bestehender Farbtoken, keine neue Farbe) statt derselben
// beigen Flaeche wie "Buchung", damit er nicht mehr wie eine weitere generische Info-Karte wirkt.
// Der Vorbereitungs-Chip-Editor (Admin/Standortverantwortlich, jetzt "Vorbereitung festlegen")
// bleibt bestehen, ist aber visuell klar von der neuen Housekeeper-Checkliste getrennt - Admins
// sehen zusaetzlich, wer eine Position wann erledigt hat. Kompakte Karte/Dashboard unveraendert
// (kein zusaetzlicher "Babybett offen"-Text). Verifiziert per tsc/eslint/build sowie einem
// Node-Integrationstest gegen einen Fake-Redis (togglePreparation an/aus, Rechte, complete-Sperre
// inkl. Ruckwaertskompatibilitaet ohne requiredPreparationIds) - alle 12 Faelle bestanden.
// v2.30.1 - PATCH: drei kleine Korrekturen in der Reinigungsdetailansicht, keine Aenderung an
// Business-Logik/Datenmodell. (1) Der Status-Punkt "Zugewiesen" (TASK_STATUS_CONFIG.assigned)
// nutzte bisher denselben roten "dirty"-Ton wie "Offen" (unzugewiesen) - "zugewiesen" ist aber ein
// positiver Zwischenschritt, kein Warnzustand, und bekommt jetzt denselben gruenen Ton wie
// "Fertig" (status-clean). (2) Eine manuell verschobene Reinigung ("Geplant für") war nur ein
// dezenter grauer Hinweistext - jetzt ein deutliches gelb/goldenes Feld (bereits bestehender
// status-progress-Ton, wie bei "Buchung geändert" - keine neue Farbe eingefuehrt). (3) "Geplant
// für DD.MM.YYYY" stand als eigener Block mit eigener Grossbuchstaben-Ueberschrift UEBER dem
// Zeitfenster - jetzt in einer Zeile auf gleicher Hoehe/Schriftgroesse wie die Zeit, mit einem
// neuen, schlichten Kalender-Icon (IconCalendar, bewusst unterschieden vom bestehenden
// IconCalendarClock des "Termin verschoben"-Badges). Verifiziert per tsc/eslint/build.
// v2.30.2 - PATCH: Nutzerfeedback zur Notice-Bestaetigung, keine Aenderung an Business-Logik.
// Der in v2.30.0 ergaenzte, dauerhaft in der WICHTIGER-HINWEIS-Karte eingeblendete Erklaerungstext
// ("Bitte bestätige diesen Hinweis. Danach kannst du die Reinigung starten.") ist wieder entfernt -
// die Karte zeigt bei unbestaetigtem Hinweis wieder ausschliesslich den Hinweistext selbst plus die
// "Gelesen und verstanden"-Aktion, wie vor v2.30.0. Scroll+kurzes Rahmen-Highlight bei einem
// blockierten Start-Versuch bleiben bestehen (kein Toast). Der Highlight-Zustand nutzte bisher
// zusaetzlich zum kraeftigeren Rahmen (border-status-attention) noch einen separaten
// `ring-2 ring-status-attention/30` daneben - dieser zusaetzliche Ring-Schatten ist entfernt, sodass
// beim Highlight nur noch GENAU ein (dunklerer, roter) Rahmen erscheint statt zweier dicht
// uebereinanderliegender Umrandungen. Verifiziert per tsc/eslint/build.
// v2.31.0 - MINOR: "Buchung geändert" braucht keine manuelle Bestaetigung mehr. Die Karte in der
// Detailansicht zeigt jetzt ausschliesslich die tatsaechliche Aenderung (Datum, Personenanzahl,
// Einheit) - der bisherige "Zur Kenntnis nehmen"-Button/"Zur Kenntnis genommen"-Zustand ist
// entfernt. Die Kenntnisnahme (fuer den orangenen Aufmerksamkeitspunkt auf der kompakten Karte
// sowie den "Buchung geändert"-Chip oben rechts in der Detailansicht, beide unveraendert ueber
// isBookingChangeAckedByMe) passiert stattdessen automatisch beim Oeffnen der Detailansicht -
// derselbe Trigger-Zeitpunkt wie beim bereits bestehenden "gesehen"-Effekt (markTaskSeen), nur
// als eigener, weiterhin unabhaengiger useEffect (keine Vermischung der beiden Zustaende). Neu:
// Personenanzahl (Erwachsene + Kinder, siehe tasks.ts#guestCount) ist ein viertes housekeeping-
// relevantes Vergleichsfeld neben Anreise/Abreise/Einheit (api/booking-changes.js, additiv im
// bestehenden housekeeping:booking_change_snapshots/housekeeping:booking_changes-Schema, kein
// neuer Redis-Key) - eine fehlende/unbekannte Personenzahl (z. B. keine expand=... im Rohdatum)
// wird dabei nie faelschlich als "0 Gaeste"-Aenderung gewertet. Verifiziert per tsc/eslint/build
// sowie einem Node-Integrationstest gegen einen Fake-Redis (8 Faelle: Erkennung/Baseline/
// Ruecksetzung fuer Personenanzahl, Regressionscheck der bestehenden Datum-Erkennung).
// v2.31.1 - PATCH: Nutzerfeedback zur Vorbereitungs-Checkliste, keine Aenderung an
// Business-Logik/Datenmodell. Die in v2.30.0 eingefuehrte schmale Listenzeile war weniger gut
// lesbar als die vorherige, groessere Pill-Darstellung - jeder Vorbereitungspunkt ist jetzt
// wieder ein groesserer, abgerundeter Chip (wie zuvor bei den reinen Anzeige-Chips), aber
// weiterhin tappable: ein Klick schaltet ueber togglePreparationItem weiterhin den
// Erledigt-Status um und zeigt dabei einen Haken statt des leeren Kreises. Die Admin-Detailinfo
// ("Erledigt von X · Zeit") ist als Tooltip auf dem Chip statt als sichtbarer Zusatztext
// untergebracht, damit die Chip-Groesse einheitlich bleibt. Der Hinweistext bei offenen
// Pflichtpunkten ("Vorbereitung noch nicht vollständig.") ist deutlich kuerzer und dezenter
// (kleinere, gedaempfte Schrift statt normaler Textfarbe) statt des vorherigen ausformulierten
// Satzes. Verifiziert per tsc/eslint/build.
// v2.31.2 - PATCH: Bugfix "Verschobene Reinigung verschwindet nach Tageswechsel" (Nutzerfeedback:
// "eine Reinigung, die ich gestern von gestern auf heute verschoben habe, wird heute nicht mehr
// als Reinigung angezeigt"). Ursache: buildTasks() erzeugt einen Task ausschliesslich fuer Tage
// innerhalb des sichtbaren, rollierenden 4-Tage-Planungsfensters (Heute+3); das unveraenderte
// Apaleo-Quelldatum einer verschobenen Reinigung faellt aber bereits am naechsten Tag aus diesem
// Fenster - der Task wurde dann gar nicht erst generiert (nicht nur sein Override verwaiste,
// sondern die gesamte Reinigung verschwand), obwohl ihr Verschiebungs-Zieldatum weiterhin
// sichtbar war. War kein Rand-, sondern der REGELFALL: bereits nach jeder Verschiebung um nur
// einen Tag am naechsten Tag reproduzierbar. Neue Funktion tasks.ts#taskGenerationDays() liefert
// zusaetzliche, NICHT sichtbare Ruecklauftage (mathematisch hergeleitet aus der Fenstergroesse,
// die bereits die maximale Verschiebedistanz begrenzt) - buildTasks() (useHousekeepingApp.ts#
// resolvedTasksAll) und die Apaleo-Reservierungsabfrage (useHousekeepingApp.ts#loadPlanningData)
// beruecksichtigen diese Ruecklauftage jetzt zusaetzlich, sodass das Quelldatum einer verschobenen
// Reinigung auffindbar bleibt. `state.planningDays` (Tages-Tabs/Datumsauswahl im UI) sowie die
// bestehende Begrenzung des Zieldatums auf das sichtbare Fenster bleiben dabei unveraendert - ein
// auf einem Ruecklauftag erzeugter, NICHT verschobener Task bleibt weiterhin unsichtbar (alle
// Tagesansichten filtern unveraendert nach scheduledDate). Verifiziert per tsc/eslint/build sowie
// einem Node-Logiktest gegen die transpilierte tasks.ts (11 Faelle: Bug reproduziert ohne Fix,
// Fix behebt ihn, keine Dopplung, Regressionscheck fuer unveraenderte Ruecklauftag-Tasks).
// v2.31.3 - PATCH: Nutzerfeedback zur "BUCHUNG GEÄNDERT"-Karte ("nicht schoen dargestellt"), keine
// Aenderung an Business-Logik. Titel/Datum standen bisher in einer eigenen, durch das Icon
// eingerueckten Zeile, waehrend die eigentliche Aenderung (Abreise/Anreise/Personen/Einheit)
// darunter bei der Karten-Innenkante begann - beide Bloecke hatten dadurch unterschiedliche linke
// Kanten (optisch zerrissen). Jetzt EINE gemeinsame, neben dem Icon eingerueckte Spalte, alles auf
// derselben Kante ausgerichtet. Jede Aenderung steht zudem als eigene Zeile mit fixer Label-Breite
// (klare Tabellen-Anmutung: Alt-Wert -> Pfeil-Icon -> Neu-Wert, hervorgehoben statt gleich
// schwerer "Label: Wert"-Flieszeilen) - neues IconArrowRight statt eines reinen Textpfeils.
// Verifiziert per tsc/eslint/build.
// v2.32.0 - MINOR: Business-Logik fuer das Apaleo-Extra `BABY` grundlegend angepasst (Nutzerfeedback
// "BABY = immer Vorbereitung innerhalb der Reinigung ist zu pauschal"). Neue Leitfrage statt "wann
// wurde BABY gebucht": "Gibt es noch eine aktive Turnover-Reinigung, in die diese Vorbereitung
// sinnvoll integriert werden kann?" - requiredPreparationItemIds() (unveraendert) deckt dank
// stabiler Task-IDs und live aus Apaleo neu berechneter Felder bereits automatisch alle Faelle ab,
// in denen eine passende Turnover-Reinigung existiert und noch nicht abgeschlossen ist (Babybett
// wird Pflicht-Vorbereitungspunkt, blockiert nur den Abschluss, nie den Start). NEU ist ausschliesslich
// der komplementaere Fall: tasks.ts#computeExtraEquipmentNeeds() leitet rein aus bereits geladenen
// Apaleo-Daten ab, wann KEINE passende offene Turnover-Reinigung existiert (keine Abreise am selben
// Tag in derselben Einheit, ODER die zugehoerige Reinigung ist bereits `completed` - eine
// abgeschlossene Reinigung wird niemals wieder geoeffnet) und dann eine separate `Zusatzausstattung`-
// Aufgabe noetig ist (ganz normale ManualTask, kein Reinigungs-Timer/-Start/-Pause, Abschluss
// ausschliesslich ueber "Aufgabe erledigt", Deadline "Anreise HH:MM" inkl. Early-Check-in). Deterministische
// ID (`manual_extra_BABY_<reservationId>`, tasks.ts#manualExtraEquipmentTaskId) verhindert Duplikate
// bei wiederholtem Sync; api/manual-tasks.js#syncExtraEquipment gleicht idempotent ab (anlegen, wenn
// noetig; eine offene, nicht mehr benoetigte Aufgabe sauber entfernen; eine bereits ERLEDIGTE Aufgabe
// niemals loeschen) - ausschliesslich fuer Properties/Reservierungen, die der jeweilige Sync selbst
// ausgewertet hat, nie darueber hinaus. api/booking-changes.js um ein fuenftes Vergleichsfeld `crib`
// erweitert (analog zu `guests`), damit ein nachtraeglich auf einer bereits offenen/laufenden
// Reinigung hinzugekommenes/entferntes Babybett ueber die bestehende Buchungsaenderungs-/Ungesehen-
// Logik sichtbar wird ("Buchung geändert" + "+ Babybett", kein neues Farbsystem) - dafuer greift
// buildTasks() bei einem Turnover-Task jetzt auch auf bookingChanges[arrivingRes.id] zu (bisher nur
// departingRes.id, ein reiner Crib-Wechsel haengt aber an der ankommenden Reservierung). TaskCard/
// TaskDetailSheet zeigen eine automatisch erzeugte Zusatzausstattung-Aufgabe mit dem bereits
// definierten Crib-Icon + "Babybett" + Anreise-Deadline statt generischem Freitext, plus einem
// "Zusatzausstattung"-Kategorie-Label neben dem "Aufgabe"-Typ. Keine neue Task-Engine, keine
// neue Team-/Berechtigungslogik (bestehende ManualTask-Zuweisungs-/Property-Rechte unveraendert
// wiederverwendet), keine geloeschten Redis-Daten. Verifiziert per tsc/eslint/build sowie zwei
// Node-Logiktestsuiten (26 Assertions gegen die transpilierte tasks.ts fuer die Faelle A-J aus dem
// Briefing; 7 Assertions gegen die echte api/manual-tasks.js-Route mit Mock-Redis fuer Anlegen/
// Idempotenz/Entfernen/Nie-Loeschen-bei-Erledigt).
// v2.32.1 - PATCH: Bugfix "Buchung geändert" erschien mit "Anreise 23.09. -> 23.09." (Nutzerfeedback:
// "Bei dieser Abreise kam es zu keiner sichtbaren Änderung des Datum, der Einheit oder der
// Personenanzahl. Buchung geändert sollte nicht erscheinen."). Ursache: api/booking-changes.js
// verglich Anreise/Abreise als VOLLE ISO-Datumszeit inkl. Uhrzeit - eine reine Uhrzeitaenderung ohne
// Tageswechsel (z. B. eine von Apaleo aktualisierte geschaetzte Ankunftszeit) wurde dadurch
// faelschlich als housekeeping-relevante Aenderung erkannt, obwohl fuer Housekeeping ausschliesslich
// der Kalendertag relevant ist (die Uhrzeit selbst laeuft bereits getrennt ueber LCO/ECI/Zeiten-
// Override). Angezeigt wurde das durch formatDayMonth()s Truncation auf Tag.Monat als "X -> X" -
// sichtbar "keine Aenderung", obwohl die Karte trotzdem erschien. Vergleich/Speicherung erfolgen
// jetzt konsequent auf Tagesebene (neue dateOnly()-Normalisierung in api/booking-changes.js) - eine
// echte Datumsaenderung wird weiterhin zuverlaessig erkannt und zeigt dann auch zwei tatsaechlich
// unterschiedliche Tage (behebt nebenbei denselben Bug latent auch fuer den "verwaister Schedule-
// Override"-Abgleich in TaskDetailSheet.tsx, der exakt dasselbe Datumsformat erwartet). Verifiziert
// per tsc/eslint/build sowie einem neuen Node-Regressionstest gegen die echte api/booking-changes.js-
// Route (Mock-Redis): reine Uhrzeitaenderung loest keine Aenderung mehr aus, echte Datumsaenderung
// weiterhin zuverlaessig mit zwei unterschiedlichen Tagen.
// v2.32.2 - PATCH: Bugfix "jetzt werden alle Buchungen als geändert angezeigt" (Regression aus
// v2.32.1). Ursache: der vorherige dateOnly()-Fix normalisierte NUR den neu berechneten `current`-
// Wert auf Tagesebene, waehrend ein VOR diesem Fix in Redis gespeicherter Snapshot weiterhin die
// volle ISO-Datumszeit enthielt - ein Vergleich zwischen altem Vollformat und neuem Tagesformat
// unterschied sich dadurch bei praktisch JEDER Reservierung, unabhaengig davon, ob sich tatsaechlich
// etwas geaendert hatte. `previous` wird jetzt beim Lesen ebenfalls durch dateOnly() normalisiert -
// bei einem bereits im neuen Format vorliegenden Snapshot wirkungslos, bei einem alten heilt es den
// einmaligen Formatwechsel sofort und ohne separaten Migrationsschritt aus.
// Zugleich Nutzerfeedback umgesetzt: "Eine Änderung ist nur bei Umbuchung (Datum, Einheit) und
// Änderung Anzahl der Personen relevant. Alle anderen Änderungen sind nicht relevant." - das in
// v2.32.0 ergaenzte fuenfte Vergleichsfeld `crib` (Babybett) wird wieder vollstaendig aus
// api/booking-changes.js entfernt (zurueck auf die urspruenglichen vier Felder Anreise/Abreise/
// Einheit/Personenanzahl); ein mitgesendetes `crib`-Feld wird ignoriert und loest nie mehr eine
// "Buchung geändert"-Anzeige aus. `cribFrom`/`cribTo` aus BookingChangeRecord sowie die zugehoerige
// "+ Babybett hinzugefügt"-Zeile in TaskDetailSheet.tsx#BookingChangeDetail wurden entsprechend
// entfernt. Die davon UNABHAENGIGE BABY-Vorbereitungslogik (Pflicht-Checklistenpunkt/Blockade des
// Reinigungsabschlusses, automatische Zusatzausstattung-Aufgabe) bleibt komplett unveraendert - das
// betrifft ausschliesslich, WAS als "Buchung geändert" angezeigt wird. Verifiziert per tsc/eslint/
// build sowie einer erweiterten Node-Regressionstestsuite gegen die echte api/booking-changes.js-
// Route (Mock-Redis, 7 Assertions): reine Uhrzeitaenderung weiterhin ignoriert, echte
// Datumsaenderung weiterhin zuverlaessig erkannt, ein Alt-Snapshot im vollen ISO-Format loest keine
// falsche Aenderung mehr aus, ein reiner Babybett-Wechsel wird nicht mehr als Aenderung erkannt.
// v2.33.0 - MINOR: Detailansicht einer Reinigung grundlegend nach neuer visueller Referenz
// optimiert (KOPF -> ggf. BUCHUNGSÄNDERUNG -> BUCHUNG -> ggf. WICHTIGER HINWEIS -> ARBEITSAUFTRAG
// -> Aktionen), ausschliesslich UI/UX - keine Aenderung an Task-Ableitung, DEPARTURE/TURNOVER-/
// INTERCLEAN-/BABY-Logik, Timer/Pause, Uebersetzung, Aufgabenlogik, Standortgruppierung oder
// Redis-Struktur:
// - Kopf zeigt keine separate Gaesteinformationszeile mehr (vormals TaskCard.tsx#OccupancyLine) -
//   Belegung steht ausschliesslich in "Buchung".
// - "Buchung" fasst Reservierungsdaten, Belegung UND Reservierungskommentar in einem Bereich
//   zusammen; bei einer einzelnen Reservierung jetzt "Abreise · 2 Erwachsene" statt einer
//   Kennzahl ohne Kontext, bei Turnover bleibt die zweispaltige Abreise/Anreise-Trennung mit dem
//   Reservierungskommentar eindeutig der richtigen Seite (Anreise) zugeordnet.
// - Neuer Apaleo-Deep-Link ("Buchung in Apaleo öffnen", https://app.apaleo.com/{propertyCode}/
//   reservations/{reservationId}/, URL-encodiert, neuer Tab) ausschliesslich fuer Admin, je
//   Reservierung ein eigenes Icon bei Turnover.
// - "Buchungsänderung" ist jetzt eine kompakte, standardmaessig eingeklappte Change-Bar (Icon +
//   Zusammenfassung + Chevron) statt einer mehrzeiligen Karte, aufklappbar fuer die vollstaendige
//   Aufschluesselung - unveraendert VOR "Buchung" positioniert.
// - "Wichtiger Hinweis": Bearbeiten/Entfernen sind admin-only hinter einem "•••"-Menue verborgen
//   statt dauerhaft sichtbarer Links. Ein blockierter Startversuch fuehrt jetzt zu einer
//   PERSISTENTEN (nicht mehr nach 2s automatisch verschwindenden) Erklaerung direkt im
//   Hinweisbereich plus hervorgehobenem Bestaetigen-Button - verschwindet erst nach echter
//   Bestaetigung. Der Startbutton selbst sieht nie mehr vorsorglich "disabled" aus und zeigt keine
//   Tooltip-Warnung mehr (Klick fuehrt bei fehlender Bestaetigung direkt zum Hinweisbereich).
// - "Vorbereitung": die Checkliste steht jetzt VOR dem Admin-Editor; automatisch aus der Apaleo-
//   Buchung (BABY) uebernommene Punkte zeigen fuer Admin/Standortverantwortliche dezent "Aus
//   Buchung übernommen" (fuer Housekeeper nicht sichtbar). Der Admin-Editor ist nicht mehr
//   dauerhaft als Chip-Reihe sichtbar, sondern hinter "+ Vorbereitung hinzufügen" verborgen. Ein
//   blockierter Abschlussversuch zeigt denselben persistenten Erklaerungs-Mechanismus wie beim
//   wichtigen Hinweis (nicht mehr dauerhaft sichtbar).
// - "Freigeben" ist keine eigene dritte Aktion mehr unterhalb des Startbuttons - die Funktion
//   existiert unveraendert im Zuweisungsbereich (CleaningAssignmentSection), sobald aufgeklappt.
// Verifiziert per tsc/eslint/build; die zugrunde liegende Buchungsaenderungs-/Vorbereitungs-/
// BABY-Business-Logik selbst ist unveraendert (nur neue Darstellung derselben Daten).
//
// v2.34.0 - Nutzerfeedback-Folgerunde "Buchung geändert" korrigiert (api/booking-changes.js,
// gezielt in der bestehenden, einzigen Change-Detection - kein zweiter Mechanismus):
// - Anreise/Abreise/Einheit gelten nur noch als geaendert, wenn BEIDE Seiten (Vorher/Nachher)
//   bekannt UND tatsaechlich unterschiedlich sind (vorher konnte eine kurzzeitig fehlende/
//   unvollstaendige Apaleo-Antwort faelschlich eine Aenderung wie "Anreise 23.09. -> " ausloesen).
// - Personenanzahl wird jetzt getrennt nach Erwachsenen/Kindern verglichen und angezeigt
//   (adultsFrom/-To, childrenFrom/-To statt einer Gesamtzahl) - die Detailansicht zeigt konkrete
//   Deltas wie "2 Erw. · 1 Kind -> 3 Erw. · 1 Kind".
// - Neuer defensiver Read-Filter (hasRealChange()) unterdrueckt jeden Change-Datensatz, dessen
//   *From/*To-Paare (nach evtl. Alt-Format) keine einzige echte Aenderung mehr zeigen wuerden -
//   ohne Redis-Daten zu loeschen (Sicherheitsnetz gegen evtl. bereits bestehende Alt-Datensaetze).
// - Neu (rein additiv, TaskDetailSheet.tsx/tasks.ts): "✓ Eingecheckt"-Hinweis bei Turnover fuer die
//   ABREISENDE Reservierung, aus dem live verifizierten Apaleo-Feld `status === 'InHouse'`
//   abgeleitet (types.ts#TaskReservationSummary.checkedIn) - rein informativ, fliesst NICHT in die
//   Buchungsaenderungs-Erkennung ein.
// - Die bestehende Aenderungs-/Ungesehen-Punkt-Logik (orange vs. gruen, nie beide gleichzeitig,
//   TasksScreen.tsx#cardAttentionState) sowie der Kenntnisnahme-Mechanismus beim Oeffnen der
//   Detailansicht sind unveraendert und bereits korrekt.
//
// v2.35.0 - "Reinigung verschoben" und "Buchung geändert" duerfen sich weder technisch noch
// visuell vermischen (Nutzerfeedback-Folgerunde):
// - TaskDetailSheet.tsx: der Hinweis auf eine manuelle Tagesverschiebung (task.scheduleOverride)
//   nutzte bisher denselben Wortlaut ("Termin geändert · von -> nach") UND denselben orangen
//   status-progress-Ton wie die Buchungsaenderung - zwei fachlich unabhaengige Dinge wirkten dadurch
//   nahezu identisch. Jetzt: eigener, unmissverstaendlicher Text ("Reinigung verschoben von ..."),
//   dezentes Sage/Gruen (status-clean) statt Orange, kompakte einzeilige Information ohne Rahmen/
//   Hintergrund-Card statt einer eigenen Alert-Box - Orange bleibt ausschliesslich der tatsaechlichen
//   Apaleo-Buchungsaenderung vorbehalten.
// - BookingChangeDetail (die orange Buchungsaenderungs-Karte): die Kompaktzeile zeigte bisher bei
//   genau einer Aenderung eine feldspezifische Zusammenfassung ("Termin geändert · X -> Y") - exakt
//   derselbe Wortlaut wie oben. Zeigt jetzt IMMER Titel + Zeitstempel ("BUCHUNG GEÄNDERT ·
//   23.09. · 16:11"), unabhaengig von der Anzahl geaenderter Felder - eindeutig als Ueberschrift
//   erkennbar, nie mit einem konkreten Feldwert verwechselbar (macht die drei jetzt tot liegenden
//   feldspezifischen Summary-Keys ueberfluessig, entfernt).
// - "GÄSTE"-Zeile heisst jetzt konsistent mit dem abgestimmten Wortlaut "Gäste" statt "Personen".
// - TaskCard.tsx (kompakte Karte): "✓ Eingecheckt" existierte bisher nur in der Detailansicht - jetzt
//   zusaetzlich dezent auf der kompakten Karte, ausschliesslich bei Turnover und ausschliesslich auf
//   der ABREISE-Seite (bei reiner Abreise weiterhin nicht noetig), sage/gruen, kein Badge.
// - api/booking-changes.js: ein Einheitenwechsel wird zusaetzlich auf Zuweisungs-Kontinuitaet
//   geprueft (migrateAssignmentsOnUnitChange) - eine noch nicht abgeschlossene Zuweisung/laufende
//   Reinigung an der ALTEN Einheit wird auf die NEUE Einheit uebertragen (Status/Zeit/Verlauf bleiben
//   erhalten), NIE ueberschreibt das eine an der neuen Einheit bereits bestehende Zuweisung, eine
//   bereits ABGESCHLOSSENE Reinigung bleibt bewusst als Historie an der alten Einheit. Der alte
//   Redis-Eintrag wird nicht geloescht. Stale/doppelte sichtbare Tasks wurden analysiert und sind
//   durch die bestehende, rein aus Live-Apaleo-Daten abgeleitete Task-Architektur strukturell
//   bereits ausgeschlossen (keine Aenderung noetig).
//
// v2.35.1 - Bugfix (live reproduziert): "Buchung geändert" zeigte weiterhin "17.09. -> 17.09." bzw.
// "22.09. -> 22.09." trotz des in v2.34.0 eingefuehrten defensiven Read-Filters. Ursache:
// hasRealChange() in api/booking-changes.js verglich die gespeicherten Rohwerte per `!==`, OHNE sie
// erneut zu normalisieren - ein Alt-Datensatz aus der Zeit VOR dem allerersten dateOnly()-Fix
// enthaelt arrivalFrom/-To bzw. departureFrom/-To noch als volle ISO-Datumszeit; unterscheiden sich
// zwei solche Werte nur in der Uhrzeit, war der rohe String-Vergleich `!==` faelschlich wahr, obwohl
// der angezeigte Kalendertag identisch ist. Jedes Feld wird jetzt vor dem Vergleich exakt so
// normalisiert wie bei der Anzeige (Datumsfelder ueber dieselbe dateOnly()-Funktion, Personenzahlen
// explizit als Number). Der fälschlich angezeigte orange Punkt auf der Karte war eine direkte Folge
// desselben Bugs (task.bookingChange war nicht null) und ist mit diesem Fix ebenfalls behoben - keine
// separate Aenderung an der Punkt-Logik selbst noetig, die war bereits korrekt.
// v2.36.0 - Team-/Benutzerverwaltung ueberarbeitet (Briefing "Team-/Benutzerverwaltung
// ueberarbeiten"): 3-Rollen-Modell admin/location_manager/housekeeper statt der bisherigen
// zwei Rollen, mit abwaertskompatibler Selbstheilungs-Migration bestehender Datensaetze
// (migrateUserRecord in api/_users.js) - kein manueller Migrationsschritt noetig, bestehende
// Logins/Passwoerter/Sessions/Teams bleiben unveraendert gueltig. Teamleader ist bewusst KEINE
// eigene Rolle mehr, sondern eine Eigenschaft einer einzelnen Teammitgliedschaft
// (StaffUser.teamMemberships[], ein User kann Mitglied mehrerer Teams gleichzeitig sein) -
// ersetzt die fruehere, auf ein einzelnes Team begrenzte housekeepingTeamId/teamRole-Kombination
// (bleibt als Kompat-Lesepfad bestehen, wird nicht mehr neu geschrieben). Neues, sicheres
// Einladungssystem ersetzt die fruehere direkte Kontoerstellung durch einen Admin: ein
// kryptographisch zufaelliges Single-Use-Token (nur als SHA-256-Hash gespeichert) wird je nach
// einladender Rolle serverseitig strikt gescoped (admin frei; Standortverantwortlicher nur
// housekeeper fuer eigene Standorte; Teamleader nur housekeeper ins eigene Team, niemals
// Teamleader-Ernennung) - Rolle/Team/isLeader kommen nie ungeprueft aus dem Client
// (api/invitations.js#resolveInvitationScope). Die eingeladene Person setzt ihr Passwort selbst
// auf einer neuen, von der App-Shell unabhaengigen Seite (app/invite/[token]). Admin sieht den
// Einladungsstatus (Aktiv/Einladung ausstehend/Deaktiviert) direkt in der neuen, um zwei Tabs
// ("Mitarbeiter"/"Reinigungsteams") erweiterten TeamScreen.tsx - mit Suche/Filter und
// Desktop-Tabelle+Mobile-Karten (AdminTable) - Standortverantwortliche sehen dieselbe Ansicht
// auf eigene Standorte/Teams beschraenkt, ein Teamleader eine reduzierte "Mein Team"-Ansicht
// (nur eigene Teammitglieder + Einladen-Button). Deaktivieren ersetzt Loeschen als Standardweg
// (Punkt "Deaktivieren statt loeschen"): invalidiert sofort alle aktiven Sessions
// (housekeeping:user_sessions:<userId>, siehe api/_auth.js#invalidateUserSessions - vorher
// blockierte active:false nur neue Logins) und warnt den Admin vor bestehenden zukuenftigen
// Zuweisungen. Zentrale, benannte Authorization-Helfer (canManageUser/canManageTeam/
// canAssignTask/canInviteUser/canManageProperty/canViewStatistics/canOpenApaleo) ersetzen
// verstreute role===...-Bedingungen, identisch in api/_permissions.js (Server, tatsaechlich
// durchgesetzt) und lib/housekeeping/permissions.ts (Client-Spiegel) - beide Implementierungen
// gegeneinander UND gegen eine 77 Faelle umfassende Privilege-Escalation-Testsuite verifiziert
// (u. a. Reinigungskraft->Admin, Standortverantwortlicher->fremder Standort/Admin-Rolle,
// Teamleader->fremdes Team/neuer Teamleader - alle serverseitig abgelehnt bzw. auf das erlaubte
// Minimum zurechtgestutzt, unabhaengig vom Client-Request).
export const APP_VERSION = '2.46.0';

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

/** Nur "Live"-Properties fuer die operative Reinigungsplanung (Punkt 8 der Feinschliff-Anfrage) -
 * live gegen den echten Apaleo-Account geprueft: `status=Live` filtert echte Test-Properties
 * (z. B. "Test run", status "Test") heraus, die sonst 1:1 wie ein normales Haus in der Planung
 * erschienen (keine bisherige Sichtbarkeitslogik dafuer). Archivierte Properties liefert Apaleo
 * ohnehin nur mit explizitem `includeArchived=true` zurueck, also ohne separaten Parameter hier
 * schon ausgeschlossen. */
export async function loadProperties(): Promise<Property[]> {
  const data = await apaleo<{ properties?: { id?: string; code?: string; name?: string }[]; results?: { id?: string; code?: string; name?: string }[] }>(
    '/inventory/v1/properties?pageSize=200&status=Live',
  );
  const list = data.properties || data.results || [];
  // `name` bleibt hier bewusst der volle, unveraenderte Apaleo-Name (nicht gekuerzt) - die
  // Kuerzung fuer die Darstellung passiert einheitlich ueber getPropertyDisplayName() an den
  // tatsaechlichen Anzeigestellen, nicht schon beim Laden.
  return list.map((p) => ({ code: (p.id || p.code) as string, name: p.name || (p.id || p.code) as string }));
}

/**
 * Bugfix: rief frueher direkt `/inventory/v1/units?...&pageSize=500` auf - Apaleo begrenzt
 * pageSize dokumentiert UND tatsaechlich durchgesetzt auf maximal 200 (siehe apaleoPaged unten),
 * ein Wert von 500 wird von Apaleo pauschal mit 422 "Invalid value provided" abgelehnt, unabhaengig
 * von der tatsaechlichen Trefferzahl - dadurch blieb "Apartments" fuer JEDES Property leer. Nutzt
 * jetzt dieselbe bereits korrekte, paginierte Implementierung wie loadUnitsForProperties() statt
 * einer zweiten, abweichenden Abfrage.
 */
export async function loadUnits(propertyCode: string): Promise<ApaleoUnit[]> {
  return loadUnitsForProperties([propertyCode]);
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

/**
 * Bugfix (live gegen den echten Account reproduziert): rief frueher `from`/`to` als reines Datum
 * ("2026-09-20" ohne Uhrzeit) auf - Apaleo lehnt das fuer BEIDE Felder mit 422 "Invalid value
 * provided" ab, dateFilter verlangt einen vollen ISO-8601-Zeitpunkt (siehe bereits bekannter,
 * identischer Fall bei loadReservationsRangeForProperties oben). Zusaetzlich `pageSize=500` wie
 * beim ebenfalls gefixten loadUnits() - Apaleo erlaubt maximal 200. Beides zusammen liess
 * "Apartments" fuer JEDES Property mit 422 fehlschlagen. Nutzt jetzt volle Tagesgrenzen (00:00 UTC
 * bis 00:00 UTC des Folgetags, exklusive Obergrenze) und die bestehende paginierte apaleoPaged().
 */
export async function loadReservations(propertyCode: string): Promise<ReservationsState> {
  const today = todayISO();
  const tomorrow = addDaysISO(today, 1);
  const dayAfterTomorrow = addDaysISO(tomorrow, 1);
  const p = encodeURIComponent(propertyCode);
  const extract = (data: Record<string, unknown>) => (data.reservations as ApaleoReservation[]) || (data.results as ApaleoReservation[]);
  const dayRange = (dayISO: string, nextDayISO: string) =>
    `from=${encodeURIComponent(`${dayISO}T00:00:00Z`)}&to=${encodeURIComponent(`${nextDayISO}T00:00:00Z`)}`;

  const [inHouse, departToday, departTomorrow, arriveToday] = await Promise.all([
    apaleoPaged<ApaleoReservation>(`/booking/v1/reservations?propertyId=${p}&status=InHouse`, extract),
    apaleoPaged<ApaleoReservation>(`/booking/v1/reservations?propertyId=${p}&dateFilter=Departure&${dayRange(today, tomorrow)}&status=InHouse,CheckedOut`, extract),
    apaleoPaged<ApaleoReservation>(`/booking/v1/reservations?propertyId=${p}&dateFilter=Departure&${dayRange(tomorrow, dayAfterTomorrow)}&status=InHouse,Confirmed`, extract),
    apaleoPaged<ApaleoReservation>(`/booking/v1/reservations?propertyId=${p}&dateFilter=Arrival&${dayRange(today, tomorrow)}&status=InHouse,Confirmed`, extract),
  ]);
  return { inHouse, departToday, departTomorrow, arriveToday };
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

/** Bugfix: rief bisher mit `{ unitIds: [...], condition }` auf - das entspricht NICHT dem
 * tatsaechlichen Apaleo-Schema fuer PUT /operations/v1/units-condition (live gegen den echten
 * Account verifiziert) und wurde deshalb zuverlaessig mit 422 abgelehnt, unabhaengig vom
 * uebergebenen `condition`-Wert. Apaleo erwartet stattdessen `unitsConditions: [{ id, condition }]`
 * (ein Eintrag pro Unit, `condition` eines von 'Clean' | 'CleanToBeInspected' | 'Dirty'). Dieser
 * Bug bestand unveraendert bereits im alten app.js und wurde bei der Migration 1:1 uebernommen,
 * ohne dass er zuvor gegen den echten Account aufgefallen war. */
export async function setUnitCondition(unitId: string, condition: string): Promise<void> {
  await apaleo('/operations/v1/units-condition', 'PUT', { unitsConditions: [{ id: unitId, condition }] });
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

/** Housekeeping Teams (Reinigungsfirmen) - eigene, vom uebrigen Backend-Zustand getrennte
 * Ressource (siehe api/housekeeping-teams.js), analog zu taskNoticesApi/taskTimeOverridesApi.
 * Lesen ist fuer jede angemeldete Person moeglich (Task Cards muessen Team-Namen zeigen koennen),
 * die schreibenden Aktionen sind serverseitig admin-only (siehe dortiger Kommentar). */
export interface HousekeepingTeamsData {
  teams: HousekeepingTeam[];
  propertyDefaults: TeamPropertyDefaultsState;
  taskTeamOverrides: TaskTeamOverridesState;
}

export async function loadHousekeepingTeams(): Promise<HousekeepingTeamsData> {
  const data = await backendGet<Partial<HousekeepingTeamsData>>('housekeeping-teams');
  return { teams: data.teams || [], propertyDefaults: data.propertyDefaults || {}, taskTeamOverrides: data.taskTeamOverrides || {} };
}

export const housekeepingTeamsApi = {
  saveTeam: (team: { id?: string; name: string; active?: boolean; propertyIds?: string[] }) =>
    backendPost<{ teams: HousekeepingTeam[]; team: HousekeepingTeam }>('housekeeping-teams', { action: 'setTeam', team }),
  setPropertyDefault: (propertyCode: string, teamId: string | null) =>
    backendPost<{ propertyDefaults: TeamPropertyDefaultsState }>('housekeeping-teams', { action: 'setPropertyDefault', propertyCode, teamId }),
  setTaskTeam: (taskId: string, teamId: string | null) =>
    backendPost<{ taskTeamOverrides: TaskTeamOverridesState }>('housekeeping-teams', { action: 'setTaskTeam', taskId, teamId }),
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
  /** Briefing "Vorbereitung als Checkliste": schaltet EINEN Vorbereitungspunkt (itemId, siehe
   * DOUBLEUP_TYPES) fuer diesen Task um - siehe api/task-assignments.js#togglePreparation. */
  togglePreparation: (taskId: string, itemId: string) =>
    backendPost<{ taskAssignments: TaskAssignmentsState }>('task-assignments', { action: 'togglePreparation', taskId, itemId }),
  /** `requiredPreparationIds` (Punkt 4): die fuer diesen Task tatsaechlich zu erledigenden
   * Vorbereitungspunkte (siehe tasks.ts#requiredPreparationItemIds) - der Server lehnt den
   * Abschluss ab, solange nicht jeder dieser IDs bereits als erledigt gespeichert ist. */
  complete: (
    taskId: string, requiresInspectionFlag: boolean,
    linenItems?: { itemId: string; estimatedQuantity: number | null; actualQuantity: number }[],
    requiredPreparationIds?: string[],
  ) =>
    backendPost<{ taskAssignments: TaskAssignmentsState }>(
      'task-assignments', { action: 'complete', taskId, requiresInspection: requiresInspectionFlag, linenItems, requiredPreparationIds },
    ),
  completeInspection: (taskId: string) =>
    backendPost<{ taskAssignments: TaskAssignmentsState }>('task-assignments', { action: 'completeInspection', taskId }),
  /** Briefing "Wieder aktivieren" - admin-only, siehe api/task-assignments.js#reopen. */
  reopen: (taskId: string) => backendPost<{ taskAssignments: TaskAssignmentsState }>('task-assignments', { action: 'reopen', taskId }),
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
  /** `sourceLanguage` = die aktuell im Client angezeigte Sprache (state.lang) - einzige
   * zuverlaessige Quelle fuer die Ausgangssprache der automatischen Uebersetzung (Briefing
   * "automatische Uebersetzung frei eingegebener operativer Texte", Punkt 3). */
  set: (taskId: string, text: string, sourceLanguage: Lang) =>
    backendPost<{ notice: TaskNotice }>('task-notices', { action: 'set', taskId, text, sourceLanguage }),
  remove: (taskId: string) => backendPost<{ ok: true }>('task-notices', { action: 'remove', taskId }),
  acknowledge: (taskId: string) => backendPost<{ ack: TaskNoticeAck }>('task-notices', { action: 'acknowledge', taskId }),
  /** Punkt 12: admin-seitiger Retry einer fehlgeschlagenen Uebersetzung. */
  retryTranslation: (taskId: string) => backendPost<{ notice: TaskNotice }>('task-notices', { action: 'retryTranslation', taskId }),
};

export interface TaskViewsData {
  seen: TaskSeenState;
  changeAcks: BookingChangeAcksState;
}

export async function loadTaskViews(): Promise<TaskViewsData> {
  const data = await backendGet<{ seen?: TaskSeenState; changeAcks?: BookingChangeAcksState }>('task-views');
  return { seen: data.seen || {}, changeAcks: data.changeAcks || {} };
}

/** Briefing "Reinigungskarten ueberarbeiten" Punkt 5/8: zwei bewusst getrennte, userbezogene
 * Aufmerksamkeits-Aktionen - "gesehen" (Detailansicht tatsaechlich geoeffnet) und
 * "Buchungsaenderung zur Kenntnis genommen" (siehe api/task-views.js fuer die serverseitige
 * Ableitung des zu bestaetigenden Zeitstempels aus dem aktuellen BookingChangeRecord). */
export const taskViewsApi = {
  markSeen: (taskId: string) => backendPost<{ seen: TaskSeenRecord }>('task-views', { action: 'markSeen', taskId }),
  acknowledgeChange: (taskId: string) => backendPost<{ ack: BookingChangeAck }>('task-views', { action: 'acknowledgeChange', taskId }),
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

export async function loadTaskScheduleOverrides(): Promise<TaskScheduleOverridesState> {
  const data = await backendGet<{ overrides?: TaskScheduleOverridesState }>('task-schedule-overrides');
  return data.overrides || {};
}

/** Manueller Admin-Override des geplanten Housekeeping-Tags ("Tag ändern", siehe
 * types.ts#TaskScheduleOverride) - siehe api/task-schedule-overrides.js fuer die serverseitige
 * Rechtepruefung (nur Admin darf schreiben; jeder mit Property-Zugriff darf lesen). `nextArrivalDate`
 * ist optional und dient ausschliesslich der serverseitigen Plausibilitaetspruefung "nicht nach der
 * naechsten Anreise" (der Server ruft dafuer selbst nie Apaleo auf, siehe dortiger Kommentar). */
/** Briefing "Bei Verschiebung Zuweisung immer aufheben": `taskAssignment`/`manualTask` sind nur
 * gesetzt, wenn der Server durch DIESEN Aufruf tatsaechlich eine bestehende Zuweisung aufgehoben
 * hat (siehe api/task-schedule-overrides.js#buildUnassignedRecord) - der Client patcht damit
 * `state.taskAssignments`/`state.manualTasks` direkt aus der Serverantwort, ohne einen zweiten
 * Request/Reload zu benoetigen (identisch zum bestehenden Muster bei anderen Task-Aktionen). */
export const taskScheduleOverridesApi = {
  set: (taskId: string, scheduledDate: string, nextArrivalDate?: string | null) =>
    backendPost<{ override: TaskScheduleOverride | null; taskAssignment?: TaskAssignment; manualTask?: ManualTask }>(
      'task-schedule-overrides', { action: 'set', taskId, scheduledDate, ...(nextArrivalDate ? { nextArrivalDate } : {}) },
    ),
  remove: (taskId: string) =>
    backendPost<{ ok: true; taskAssignment?: TaskAssignment; manualTask?: ManualTask }>(
      'task-schedule-overrides', { action: 'remove', taskId },
    ),
};

/** Manuell von Admin erstellte Aufgaben (Punkt "Admin kann Aufgaben erstellen") - siehe
 * api/manual-tasks.js fuer die serverseitige Rechtepruefung (Anlegen: nur Admin; Erledigen:
 * zugewiesene Person oder Standortverantwortlich; Lesen: jeder mit Property-Zugriff). */
export interface ManualTaskCreateInput {
  propertyCode: string;
  propertyName: string;
  unitId?: string | null;
  unitName?: string | null;
  date: string;
  title: string;
  description: string;
  assignedUserId?: string | null;
  assignedUserName?: string | null;
  /** Siehe taskNoticesApi.set - dieselbe Quellsprachen-Herleitung (state.lang) fuer die
   * automatische Uebersetzung von `description`. Optional: useHousekeepingApp.ts#createManualTask
   * traegt state.lang automatisch nach, falls der Aufrufer (ManualTaskFormSheet.tsx) es weglaesst. */
  sourceLanguage?: Lang;
}

export async function loadManualTasks(): Promise<ManualTasksState> {
  const data = await backendGet<{ manualTasks?: ManualTasksState }>('manual-tasks');
  return data.manualTasks || {};
}

export const manualTasksApi = {
  create: (input: ManualTaskCreateInput) =>
    backendPost<{ manualTasks: ManualTasksState }>('manual-tasks', { action: 'create', ...input }),
  complete: (taskId: string) => backendPost<{ manualTasks: ManualTasksState }>('manual-tasks', { action: 'complete', taskId }),
  /** Briefing "Wieder aktivieren" - admin-only, siehe api/manual-tasks.js#reopen. */
  reopen: (taskId: string) => backendPost<{ manualTasks: ManualTasksState }>('manual-tasks', { action: 'reopen', taskId }),
  /** Briefing "BABY-Business-Logik" Punkt 3C/4/5/8: idempotenter Abgleich der automatisch aus dem
   * Apaleo-Service BABY abgeleiteten `Zusatzausstattung`-Aufgaben - siehe
   * lib/housekeeping/tasks.ts#computeExtraEquipmentNeeds (Client-Berechnung der `needs`) und
   * api/manual-tasks.js#syncExtraEquipment (serverseitiger Redis-Abgleich). */
  syncExtraEquipment: (needs: ExtraEquipmentNeed[], evaluatedReservationIds: string[], coveredProperties: string[]) =>
    backendPost<{ manualTasks: ManualTasksState }>(
      'manual-tasks', { action: 'syncExtraEquipment', needs, evaluatedReservationIds, coveredProperties },
    ),
};

/** Housekeeping-relevante Buchungsaenderungen (Punkt "Buchungsaenderung sichtbar machen") - siehe
 * api/booking-changes.js. `syncBookingChanges` wird nach jedem Laden der Apaleo-Reservierungen
 * fuer den Planungszeitraum aufgerufen (siehe useHousekeepingApp.ts#loadPlanningData) und liefert
 * die vollstaendige, fuer den User sichtbare Aenderungsliste zurueck (Server vergleicht gegen den
 * zuletzt gespeicherten housekeeping:*-Snapshot und aktualisiert ihn bei Bedarf). */
export async function syncBookingChanges(
  reservations: {
    id: string; arrival?: string | null; departure?: string | null; unitId?: string | null; propertyCode: string;
    adults?: number | null; children?: number | null;
  }[],
): Promise<BookingChangeRecordsState> {
  const data = await backendPost<{ changes?: BookingChangeRecordsState }>('booking-changes', { action: 'sync', reservations });
  return data.changes || {};
}

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

/** Einladungssystem (Briefing "Team-/Benutzerverwaltung ueberarbeiten") - Sichtbarkeit/Scoping wird
 * ausschliesslich serverseitig durchgesetzt (siehe api/invitations.js): Admin sieht/verwaltet alle
 * Einladungen, Standortverantwortliche/Teamleader nur die von ihnen selbst versendeten. `create`
 * gibt das Klartext-Token NUR einmalig zurueck (fuer "Einladungslink kopieren", siehe
 * TeamScreen.tsx) - es wird serverseitig nie gespeichert und ist danach nicht mehr abrufbar. */
export interface InvitationCreateInput {
  email: string;
  role?: Role;
  propertyIds?: string[];
  teamId?: string | null;
  isLeader?: boolean;
  lang?: Lang;
}

export const invitationsApi = {
  list: async (): Promise<InvitationsState> => {
    const data = await backendGet<{ invitations?: Invitation[] }>('invitations');
    const byId: InvitationsState = {};
    for (const inv of data.invitations || []) byId[inv.id] = inv;
    return byId;
  },
  create: (input: InvitationCreateInput) =>
    backendPost<{ invitation: Invitation; token: string }>('invitations', { action: 'create', ...input }),
  resend: (id: string) => backendPost<{ invitation: Invitation; token: string }>('invitations', { action: 'resend', id }),
  revoke: (id: string) => backendPost<{ invitation: Invitation }>('invitations', { action: 'revoke', id }),
};

export interface InvitationInfo {
  status: 'pending' | 'expired' | 'accepted' | 'revoked' | 'not_found';
  email?: string;
  role?: Role;
  lang?: Lang;
}

/** Oeffentliche Einladungsseite (app/invite/[token]/page.tsx, siehe dort) - bewusst OHNE
 * bestehende Session/Cookie: wer den Link noch nicht angenommen hat, ist noch gar kein
 * angemeldeter Benutzer dieser App. Ruft denselben legacy-Endpunkt wie die urspruengliche
 * Admin-Ersteinrichtung auf (api/auth.js, siehe app.js#action:'register-admin') - beides ist
 * "Account-Anlage vor dem ersten Login", nicht der reguläre Next-native app/api/auth/{login,me}-
 * Session-Lebenszyklus. */
export async function fetchInvitationInfo(token: string): Promise<InvitationInfo> {
  return backendPost<InvitationInfo>('auth', { action: 'invitation-info', token });
}

export interface AcceptInvitationInput {
  token: string;
  firstName: string;
  lastName: string;
  password: string;
  passwordConfirm: string;
}

export async function acceptInvitation(input: AcceptInvitationInput): Promise<StaffUser> {
  const data = await backendPost<{ user: StaffUser }>('auth', { action: 'accept-invite', ...input });
  return data.user;
}

/** Admin-Reservierungssuche (Punkt 5-9) - sucht live gegen Apaleo ueber alle Properties/Zeitraeume
 * hinweg (nicht nur die vier geladenen Planungstage), siehe api/reservation-search.js fuer die
 * serverseitige role==='admin'-Pruefung. */
export async function searchReservations(query: string): Promise<ReservationSearchResult[]> {
  const data = await backendPost<{ results?: ReservationSearchResult[] }>('reservation-search', { query });
  return data.results || [];
}

/** Housekeeping-Vorfaelle (Briefing "Vorfall melden") - zwei getrennte Aufrufe: erst je Foto ein
 * Upload (liefert eine persistente Vercel-Blob-URL, siehe api/incident-photos.js), danach EIN
 * `report()`-Aufruf mit den bereits hochgeladenen URLs (siehe api/incidents.js). `dataUrl` ist
 * bereits die client-seitig komprimierte Aufnahme (siehe lib/housekeeping/image.ts). */
export const incidentPhotosApi = {
  upload: (taskId: string, dataUrl: string) => backendPost<{ url: string }>('incident-photos', { taskId, dataUrl }),
};

export interface ReportIncidentInput {
  taskId: string;
  description: string;
  photoUrls: string[];
  propertyName: string;
  unitName: string;
}

export const incidentsApi = {
  report: (input: ReportIncidentInput) =>
    backendPost<{ incident: HousekeepingIncident; slackDelivered: boolean }>('incidents', input),
  /** Admin-Uebersicht "Vorfaelle" (Einstellungen > Meldungen & Betrieb) - admin-only serverseitig. */
  list: async (): Promise<HousekeepingIncident[]> => {
    const data = await backendGet<{ incidents?: HousekeepingIncident[] }>('incidents');
    return data.incidents || [];
  },
};

/** Waesche & Bettsachen (Briefing "Waescheverbrauch erfassen") - Artikelliste lesen darf jede
 * angemeldete Person, die schreibenden Aktionen sind serverseitig admin-only (siehe
 * api/linen-items.js). Der eigentliche Abschluss-Report entsteht NICHT hier separat, sondern
 * ausschliesslich ueber taskAssignmentsApi.complete() (linenItems-Parameter oben) - keine zweite
 * parallele Abschluss-Route. */
export async function loadLinenItems(): Promise<LinenItem[]> {
  const data = await backendGet<{ items?: LinenItem[] }>('linen-items');
  return data.items || [];
}

export const linenItemsApi = {
  saveItem: (item: Partial<LinenItem> & { name: string; unit: string }) =>
    backendPost<{ items: LinenItem[]; item: LinenItem }>('linen-items', { action: 'setItem', item }),
  reorder: (orderedIds: string[]) => backendPost<{ items: LinenItem[] }>('linen-items', { action: 'reorderItems', orderedIds }),
};

/** Verbrauchsmaterial (Briefing "Verbrauch melden") - komplett getrennt von Waesche/Bettsachen
 * (eigene Liste, eigener Report-Typ, siehe api/consumables.js). */
export async function loadConsumableItems(): Promise<ConsumableItem[]> {
  const data = await backendGet<{ items?: ConsumableItem[] }>('consumables');
  return data.items || [];
}

export const consumablesApi = {
  saveItem: (item: Partial<ConsumableItem> & { name: string; unit: string }) =>
    backendPost<{ items: ConsumableItem[]; item: ConsumableItem }>('consumables', { action: 'setItem', item }),
  reorder: (orderedIds: string[]) => backendPost<{ items: ConsumableItem[] }>('consumables', { action: 'reorderItems', orderedIds }),
  report: (propertyCode: string, items: { itemId: string; quantity: number }[]) =>
    backendPost<{ report: ConsumableReport }>('consumables', { action: 'report', propertyCode, items }),
  /** Admin-Uebersicht "Verbrauchsmeldungen" (Einstellungen > Meldungen & Betrieb) - admin-only serverseitig. */
  listReports: async (): Promise<ConsumableReport[]> => {
    const data = await backendPost<{ reports?: ConsumableReport[] }>('consumables', { action: 'listReports' });
    return data.reports || [];
  },
};

/** Einstellungen > Integrationen - liefert ausschliesslich boolesche "konfiguriert"-Flags, nie
 * Secrets/Tokens (siehe api/integrations-status.js). admin-only serverseitig. */
export interface IntegrationsStatus {
  apaleo: { configured: boolean };
  slack: { configured: boolean };
}

export async function loadIntegrationsStatus(): Promise<IntegrationsStatus> {
  return backendGet<IntegrationsStatus>('integrations-status');
}
