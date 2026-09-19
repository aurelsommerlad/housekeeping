const { createClient } = require('redis');

let clientPromise = null;

function getRedis() {
  if (!clientPromise) {
    const url = process.env.REDIS_URL;
    if (!url) throw new Error('REDIS_URL Umgebungsvariable ist nicht gesetzt.');
    const client = createClient({ url });
    client.on('error', (err) => console.error('[redis] client error', err));
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
