// Gemeinsame Redis-Helfer fuer "Wichtige Hinweise" (housekeeping:task_notices,
// housekeeping:task_notice_acks) - genutzt sowohl von api/task-notices.js (CRUD/Bestaetigung)
// als auch von api/task-assignments.js (Startsperre: Reinigung darf erst beginnen, wenn der
// ZUGEWIESENE Mitarbeiter den aktuell gueltigen Hinweis bestaetigt hat, siehe isAcknowledged()).
//
// Eindeutig unter dem housekeeping:*-Namespace, komplett getrennt von Guest-Services-Keys und
// vom (unveraenderten) Apaleo-Reservierungskommentar - siehe types.ts#TaskNotice-Kommentar.
const { parseJSON } = require('./_redis');

const NOTICES_HASH_KEY = 'housekeeping:task_notices';
const ACKS_HASH_KEY = 'housekeeping:task_notice_acks';

function ackKey(taskId, userId) {
  return `${taskId}|${userId}`;
}

async function getNotice(redis, taskId) {
  const raw = await redis.hGet(NOTICES_HASH_KEY, taskId);
  return raw ? parseJSON(raw, null) : null;
}

async function getAck(redis, taskId, userId) {
  const raw = await redis.hGet(ACKS_HASH_KEY, ackKey(taskId, userId));
  return raw ? parseJSON(raw, null) : null;
}

// Punkt 6: kein Hinweis vorhanden -> nichts zu bestaetigen (true). Sonst nur true, wenn GENAU
// die aktuelle Version durch GENAU diesen User bestaetigt wurde - eine Bestaetigung einer
// frueheren Version (vor einer inhaltlichen Aenderung) zaehlt nicht (Punkt 8).
async function isAcknowledged(redis, taskId, userId) {
  const notice = await getNotice(redis, taskId);
  if (!notice) return true;
  const ack = await getAck(redis, taskId, userId);
  return !!ack && ack.noticeVersion === notice.version;
}

async function clearAcksForTask(redis, taskId) {
  const all = await redis.hGetAll(ACKS_HASH_KEY);
  const prefix = `${taskId}|`;
  const toDelete = Object.keys(all).filter((k) => k.startsWith(prefix));
  if (toDelete.length) await redis.hDel(ACKS_HASH_KEY, toDelete);
}

module.exports = {
  NOTICES_HASH_KEY, ACKS_HASH_KEY, ackKey,
  getNotice, getAck, isAcknowledged, clearAcksForTask,
};
