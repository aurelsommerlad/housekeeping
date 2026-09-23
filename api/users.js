// Benutzerverwaltung (CRUD). Login und Erstregistrierung laufen ueber /api/auth - diese Route
// dient nur noch dazu, Benutzer zu lesen (jeder angemeldete Benutzer) bzw. anzulegen/aendern/
// zu loeschen (ausschliesslich Administratoren).
//
// Briefing "Deaktivieren statt loeschen" (Punkt 25): Mitarbeiter werden grundsaetzlich nicht hart
// geloescht, sondern ueber `action:'set', user:{active:false}` deaktiviert - historische
// Reinigungen/Aufgaben bleiben dadurch unveraendert mit Name/User-Id nachvollziehbar (siehe
// api/task-assignments.js, das ausschliesslich ueber die User-Id verweist, niemals den
// User-Datensatz kopiert). `action:'delete'` bleibt fuer Alt-Faelle bestehen, wird von der
// ueberarbeiteten Team-/Benutzerverwaltungs-UI aber nicht mehr angeboten. Eine Deaktivierung
// invalidiert zusaetzlich sofort alle aktiven Sessions dieses Users (siehe
// api/_auth.js#invalidateUserSessions) - vorher blockierte `active:false` nur NEUE Logins.
const { getRedis } = require('./_redis');
const { requireSession, requireAdmin, invalidateUserSessions } = require('./_auth');
const {
  getAllUsers, getUserRawById, upsertUser, deleteUserByUsername, sanitizeUser,
} = require('./_users');

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
      // "aktiv war es vorher" nur ueber den bereits gespeicherten Datensatz feststellbar (nicht
      // ueber `user` aus dem Request-Body - der koennte z. B. `active` gar nicht mitschicken).
      const existing = user.id ? await getUserRawById(redis, user.id) : null;
      const wasActive = !existing || existing.active !== false;
      const saved = await upsertUser(redis, user);
      if (wasActive && saved.active === false) await invalidateUserSessions(saved.id);
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
        res.status(400).json({ error: 'Der letzte verbleibende Administrator kann nicht gelöscht werden.' });
        return;
      }
      await deleteUserByUsername(redis, username);
      // Auch ein Hard-Delete muss bestehende Sessions sofort invalidieren - sonst bliebe ein
      // bereits ausgestelltes Session-Token fuer einen nicht mehr existierenden User bis zu 30
      // Tage gueltig (requireSession/requireAdmin pruefen nur das Session-Token selbst, nicht,
      // ob der referenzierte User-Datensatz noch existiert).
      if (target) await invalidateUserSessions(target.id);
      res.status(200).json({ users: await getAllUsers(redis) });
      return;
    }

    res.status(400).json({ error: 'Unbekannte action.' });
  } catch (err) {
    console.error('[api/users]', err);
    res.status(500).json({ error: err.message || 'Interner Fehler' });
  }
};
