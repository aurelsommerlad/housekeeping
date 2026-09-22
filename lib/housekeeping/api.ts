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
  ApaleoReservation, ApaleoUnit, AssignmentsState, BookingChangeRecordsState, DoubleupsState, Completion, BreakEntry,
  ConsumableItem, ConsumableReport, HousekeepingIncident, HousekeepingTeam, LinenItem, ManualTasksState,
  NfcTagStatusesState, Property, ReservationSearchResult, ReservationsState, StaffUser, TaskAssignmentsState, TaskNotice,
  TaskNoticeAck, TaskNoticeAcksState, TaskNoticesState, TaskStartSource, TaskTeamOverridesState, TaskTimeOverride,
  TaskTimeOverridesState, TeamPropertyDefaultsState,
} from './types';

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
export const APP_VERSION = '2.21.0';

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
  saveTeam: (team: { id?: string; name: string; active?: boolean }) =>
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
  complete: (taskId: string, requiresInspectionFlag: boolean, linenItems?: { itemId: string; estimatedQuantity: number | null; actualQuantity: number }[]) =>
    backendPost<{ taskAssignments: TaskAssignmentsState }>('task-assignments', { action: 'complete', taskId, requiresInspection: requiresInspectionFlag, linenItems }),
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
}

export async function loadManualTasks(): Promise<ManualTasksState> {
  const data = await backendGet<{ manualTasks?: ManualTasksState }>('manual-tasks');
  return data.manualTasks || {};
}

export const manualTasksApi = {
  create: (input: ManualTaskCreateInput) =>
    backendPost<{ manualTasks: ManualTasksState }>('manual-tasks', { action: 'create', ...input }),
  complete: (taskId: string) => backendPost<{ manualTasks: ManualTasksState }>('manual-tasks', { action: 'complete', taskId }),
};

/** Housekeeping-relevante Buchungsaenderungen (Punkt "Buchungsaenderung sichtbar machen") - siehe
 * api/booking-changes.js. `syncBookingChanges` wird nach jedem Laden der Apaleo-Reservierungen
 * fuer den Planungszeitraum aufgerufen (siehe useHousekeepingApp.ts#loadPlanningData) und liefert
 * die vollstaendige, fuer den User sichtbare Aenderungsliste zurueck (Server vergleicht gegen den
 * zuletzt gespeicherten housekeeping:*-Snapshot und aktualisiert ihn bei Bedarf). */
export async function syncBookingChanges(
  reservations: { id: string; arrival?: string | null; departure?: string | null; unitId?: string | null; propertyCode: string }[],
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
