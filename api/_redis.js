const { createClient } = require('redis');

let clientPromise = null;

function getRedis() {
  if (!clientPromise) {
    const url = process.env.REDIS_URL;
    if (!url) throw new Error('REDIS_URL Umgebungsvariable ist nicht gesetzt.');
    const client = createClient({
      url,
      // Bei einer Redis-Stoerung soll ein Request zuegig mit einem klaren Fehler fehlschlagen,
      // statt endlos zu haengen: disableOfflineQueue laesst Befehle sofort fehlschlagen statt
      // sie auf eine (moeglicherweise nie wiederkehrende) Verbindung warten zu lassen, und
      // reconnectStrategy:false verhindert einen unbegrenzten automatischen Reconnect-Loop.
      disableOfflineQueue: true,
      socket: {
        connectTimeout: 5000,
        reconnectStrategy: false,
      },
    });
    client.on('error', (err) => {
      console.error('[redis] client error', err);
      // Verbindung gilt als kaputt - der naechste getRedis()-Aufruf baut einen frischen
      // Client auf, statt dauerhaft an einer toten Verbindung haengen zu bleiben.
      clientPromise = null;
    });
    clientPromise = client.connect().then(() => client).catch((err) => {
      clientPromise = null;
      throw err;
    });
  }
  return clientPromise;
}

function parseJSON(value, fallback) {
  if (value === null || value === undefined) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

module.exports = { getRedis, parseJSON };
