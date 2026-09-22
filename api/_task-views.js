// Gemeinsame Redis-Helfer fuer die beiden neuen, bewusst GETRENNTEN userbezogenen
// Aufmerksamkeits-Zustaende einer Reinigungskarte (Briefing "Reinigungskarten ueberarbeiten"
// Punkt 5/7/8): "gesehen" (housekeeping:task_seen) und "Buchungsaenderung zur Kenntnis genommen"
// (housekeeping:task_booking_change_acks). Analog zu api/_task-notices.js (identisches
// "<taskId>|<userId>"-Schluesselmuster), hier nur fuer zwei Hashes statt einem.
const { parseJSON } = require('./_redis');

const SEEN_HASH_KEY = 'housekeeping:task_seen';
const CHANGE_ACKS_HASH_KEY = 'housekeeping:task_booking_change_acks';

function viewKey(taskId, userId) {
  return `${taskId}|${userId}`;
}

async function getSeen(redis, taskId, userId) {
  const raw = await redis.hGet(SEEN_HASH_KEY, viewKey(taskId, userId));
  return raw ? parseJSON(raw, null) : null;
}

async function getChangeAck(redis, taskId, userId) {
  const raw = await redis.hGet(CHANGE_ACKS_HASH_KEY, viewKey(taskId, userId));
  return raw ? parseJSON(raw, null) : null;
}

module.exports = {
  SEEN_HASH_KEY, CHANGE_ACKS_HASH_KEY, viewKey, getSeen, getChangeAck,
};
