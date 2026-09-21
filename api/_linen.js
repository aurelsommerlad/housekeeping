// Waesche & Bettsachen (Briefing "Waescheverbrauch erfassen") - zwei eigene Redis-Hashes unter
// dem housekeeping:*-Namespace, komplett getrennt von Verbrauchsmaterial (api/_consumables.js)
// und von Task-Zuweisungen:
//
// - housekeeping:linen_items               Hash, Key = Item-Id -> LinenItem
// - housekeeping:cleaning_completion_reports Hash, Key = Report-Id -> CleaningCompletionReport
//
// "Historisch verwendete Artikel nicht hart loeschen" (Briefing Punkt 6): es gibt bewusst KEINE
// delete-Funktion hier - nur `active` toggeln (siehe upsertItem).
const crypto = require('crypto');
const { parseJSON } = require('./_redis');

const ITEMS_HASH_KEY = 'housekeeping:linen_items';
const REPORTS_HASH_KEY = 'housekeeping:cleaning_completion_reports';

async function getAllItems(redis) {
  const all = await redis.hGetAll(ITEMS_HASH_KEY);
  return Object.values(all).map((v) => parseJSON(v, null)).filter(Boolean).sort((a, b) => a.sortOrder - b.sortOrder);
}

async function getActiveItemsForProperty(redis, propertyCode) {
  const all = await getAllItems(redis);
  return all.filter((item) => item.active && Array.isArray(item.propertyIds) && item.propertyIds.includes(propertyCode));
}

// Legt einen neuen Artikel an (kein `id`) oder aktualisiert einen bestehenden.
async function upsertItem(redis, input) {
  const id = input.id || crypto.randomBytes(6).toString('hex');
  const existingRaw = await redis.hGet(ITEMS_HASH_KEY, id);
  const existing = existingRaw ? parseJSON(existingRaw, {}) : {};
  const name = String(input.name || existing.name || '').trim();
  const unit = String(input.unit || existing.unit || '').trim();
  if (!name) throw new Error('Name ist erforderlich.');
  if (!unit) throw new Error('Einheit ist erforderlich.');
  const record = {
    id,
    name,
    unit,
    active: input.active !== undefined ? !!input.active : (existing.active !== false),
    sortOrder: Number.isFinite(input.sortOrder) ? input.sortOrder : (Number.isFinite(existing.sortOrder) ? existing.sortOrder : 0),
    propertyIds: Array.isArray(input.propertyIds) ? input.propertyIds : (existing.propertyIds || []),
    estimationRule: input.estimationRule !== undefined ? input.estimationRule : (existing.estimationRule || { type: 'none' }),
  };
  await redis.hSet(ITEMS_HASH_KEY, id, JSON.stringify(record));
  return record;
}

// Setzt sortOrder = Index in `orderedIds` neu - einfache Alternative zu Drag&Drop (Admin nutzt
// Rauf/Runter-Pfeile, siehe ItemCatalogSettingsScreen.tsx).
async function reorderItems(redis, orderedIds) {
  const all = await getAllItems(redis);
  const byId = new Map(all.map((item) => [item.id, item]));
  const multi = redis.multi();
  orderedIds.forEach((id, index) => {
    const item = byId.get(id);
    if (!item) return;
    item.sortOrder = index;
    multi.hSet(ITEMS_HASH_KEY, id, JSON.stringify(item));
  });
  await multi.exec();
  return getAllItems(redis);
}

async function saveCompletionReport(redis, data) {
  const id = crypto.randomBytes(12).toString('hex');
  const record = {
    id,
    taskId: data.taskId,
    propertyId: data.propertyCode,
    unitId: data.unitId,
    reservationId: data.reservationId || null,
    completedByUserId: data.completedByUserId,
    completedByUserName: data.completedByUserName,
    housekeepingTeamId: data.housekeepingTeamId || null,
    completedAt: Date.now(),
    linenItems: data.linenItems,
  };
  await redis.hSet(REPORTS_HASH_KEY, id, JSON.stringify(record));
  return record;
}

module.exports = {
  ITEMS_HASH_KEY, REPORTS_HASH_KEY, getAllItems, getActiveItemsForProperty, upsertItem, reorderItems, saveCompletionReport,
};
