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

const HASH_KEY = 'housekeeping:manual_tasks';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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
        assignedUserId, assignedUserName,
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
      const task = {
        id,
        propertyCode,
        propertyName: propertyName || propertyCode,
        unitId: unitId || null,
        unitName: unitId ? (unitName || unitId) : null,
        date,
        title: title.trim(),
        description: typeof description === 'string' ? description.trim() : '',
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
      await redis.hSet(HASH_KEY, taskId, JSON.stringify(updated));
      res.status(200).json({ manualTasks: await allTasksForUser(redis, user) });
      return;
    }

    res.status(400).json({ error: 'Unbekannte action.' });
  } catch (err) {
    console.error('[api/manual-tasks]', err);
    res.status(500).json({ error: err.message || 'Interner Fehler' });
  }
};
