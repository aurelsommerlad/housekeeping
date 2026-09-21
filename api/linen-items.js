// Waesche & Bettsachen - Artikelverwaltung (Briefing Punkt 6). Lesen darf jede angemeldete Person
// (das Abschlussformular muss die je Property aktiven Artikel kennen) - Schreiben ist
// ausschliesslich Administratoren vorbehalten, siehe api/housekeeping-teams.js fuer dasselbe Muster.
const { getRedis } = require('./_redis');
const { requireSession, requireAdmin } = require('./_auth');
const { getAllItems, upsertItem, reorderItems } = require('./_linen');

module.exports = async (req, res) => {
  try {
    const redis = await getRedis();

    if (req.method === 'GET') {
      if (!(await requireSession(req, res))) return;
      res.status(200).json({ items: await getAllItems(redis) });
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    if (!(await requireAdmin(req, res))) return;

    const { action } = req.body || {};

    if (action === 'setItem') {
      const { item } = req.body;
      if (!item) { res.status(400).json({ error: 'item ist erforderlich.' }); return; }
      const saved = await upsertItem(redis, item);
      res.status(200).json({ items: await getAllItems(redis), item: saved });
      return;
    }

    if (action === 'reorderItems') {
      const { orderedIds } = req.body;
      if (!Array.isArray(orderedIds)) { res.status(400).json({ error: 'orderedIds ist erforderlich.' }); return; }
      res.status(200).json({ items: await reorderItems(redis, orderedIds) });
      return;
    }

    res.status(400).json({ error: 'Unbekannte action.' });
  } catch (err) {
    console.error('[api/linen-items]', err);
    res.status(500).json({ error: err.message || 'Interner Fehler' });
  }
};
