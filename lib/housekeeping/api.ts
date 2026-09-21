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
  ApaleoReservation, ApaleoUnit, AssignmentsState, DoubleupsState, Completion, BreakEntry, HousekeepingTeam, NfcTagStatusesState,
  Property, ReservationSearchResult, ReservationsState, StaffUser, TaskAssignmentsState, TaskNotice, TaskNoticeAck,
  TaskNoticeAcksState, TaskNoticesState, TaskStartSource, TaskTeamOverridesState, TaskTimeOverride, TaskTimeOverridesState,
  TeamPropertyDefaultsState,
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
export const APP_VERSION = '2.12.0';

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
  complete: (taskId: string, requiresInspectionFlag: boolean) =>
    backendPost<{ taskAssignments: TaskAssignmentsState }>('task-assignments', { action: 'complete', taskId, requiresInspection: requiresInspectionFlag }),
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
