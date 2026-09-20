// Gemeinsamer Apaleo-Client (Client-Credentials-Token + generischer Fetch) - extrahiert aus
// api/apaleo.js (dem bestehenden, client-seitig aufgerufenen Rohdaten-Proxy), damit neue
// serverseitige Apaleo-Aufrufe (z. B. api/reservation-search.js) dieselbe Token-/Fetch-Logik
// wiederverwenden statt sie ein zweites Mal zu implementieren. Verhalten 1:1 unveraendert
// gegenueber der vorherigen, in api/apaleo.js lokalen Fassung.
const TOKEN_URL = 'https://identity.apaleo.com/connect/token';
const API_BASE = 'https://api.apaleo.com';

let tokenCache = { token: null, expiresAt: 0 };

async function getApaleoToken() {
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

/** Generischer, authentifizierter Fetch gegen die Apaleo-API. `path` beginnt mit "/" (z. B.
 * "/booking/v1/reservations?..."). Behandelt 204 (kein Inhalt) wie api/apaleo.js es bereits tat -
 * als validen 200er mit leerem Objekt, statt eines rohen 204-Bodys. */
async function apaleoFetch(path, method, body) {
  const token = await getApaleoToken();
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
  const status = upstream.status === 204 ? 200 : upstream.status;
  return { status, data };
}

module.exports = { getApaleoToken, apaleoFetch, API_BASE };
