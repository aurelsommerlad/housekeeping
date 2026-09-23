// Manuell von Admin erstellte, operative Aufgaben (Punkt "Admin kann Aufgaben erstellen") - KEIN
// Apaleo-Bezug, KEIN Reinigungs-Workflow. Redis housekeeping:manual_tasks, Key = eigene stabile
// ID (siehe types.ts#ManualTask). Getrennt von housekeeping:task_assignments, da eine manuelle
// Aufgabe keinen Timer/Pause/Team-Zustand hat - nur Offen/Erledigt (Punkt 3).
//
// Rechte (Punkt "server-seitig nur Admin, bestehende Manager-Rechte nicht eigenmaechtig
// erweitern"): NUR Admin darf eine Aufgabe anlegen. Lesen darf jeder mit Zugriff auf das
// Property (hasPropertyAccess). "Erledigen" darf Admin, Standortverantwortlicher dieses
// Property, ODER die zugewiesene Person selbst (identisch zur bestehenden Regel fuer
// Reinigungs-Tasks, siehe api/task-assignments.js).
const { getRedis, parseJSON } = require('./_redis');
const { requireSession } = require('./_auth');
const { getUserRawById } = require('./_users');
const { hasPropertyAccess, isPropertyManager } = require('./_permissions');
const { buildFreeTextTranslation } = require('./_translate');

const HASH_KEY = 'housekeeping:manual_tasks';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const VALID_SOURCE_LANGUAGES = ['de', 'en', 'pl', 'ro'];

// Briefing "BABY-Business-Logik" Punkt 5 "keine Doppelaufgaben": deterministisch aus
// Servicecode+Reservierung statt der sonst hier verwendeten Zufalls-ID (siehe 'create' oben) - ein
// erneuter Apaleo-Sync berechnet fuer dieselbe Buchung immer wieder EXAKT dieselbe ID, statt eine
// weitere Aufgabe anzulegen. Muss 1:1 mit lib/housekeeping/tasks.ts#manualExtraEquipmentTaskId
// uebereinstimmen (dort fuer den Client, hier fuer den Server - api/*.js importiert bewusst kein
// TypeScript, siehe bestehende Konvention z. B. api/_permissions.js). Enthaelt bewusst kein "|",
// damit api/task-schedule-overrides.js#isDerivedTaskId (5-Teile-Pipe-Heuristik) diese ID niemals
// mit einer abgeleiteten Reinigungs-Task-ID verwechselt.
function extraEquipmentTaskId(reservationId) {
  return `manual_extra_BABY_${reservationId}`;
}

// Punkt "Wieder aktivieren": derselbe Verlaufsmechanismus wie bei Reinigungs-Tasks (siehe
// api/task-assignments.js#appendHistory), hier additiv auf `task.history` statt auf einem
// TaskAssignment-Datensatz - kein zweiter, abweichender Audit-Mechanismus.
function appendHistory(task, action, user) {
  const entry = { action, at: Date.now(), byUserId: user.id, byUserName: user.name || user.username };
  task.history = [...(task.history || []), entry];
  return task;
}

async function allTasksForUser(redis, user) {
  const all = await redis.hGetAll(HASH_KEY);
  const tasks = {};
  for (const [id, raw] of Object.entries(all)) {
    const task = parseJSON(raw, null);
    if (!task) continue;
    if (!hasPropertyAccess(user, task.propertyCode)) continue;
    tasks[id] = task;
  }
  return tasks;
}

module.exports = async (req, res) => {
  try {
    const redis = await getRedis();

    const session = await requireSession(req, res);
    if (!session) return;
    // Immer frisch laden statt der im Session-Cookie gecachten role - siehe api/_permissions.js.
    const user = await getUserRawById(redis, session.userId);
    if (!user) { res.status(401).json({ error: 'Nicht angemeldet.' }); return; }

    if (req.method === 'GET') {
      res.status(200).json({ manualTasks: await allTasksForUser(redis, user) });
      return;
    }

    if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

    const { action } = req.body || {};

    if (action === 'create') {
      if (user.role !== 'admin') {
        res.status(403).json({ error: 'Nur Admin kann Aufgaben erstellen.' });
        return;
      }
      const {
        propertyCode, propertyName, unitId, unitName, date, title, description,
        assignedUserId, assignedUserName, sourceLanguage,
      } = req.body;
      if (!propertyCode || typeof propertyCode !== 'string') {
        res.status(400).json({ error: 'propertyCode ist erforderlich.' });
        return;
      }
      if (!date || !DATE_RE.test(date)) {
        res.status(400).json({ error: 'Ungültiges Datum (erwartet yyyy-mm-dd).' });
        return;
      }
      if (!title || typeof title !== 'string' || !title.trim()) {
        res.status(400).json({ error: 'Titel ist erforderlich.' });
        return;
      }
      if (!description || typeof description !== 'string' || !description.trim()) {
        res.status(400).json({ error: 'Beschreibung ist erforderlich.' });
        return;
      }
      const id = `manual_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const trimmedDescription = typeof description === 'string' ? description.trim() : '';
      // Briefing "automatische Uebersetzung frei eingegebener operativer Texte": gleiches Muster
      // wie bei api/task-notices.js#set - state.lang des Erstellers ist die Quellsprache, Fallback
      // 'de'. Es gibt aktuell keine "Aufgabe bearbeiten"-Aktion, daher entsteht die Uebersetzung
      // ausschliesslich hier bei der Erstellung.
      const lang = VALID_SOURCE_LANGUAGES.includes(sourceLanguage) ? sourceLanguage : 'de';
      const descriptionTranslation = await buildFreeTextTranslation(trimmedDescription, lang);
      const task = {
        id,
        propertyCode,
        propertyName: propertyName || propertyCode,
        unitId: unitId || null,
        unitName: unitId ? (unitName || unitId) : null,
        date,
        title: title.trim(),
        description: trimmedDescription,
        descriptionTranslation,
        assignedUserId: assignedUserId || null,
        assignedUserName: assignedUserId ? (assignedUserName || null) : null,
        status: 'open',
        createdByUserId: user.id,
        createdByUserName: user.name || user.username,
        createdAt: Date.now(),
      };
      await redis.hSet(HASH_KEY, id, JSON.stringify(task));
      res.status(200).json({ manualTasks: await allTasksForUser(redis, user) });
      return;
    }

    if (action === 'complete') {
      const { taskId } = req.body;
      if (!taskId) { res.status(400).json({ error: 'taskId ist erforderlich.' }); return; }
      const raw = await redis.hGet(HASH_KEY, taskId);
      const task = raw ? parseJSON(raw, null) : null;
      if (!task) { res.status(404).json({ error: 'Aufgabe nicht gefunden.' }); return; }
      const canComplete = isPropertyManager(user, task.propertyCode) || task.assignedUserId === user.id;
      if (!canComplete) {
        res.status(403).json({ error: 'Nur die zugewiesene Person oder Standortverantwortliche können diese Aufgabe erledigen.' });
        return;
      }
      const updated = {
        ...task,
        status: 'completed',
        completedByUserId: user.id,
        completedByUserName: user.name || user.username,
        completedAt: Date.now(),
      };
      appendHistory(updated, 'completed', user);
      await redis.hSet(HASH_KEY, taskId, JSON.stringify(updated));
      res.status(200).json({ manualTasks: await allTasksForUser(redis, user) });
      return;
    }

    if (action === 'reopen') {
      // Briefing "Wieder aktivieren": admin-only, ausschliesslich fuer eine bereits abgeschlossene
      // Aufgabe (siehe tasks.ts#canReopenTask). ManualTaskStatus kennt nur 'open'/'completed'
      // (kein eigener "assigned"-Zwischenstatus fuer manuelle Aufgaben) - eine bereits zugewiesene
      // Aufgabe bleibt beim Reaktivieren einfach zugewiesen UND 'open' (assignedUserId/-Name
      // unveraendert), analog zur bestehenden Anzeige eines offenen, aber schon zugewiesenen Tasks.
      const { taskId } = req.body;
      if (!taskId) { res.status(400).json({ error: 'taskId ist erforderlich.' }); return; }
      if (user.role !== 'admin') {
        res.status(403).json({ error: 'Nur Administratoren können eine Aufgabe wieder aktivieren.' });
        return;
      }
      const raw = await redis.hGet(HASH_KEY, taskId);
      const task = raw ? parseJSON(raw, null) : null;
      if (!task) { res.status(404).json({ error: 'Aufgabe nicht gefunden.' }); return; }
      if (task.status !== 'completed') {
        res.status(409).json({ error: 'Nur eine erledigte Aufgabe kann wieder aktiviert werden.' });
        return;
      }
      const updated = { ...task, status: 'open' };
      appendHistory(updated, 'reopened', user);
      await redis.hSet(HASH_KEY, taskId, JSON.stringify(updated));
      res.status(200).json({ manualTasks: await allTasksForUser(redis, user) });
      return;
    }

    // Briefing "BABY-Business-Logik" Punkt 3C/4/5/8/10: idempotenter Abgleich der automatisch aus
    // dem Apaleo-Service BABY abgeleiteten `Zusatzausstattung`-Aufgaben. Der Client berechnet
    // `needs` bereits rein (lib/housekeeping/tasks.ts#computeExtraEquipmentNeeds, exakt derselbe
    // Entscheidungsbaum wie bei der Vorbereitungs-Checkliste, siehe requiredPreparationItemIds) -
    // hier passiert NUR der Redis-Abgleich (anlegen/entfernen), keine zweite Ableitungslogik. Jeder
    // mit Property-Zugriff darf syncen (dieselbe Vertrauensstufe wie api/booking-changes.js#sync -
    // rein aus bereits sichtbaren Apaleo-Daten abgeleitet, kein Admin-Recht noetig).
    if (action === 'syncExtraEquipment') {
      const { needs, evaluatedReservationIds, coveredProperties } = req.body;
      if (!Array.isArray(needs) || !Array.isArray(evaluatedReservationIds) || !Array.isArray(coveredProperties)) {
        res.status(400).json({ error: 'needs[]/evaluatedReservationIds[]/coveredProperties[] sind erforderlich.' });
        return;
      }
      // Sicherheitsabgrenzung (Punkt "keine bestehenden Redis-Daten loeschen"): eine Reconciliation
      // (Loeschen nicht mehr benoetigter offener Aufgaben, siehe unten) darf NIEMALS ueber das
      // hinausgehen, was dieser Sync tatsaechlich selbst ausgewertet hat UND worauf der User Zugriff
      // hat - sonst koennte ein auf einen einzelnen Standort eingeschraenkter Sync faelschlich
      // Aufgaben ausserhalb seines eigenen Blickfelds entfernen.
      const safeCoveredProperties = coveredProperties.filter((p) => typeof p === 'string' && hasPropertyAccess(user, p));
      const validNeeds = needs.filter((n) => (
        n && typeof n.propertyCode === 'string' && hasPropertyAccess(user, n.propertyCode)
        && safeCoveredProperties.includes(n.propertyCode)
        && typeof n.reservationId === 'string' && n.reservationId
        && typeof n.unitId === 'string' && n.unitId
        && typeof n.date === 'string' && DATE_RE.test(n.date)
        && (n.dueTime === '13:00' || n.dueTime === '16:00')
      ));

      const now = Date.now();
      const all = await redis.hGetAll(HASH_KEY);
      const existing = {};
      for (const [id, raw] of Object.entries(all)) {
        const t = parseJSON(raw, null);
        if (t) existing[id] = t;
      }

      const neededIds = new Set();
      const writes = [];
      for (const need of validNeeds) {
        // ID wird IMMER serverseitig aus reservationId+serviceCode neu berechnet, niemals einer vom
        // Client mitgeschickten ID vertraut (Punkt 5 "nicht mit zufaelligen IDs arbeiten" gilt
        // ebenso fuer eine potenziell manipulierte ID).
        const id = extraEquipmentTaskId(need.reservationId);
        neededIds.add(id);
        if (existing[id]) continue; // idempotent (Punkt "H": erneuter Sync erzeugt keine Dopplung)
        const task = {
          id,
          propertyCode: need.propertyCode,
          propertyName: need.propertyName || need.propertyCode,
          unitId: need.unitId,
          unitName: need.unitName || need.unitId,
          date: need.date,
          title: 'Zusatzausstattung',
          description: 'Babybett',
          assignedUserId: null,
          assignedUserName: null,
          status: 'open',
          createdByUserId: user.id,
          createdByUserName: user.name || user.username,
          createdAt: now,
          extraEquipment: { category: 'extra_equipment', serviceCode: 'BABY', reservationId: need.reservationId, dueTime: need.dueTime },
        };
        writes.push([id, JSON.stringify(task)]);
      }

      // Punkt 8: eine offene automatische Aufgabe, deren Bedarf nicht mehr besteht (BABY wieder
      // storniert ODER die zugehoerige Turnover-Reinigung deckt sie jetzt wieder live ab), sauber
      // entfernen - eine bereits ERLEDIGTE historische Aufgabe wird NIEMALS geloescht (status-Filter
      // unten). Nur fuer Reservierungen, die dieser Sync tatsaechlich ausgewertet hat.
      const evaluatedSet = new Set(evaluatedReservationIds.filter((x) => typeof x === 'string'));
      for (const [id, task] of Object.entries(existing)) {
        if (task.status !== 'open') continue;
        const ee = task.extraEquipment;
        if (!ee || ee.category !== 'extra_equipment') continue;
        if (!safeCoveredProperties.includes(task.propertyCode)) continue;
        if (!evaluatedSet.has(ee.reservationId)) continue;
        if (neededIds.has(id)) continue;
        await redis.hDel(HASH_KEY, id);
      }

      for (const [field, value] of writes) await redis.hSet(HASH_KEY, field, value);

      res.status(200).json({ manualTasks: await allTasksForUser(redis, user) });
      return;
    }

    res.status(400).json({ error: 'Unbekannte action.' });
  } catch (err) {
    console.error('[api/manual-tasks]', err);
    res.status(500).json({ error: err.message || 'Interner Fehler' });
  }
};
