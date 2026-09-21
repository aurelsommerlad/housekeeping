// Verbrauchsmaterial (Briefing "Verbrauch melden") - eigene, von Waesche/Bettsachen (api/_linen.js)
// komplett getrennte Redis-Hashes unter housekeeping:*:
//
// - housekeeping:consumable_items    Hash, Key = Item-Id -> ConsumableItem
// - housekeeping:consumable_reports  Hash, Key = Report-Id -> ConsumableReport
//
// Standortbezogen, NIE apartment-/reinigungsbezogen (kein unitId/taskId, siehe saveReport unten).
// Kein Hard-Delete - nur `active` toggeln (siehe upsertItem).
const crypto = require('crypto');
const { parseJSON } = require('./_redis');

const ITEMS_HASH_KEY = 'housekeeping:consumable_items';
const REPORTS_HASH_KEY = 'housekeeping:consumable_reports';

async function getAllItems(redis) {
  const all = await redis.hGetAll(ITEMS_HASH_KEY);
  return Object.values(all).map((v) => parseJSON(v, null)).filter(Boolean).sort((a, b) => a.sortOrder - b.sortOrder);
}

async function getActiveItemsForProperty(redis, propertyCode) {
  const all = await getAllItems(redis);
  return all.filter((item) => item.active && Array.isArray(item.propertyIds) && item.propertyIds.includes(propertyCode));
}

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
  };
  await redis.hSet(ITEMS_HASH_KEY, id, JSON.stringify(record));
  return record;
}

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

async function saveReport(redis, data) {
  const id = crypto.randomBytes(12).toString('hex');
  const record = {
    id,
    propertyId: data.propertyCode,
    reportedByUserId: data.reportedByUserId,
    reportedByUserName: data.reportedByUserName,
    housekeepingTeamId: data.housekeepingTeamId || null,
    createdAt: Date.now(),
    items: data.items,
  };
  await redis.hSet(REPORTS_HASH_KEY, id, JSON.stringify(record));
  return record;
}

module.exports = { ITEMS_HASH_KEY, REPORTS_HASH_KEY, getAllItems, getActiveItemsForProperty, upsertItem, reorderItems, saveReport };
