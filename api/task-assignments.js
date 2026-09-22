// Aufgabenbezogene Zuweisungen (Punkt 4/28): Key = deterministische Task-ID (siehe
// lib/housekeeping/tasks.ts#taskId), NICHT mehr Property+Zimmer wie im alten
// housekeeping:assignments-Hash (der unangetastet bleibt, siehe api/assignments.js - eine
// Zuweisung gehoert jetzt zu einem konkreten Auftrag an einem konkreten Datum, nicht mehr
// dauerhaft zum Apartment).
//
// Rechte (Punkt 14/15/16): ein Housekeeper darf sich selbst einen offenen Task zuweisen
// (atomar, Race-Condition-sicher, Punkt 19) und eigene Zuweisungen/Timer/Abschluss verwalten.
// 'assign'/'bulkAssign'/'clearScope' erfordern Admin ODER Standortverantwortlich fuer GENAU das
// Property des jeweiligen Tasks (aus der Task-ID selbst abgeleitet, nicht vom Client behauptet -
// siehe api/_permissions.js).
const { getRedis, parseJSON, migrateLegacyKey } = require('./_redis');
const { requireSession } = require('./_auth');
const { getUserRawById } = require('./_users');
const {
  hasPropertyAccess, isPropertyManager, propertyCodeFromTaskId, dateFromTaskId, unitIdFromTaskId, reservationIdFromTaskId,
} = require('./_permissions');
const { isAcknowledged } = require('./_task-notices');
const { resolveAssignedTeamId } = require('./_teams');
const { getActiveItemsForProperty: getActiveLinenItemsForProperty, saveCompletionReport: saveLinenCompletionReport } = require('./_linen');

// Housekeeping Teams (Reinigungsfirmen): darf `user` einen Task claimen/starten, der (laut
// resolveAssignedTeamId) einem Team zugeordnet ist? Admin und Standortverantwortliche des
// betreffenden Property duerfen das immer (unveraendertes bestehendes Recht). Ist GAR KEIN Team
// zugeordnet (Property ohne konfiguriertes Standard-Team - Migration-light: bestehende
// Properties funktionieren unveraendert weiter), gilt weiterhin ausschliesslich der bisherige
// hasPropertyAccess-Check. Ist ein Team zugeordnet, muss der Aufrufer GENAU diesem Team angehoeren
// (Mitglied oder Lead - beide duerfen sich selbst einen freien Team-Task zuweisen).
function canClaimTeamTask(user, propertyCode, assignedTeamId) {
  if (user.role === 'admin') return true;
  if (isPropertyManager(user, propertyCode)) return true;
  if (!assignedTeamId) return true;
  return user.housekeepingTeamId === assignedTeamId;
}

const HASH_KEY = 'housekeeping:task_assignments';
const LEGACY_HASH_KEY = 'hk:task_assignments';
// Briefing "Tag ändern": nur GELESEN, nie geschrieben - siehe api/task-schedule-overrides.js fuer
// die eigentliche Schreib-Route/Rechtepruefung dieses Hashes.
const SCHEDULE_OVERRIDES_HASH_KEY = 'housekeeping:task_schedule_overrides';

async function allTaskAssignments(redis) {
  const all = await redis.hGetAll(HASH_KEY);
  const assignments = {};
  for (const [k, v] of Object.entries(all)) assignments[k] = parseJSON(v, null);
  return assignments;
}

// Atomarer Self-Claim (Punkt 19) via HSETNX statt WATCH/MULTI/EXEC: `getRedis()` liefert eine
// EINZIGE, prozessweit geteilte Verbindung (siehe api/_redis.js) - WATCH/MULTI/EXEC ist aber
// PRO VERBINDUNG wirksam, nicht pro Aufruf. Bei mehreren gleichzeitigen claimTask()-Aufrufen auf
// derselben Verbindung wurde ein erfolgreiches EXEC eines Aufrufs den beobachteten Schluessel fuer
// ALLE anderen, noch laufenden Aufrufe auf derselben Verbindung ebenfalls loeschen (WATCH-Zustand
// ist verbindungs-, nicht aufrufbezogen) - dadurch konnten bei echter Nebenlaeufigkeit mehrere
// Anfragen gleichzeitig gewinnen (im Lasttest reproduziert: 8 parallele Claims auf einen frischen
// Task ergaben 8 statt 1 Gewinner). HSETNX ist dagegen ein einzelner, nativ atomarer Redis-Befehl
// ("setze dieses Hash-Feld nur, wenn es noch nicht existiert") - kein WATCH/MULTI/EXEC, keine
// Verbindungsisolation noetig, kein Retry-Loop, und weiterhin kein Lua/EVAL (Upstash-Plankompatibel,
// HSETNX ist ein Kernprotokoll-Befehl wie jeder andere Hash-Befehl auch).
async function claimTask(redis, taskId, record) {
  const created = await redis.hSetNX(HASH_KEY, taskId, JSON.stringify(record));
  if (created) return true;
  // Punkt "Wieder aktivieren": eine reaktivierte, aber (noch) niemandem zugewiesene Aufgabe hat
  // weiterhin einen bestehenden Redis-Datensatz (status: 'open', siehe reopen-Aktion unten) - der
  // urspruengliche Datensatz MUSS erhalten bleiben, um Verlauf/elapsedSeconds nicht zu verlieren,
  // weshalb HSETNX oben (setzt nur, wenn der Schluessel komplett FEHLT) hier fehlschlaegt, obwohl
  // der Task fachlich frei ist. Fallback: lesen und nur uebernehmen, wenn der bestehende Datensatz
  // tatsaechlich noch 'open' ist - ein bewusst in Kauf genommenes, schmales Race-Fenster fuer
  // diesen deutlich selteneren Fall (der haeufige Fall, ein brandneuer Task, bleibt vollstaendig
  // ueber den atomaren HSETNX-Pfad oben abgesichert - siehe dessen Kommentar fuer den Grund, warum
  // hier bewusst kein WATCH/MULTI/EXEC bzw. Lua/EVAL verwendet wird).
  const raw = await redis.hGet(HASH_KEY, taskId);
  const existing = raw ? parseJSON(raw, null) : null;
  if (!existing || existing.status !== 'open') return false;
  const merged = {
    ...existing, housekeeperId: record.housekeeperId, housekeeperName: record.housekeeperName,
    since: record.since, status: 'assigned', cleaningStartedAt: null,
  };
  await redis.hSet(HASH_KEY, taskId, JSON.stringify(merged));
  return true;
}

// Fuer Selbstbedienungs-Aktionen (release/startTimer/stopTimer): erlaubt fuer Admin, fuer
// Standortverantwortliche des betreffenden Property, oder wenn es die eigene Zuweisung ist.
// Reinigungsverlauf (Punkt "Reinigungsverlauf"): haengt an genau demselben TaskAssignment-Datensatz
// an, auf dem status/cleaningStartedAt/elapsedSeconds bereits liegen - kein zweiter, paralleler
// Speicherort. `action` ist ereignisbezogen (started/paused/resumed/completed) statt nur den
// Status zu spiegeln, damit die Verlaufszeile ohne weitere Herleitung den geforderten Text traegt.
function appendHistory(record, action, user, source) {
  const entry = { action, at: Date.now(), byUserId: user.id, byUserName: user.name || user.username };
  if (source) entry.source = source;
  record.history = [...(record.history || []), entry];
  return record;
}

async function canTouchOwnAssignment(redis, user, taskId) {
  if (user.role === 'admin') return true;
  const propertyCode = propertyCodeFromTaskId(taskId);
  if (isPropertyManager(user, propertyCode)) return true;
  const raw = await redis.hGet(HASH_KEY, taskId);
  if (!raw) return true;
  const existing = parseJSON(raw, null);
  return !existing || existing.housekeeperId === user.id;
}

module.exports = async (req, res) => {
  try {
    const redis = await getRedis();
    await migrateLegacyKey(redis, LEGACY_HASH_KEY, HASH_KEY);

    if (req.method === 'GET') {
      if (!(await requireSession(req, res))) return;
      res.status(200).json({ taskAssignments: await allTaskAssignments(redis) });
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const session = await requireSession(req, res);
    if (!session) return;
    // Immer frisch laden statt der im Session-Cookie gecachten role - managedProperties und
    // Property-Zugriff koennen sich seit dem Login geaendert haben (siehe api/_permissions.js).
    const user = await getUserRawById(redis, session.userId);
    if (!user) {
      res.status(401).json({ error: 'Nicht angemeldet.' });
      return;
    }
    // Deaktivierte Benutzer koennen sich zwar (per verifyLogin) nicht mehr neu anmelden, eine
    // zuvor ausgestellte Session blieb bisher aber bis zum Ablauf wirksam - diese Route ist der
    // Ort, an dem tatsaechlich Zustand veraendert wird, deshalb hier zusaetzlich hart gesperrt
    // (Briefing-Testfall "deaktivierter Mitarbeiter kann keine Reinigung uebernehmen").
    if (user.active === false) {
      res.status(403).json({ error: 'Dieses Benutzerkonto ist deaktiviert.' });
      return;
    }

    const { action } = req.body || {};

    if (action === 'claim') {
      const { taskId } = req.body;
      if (!taskId) { res.status(400).json({ error: 'taskId ist erforderlich.' }); return; }
      const propertyCode = propertyCodeFromTaskId(taskId);
      if (!hasPropertyAccess(user, propertyCode)) {
        res.status(403).json({ error: 'Kein Zugriff auf dieses Property.' });
        return;
      }
      const assignedTeamId = await resolveAssignedTeamId(redis, taskId);
      if (!canClaimTeamTask(user, propertyCode, assignedTeamId)) {
        res.status(403).json({ error: 'Diese Reinigung ist einem anderen Team zugewiesen.' });
        return;
      }
      const record = {
        taskId, housekeeperId: user.id, housekeeperName: user.name || user.username,
        since: Date.now(), status: 'assigned', cleaningStartedAt: null, elapsedSeconds: 0,
      };
      const claimed = await claimTask(redis, taskId, record);
      if (!claimed) {
        res.status(409).json({ error: 'Diese Aufgabe wurde gerade von einem anderen Teammitglied übernommen.' });
        return;
      }
    } else if (action === 'release') {
      const { taskId } = req.body;
      if (!taskId) { res.status(400).json({ error: 'taskId ist erforderlich.' }); return; }
      const raw = await redis.hGet(HASH_KEY, taskId);
      const existing = raw ? parseJSON(raw, null) : null;
      const propertyCode = propertyCodeFromTaskId(taskId);
      const isOwn = existing && existing.housekeeperId === user.id;
      // Team-Verantwortliche (Punkt "Lead darf Personen-Zuweisung freigeben") duerfen das
      // ausschliesslich fuer Tasks des EIGENEN Teams - abgeleitet ueber resolveAssignedTeamId,
      // nicht ueber eine (moeglicherweise inzwischen veraltete) Teamzugehoerigkeit der bereits
      // zugewiesenen Person.
      const isLeadOfTask = user.teamRole === 'lead' && !!user.housekeepingTeamId &&
        user.housekeepingTeamId === (await resolveAssignedTeamId(redis, taskId));
      const allowed = user.role === 'admin' || isPropertyManager(user, propertyCode) || isOwn || isLeadOfTask;
      if (!allowed) { res.status(403).json({ error: 'Diese Aufgabe gehört einer anderen Person.' }); return; }
      // Punkt 14: eigene Aufgabe nur freigeben, solange die Reinigung noch nicht begonnen wurde.
      if (isOwn && user.role !== 'admin' && existing && existing.status !== 'assigned') {
        res.status(409).json({ error: 'Die Reinigung wurde bereits begonnen und kann nicht mehr freigegeben werden.' });
        return;
      }
      await redis.hDel(HASH_KEY, taskId);
    } else if (action === 'assign') {
      const { taskId, housekeeperId, housekeeperName } = req.body;
      if (!taskId || !housekeeperId) { res.status(400).json({ error: 'taskId und housekeeperId sind erforderlich.' }); return; }
      const propertyCode = propertyCodeFromTaskId(taskId);
      const manager = isPropertyManager(user, propertyCode);
      // Team-Verantwortliche duerfen zusaetzlich zu Standortverantwortlichen freie Tasks des
      // EIGENEN Teams an eigene Teammitglieder verteilen/umverteilen (Briefing "Lead weist
      // Aufgaben Team-Mitgliedern zu") - ausschliesslich innerhalb des eigenen Teams, nie fuer
      // fremde Teams oder Personen ausserhalb des Teams.
      const assignedTeamId = await resolveAssignedTeamId(redis, taskId);
      const isLeadOfTask = user.teamRole === 'lead' && !!user.housekeepingTeamId && user.housekeepingTeamId === assignedTeamId;
      if (!manager && !isLeadOfTask) {
        res.status(403).json({ error: 'Nur für Standortverantwortliche oder den Team-Verantwortlichen dieses Teams.' });
        return;
      }
      if (!manager && isLeadOfTask) {
        const target = await getUserRawById(redis, housekeeperId);
        if (!target || target.housekeepingTeamId !== assignedTeamId || target.active === false || !hasPropertyAccess(target, propertyCode)) {
          res.status(403).json({ error: 'Nur aktive Mitglieder des eigenen Teams mit Zugriff auf dieses Property.' });
          return;
        }
      }
      // Punkt "Wieder aktivieren": bewahrt einen evtl. bereits bestehenden Datensatz (elapsedSeconds/
      // history/completedAt) statt ihn blind mit einem frischen Objektliteral zu ueberschreiben -
      // relevant, sobald ein Admin nach einer Reaktivierung separat neu zuweist ("Der Admin kann
      // danach separat neu zuweisen", siehe Briefing), aber auch fuer jede sonstige Umverteilung
      // eines bereits einmal begonnenen/pausierten Tasks (der bisherige, blinde Overwrite haette
      // dort ebenso Verlauf/Zeit verloren).
      const existingForAssign = await redis.hGet(HASH_KEY, taskId).then((raw) => (raw ? parseJSON(raw, null) : null));
      await redis.hSet(HASH_KEY, taskId, JSON.stringify({
        ...(existingForAssign || {}),
        taskId, housekeeperId, housekeeperName: housekeeperName || '',
        since: Date.now(), status: 'assigned', cleaningStartedAt: null,
        elapsedSeconds: existingForAssign ? (existingForAssign.elapsedSeconds || 0) : 0,
        history: existingForAssign ? (existingForAssign.history || []) : [],
      }));
    } else if (action === 'bulkAssign') {
      const { taskIds, housekeeperId, housekeeperName } = req.body;
      if (!Array.isArray(taskIds) || taskIds.length === 0 || !housekeeperId) {
        res.status(400).json({ error: 'taskIds[] und housekeeperId sind erforderlich.' });
        return;
      }
      const notAllowed = taskIds.find((id) => !isPropertyManager(user, propertyCodeFromTaskId(id)));
      if (notAllowed) {
        res.status(403).json({ error: 'Nur für Standortverantwortliche der betroffenen Properties.' });
        return;
      }
      const multi = redis.multi();
      for (const taskId of taskIds) {
        multi.hSet(HASH_KEY, taskId, JSON.stringify({
          taskId, housekeeperId, housekeeperName: housekeeperName || '',
          since: Date.now(), status: 'assigned', cleaningStartedAt: null, elapsedSeconds: 0,
        }));
      }
      await multi.exec();
    } else if (action === 'clearScope') {
      // Punkt 22: bezieht sich auf Tag + Property/Standortfilter, nicht mehr pauschal auf das
      // ganze Property - "date" ist Pflicht, "property" optional (leer/'all' = alle Properties,
      // fuer die der Aufrufer Standortverantwortlich ist).
      //
      // Briefing "Tag ändern" Punkt 13: `date` kommt vom Client als der gerade sichtbare Tag
      // (state.selectedDay, also der EFFEKTIVE/geplante Tag) - ein Task, der per Schedule-Override
      // auf einen anderen Tag verschoben wurde, muss deshalb anhand seines EFFEKTIVEN Tages
      // (scheduledDate) geprueft werden, nicht anhand des in der ID eingebetteten Quelldatums
      // (dateFromTaskId). Ohne diese Korrektur wuerde "Zuweisungen dieses Tages aufheben" nach
      // einer Verschiebung entweder den falschen Tag treffen oder den richtigen verfehlen.
      const { date, property } = req.body;
      if (!date) { res.status(400).json({ error: 'date ist erforderlich.' }); return; }
      const [all, scheduleOverridesRaw] = await Promise.all([
        redis.hGetAll(HASH_KEY),
        redis.hGetAll(SCHEDULE_OVERRIDES_HASH_KEY),
      ]);
      const toDelete = Object.keys(all).filter((id) => {
        const override = parseJSON(scheduleOverridesRaw[id], null);
        const effectiveDate = override?.scheduledDate || dateFromTaskId(id);
        if (effectiveDate !== date) return false;
        const propertyCode = propertyCodeFromTaskId(id);
        if (property && property !== 'all' && propertyCode !== property) return false;
        return isPropertyManager(user, propertyCode);
      });
      if (toDelete.length) await redis.hDel(HASH_KEY, toDelete);
    } else if (action === 'startTimer') {
      const { taskId, startSource } = req.body;
      if (!taskId) { res.status(400).json({ error: 'taskId ist erforderlich.' }); return; }
      // Punkt "Startquelle speichern": rein informativ fuer den Reinigungsverlauf, kein
      // Berechtigungs-/Verhaltensunterschied - ein unbekannter/fehlender Wert zaehlt als 'manual'.
      const source = startSource === 'nfc' ? 'nfc' : 'manual';
      if (!(await canTouchOwnAssignment(redis, user, taskId))) {
        res.status(403).json({ error: 'Diese Aufgabe gehört einer anderen Person.' });
        return;
      }
      const propertyCode = propertyCodeFromTaskId(taskId);
      if (!hasPropertyAccess(user, propertyCode)) { res.status(403).json({ error: 'Kein Zugriff auf dieses Property.' }); return; }
      const existingRaw = await redis.hGet(HASH_KEY, taskId);
      const existing = existingRaw
        ? parseJSON(existingRaw, {})
        : { taskId, housekeeperId: user.id, housekeeperName: user.name || user.username, since: Date.now(), status: 'assigned', elapsedSeconds: 0 };
      // Punkt 6: Reinigungsstart serverseitig gesperrt, solange der ZUGEWIESENE Mitarbeiter (nicht
      // notwendigerweise der Aufrufer - z. B. wenn ein Admin fuer jemand anderen startet) einen
      // wichtigen Hinweis in seiner aktuellen Version noch nicht bestaetigt hat. Kein Hinweis
      // vorhanden -> isAcknowledged() liefert true, also keine Aenderung am bisherigen Verhalten.
      if (!(await isAcknowledged(redis, taskId, existing.housekeeperId || user.id))) {
        res.status(409).json({ error: 'Bitte bestätige zuerst den wichtigen Hinweis.' });
        return;
      }
      // Punkt "Reinigungsverlauf": ein bereits einmal begonnener Task (elapsedSeconds > 0, z. B.
      // nach einer Pause) wird beim erneuten Start als "Fortgesetzt" statt "Reinigung gestartet"
      // protokolliert - reine Ableitung aus dem ohnehin vorhandenen Feld, kein zweiter Zaehler.
      //
      // Punkt "Wieder aktivieren": folgt auf den Start unmittelbar ein 'reopened'-Eintrag (der
      // letzte Verlaufseintrag), wird stattdessen 'restarted' protokolliert ("Reinigung erneut
      // gestartet") - unterscheidet sich bewusst von 'resumed' (Fortsetzen NACH einer Pause
      // innerhalb derselben laufenden Reinigung, kein Abschluss dazwischen).
      const lastHistoryAction = existing.history && existing.history.length > 0
        ? existing.history[existing.history.length - 1].action
        : null;
      const startAction = lastHistoryAction === 'reopened'
        ? 'restarted'
        : ((existing.elapsedSeconds || 0) > 0 ? 'resumed' : 'started');
      appendHistory(existing, startAction, user, source);
      existing.status = 'in_progress';
      existing.cleaningStartedAt = Date.now();
      await redis.hSet(HASH_KEY, taskId, JSON.stringify(existing));
    } else if (action === 'stopTimer') {
      const { taskId } = req.body;
      if (!taskId) { res.status(400).json({ error: 'taskId ist erforderlich.' }); return; }
      if (!(await canTouchOwnAssignment(redis, user, taskId))) {
        res.status(403).json({ error: 'Diese Aufgabe gehört einer anderen Person.' });
        return;
      }
      const existingRaw = await redis.hGet(HASH_KEY, taskId);
      const existing = existingRaw ? parseJSON(existingRaw, null) : null;
      if (existing && existing.cleaningStartedAt) {
        existing.elapsedSeconds = (existing.elapsedSeconds || 0) + Math.round((Date.now() - existing.cleaningStartedAt) / 1000);
        existing.cleaningStartedAt = null;
        // Eigener, von "assigned" (noch nie gestartet) unterscheidbarer Status - siehe
        // types.ts#TaskStatus. Vorher fiel eine pausierte Aufgabe optisch mit einer frisch
        // zugewiesenen, noch nie begonnenen zusammen.
        existing.status = 'paused';
        appendHistory(existing, 'paused', user);
        await redis.hSet(HASH_KEY, taskId, JSON.stringify(existing));
      }
    } else if (action === 'complete') {
      // Punkt 23: unser Workflow-Status (hier) und der Apaleo Unit Condition Aufruf (separat vom
      // Client via dem bestehenden, unveraenderten setUnitCondition()) sind bewusst getrennt.
      //
      // Waescheverbrauch (Briefing "Waescheverbrauch erfassen"): erweitert bewusst DIESE bestehende
      // Aktion statt eines zweiten, parallelen Abschlussmechanismus. Sind fuer dieses Property
      // aktive Waescheartikel konfiguriert, MUSS `linenItems` fuer jeden davon einen gueltigen
      // `actualQuantity` enthalten (0 ist gueltig, fehlend/null/undefined nicht) - sonst wird die
      // gesamte Aktion abgelehnt, BEVOR irgendetwas an Timer/Status veraendert wird (Punkt 9: kein
      // "completed" ohne vollstaendigen Report, und ein abgebrochenes Formular darf den Timer nicht
      // schon beendet haben). Properties ohne konfigurierte Artikel verhalten sich unveraendert wie
      // zuvor (migration-light, kein Formular noetig).
      const { taskId, requiresInspection: needsInspection, linenItems: submittedLinenItems } = req.body;
      if (!taskId) { res.status(400).json({ error: 'taskId ist erforderlich.' }); return; }
      if (!(await canTouchOwnAssignment(redis, user, taskId))) {
        res.status(403).json({ error: 'Diese Aufgabe gehört einer anderen Person.' });
        return;
      }
      const propertyCode = propertyCodeFromTaskId(taskId);
      const requiredLinenItems = await getActiveLinenItemsForProperty(redis, propertyCode);
      const submitted = Array.isArray(submittedLinenItems) ? submittedLinenItems : [];
      const submittedById = new Map(submitted.map((li) => [li.itemId, li]));
      const linenReportLines = [];
      for (const item of requiredLinenItems) {
        const entry = submittedById.get(item.id);
        const actual = entry ? entry.actualQuantity : undefined;
        if (actual === null || actual === undefined || typeof actual !== 'number' || !Number.isFinite(actual) || actual < 0) {
          res.status(400).json({ error: 'Bitte den tatsächlichen Wäscheverbrauch vollständig erfassen.' });
          return;
        }
        linenReportLines.push({
          itemId: item.id, itemName: item.name, unit: item.unit,
          estimatedQuantity: entry && typeof entry.estimatedQuantity === 'number' ? entry.estimatedQuantity : null,
          actualQuantity: actual,
        });
      }

      const existingRaw = await redis.hGet(HASH_KEY, taskId);
      const existing = existingRaw
        ? parseJSON(existingRaw, {})
        : { taskId, housekeeperId: user.id, housekeeperName: user.name || user.username, since: Date.now(), elapsedSeconds: 0 };
      if (existing.cleaningStartedAt) {
        existing.elapsedSeconds = (existing.elapsedSeconds || 0) + Math.round((Date.now() - existing.cleaningStartedAt) / 1000);
        existing.cleaningStartedAt = null;
      }
      existing.status = needsInspection ? 'inspection' : 'completed';
      existing.completedAt = Date.now();
      appendHistory(existing, 'completed', user);
      await redis.hSet(HASH_KEY, taskId, JSON.stringify(existing));

      if (linenReportLines.length > 0) {
        const assignedTeamId = await resolveAssignedTeamId(redis, taskId);
        await saveLinenCompletionReport(redis, {
          taskId, propertyCode, unitId: unitIdFromTaskId(taskId), reservationId: reservationIdFromTaskId(taskId),
          completedByUserId: user.id, completedByUserName: user.name || user.username,
          housekeepingTeamId: assignedTeamId, linenItems: linenReportLines,
        });
      }
    } else if (action === 'completeInspection') {
      const { taskId } = req.body;
      if (!taskId) { res.status(400).json({ error: 'taskId ist erforderlich.' }); return; }
      const propertyCode = propertyCodeFromTaskId(taskId);
      if (!isPropertyManager(user, propertyCode)) {
        res.status(403).json({ error: 'Nur für Standortverantwortliche dieses Property.' });
        return;
      }
      const existingRaw = await redis.hGet(HASH_KEY, taskId);
      const existing = existingRaw ? parseJSON(existingRaw, null) : null;
      if (existing) {
        existing.status = 'completed';
        existing.completedAt = Date.now();
        await redis.hSet(HASH_KEY, taskId, JSON.stringify(existing));
      }
    } else if (action === 'reopen') {
      // Briefing "Wieder aktivieren": admin-only, ausschliesslich fuer eine bereits ABGESCHLOSSENE
      // Reinigung (siehe tasks.ts#canReopenTask - dieselbe Regel, hier serverseitig gegen den
      // frischen Redis-Stand durchgesetzt). Setzt NIE auf 'in_progress' zurueck - der normale
      // "Reinigung starten"-Weg (bzw. NFC) muss fuer den Wiedereinstieg verwendet werden. Der
      // bestehende Verlauf/elapsedSeconds-Akkumulator bleibt vollstaendig erhalten (siehe
      // claimTask()-Kommentar oben: dieser Akkumulator schliesst die Luecke zwischen 'completed'
      // und dem naechsten Start bereits automatisch von der aktiven Zeit aus, da cleaningStartedAt
      // in der Zwischenzeit `null` ist - kein neues sessions[]-Schema noetig).
      const { taskId } = req.body;
      if (!taskId) { res.status(400).json({ error: 'taskId ist erforderlich.' }); return; }
      if (user.role !== 'admin') {
        res.status(403).json({ error: 'Nur Administratoren können eine Reinigung wieder aktivieren.' });
        return;
      }
      const existingRaw = await redis.hGet(HASH_KEY, taskId);
      const existing = existingRaw ? parseJSON(existingRaw, null) : null;
      if (!existing || existing.status !== 'completed') {
        res.status(409).json({ error: 'Nur eine abgeschlossene Reinigung kann wieder aktiviert werden.' });
        return;
      }
      existing.status = existing.housekeeperId ? 'assigned' : 'open';
      existing.cleaningStartedAt = null;
      appendHistory(existing, 'reopened', user);
      await redis.hSet(HASH_KEY, taskId, JSON.stringify(existing));
    } else {
      res.status(400).json({ error: 'Unbekannte action.' });
      return;
    }

    res.status(200).json({ taskAssignments: await allTaskAssignments(redis) });
  } catch (err) {
    console.error('[api/task-assignments]', err);
    res.status(500).json({ error: err.message || 'Interner Fehler' });
  }
};
