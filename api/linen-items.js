// Waesche & Bettsachen - Artikelverwaltung (Briefing Punkt 6). Lesen darf jede angemeldete Person
// (das Abschlussformular muss die je Property aktiven Artikel kennen) - Schreiben ist
// ausschliesslich Administratoren vorbehalten, siehe api/housekeeping-teams.js fuer dasselbe Muster.
const { getRedis } = require('./_redis');
const { requireSession, requireAdmin } = require('./_auth');
const { getUserRawById } = require('./_users');
const { isAdmin, isLocationManager } = require('./_permissions');
const { getAllItems, upsertItem, reorderItems, getAllReports } = require('./_linen');

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

    const { action } = req.body || {};

    // Admin-Analyse "Wäsche" (Briefing "Wäschereklamation erfassen"): Admin sieht alle Berichte
    // standortuebergreifend, ein Standortverantwortlicher ausschliesslich Berichte seiner eigenen
    // zugeordneten Standorte (analog zum bestehenden Scoping-Muster in
    // HousekeepingTeamsScreen.tsx/managedPropertyCodes) - jeder andere Nutzer bekommt 403. Nutzt
    // bewusst den frisch geladenen User-Datensatz (nie die Session-Cookie-Rolle), siehe
    // api/_permissions.js-Kommentar.
    if (action === 'listReports') {
      const session = await requireSession(req, res);
      if (!session) return;
      const user = await getUserRawById(redis, session.userId);
      if (!user || user.active === false) { res.status(403).json({ error: 'Kein Zugriff.' }); return; }
      const allReports = await getAllReports(redis);
      if (isAdmin(user)) {
        res.status(200).json({ reports: allReports });
        return;
      }
      if (isLocationManager(user)) {
        const managed = new Set(user.managedProperties || []);
        res.status(200).json({ reports: allReports.filter((r) => managed.has(r.propertyId)) });
        return;
      }
      res.status(403).json({ error: 'Kein Zugriff.' });
      return;
    }

    if (!(await requireAdmin(req, res))) return;

    if (action === 'setItem') {
      const { item, sourceLanguage } = req.body;
      if (!item) { res.status(400).json({ error: 'item ist erforderlich.' }); return; }
      const saved = await upsertItem(redis, { ...item, sourceLanguage });
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
