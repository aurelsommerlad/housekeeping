// Abgeschlossene Reinigungen / Zusatzausstattungs-Aufgaben, fuer den Statistik-Screen.
const { getRedis, parseJSON } = require('./_redis');

const LIST_KEY = 'hk:completions';
const MAX_ENTRIES = 10000;

async function allCompletions(redis) {
  const raw = await redis.lRange(LIST_KEY, 0, -1);
  return raw.map((v) => parseJSON(v, null)).filter(Boolean);
}

module.exports = async (req, res) => {
  try {
    const redis = await getRedis();

    if (req.method === 'GET') {
      res.status(200).json({ completions: await allCompletions(redis) });
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const { action, entry } = req.body || {};
    if (action !== 'add' || !entry) {
      res.status(400).json({ error: 'action "add" mit entry ist erforderlich.' });
      return;
    }

    const record = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      property: entry.property || '',
      room: entry.room || '',
      housekeeperId: entry.housekeeperId || '',
      housekeeperName: entry.housekeeperName || '',
      type: entry.type || 'clean',
      startedAt: entry.startedAt || null,
      finishedAt: entry.finishedAt || Date.now(),
      durationSeconds: entry.durationSeconds || 0,
      createdAt: Date.now(),
    };
    await redis.rPush(LIST_KEY, JSON.stringify(record));
    await redis.lTrim(LIST_KEY, -MAX_ENTRIES, -1);

    res.status(200).json({ completions: await allCompletions(redis) });
  } catch (err) {
    console.error('[api/completions]', err);
    res.status(500).json({ error: err.message || 'Interner Fehler' });
  }
};
