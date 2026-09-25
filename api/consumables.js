// Verbrauchsmaterial (Briefing "Verbrauch melden") - Artikelverwaltung (admin-only) UND die
// eigentliche Verbrauchsmeldung (jeder angemeldete Benutzer mit Property-Zugriff) in EINER Route,
// analog zu api/housekeeping-teams.js. Rein standortbezogen: eine Meldung traegt bewusst kein
// unitId/taskId (Briefing Punkt 10/13).
const { getRedis } = require('./_redis');
const { requireSession, requireAdmin } = require('./_auth');
const { getUserRawById } = require('./_users');
const { hasPropertyAccess } = require('./_permissions');
const { getAllItems, getActiveItemsForProperty, upsertItem, reorderItems, saveReport, getAllReports } = require('./_consumables');

const MAX_ITEMS_PER_REPORT = 100;

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

    if (action === 'setItem' || action === 'reorderItems' || action === 'listReports') {
      if (!(await requireAdmin(req, res))) return;
      if (action === 'setItem') {
        const { item, sourceLanguage } = req.body;
        if (!item) { res.status(400).json({ error: 'item ist erforderlich.' }); return; }
        const saved = await upsertItem(redis, { ...item, sourceLanguage });
        res.status(200).json({ items: await getAllItems(redis), item: saved });
        return;
      }
      if (action === 'listReports') {
        // Fuer die Admin-Uebersicht "Verbrauchsmeldungen" (Einstellungen > Meldungen & Betrieb) -
        // admin-only, da standortuebergreifend alle gemeldeten Mengen sichtbar werden.
        res.status(200).json({ reports: await getAllReports(redis) });
        return;
      }
      const { orderedIds } = req.body;
      if (!Array.isArray(orderedIds)) { res.status(400).json({ error: 'orderedIds ist erforderlich.' }); return; }
      res.status(200).json({ items: await reorderItems(redis, orderedIds) });
      return;
    }

    if (action === 'report') {
      const session = await requireSession(req, res);
      if (!session) return;
      const user = await getUserRawById(redis, session.userId);
      if (!user) { res.status(401).json({ error: 'Nicht angemeldet.' }); return; }
      if (user.active === false) { res.status(403).json({ error: 'Dieses Benutzerkonto ist deaktiviert.' }); return; }

      const { propertyCode, items } = req.body;
      if (!propertyCode) { res.status(400).json({ error: 'propertyCode ist erforderlich.' }); return; }
      if (!hasPropertyAccess(user, propertyCode)) {
        res.status(403).json({ error: 'Kein Zugriff auf dieses Property.' });
        return;
      }
      if (!Array.isArray(items) || items.length === 0 || items.length > MAX_ITEMS_PER_REPORT) {
        res.status(400).json({ error: 'Mindestens eine Menge ist erforderlich.' });
        return;
      }
      // Nur tatsaechlich fuer diese Property aktive Artikel akzeptieren (Punkt 16: Server prueft
      // Berechtigungen, der Client darf keine beliebige itemId/Menge fuer ein fremdes Property
      // untermischen) - dieselbe Denkweise wie bei der taskId-Faelschungssicherheit an anderer Stelle.
      const activeItems = await getActiveItemsForProperty(redis, propertyCode);
      const activeById = new Map(activeItems.map((it) => [it.id, it]));
      const reportLines = [];
      for (const entry of items) {
        const item = activeById.get(entry.itemId);
        if (!item) continue;
        const quantity = entry.quantity;
        if (typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity <= 0) continue;
        reportLines.push({ itemId: item.id, itemName: item.name, unit: item.unit, quantity });
      }
      if (reportLines.length === 0) {
        res.status(400).json({ error: 'Bitte mindestens eine Menge größer 0 angeben.' });
        return;
      }

      const report = await saveReport(redis, {
        propertyCode, reportedByUserId: user.id, reportedByUserName: user.name || user.username,
        housekeepingTeamId: user.housekeepingTeamId || null, items: reportLines,
      });
      res.status(200).json({ report });
      return;
    }

    res.status(400).json({ error: 'Unbekannte action.' });
  } catch (err) {
    console.error('[api/consumables]', err);
    res.status(500).json({ error: err.message || 'Interner Fehler' });
  }
};
