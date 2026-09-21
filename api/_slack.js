// Serverseitiger Slack-Versand (Housekeeping-Vorfaelle) - es gab bisher KEINE Slack-Integration
// im Code (nur eine historische, App-externe Namenskonvention fuer Buchungsnummern im
// Kommentar von types.ts). Dies ist deshalb eine neue, ausschliesslich serverseitige Anbindung
// per Incoming Webhook: die Webhook-URL steht NUR in der Umgebungsvariable
// SLACK_INCIDENT_WEBHOOK_URL (siehe README.md), wird NIE an den Client ausgeliefert und nie in
// Redis gespeichert - api/incidents.js ist die einzige Aufrufstelle.
//
// Speicherung (api/_incidents.js) und Slack-Zustellung sind bewusst getrennte Schritte: ein
// Vorfall wird IMMER zuerst persistiert, der Slack-Versand ist ein optionaler zweiter Schritt,
// dessen Erfolg/Misserfolg separat im Incident-Datensatz vermerkt wird (slackDeliveryStatus) -
// ein voruebergehend nicht erreichbares Slack darf einen bereits gespeicherten Vorfall nie kosten.
function buildIncidentSlackMessage(incident) {
  const dateLabel = new Date(incident.createdAt).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const timeLabel = new Date(incident.createdAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  const reporterLine = incident.housekeepingTeamName
    ? `${incident.reportedByUserName} · ${incident.housekeepingTeamName}`
    : incident.reportedByUserName;

  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: 'Neuer Housekeeping-Vorfall', emoji: false } },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*${incident.unitName} · ${incident.propertyName}*\n${dateLabel} · ${timeLabel}` },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Gemeldet von:*\n${reporterLine}` },
        {
          type: 'mrkdwn',
          text: `*Reinigung:*\n${incident.taskTypeLabel}${incident.reservationId ? `\nBuchung: ${incident.reservationId}` : ''}`,
        },
      ],
    },
    { type: 'section', text: { type: 'mrkdwn', text: `*Beschreibung:*\n${incident.description}` } },
  ];

  for (const url of incident.photoUrls) {
    blocks.push({ type: 'image', image_url: url, alt_text: 'Vorfall-Foto' });
  }
  // Zusaetzlich als anklickbarer Link (Punkt 8: falls Slack ein Bild einmal nicht einbetten kann,
  // z. B. bei einem voruebergehenden Fetch-Fehler auf Slack-Seite) - kostet nichts, wenn die
  // Bilder oben bereits sichtbar sind.
  if (incident.photoUrls.length > 0) {
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: incident.photoUrls.map((url, i) => `<${url}|Foto ${i + 1}>`).join(' · ') }],
    });
  }

  return { text: `Neuer Housekeeping-Vorfall: ${incident.unitName} · ${incident.propertyName}`, blocks };
}

// Liefert { delivered: boolean, error?: string } - wirft NIE (der Aufrufer soll den Vorfall in
// jedem Fall als gespeichert behandeln koennen, unabhaengig vom Slack-Ergebnis).
async function sendIncidentToSlack(incident) {
  const webhookUrl = process.env.SLACK_INCIDENT_WEBHOOK_URL;
  if (!webhookUrl) {
    return { delivered: false, skipped: true, error: 'SLACK_INCIDENT_WEBHOOK_URL ist nicht gesetzt.' };
  }
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildIncidentSlackMessage(incident)),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { delivered: false, error: `Slack antwortete mit ${res.status}${body ? `: ${body.slice(0, 200)}` : ''}` };
    }
    return { delivered: true };
  } catch (err) {
    return { delivered: false, error: err.message || 'Unbekannter Fehler beim Slack-Versand.' };
  }
}

module.exports = { sendIncidentToSlack };
