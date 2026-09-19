// Benutzerverwaltung (CRUD) + Login. Passwoerter verlassen den Server nie im Klartext an andere Endpunkte,
// werden aber (bewusst einfach, da rein internes Tool) unverschluesselt in Redis gehalten.
const { getRedis, parseJSON } = require('./_redis');

const HASH_KEY = 'hk:users';

// Einmalige Seed-Befuellung beim allerersten Start. Danach Verwaltung ausschliesslich ueber die App.
const SEED_USERS = [
  { username: 'admin', password: 'admin123', name: 'Admin', role: 'admin', properties: 'alle' },
  { username: 'hk1', password: 'hk1123', name: 'Housekeeper 1', role: 'housekeeper', properties: 'alle' },
];

function sanitize(u) {
  if (!u) return u;
  const { password, ...rest } = u;
  return rest;
}

async function ensureSeed(redis) {
  const exists = await redis.exists(HASH_KEY);
  if (exists) return;
  const multi = redis.multi();
  for (const u of SEED_USERS) {
    const record = { ...u, id: u.username };
    multi.hSet(HASH_KEY, u.username, JSON.stringify(record));
  }
  await multi.exec();
}

async function allUsers(redis) {
  const all = await redis.hGetAll(HASH_KEY);
  return Object.values(all).map((v) => sanitize(parseJSON(v, null))).filter(Boolean);
}

module.exports = async (req, res) => {
  try {
    const redis = await getRedis();
    await ensureSeed(redis);

    if (req.method === 'GET') {
      res.status(200).json({ users: await allUsers(redis) });
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const { action } = req.body || {};

    if (action === 'login') {
      const { username, password } = req.body;
      const key = String(username || '').trim().toLowerCase();
      const raw = await redis.hGet(HASH_KEY, key);
      const user = raw ? parseJSON(raw, null) : null;
      if (!user || user.password !== password) {
        res.status(401).json({ error: 'Benutzername oder Passwort falsch.' });
        return;
      }
      res.status(200).json({ user: sanitize(user) });
      return;
    }

    if (action === 'set') {
      const { user } = req.body;
      if (!user || !user.username) {
        res.status(400).json({ error: 'user.username ist erforderlich.' });
        return;
      }
      const key = String(user.username).trim().toLowerCase();
      const existingRaw = await redis.hGet(HASH_KEY, key);
      const existing = existingRaw ? parseJSON(existingRaw, {}) : {};
      const merged = {
        ...existing,
        ...user,
        username: key,
        id: existing.id || key,
      };
      if (!merged.password) merged.password = existing.password || '';
      await redis.hSet(HASH_KEY, key, JSON.stringify(merged));
      res.status(200).json({ users: await allUsers(redis) });
      return;
    }

    if (action === 'delete') {
      const { username } = req.body;
      if (!username) {
        res.status(400).json({ error: 'username ist erforderlich.' });
        return;
      }
      await redis.hDel(HASH_KEY, String(username).trim().toLowerCase());
      res.status(200).json({ users: await allUsers(redis) });
      return;
    }

    res.status(400).json({ error: 'Unbekannte action.' });
  } catch (err) {
    console.error('[api/users]', err);
    res.status(500).json({ error: err.message || 'Interner Fehler' });
  }
};
