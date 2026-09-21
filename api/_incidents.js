// Datenzugriff fuer Housekeeping-Vorfaelle (Redis-Hash "housekeeping:incidents", Key = Incident-
// Id) - eigener, unter dem housekeeping:*-Namespace liegender Speicherort, komplett getrennt von
// Task-Zuweisungen/Guest Services. Ein Vorfall ist bewusst NICHT an eine dauerhafte Task-
// Persistierung gekoppelt (Tasks existieren serverseitig ueberhaupt nicht - sie werden bei jedem
// Aufruf frisch aus Apaleo abgeleitet, siehe lib/housekeeping/tasks.ts) - deshalb traegt der
// Incident-Datensatz alle fuer eine spaetere Vorfallhistorie noetigen Angaben redundant selbst
// (propertyName/unitName/taskTypeLabel/reservationId/...), statt sie ueber eine taskId
// nachschlagen zu muessen, die in ein paar Tagen nicht mehr aufloesbar waere.
const crypto = require('crypto');
const { parseJSON } = require('./_redis');

const HASH_KEY = 'housekeeping:incidents';

const TASK_TYPE_LABELS = { turnover: 'Turnover', departure: 'Abreise', stayover: 'Zwischenreinigung', extra: 'Aufgabe' };

async function createIncident(redis, data) {
  const id = crypto.randomBytes(12).toString('hex');
  const record = {
    id,
    taskId: data.taskId,
    propertyId: data.propertyCode,
    unitId: data.unitId,
    reservationId: data.reservationId || null,
    reportedByUserId: data.reportedByUserId,
    reportedByUserName: data.reportedByUserName,
    housekeepingTeamId: data.housekeepingTeamId || null,
    housekeepingTeamName: data.housekeepingTeamName || null,
    description: data.description,
    photoUrls: data.photoUrls,
    createdAt: Date.now(),
    status: 'reported',
    // Reine Anzeigefelder (Punkt 7: "duerfen nicht manuell eingegeben werden") - vom Client aus
    // dem bereits geladenen ResolvedTask uebernommen, NICHT sicherheitsrelevant: propertyId/
    // unitId/reservationId oben kommen ausschliesslich aus der server-seitig geparsten taskId
    // (siehe api/incidents.js), diese Felder hier sind ausschliesslich fuer die menschenlesbare
    // Darstellung in Slack/einer spaeteren Vorfalluebersicht.
    propertyName: data.propertyName,
    unitName: data.unitName,
    taskType: data.taskType,
    taskTypeLabel: TASK_TYPE_LABELS[data.taskType] || data.taskType,
    taskDate: data.taskDate,
    // Getrennt von der Speicherung behandelt (Punkt 11) - wird erst NACH dem Slack-Versandversuch
    // per updateIncidentSlackStatus() nachgetragen; 'pending' ist der Uebergangszustand zwischen
    // "gespeichert" und "Slack-Versand versucht" (sollte im Normalfall nie sichtbar werden, da
    // beide Schritte innerhalb desselben Requests laufen).
    slackDeliveryStatus: 'pending',
    slackError: null,
  };
  await redis.hSet(HASH_KEY, id, JSON.stringify(record));
  return record;
}

async function updateIncidentSlackStatus(redis, id, slackDeliveryStatus, slackError) {
  const raw = await redis.hGet(HASH_KEY, id);
  const existing = raw ? parseJSON(raw, null) : null;
  if (!existing) return null;
  existing.slackDeliveryStatus = slackDeliveryStatus;
  existing.slackError = slackError || null;
  await redis.hSet(HASH_KEY, id, JSON.stringify(existing));
  return existing;
}

// Fuer eine spaetere Admin-Vorfalluebersicht (Punkt 13 "Vorbereitung fuer spaeter") - bereits
// heute nutzbar, aber noch von keiner Route aufgerufen.
async function getAllIncidents(redis) {
  const all = await redis.hGetAll(HASH_KEY);
  return Object.values(all).map((v) => parseJSON(v, null)).filter(Boolean).sort((a, b) => b.createdAt - a.createdAt);
}

module.exports = { HASH_KEY, createIncident, updateIncidentSlackStatus, getAllIncidents };
