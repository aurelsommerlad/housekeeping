// Zusatzausstattungs-Status pro Zimmer ("Aufdoppeln"), unabhaengig vom Reinigungszustand.
const { getRedis, parseJSON } = require('./_redis');

const HASH_KEY = 'hk:doubleups';

async function allDoubleups(redis) {
  const all = await redis.hGetAll(HASH_KEY);
  const doubleups = {};
  for (const [k, v] of Object.entries(all)) doubleups[k] = parseJSON(v, null);
  return doubleups;
}

module.exports = async (req, res) => {
  try {
    const redis = await getRedis();

    if (req.method === 'GET') {
      res.status(200).json({ doubleups: await allDoubleups(redis) });
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const { action } = req.body || {};

    if (action === 'set') {
      const { key, types, note } = req.body;
      if (!key || !Array.isArray(types)) {
        res.status(400).json({ error: 'key und types[] sind erforderlich.' });
        return;
      }
      await redis.hSet(HASH_KEY, key, JSON.stringify({ types, note: note || '', updatedAt: Date.now() }));
    } else if (action === 'clear') {
      const { key } = req.body;
      if (!key) {
        res.status(400).json({ error: 'key ist erforderlich.' });
        return;
      }
      await redis.hDel(HASH_KEY, key);
    } else {
      res.status(400).json({ error: 'Unbekannte action.' });
      return;
    }

    res.status(200).json({ doubleups: await allDoubleups(redis) });
  } catch (err) {
    console.error('[api/doubleups]', err);
    res.status(500).json({ error: err.message || 'Interner Fehler' });
  }
};
