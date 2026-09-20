// Serverseitiger Proxy zu Apaleo. Der Client Secret verlaesst diesen Prozess nie.
// Erfordert eine gueltige Session - anonyme Zugriffe auf die PMS-Daten sind nicht erlaubt.
//
// Token-/Fetch-Logik liegt in api/_apaleo.js (gemeinsam mit api/reservation-search.js genutzt) -
// dieser Proxy selbst ist unveraendert: der Client liefert `path`/`method`/`body`, die Antwort
// wird 1:1 durchgereicht.
const { requireSession } = require('./_auth');
const { apaleoFetch } = require('./_apaleo');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  try {
    if (!(await requireSession(req, res))) return;

    const { path, method, body } = req.body || {};
    if (!path || typeof path !== 'string' || !path.startsWith('/')) {
      res.status(400).json({ error: 'path ist erforderlich und muss mit / beginnen.' });
      return;
    }
    const { status, data } = await apaleoFetch(path, method, body);
    // Apaleo antwortet bei 0 Treffern (z. B. keine Abreisen an einem Tag/Property) mit
    // HTTP 204 No Content und OHNE Body - verifiziert live gegen den echten Account. Ein 204
    // darf laut HTTP-Spec NIE einen Body tragen; res.status(204).json({}) wuerde genau das tun
    // und kann je nach Client/Proxy-Schicht zu einer fehlerhaften Response-Framing fuehren, bei
    // der der Fetch im Browser haengen bleibt (das Promise loest sich weder auf noch lehnt es
    // ab - ein try/catch beim Aufrufer kann das nicht abfangen). apaleoFetch() wandelt einen
    // solchen 204 deshalb bereits in einen 200er mit leerem Objekt um.
    res.status(status).json(data);
  } catch (err) {
    console.error('[api/apaleo]', err);
    res.status(500).json({ error: err.message || 'Interner Fehler' });
  }
};
