// Housekeeping-Vorfaelle melden (Briefing "Vorfall melden") - EIN Endpunkt fuer Punkt 9
// (Speicherung) + Punkt 8 (Slack), bewusst als zwei getrennte Schritte (Punkt 11: ein
// voruebergehend nicht erreichbares Slack darf einen bereits gemeldeten Vorfall nie kosten).
//
// Berechtigung (Punkt 12): ausschliesslich serverseitig geprueft. propertyCode/unitId/taskType/
// reservationId werden NIE vom Client uebernommen, sondern faelschungssicher aus der taskId selbst
// geparst (siehe api/_permissions.js, exakt dasselbe Prinzip wie api/task-assignments.js) - ein
// manipuliertes taskId-Property-Praefix fuehrt einfach zu einer anderen (echten) Property, fuer
// die dieselbe hasPropertyAccess-Pruefung gilt; ein frei erfundenes Praefix hat schlicht keinen
// Property-Zugriff und wird abgelehnt. Ein deaktivierter Benutzer wird ebenso abgelehnt wie bei
// api/task-assignments.js.
const { getRedis } = require('./_redis');
const { requireSession } = require('./_auth');
const { getUserRawById } = require('./_users');
const { hasPropertyAccess, propertyCodeFromTaskId, dateFromTaskId, unitIdFromTaskId, taskTypeFromTaskId, reservationIdFromTaskId } = require('./_permissions');
const { getTeamById } = require('./_teams');
const { createIncident, updateIncidentSlackStatus } = require('./_incidents');
const { sendIncidentToSlack } = require('./_slack');

const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_PHOTOS = 5;

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const redis = await getRedis();
    const session = await requireSession(req, res);
    if (!session) return;
    const user = await getUserRawById(redis, session.userId);
    if (!user) { res.status(401).json({ error: 'Nicht angemeldet.' }); return; }
    if (user.active === false) { res.status(403).json({ error: 'Dieses Benutzerkonto ist deaktiviert.' }); return; }

    const { taskId, description, photoUrls, propertyName, unitName } = req.body || {};
    if (!taskId) { res.status(400).json({ error: 'Es muss eine Reinigung ausgewaehlt werden.' }); return; }
    const trimmedDescription = String(description || '').trim();
    if (!trimmedDescription) { res.status(400).json({ error: 'Bitte eine Beschreibung angeben.' }); return; }
    if (trimmedDescription.length > MAX_DESCRIPTION_LENGTH) {
      res.status(400).json({ error: 'Beschreibung ist zu lang.' });
      return;
    }
    if (!Array.isArray(photoUrls) || photoUrls.length === 0) {
      res.status(400).json({ error: 'Mindestens ein Foto ist erforderlich.' });
      return;
    }
    if (photoUrls.length > MAX_PHOTOS || photoUrls.some((u) => typeof u !== 'string' || !u)) {
      res.status(400).json({ error: 'Ungueltige Fotoliste.' });
      return;
    }
    // Nur zuvor ueber api/incident-photos.js auf Vercel Blob hochgeladene URLs akzeptieren
    // (Punkt 12: kein beliebiger externer Bild-Link, der z. B. in der Slack-Nachricht als Koeder
    // fuer einen Klick dienen koennte) - siehe @vercel/blob-Dokumentation fuer dieses feste
    // URL-Schema ("https://$storeId.public.blob.vercel-storage.com/$pathname").
    if (photoUrls.some((u) => {
      try { return !new URL(u).hostname.endsWith('.public.blob.vercel-storage.com'); } catch { return true; }
    })) {
      res.status(400).json({ error: 'Ungueltige Fotoliste.' });
      return;
    }

    const propertyCode = propertyCodeFromTaskId(taskId);
    if (!hasPropertyAccess(user, propertyCode)) {
      res.status(403).json({ error: 'Kein Zugriff auf dieses Property.' });
      return;
    }

    let team = null;
    if (user.housekeepingTeamId) team = await getTeamById(redis, user.housekeepingTeamId);

    const incident = await createIncident(redis, {
      taskId,
      propertyCode,
      unitId: unitIdFromTaskId(taskId),
      reservationId: reservationIdFromTaskId(taskId),
      reportedByUserId: user.id,
      reportedByUserName: user.name || user.username,
      housekeepingTeamId: user.housekeepingTeamId || null,
      housekeepingTeamName: team ? team.name : null,
      description: trimmedDescription,
      photoUrls,
      propertyName: String(propertyName || propertyCode),
      unitName: String(unitName || unitIdFromTaskId(taskId)),
      taskType: taskTypeFromTaskId(taskId),
      taskDate: dateFromTaskId(taskId),
    });

    const slackResult = await sendIncidentToSlack(incident);
    const finalStatus = slackResult.delivered ? 'sent' : (slackResult.skipped ? 'skipped' : 'failed');
    const updated = await updateIncidentSlackStatus(redis, incident.id, finalStatus, slackResult.error);

    res.status(200).json({ incident: updated || incident, slackDelivered: !!slackResult.delivered });
  } catch (err) {
    console.error('[api/incidents]', err);
    res.status(500).json({ error: err.message || 'Interner Fehler' });
  }
};
