// Einstellungen > Integrationen - liefert AUSSCHLIESSLICH boolesche "ist konfiguriert"-Flags,
// niemals Secrets/Tokens/Webhook-URLs selbst (die bleiben ausschliesslich serverseitig in den
// jeweiligen env vars, siehe README.md). admin-only, da es sich um eine technische Systemansicht
// handelt. "configured" bedeutet hier bewusst nur "die noetigen Umgebungsvariablen sind gesetzt" -
// eine echte Live-Verbindungspruefung (z. B. ein Test-Tokenabruf bei Apaleo) wuerde bei jedem
// Oeffnen dieser Seite unnoetigen Netzwerkverkehr erzeugen und ist fuer Punkt 5 nicht verlangt.
const { requireAdmin } = require('./_auth');

module.exports = async (req, res) => {
  try {
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }
    if (!(await requireAdmin(req, res))) return;

    res.status(200).json({
      apaleo: { configured: !!(process.env.APALEO_CLIENT_ID && process.env.APALEO_CLIENT_SECRET) },
      slack: { configured: !!process.env.SLACK_INCIDENT_WEBHOOK_URL },
    });
  } catch (err) {
    console.error('[api/integrations-status]', err);
    res.status(500).json({ error: err.message || 'Interner Fehler' });
  }
};
