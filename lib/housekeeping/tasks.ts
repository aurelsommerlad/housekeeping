/**
 * Reinigungsauftrags-Ableitung (Punkt 4/7/8/9): Datum -> Reinigungsauftraege -> Zuweisung ->
 * Durchfuehrung, statt Property -> Zimmer -> aktueller Zimmerzustand. Tasks werden REIN aus
 * Apaleo-Reservierungen fuer Heute+3 abgeleitet (deterministische ID, siehe taskId()) und tragen
 * selbst keinen Zuweisungs-/Fortschrittszustand - der liegt getrennt in TaskAssignment
 * (housekeeping:task_assignments, siehe api/task-assignments.js), gemaess Punkt 23 (Task-Status
 * = unser Workflow, Apaleo Unit Condition = PMS-Zustand, beides bewusst getrennt).
 *
 * Zwischenreinigung (Punkt 12, Feinschliff-Analyse): die frueher hier automatisch anhand von
 * Naechten seit Anreise ausgeloeste Zwangsreinigung wurde ENTFERNT. Eine Zwischenreinigung
 * entsteht jetzt AUSSCHLIESSLICH, wenn die Apaleo-Reservierung den Service `INTERCLEAN` fuer
 * GENAU diesen Tag gebucht hat (siehe bookedServiceDates() unten) - das tatsaechliche
 * Leistungsdatum liefert Apaleo bereits ueber `services[].dates[].serviceDate` mit demselben
 * `expand=services`, der schon fuer ECI/LCO/HUND/BABY verwendet wird (kein zusaetzlicher Request
 * noetig, live gegen den echten Account verifiziert). Diese Reinigung ist eine normale Reinigung
 * (Timer/Pause/Abschluss) wie jede andere - `forced` bleibt aus Typkompatibilitaet bestehen, ist
 * fuer type==='stayover' aber immer `false` (kein "erzwungener" Charakter mehr).
 */
import { unitCondition } from './rooms';
import type {
  ApaleoReservation, ApaleoUnit, BookingChangeRecord, BookingChangeRecordsState, CapacityEntry, DaySummary, DoubleupsState,
  HousekeepingTeam, ManualTask, PreparationCompletionsState, Task, TaskAssignmentsState, TaskHistoryEntry, TaskReservationSummary,
  TaskStatus, TaskScheduleOverride, TaskScheduleOverridesState, TaskTeamOverridesState, TaskTimeOverride, TaskTimeOverridesState,
  TeamCapacityEntry, TeamPropertyDefaultsState, TaskType,
} from './types';

/** Standardzeiten (Prioritaet 3, ohne gebuchtes Extra/Override) - siehe Briefing Punkt 1.
 * EXPORTIERT, damit die Einstellungen-Seite (StandardTimesScreen.tsx) exakt diese Werte rein
 * informativ anzeigen kann, statt sie dort ein zweites Mal als Literal zu duplizieren - EINE
 * Quelle der Wahrheit fuer diese Business Rule (siehe Briefing "Standardzeiten": bewusst noch
 * keine dynamische Konfigurationsquelle daneben). */
export const STANDARD_DEPARTURE_TIME = '10:00';
export const STANDARD_ARRIVAL_TIME = '16:00';
/** Late Check-out/Early Check-in verschieben die jeweilige Zeit auf 13:00 (Prioritaet 2) - die
 * Stunde selbst steht bei Apaleo NICHT strukturiert am gebuchten Service (live verifiziert: weder
 * am Service noch an der gebuchten Instanz existiert ein Zeitfeld, nur ein Datum), sondern ist
 * eine reine UNIQUE-PLACES-Geschaeftsregel (siehe Service-Beschreibungstext "bis maximal/fruehestens
 * ab 13:00 Uhr") - deshalb hier bewusst als benannte Konstante hinterlegt statt aus Apaleo geraten.
 */
export const EXTRA_TIME = '13:00';

/** Apaleo-Servicecode ('ECI'/'LCO'/'HUND'/'BABY') statt `id` (property-praefigiert, z. B.
 * "LAEKE-LCO") oder `name`/`description` (Freitext, siehe HUESLE-OTHER-Decoy in der Recherche) -
 * property-uebergreifend einheitlich und robust gegen Namensaenderungen. NIEMALS `comment`
 * heranziehen. 'HUND' (Hund-Gebuehr) und 'BABY' (Babybett) live gegen alle vier Properties
 * (HUESLE/LAEKE/ALPILA/ALTUS) verifiziert - identischer Code ueberall. */
function hasBookedService(r: ApaleoReservation | undefined, code: 'ECI' | 'LCO' | 'HUND' | 'BABY'): boolean {
  return !!r?.services?.some((s) => s.service?.code === code);
}

/** Alle gebuchten Leistungsdatane (yyyy-mm-dd) EINES Servicecodes auf dieser Reservierung (Punkt
 * 12) - `INTERCLEAN` ist `availability.mode: "Daily"` (live gegen alle Properties verifiziert) und
 * wird deshalb, anders als ECI/LCO/HUND/BABY, potenziell fuer mehrere einzelne Tage gebucht. */
function bookedServiceDates(r: ApaleoReservation | undefined, code: string): string[] {
  if (!r?.services) return [];
  const out: string[] = [];
  for (const s of r.services) {
    if (s.service?.code !== code) continue;
    for (const d of s.dates || []) {
      const day = dateOnly(d.serviceDate);
      if (day) out.push(day);
    }
  }
  return out;
}

/** "HH:MM" -> Minuten seit Mitternacht, fuer Sortierung/Fensterberechnung. */
function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map((n) => parseInt(n, 10));
  return (h || 0) * 60 + (m || 0);
}

function dateOnly(dt?: string): string | null {
  return dt ? String(dt).slice(0, 10) : null;
}

function guestName(r: ApaleoReservation): string {
  return [r.primaryGuest?.firstName, r.primaryGuest?.lastName].filter(Boolean).join(' ');
}

/** Exportiert (statt modul-privat), damit useHousekeepingApp.ts#loadPlanningData dieselbe
 * Gesamtpersonenzahl-Berechnung fuer den Buchungsaenderungs-Sync (api/booking-changes.js) nutzen
 * kann statt einer zweiten, potenziell abweichenden Kopie der Logik. */
export function guestCount(r: ApaleoReservation): number | null {
  if (typeof r.adults !== 'number') return null;
  return r.adults + (r.childrenAges?.length || 0);
}

function reservationComment(r: ApaleoReservation): string {
  return r.comment || r.booker?.comment || '';
}

/** Reservierungsinformationen (Punkt 1) ausschliesslich aus echten Apaleo-Feldern - `created` fuer
 * "gebucht am", `id` (nicht `bookingId`) als anzuzeigende Buchungsnummer (siehe
 * types.ts#TaskReservationSummary). `hasDog`/`hasCrib` beziehen sich ausschliesslich auf DIESE
 * eine Reservierung `r` - bei Turnover wird diese Funktion separat fuer die abreisende und die
 * ankommende Reservierung aufgerufen, die beiden Ergebnisse werden nie vermischt. */
function reservationSummary(r: ApaleoReservation): TaskReservationSummary {
  return {
    reservationId: r.id,
    bookingId: r.bookingId || r.id,
    bookingDate: dateOnly(r.created),
    arrivalDate: dateOnly(r.arrival) || '',
    departureDate: dateOnly(r.departure) || '',
    guestName: guestName(r),
    adults: typeof r.adults === 'number' ? r.adults : null,
    childrenCount: r.childrenAges?.length || 0,
    childAges: r.childrenAges || [],
    hasDog: hasBookedService(r, 'HUND'),
    hasCrib: hasBookedService(r, 'BABY'),
  };
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
  /** Bekannte housekeeping-relevante Buchungsaenderungen je reservationId (Punkt 9) - optional,
   * da nicht jeder Aufrufer (z. B. Tests) diese Daten mitfuehrt. */
  bookingChanges?: BookingChangeRecordsState;
}

export function buildTasks({ propertyNames, units, reservations, doubleups, days, today, bookingChanges = {} }: BuildTasksInput): Task[] {
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
        // Punkt 5/6: LCO IMMER von der ABREISENDEN Reservierung, ECI IMMER von der ANKOMMENDEN
        // (naechsten) Reservierung - niemals beide von derselben Reservierung lesen.
        const hasLateCheckout = hasBookedService(departingRes, 'LCO');
        const hasEarlyCheckin = hasBookedService(arrivingRes, 'ECI');
        tasks.push({
          id: taskId(propertyCode, unit.id, date, 'turnover', departingRes.id),
          propertyId: propertyCode, propertyCode, propertyName, unitId: unit.id, unitName, date, type: 'turnover',
          sourceReservationId: departingRes.id, departureReservationId: departingRes.id, nextReservationId: arrivingRes.id,
          departureTime: departingRes.departure || null, nextArrivalTime: arrivingRes.arrival || null,
          guestName: guestName(departingRes), nextGuestName: guestName(arrivingRes),
          guestCount: guestCount(arrivingRes), comment: reservationComment(arrivingRes),
          doubleupTypes: doubleup?.types || [], followingArrivalDate: null,
          forced: false, nights: null, condition: conditionNow,
          hasLateCheckout, hasEarlyCheckin,
          bookedDepartureTime: hasLateCheckout ? EXTRA_TIME : STANDARD_DEPARTURE_TIME,
          bookedArrivalTime: hasEarlyCheckin ? EXTRA_TIME : STANDARD_ARRIVAL_TIME,
          // Punkt 4: strikt getrennt - reservationInfo IMMER von departingRes, nextReservationInfo
          // IMMER von arrivingRes, nie vermischt.
          reservationInfo: reservationSummary(departingRes), nextReservationInfo: reservationSummary(arrivingRes),
          bookingChange: bookingChanges[departingRes.id] || null,
        });
        continue;
      }

      if (departingRes) {
        const nextArrival = unitReservations
          .filter((r) => { const a = dateOnly(r.arrival); return !!a && a > date; })
          .sort((a, b) => (dateOnly(a.arrival) as string).localeCompare(dateOnly(b.arrival) as string))[0];
        const hasLateCheckout = hasBookedService(departingRes, 'LCO');
        tasks.push({
          id: taskId(propertyCode, unit.id, date, 'departure', departingRes.id),
          propertyId: propertyCode, propertyCode, propertyName, unitId: unit.id, unitName, date, type: 'departure',
          sourceReservationId: departingRes.id, departureReservationId: departingRes.id, nextReservationId: null,
          departureTime: departingRes.departure || null, nextArrivalTime: null,
          guestName: guestName(departingRes), nextGuestName: '',
          guestCount: guestCount(departingRes), comment: reservationComment(departingRes),
          doubleupTypes: doubleup?.types || [], followingArrivalDate: nextArrival ? dateOnly(nextArrival.arrival) : null,
          forced: false, nights: null, condition: conditionNow,
          hasLateCheckout, hasEarlyCheckin: false,
          bookedDepartureTime: hasLateCheckout ? EXTRA_TIME : STANDARD_DEPARTURE_TIME,
          bookedArrivalTime: null,
          reservationInfo: reservationSummary(departingRes), nextReservationInfo: null,
          bookingChange: bookingChanges[departingRes.id] || null,
        });
        continue;
      }

      const occupiedRes = unitReservations.find((r) => {
        const arr = dateOnly(r.arrival);
        const dep = dateOnly(r.departure);
        return !!arr && !!dep && arr <= date && date < dep;
      });

      // Zwischenreinigung (Punkt 12): ausschliesslich, wenn `INTERCLEAN` fuer GENAU diesen Tag
      // gebucht ist (siehe bookedServiceDates()) - keine Naechte-/Abreise-Heuristik mehr.
      if (occupiedRes && bookedServiceDates(occupiedRes, 'INTERCLEAN').includes(date)) {
        const arrivalDate = dateOnly(occupiedRes.arrival) as string;
        tasks.push({
          id: taskId(propertyCode, unit.id, date, 'stayover', occupiedRes.id),
          propertyId: propertyCode, propertyCode, propertyName, unitId: unit.id, unitName, date, type: 'stayover',
          sourceReservationId: occupiedRes.id, departureReservationId: null, nextReservationId: null,
          departureTime: null, nextArrivalTime: null,
          guestName: guestName(occupiedRes), nextGuestName: '',
          guestCount: guestCount(occupiedRes), comment: reservationComment(occupiedRes),
          doubleupTypes: doubleup?.types || [], followingArrivalDate: null,
          forced: false, nights: nightsSince(arrivalDate, date), condition: conditionNow,
          hasLateCheckout: false, hasEarlyCheckin: false,
          bookedDepartureTime: STANDARD_DEPARTURE_TIME, bookedArrivalTime: null,
          reservationInfo: reservationSummary(occupiedRes), nextReservationInfo: null,
          bookingChange: bookingChanges[occupiedRes.id] || null,
        });
        continue;
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
          hasLateCheckout: false, hasEarlyCheckin: false,
          bookedDepartureTime: STANDARD_DEPARTURE_TIME, bookedArrivalTime: null,
          reservationInfo: null, nextReservationInfo: null,
          bookingChange: null,
        });
      }
    }
  }

  return tasks;
}

const TYPE_TIER: Record<TaskType, number> = { turnover: 0, departure: 1, stayover: 2, extra: 3, manual: 4 };

export interface ResolvedTask extends Task {
  status: TaskStatus;
  assignedUserId: string | null;
  assignedUserName: string | null;
  /** Housekeeping Team (Reinigungsfirma), dem dieser Task zugeordnet ist - berechnet aus einem
   * evtl. vorhandenen Task-Override, sonst dem konfigurierten Property-Standard, sonst `null`
   * (Property ohne Team-Konfiguration, siehe resolveTasks). Bewusst GETRENNT von
   * assignedUserId/-Name (Punkt "Team- und Personen-Zuweisung nie vermischen") - ein
   * `assignedUserId` MUSS, falls gesetzt, Mitglied dieses Teams sein (serverseitig durchgesetzt,
   * siehe api/task-assignments.js#assign), wird hier aber nicht selbst noch einmal geprueft. */
  assignedTeamId: string | null;
  assignedTeamName: string | null;
  cleaningStartedAt: number | null;
  elapsedSeconds: number;
  completedAt: number | null;
  history: TaskHistoryEntry[];
  /** true, wenn der LETZTE Verlaufseintrag 'reopened' ist (Briefing "Wieder aktivieren") - fällt
   * automatisch wieder auf `false`, sobald ein nachfolgender 'restarted'/'started'-Eintrag
   * angehaengt wird, damit die dezente Kennzeichnung nicht dauerhaft prominent bleibt, sobald die
   * Reinigung wieder laeuft. Rein abgeleitet aus `history`, keine eigene Persistenz. */
  reopened: boolean;
  /** Aktiver manueller Override (Prioritaet 1) - `null`, wenn keiner gesetzt ist. */
  timeOverride: TaskTimeOverride | null;
  /** Operative Abreise-/Anreisezeit NACH Anwendung der vollen Prioritaetskette (1: Override, 2:
   * gebuchtes Extra, 3: Standard), Format "HH:MM". effectiveArrivalTime ist nur bei
   * type==='turnover' gesetzt. */
  effectiveDepartureTime: string;
  effectiveArrivalTime: string | null;
  /** true, wenn GENAU diese Seite manuell ueberschrieben wurde (fuer die "Geaenderte Zeit"-
   * Kennzeichnung, Punkt 9/14). */
  departureOverridden: boolean;
  arrivalOverridden: boolean;
  /** Reinigungsfenster in Minuten (effectiveArrivalTime - effectiveDepartureTime), nur bei
   * type==='turnover' gesetzt - negativ/0 bedeutet ein kritisches/nicht vorhandenes Fenster
   * (Punkt 15). */
  cleaningWindowMinutes: number | null;
  /** Kritischer Turnover (Punkt 4/15): das TATSAECHLICHE operative Fenster (nach Override) ist
   * <= 0 Minuten - deckt sowohl den gebuchten LCO+ECI-Fall (13:00->13:00) als auch einen durch
   * einen Override versehentlich erzeugten Konflikt ab, ohne die beiden Faelle separat pflegen zu
   * muessen. */
  timeConflict: boolean;
  /** Aktiver Planungs-Override (Briefing "Tag ändern") - `null`, wenn keiner gesetzt ist, sonst
   * derselbe Datensatz wie in TaskScheduleOverridesState. */
  scheduleOverride: TaskScheduleOverride | null;
  /** Der TATSAECHLICH geplante Housekeeping-Tag - `scheduleOverride?.scheduledDate` falls gesetzt,
   * sonst identisch zu `date` (dem unveraenderten Apaleo-/Quelldatum). ALLE Tagesansichten
   * (tasksForDay/daySummary/capacityForDay/teamCapacityForDay) filtern nach DIESEM Feld, nicht nach
   * `date` - das ist der einzige Ort, an dem eine Verschiebung tatsaechlich wirkt (siehe
   * useHousekeepingApp.ts#tasksForDayAll). `date` selbst bleibt fuer IMMER das Quelldatum. */
  scheduledDate: string;
  /** Briefing "Vorbereitung als Checkliste": erledigte Vorbereitungspunkte DIESES Tasks, 1:1 aus
   * TaskAssignment.preparationCompletions uebernommen (leeres Objekt, wenn noch nichts erledigt
   * wurde oder es - wie bei einer manuellen Aufgabe - keinen Vorbereitungs-Workflow gibt). */
  preparationCompletions: PreparationCompletionsState;
}

/** Housekeeping Teams: Kontext fuer die Team-Ableitung in resolveTasks() - Override VOR
 * Property-Standard, exakt dieselbe Prioritaet wie api/_teams.js#resolveAssignedTeamId
 * serverseitig (beide muessen synchron gehalten werden). `teamsById` dient nur der
 * Namensanzeige (Team-Id ist die alleinige Quelle der Wahrheit fuer "welches Team"). */
export interface TeamContext {
  overrides: TaskTeamOverridesState;
  propertyDefaults: TeamPropertyDefaultsState;
  teamsById: Record<string, HousekeepingTeam>;
}

const EMPTY_TEAM_CONTEXT: TeamContext = { overrides: {}, propertyDefaults: {}, teamsById: {} };

/** Fuehrt die rein aus Apaleo abgeleiteten Tasks mit dem persistierten Zuweisungs-/
 * Fortschrittszustand UND dem manuellen Zeiten-Override aus Redis zusammen - analog zu
 * buildRooms(), das assignments[key] in jedes abgeleitete Room-Objekt mischt. */
export function resolveTasks(
  tasks: Task[],
  assignments: TaskAssignmentsState,
  overrides: TaskTimeOverridesState,
  now: number,
  teamContext: TeamContext = EMPTY_TEAM_CONTEXT,
  scheduleOverrides: TaskScheduleOverridesState = {},
): ResolvedTask[] {
  return tasks.map((task) => {
    const a = assignments[task.id];
    const override = overrides[task.id] || null;
    const effectiveDepartureTime = override?.departureTime || task.bookedDepartureTime;
    const effectiveArrivalTime = task.type === 'turnover' ? (override?.arrivalTime || task.bookedArrivalTime) : null;
    const cleaningWindowMinutes = task.type === 'turnover' && effectiveArrivalTime
      ? timeToMinutes(effectiveArrivalTime) - timeToMinutes(effectiveDepartureTime)
      : null;
    const timeMeta = {
      timeOverride: override,
      effectiveDepartureTime,
      effectiveArrivalTime,
      departureOverridden: !!override?.departureTime,
      arrivalOverridden: !!override?.arrivalTime,
      cleaningWindowMinutes,
      timeConflict: cleaningWindowMinutes !== null && cleaningWindowMinutes <= 0,
    };
    // Briefing "Tag ändern" (Punkt 1/3): `date` bleibt das unveraenderte Apaleo-/Quelldatum -
    // `scheduledDate` ist der einzige Ort, an dem ein Planungs-Override tatsaechlich wirkt.
    const scheduleOverride = scheduleOverrides[task.id] || null;
    const scheduleMeta = { scheduleOverride, scheduledDate: scheduleOverride?.scheduledDate || task.date };
    const teamOverride = teamContext.overrides[task.id];
    const assignedTeamId = teamOverride ? teamOverride.teamId : (teamContext.propertyDefaults[task.propertyCode] || null);
    const assignedTeamName = assignedTeamId ? (teamContext.teamsById[assignedTeamId]?.name || teamOverride?.teamName || null) : null;
    const teamMeta = { assignedTeamId, assignedTeamName };
    if (!a) {
      return {
        ...task, ...timeMeta, ...scheduleMeta, ...teamMeta, status: 'open', assignedUserId: null, assignedUserName: null,
        cleaningStartedAt: null, elapsedSeconds: 0, completedAt: null, history: [], reopened: false,
        preparationCompletions: {},
      };
    }
    const elapsed = (a.elapsedSeconds || 0) + (a.cleaningStartedAt ? Math.round((now - a.cleaningStartedAt) / 1000) : 0);
    const history = a.history || [];
    return {
      ...task, ...timeMeta, ...scheduleMeta, ...teamMeta, status: a.status, assignedUserId: a.housekeeperId, assignedUserName: a.housekeeperName,
      cleaningStartedAt: a.cleaningStartedAt, elapsedSeconds: elapsed, completedAt: a.completedAt || null,
      history, reopened: history.length > 0 && history[history.length - 1].action === 'reopened',
      preparationCompletions: a.preparationCompletions || {},
    };
  });
}

/**
 * Manuell erstellte Aufgaben (Punkt "Admin kann Aufgaben erstellen") in dieselbe ResolvedTask-Form
 * wie Apaleo-abgeleitete Reinigungsauftraege gebracht, damit TaskCard/TaskDetailSheet/
 * sortTasksForDay/tasksForDay sie ohne Sonderpfad mitrendern koennen. Bewusst KEIN Durchlauf durch
 * resolveTasks()/TaskAssignmentsState - eine manuelle Aufgabe hat keinen Reinigungs-Workflow
 * (kein Timer/Pause/Team), ihr Status kommt 1:1 aus dem ManualTask-Datensatz selbst (Punkt 3).
 *
 * Briefing "Tag ändern" (Punkt 3): `scheduleOverride` optional, exakt derselbe Datensatz-Typ wie
 * bei einer Reinigung (dieselbe housekeeping:task_schedule_overrides-Hashmap, Key = mt.id) - `null`
 * bedeutet "noch nie verschoben", `scheduledDate` faellt dann auf `mt.date` (das Datum, das beim
 * Erstellen der Aufgabe gewaehlt wurde) zurueck, analog zu `task.date` bei einer Reinigung.
 */
export function manualTaskToResolvedTask(mt: ManualTask, scheduleOverride: TaskScheduleOverride | null = null): ResolvedTask {
  // Punkt "Wieder aktivieren": bevorzugt den persistierten Verlauf (mt.history), falls vorhanden -
  // aeltere Datensaetze ohne dieses Feld werden weiterhin aus den skalaren completedAt/
  // completedByUserId/-Name-Feldern rekonstruiert (identisches Fallback-Verhalten wie zuvor).
  const history = mt.history && mt.history.length > 0
    ? mt.history
    : (mt.completedAt && mt.completedByUserId
      ? [{ action: 'completed' as const, at: mt.completedAt, byUserId: mt.completedByUserId, byUserName: mt.completedByUserName || '' }]
      : []);
  return {
    id: mt.id,
    propertyId: mt.propertyCode,
    propertyCode: mt.propertyCode,
    propertyName: mt.propertyName,
    unitId: mt.unitId || '',
    unitName: mt.unitName || '',
    date: mt.date,
    type: 'manual',
    sourceReservationId: null,
    departureReservationId: null,
    nextReservationId: null,
    departureTime: null,
    nextArrivalTime: null,
    guestName: '',
    nextGuestName: '',
    guestCount: null,
    comment: '',
    doubleupTypes: [],
    followingArrivalDate: null,
    forced: false,
    nights: null,
    condition: '',
    hasLateCheckout: false,
    hasEarlyCheckin: false,
    bookedDepartureTime: '',
    bookedArrivalTime: null,
    reservationInfo: null,
    nextReservationInfo: null,
    manualTitle: mt.title,
    manualDescription: mt.description,
    manualDescriptionTranslation: mt.descriptionTranslation,
    bookingChange: null,
    // Punkt 3: bewusst nur Offen/Erledigt, kein Reinigungs-Zwischenstatus (assigned/in_progress/
    // paused/inspection gibt es fuer eine manuelle Aufgabe nicht).
    status: mt.status === 'completed' ? 'completed' : 'open',
    assignedUserId: mt.assignedUserId,
    assignedUserName: mt.assignedUserName,
    assignedTeamId: null,
    assignedTeamName: null,
    cleaningStartedAt: null,
    elapsedSeconds: 0,
    completedAt: mt.completedAt || null,
    history,
    reopened: history.length > 0 && history[history.length - 1].action === 'reopened',
    timeOverride: null,
    effectiveDepartureTime: '',
    effectiveArrivalTime: null,
    departureOverridden: false,
    arrivalOverridden: false,
    cleaningWindowMinutes: null,
    timeConflict: false,
    scheduleOverride,
    scheduledDate: scheduleOverride?.scheduledDate || mt.date,
    // Punkt 11: manuelle Aufgaben haben keinen Vorbereitungs-Workflow.
    preparationCompletions: {},
  };
}

/** Briefing "Vorbereitung als Checkliste": die Menge der fuer DIESEN Task tatsaechlich zu
 * erledigenden Vorbereitungspunkte - Vereinigung aus dem manuell gesetzten Housekeeping-Flag
 * (doubleupTypes, admin-editierbar ueber toggleTaskDoubleType) und einem per Apaleo-Service (BABY)
 * gebuchten Babybett (IMMER Pflicht, unabhaengig vom manuellen Flag - siehe
 * reservationSummary()#hasCrib). Ein gebuchter Hund (hasDog) ist bewusst NICHT automatisch
 * enthalten - das bleibt reine Gaesteinformation, es sei denn, 'dog' wurde zusaetzlich manuell als
 * Vorbereitung getoggelt (identische Unterscheidung wie bei den gebuchten Extras auf der Karte,
 * siehe TaskCard.tsx#bookedExtraIcons). Architektur bewusst offen fuer weitere kuenftige,
 * automatisch abgeleitete Pflichtpunkte - hier einfach ergaenzen, kein Datenmodell-Update noetig. */
export function requiredPreparationItemIds(task: ResolvedTask): string[] {
  const apaleoHasCrib = !!(task.reservationInfo?.hasCrib || task.nextReservationInfo?.hasCrib);
  const ids = new Set(task.doubleupTypes);
  if (apaleoHasCrib) ids.add('crib');
  return Array.from(ids);
}

/** Briefing "DEPARTURE/TURNOVER vereinheitlichen" (Punkt 8): sortierbarer String-Schluessel fuer
 * den naechsten Zeitpunkt, zu dem das Apartment bezugsfertig sein muss - "YYYY-MM-DD HH:MM" ist
 * lexikographisch exakt chronologisch sortierbar, kein Date-Parsing noetig. Same-Day-Turnover:
 * die heutige, bereits vollstaendig aufgeloeste Anreisezeit (effectiveArrivalTime beruecksichtigt
 * Early-Check-in UND manuelle Time-Overrides bereits, siehe resolveTasks()). Departure mit
 * bekannter Folgebelegung: der naechste Anreisetag - die Uhrzeit DIESER kuenftigen Reservierung
 * ist uns hier (noch) nicht bekannt, "00:00" ist deshalb bewusst konservativ (dringlicher
 * eingeschaetzt als tatsaechlich bekannt), was den Vergleich nicht verfaelscht, da ein anderer Tag
 * ohnehin immer nach "heute" sortiert. Ohne bekannte naechste Belegung das spaeteste denkbare
 * Datum (am wenigsten dringend). */
function nextRequiredAtKey(t: ResolvedTask): string {
  if (t.type === 'turnover' && t.effectiveArrivalTime) return `${t.date} ${t.effectiveArrivalTime}`;
  if (t.type === 'departure' && t.followingArrivalDate) return `${t.followingArrivalDate} 00:00`;
  return '9999-12-31 23:59';
}

/** Priorisierung innerhalb eines Tages - kombiniert den Bearbeitungsstatus (Punkt "Sortierung
 * innerhalb eines Tages": kritische Turnovers/Zeitkonflikte zuerst, dann laufend, pausiert,
 * offen/zugewiesen, zuletzt fertig) mit der Typ-/Zeitpriorisierung (Punkt 9/15/"DEPARTURE/
 * TURNOVER vereinheitlichen" Punkt 8): 1) jede "Reinigung nach Abreise" (Turnover ODER Departure,
 * sortiert nach nextRequiredAtKey - NICHT mehr nach Type), 2) Stayover, 3) Extra, 4) manuelle
 * Aufgabe. Ein abgeschlossener kritischer Turnover gilt nicht mehr als dringend und sinkt wie
 * jede andere fertige Aufgabe ans Ende. */
export function sortTasksForDay(tasks: ResolvedTask[]): ResolvedTask[] {
  function statusTier(t: ResolvedTask): number {
    if (t.status === 'completed') return 5;
    if (t.timeConflict) return 1;
    if (t.status === 'in_progress') return 2;
    if (t.status === 'paused') return 3;
    return 4;
  }
  // Briefing "DEPARTURE/TURNOVER vereinheitlichen" (Punkt 8): die operative Prioritaet zwischen
  // Turnover und Departure ergibt sich nicht mehr aus dem Typ selbst (beide sind fuer
  // Housekeeping primaer "Reinigung nach Abreise", siehe TASK_TYPE_CONFIG), sondern EIN
  // gemeinsamer Rang - die tatsaechliche Reihenfolge innerhalb dieses Rangs entscheidet
  // ausschliesslich nextRequiredAtKey() (der naechste Zeitpunkt, zu dem das Apartment
  // bezugsfertig sein muss). Stayover/Extra/Manual bleiben unveraendert eigene, niedrigere Raenge.
  function typeTier(t: ResolvedTask): number {
    if (t.type === 'turnover' || t.type === 'departure') return 0;
    return TYPE_TIER[t.type];
  }
  return tasks.slice().sort((a, b) => {
    const st = statusTier(a) - statusTier(b);
    if (st !== 0) return st;
    const tt = typeTier(a) - typeTier(b);
    if (tt !== 0) return tt;
    const rk = nextRequiredAtKey(a).localeCompare(nextRequiredAtKey(b));
    if (rk !== 0) return rk;
    if (a.propertyCode !== b.propertyCode) return a.propertyCode.localeCompare(b.propertyCode);
    return a.unitName.localeCompare(b.unitName, undefined, { numeric: true });
  });
}

/** Briefing "Tag ändern" Punkt 12: ein bereits gestarteter/pausierter/abgeschlossener Task darf
 * nicht mehr verschoben werden (nur 'open'/'assigned' sind verschiebbar) - fuer eine manuelle
 * Aufgabe sinngemaess dasselbe ueber ihren eigenen, kleineren Status-Raum ('open'/'completed').
 * EINE Stelle fuer diese Regel, von Server (api/task-schedule-overrides.js, dort dieselbe Pruefung
 * nochmal serverseitig gegen den frischen Redis-Stand) UND Client (TaskDetailSheet.tsx, um die
 * Aktion gar nicht erst anzubieten) genutzt.
 */
export function canRescheduleTask(status: TaskStatus): boolean {
  return status === 'open' || status === 'assigned';
}

/** Briefing "Wieder aktivieren" Punkt 1: nur eine ABGESCHLOSSENE Reinigung/Aufgabe darf reaktiviert
 * werden - EINE Stelle fuer diese Regel, von Server (api/task-assignments.js/api/manual-tasks.js,
 * dort dieselbe Pruefung nochmal serverseitig gegen den frischen Redis-Stand) UND Client
 * (TaskDetailSheet.tsx) genutzt. */
export function canReopenTask(status: TaskStatus): boolean {
  return status === 'completed';
}

/** Briefing "Tag ändern" Punkt 7: das harte Referenzdatum, ab dem eine Verschiebung blockiert wird
 * ("... kann nicht nach der nächsten Anreise geplant werden") bzw. bei Gleichheit eine deutliche
 * Warnung ausloest - bei Turnover ist das der Task-Tag selbst (die naechste Anreise findet AM
 * SELBEN Tag statt), bei Departure die bekannte Folgeanreise (falls schon bekannt), sonst gibt es
 * keine Kollisionsgrenze (Zwischenreinigung/Aufgabe/Extra). */
export function nextArrivalDateForTask(task: Task): string | null {
  if (task.type === 'turnover') return task.date;
  if (task.type === 'departure') return task.followingArrivalDate;
  return null;
}

export function daySummary(date: string, tasks: ResolvedTask[]): DaySummary {
  // Briefing "Tag ändern" (Punkt 13): filtert nach `scheduledDate` (dem TATSAECHLICH geplanten
  // Tag), nicht nach `date` (dem unveraenderten Quelldatum) - sonst wuerde ein verschobener Task
  // hier faelschlich verschwinden, obwohl der Aufrufer (useHousekeepingApp.ts#tasksForDayAll)
  // bereits korrekt nach scheduledDate vorgefiltert hat.
  const dayTasks = tasks.filter((t) => t.scheduledDate === date);
  return {
    date,
    total: dayTasks.length,
    assigned: dayTasks.filter((t) => t.status === 'assigned').length,
    open: dayTasks.filter((t) => t.status === 'open').length,
    inProgress: dayTasks.filter((t) => t.status === 'in_progress').length,
    paused: dayTasks.filter((t) => t.status === 'paused').length,
    completed: dayTasks.filter((t) => t.status === 'completed').length,
    turnover: dayTasks.filter((t) => t.type === 'turnover').length,
  };
}

/** Team-/Kapazitaetsuebersicht (Punkt 12): Anzahl Aufgaben je Housekeeper an diesem Tag, plus
 * "Nicht zugewiesen" als letzter Eintrag (housekeeperId: null). */
export function capacityForDay(date: string, tasks: ResolvedTask[]): CapacityEntry[] {
  // Siehe Kommentar in daySummary() - scheduledDate statt date.
  const dayTasks = tasks.filter((t) => t.scheduledDate === date);
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

/** Team-Ebene der Team-/Kapazitaetsuebersicht (Briefing "Team-Auslastung") - je Team die
 * Gesamtzahl PLUS dieselbe personenbezogene Aufschluesselung wie capacityForDay(), nur auf die
 * Aufgaben GENAU dieses Teams eingeschraenkt. Aufgaben ganz ohne Team-Zuordnung (Property ohne
 * konfiguriertes Standard-Team) buendeln sich in einem abschliessenden `teamId: null`-Eintrag,
 * analog zum "Nicht zugewiesen"-Eintrag von capacityForDay(). */
export function teamCapacityForDay(date: string, tasks: ResolvedTask[]): TeamCapacityEntry[] {
  // Siehe Kommentar in daySummary() - scheduledDate statt date.
  const dayTasks = tasks.filter((t) => t.scheduledDate === date);
  const map = new Map<string, TeamCapacityEntry>();
  const noTeamTasks: ResolvedTask[] = [];
  for (const t of dayTasks) {
    if (!t.assignedTeamId) { noTeamTasks.push(t); continue; }
    let entry = map.get(t.assignedTeamId);
    if (!entry) {
      entry = { teamId: t.assignedTeamId, teamName: t.assignedTeamName || '', total: 0, perPerson: [] };
      map.set(t.assignedTeamId, entry);
    }
    entry.total += 1;
  }
  for (const entry of map.values()) {
    entry.perPerson = capacityForDay(date, dayTasks.filter((t) => t.assignedTeamId === entry.teamId));
  }
  const list = Array.from(map.values()).sort((a, b) => b.total - a.total);
  if (noTeamTasks.length > 0) {
    list.push({ teamId: null, teamName: '', total: noTeamTasks.length, perPerson: capacityForDay(date, noTeamTasks) });
  }
  return list;
}

/** Kein Inspektions-Schritt in diesem Betrieb (fachliche Klarstellung) - eine abgeschlossene
 * Reinigung ist direkt fertig, der Apaleo-Unit-Status wird direkt auf "Clean" gesetzt statt ueber
 * einen Zwischenzustand "CleanToBeInspected". Zentral an einer Stelle statt verstreut - eine
 * spaetere Property-spezifische Wiedereinfuehrung koennte hier ansetzen, ohne Aufrufstellen
 * anzufassen. */
export function requiresInspection(_propertyCode: string): boolean {
  return false;
}
