// Authentifizierung: Ersteinrichtung (einmalige Admin-Registrierung), Login, Logout, Session-Status.
// GET  -> aktueller Session-Status ({authenticated, user, setupRequired}).
// POST -> { action: 'register-admin' | 'login' | 'logout', ... }.
const { getRedis } = require('./_redis');
const { createSession, destroySession, getSession } = require('./_auth');
const { hasAnyAdmin, getUserRawById, sanitizeUser, createUser, verifyLogin } = require('./_users');

// Atomarer Schutz gegen mehrfache Erst-Registrierung, auch bei parallelen Requests
// (SET...NX ist in Redis eine einzelne atomare Operation).
const SETUP_LOCK_KEY = 'hk:setup_lock';

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

module.exports = async (req, res) => {
  try {
    const redis = await getRedis();

    if (req.method === 'GET') {
      const session = await getSession(req);
      const setupRequired = !(await hasAnyAdmin(redis));
      if (!session) {
        res.status(200).json({ authenticated: false, user: null, setupRequired });
        return;
      }
      const user = await getUserRawById(redis, session.userId);
      if (!user) {
        res.status(200).json({ authenticated: false, user: null, setupRequired });
        return;
      }
      res.status(200).json({ authenticated: true, user: sanitizeUser(user), setupRequired: false });
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const { action } = req.body || {};

    if (action === 'register-admin') {
      const { firstName, lastName, email, password, passwordConfirm } = req.body;
      if (!firstName || !lastName || !email || !password) {
        res.status(400).json({ error: 'Bitte alle Felder ausfuellen.' });
        return;
      }
      if (!isValidEmail(email)) {
        res.status(400).json({ error: 'Ungueltige E-Mail-Adresse.' });
        return;
      }
      if (String(password).length < 8) {
        res.status(400).json({ error: 'Das Passwort muss mindestens 8 Zeichen lang sein.' });
        return;
      }
      if (password !== passwordConfirm) {
        res.status(400).json({ error: 'Die Passwoerter stimmen nicht ueberein.' });
        return;
      }

      // Serverseitige Kernregel: es kann nur EIN einziges Mal ein erster Admin registriert werden.
      const acquired = await redis.set(SETUP_LOCK_KEY, String(Date.now()), { NX: true });
      if (!acquired) {
        res.status(403).json({ error: 'Es wurde bereits ein Administrator eingerichtet.' });
        return;
      }
      if (await hasAnyAdmin(redis)) {
        // Sollte durch den Lock oben nicht mehr vorkommen, ist aber eine zusaetzliche Absicherung.
        res.status(403).json({ error: 'Es wurde bereits ein Administrator eingerichtet.' });
        return;
      }

      try {
        const user = await createUser(redis, { firstName, lastName, email, password, role: 'admin', properties: 'alle' });
        await createSession(req, res, user);
        res.status(200).json({ user: sanitizeUser(user) });
      } catch (err) {
        // Lock wieder freigeben, damit ein Eingabefehler (z.B. doppelte E-Mail) nicht die
        // Ersteinrichtung dauerhaft blockiert.
        await redis.del(SETUP_LOCK_KEY);
        throw err;
      }
      return;
    }

    if (action === 'login') {
      const { identifier, password, scope } = req.body;
      if (!identifier || !password) {
        res.status(400).json({ error: 'Bitte Zugangsdaten eingeben.' });
        return;
      }
      const user = await verifyLogin(redis, identifier, password);
      if (!user) {
        res.status(401).json({ error: 'E-Mail/Benutzername oder Passwort falsch.' });
        return;
      }
      if (scope === 'admin' && user.role !== 'admin') {
        // Serverseitig durchgesetzt: ein Housekeeping-Konto bekommt hier niemals eine Session,
        // egal was das Frontend anzeigt oder welcher Endpunkt direkt aufgerufen wird.
        res.status(403).json({ error: 'Kein Zugriff auf den Adminbereich.' });
        return;
      }
      await createSession(req, res, user);
      res.status(200).json({ user: sanitizeUser(user) });
      return;
    }

    if (action === 'logout') {
      await destroySession(req, res);
      res.status(200).json({ ok: true });
      return;
    }

    res.status(400).json({ error: 'Unbekannte action.' });
  } catch (err) {
    console.error('[api/auth]', err);
    res.status(500).json({ error: err.message || 'Interner Fehler' });
  }
};
