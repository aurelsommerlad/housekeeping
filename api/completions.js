// Abgeschlossene Reinigungen / Zusatzausstattungs-Aufgaben, fuer den Statistik-Screen.
//
// Rechte (Punkt 5 der Feinschliff-Analyse, Sicherheitsluecke behoben): Statistik ist ausschliess-
// lich fuer Admin gedacht (siehe StaffNavBar.tsx/app/page.tsx) - GET lieferte hier bisher JEDEM
// eingeloggten User (auch normalen Housekeepern) alle Abschlussdaten ueber ALLE Standorte hinweg,
// unabhaengig davon, dass die Statistik-Ansicht selbst fuer sie ausgeblendet war. Ein 403 wuerde
// jedoch loadBackendState() (Promise.all ueber mehrere /api/*-Requests, siehe api.ts) fuer JEDEN
// Nicht-Admin beim Login zum Scheitern bringen - GET liefert Nicht-Admins deshalb bewusst weiterhin
// HTTP 200 mit einer leeren Liste statt eines Fehlers.
const { getRedis, parseJSON, migrateLegacyKey } = require('./_redis');
const { requireSession } = require('./_auth');
const { getUserRawById } = require('./_users');

const LIST_KEY = 'housekeeping:completions';
const LEGACY_LIST_KEY = 'hk:completions';
const MAX_ENTRIES = 10000;

async function allCompletions(redis) {
  const raw = await redis.lRange(LIST_KEY, 0, -1);
  return raw.map((v) => parseJSON(v, null)).filter(Boolean);
}

module.exports = async (req, res) => {
  try {
    const redis = await getRedis();
    await migrateLegacyKey(redis, LEGACY_LIST_KEY, LIST_KEY);

    if (req.method === 'GET') {
      const session = await requireSession(req, res);
      if (!session) return;
      // Immer frisch laden statt der im Session-Cookie gecachten role, siehe api/_permissions.js.
      const user = await getUserRawById(redis, session.userId);
      if (!user || user.role !== 'admin') { res.status(200).json({ completions: [] }); return; }
      res.status(200).json({ completions: await allCompletions(redis) });
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    if (!(await requireSession(req, res))) return;

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
