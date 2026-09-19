// Pausen-Log der Housekeeper, fuer Pausen-Tracking und Statistik.
const { getRedis, parseJSON, migrateLegacyKey } = require('./_redis');
const { requireSession } = require('./_auth');

const LIST_KEY = 'housekeeping:breaks';
const LEGACY_LIST_KEY = 'hk:breaks';
const MAX_ENTRIES = 5000;

async function allBreaks(redis) {
  const raw = await redis.lRange(LIST_KEY, 0, -1);
  return raw.map((v) => parseJSON(v, null)).filter(Boolean);
}

module.exports = async (req, res) => {
  try {
    const redis = await getRedis();
    await migrateLegacyKey(redis, LEGACY_LIST_KEY, LIST_KEY);

    if (req.method === 'GET') {
      if (!(await requireSession(req, res))) return;
      res.status(200).json({ breaks: await allBreaks(redis) });
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    if (!(await requireSession(req, res))) return;

    const { action } = req.body || {};

    if (action === 'start') {
      const { housekeeperId, housekeeperName } = req.body;
      if (!housekeeperId) {
        res.status(400).json({ error: 'housekeeperId ist erforderlich.' });
        return;
      }
      await redis.rPush(
        LIST_KEY,
        JSON.stringify({ housekeeperId, housekeeperName: housekeeperName || '', start: Date.now(), end: null, durationSeconds: 0 })
      );
      await redis.lTrim(LIST_KEY, -MAX_ENTRIES, -1);
    } else if (action === 'end') {
      const { housekeeperId } = req.body;
      if (!housekeeperId) {
        res.status(400).json({ error: 'housekeeperId ist erforderlich.' });
        return;
      }
      const raw = await redis.lRange(LIST_KEY, 0, -1);
      for (let i = raw.length - 1; i >= 0; i--) {
        const entry = parseJSON(raw[i], null);
        if (entry && entry.housekeeperId === housekeeperId && entry.end === null) {
          entry.end = Date.now();
          entry.durationSeconds = Math.round((entry.end - entry.start) / 1000);
          await redis.lSet(LIST_KEY, i, JSON.stringify(entry));
          break;
        }
      }
    } else {
      res.status(400).json({ error: 'Unbekannte action.' });
      return;
    }

    res.status(200).json({ breaks: await allBreaks(redis) });
  } catch (err) {
    console.error('[api/breaks]', err);
    res.status(500).json({ error: err.message || 'Interner Fehler' });
  }
};
