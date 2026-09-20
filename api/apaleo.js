// Serverseitiger Proxy zu Apaleo. Der Client Secret verlaesst diesen Prozess nie.
// Erfordert eine gueltige Session - anonyme Zugriffe auf die PMS-Daten sind nicht erlaubt.
const { requireSession } = require('./_auth');

const TOKEN_URL = 'https://identity.apaleo.com/connect/token';
const API_BASE = 'https://api.apaleo.com';

let tokenCache = { token: null, expiresAt: 0 };

async function getToken() {
  const now = Date.now();
  if (tokenCache.token && tokenCache.expiresAt - 30000 > now) {
    return tokenCache.token;
  }
  const clientId = process.env.APALEO_CLIENT_ID;
  const clientSecret = process.env.APALEO_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('APALEO_CLIENT_ID / APALEO_CLIENT_SECRET sind nicht gesetzt.');
  }
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Apaleo Token-Fehler (${res.status}): ${text}`);
  }
  const data = JSON.parse(text);
  tokenCache = {
    token: data.access_token,
    expiresAt: now + (data.expires_in ? data.expires_in * 1000 : 3600 * 1000),
  };
  return tokenCache.token;
}

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
    const token = await getToken();
    const upstreamMethod = (method || 'GET').toUpperCase();
    const upstream = await fetch(`${API_BASE}${path}`, {
      method: upstreamMethod,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: upstreamMethod !== 'GET' && body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await upstream.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text };
    }
    // Apaleo antwortet bei 0 Treffern (z. B. keine Abreisen an einem Tag/Property) mit
    // HTTP 204 No Content und OHNE Body - verifiziert live gegen den echten Account. Ein 204
    // darf laut HTTP-Spec NIE einen Body tragen; res.status(204).json({}) wuerde genau das tun
    // und kann je nach Client/Proxy-Schicht zu einer fehlerhaften Response-Framing fuehren, bei
    // der der Fetch im Browser haengen bleibt (das Promise loest sich weder auf noch lehnt es
    // ab - ein try/catch beim Aufrufer kann das nicht abfangen). Deshalb wird ein leeres
    // Apaleo-Ergebnis hier immer als valider 200er mit leerem Objekt durchgereicht.
    const status = upstream.status === 204 ? 200 : upstream.status;
    res.status(status).json(data);
  } catch (err) {
    console.error('[api/apaleo]', err);
    res.status(500).json({ error: err.message || 'Interner Fehler' });
  }
};
