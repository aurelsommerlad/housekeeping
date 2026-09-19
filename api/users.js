// Benutzerverwaltung (CRUD). Login und Erstregistrierung laufen ueber /api/auth - diese Route
// dient nur noch dazu, Benutzer zu lesen (jeder angemeldete Benutzer) bzw. anzulegen/aendern/
// zu loeschen (ausschliesslich Administratoren).
const { getRedis } = require('./_redis');
const { requireSession, requireAdmin } = require('./_auth');
const { getAllUsers, upsertUser, deleteUserByUsername, sanitizeUser } = require('./_users');

module.exports = async (req, res) => {
  try {
    const redis = await getRedis();

    if (req.method === 'GET') {
      if (!(await requireSession(req, res))) return;
      res.status(200).json({ users: await getAllUsers(redis) });
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    if (!(await requireAdmin(req, res))) return;

    const { action } = req.body || {};

    if (action === 'set') {
      const { user } = req.body;
      if (!user || (!user.username && !user.email)) {
        res.status(400).json({ error: 'username oder email ist erforderlich.' });
        return;
      }
      const saved = await upsertUser(redis, user);
      res.status(200).json({ users: await getAllUsers(redis), user: sanitizeUser(saved) });
      return;
    }

    if (action === 'delete') {
      const { username } = req.body;
      if (!username) {
        res.status(400).json({ error: 'username ist erforderlich.' });
        return;
      }
      const all = await getAllUsers(redis);
      const target = all.find((u) => u.username === String(username).trim().toLowerCase());
      const adminCount = all.filter((u) => u.role === 'admin').length;
      if (target && target.role === 'admin' && adminCount <= 1) {
        res.status(400).json({ error: 'Der letzte verbleibende Administrator kann nicht geloescht werden.' });
        return;
      }
      await deleteUserByUsername(redis, username);
      res.status(200).json({ users: await getAllUsers(redis) });
      return;
    }

    res.status(400).json({ error: 'Unbekannte action.' });
  } catch (err) {
    console.error('[api/users]', err);
    res.status(500).json({ error: err.message || 'Interner Fehler' });
  }
};
