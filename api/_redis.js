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

// Housekeeping-Daten liefen anfangs unter dem generischen Praefix "hk:*", das dieselbe
// Redis-Instanz wie Guest Services benutzt. Um Namenskollisionen dauerhaft auszuschliessen,
// ziehen alle Housekeeping-Keys auf den eindeutigen Namespace "housekeeping:*" um.
//
// RENAMENX verschiebt einen bestehenden Key verlustfrei auf den neuen Namen (kein Loeschen,
// kein Datenverlust) und tut nichts, wenn der neue Key schon existiert oder der alte Key nicht
// (mehr) existiert - beides ist ein Erfolgsfall (nichts zu tun) und wird hier bewusst
// verschluckt, damit ein fehlender Alt-Key niemals einen Request zum Scheitern bringt.
// Guest-Services-Keys sind von alledem nicht betroffen, da nur die hier explizit uebergebenen
// alten Housekeeping-Key-Namen angefasst werden.
const migratedKeys = new Set();
async function migrateLegacyKey(client, oldKey, newKey) {
  if (migratedKeys.has(newKey)) return;
  migratedKeys.add(newKey);
  try {
    await client.renameNX(oldKey, newKey);
  } catch (err) {
    if (!/no such key/i.test(err && err.message || '')) {
      console.error('[redis] Migration fehlgeschlagen', oldKey, '->', newKey, err);
    }
  }
}

module.exports = { getRedis, parseJSON, migrateLegacyKey };
