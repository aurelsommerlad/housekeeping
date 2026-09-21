// Housekeeping Teams (Reinigungsfirmen) - CRUD fuer Team-Stammdaten, Property-Standardzuordnung
// und Task-Overrides (siehe api/_teams.js fuer die Redis-Schicht). Lesen darf jede angemeldete
// Person (die Task Cards/Details aller Nutzer muessen Team-Namen anzeigen koennen) - Schreiben
// ist ausschliesslich Administratoren vorbehalten: die Zuordnung "welches Team gehoert zu
// welcher Property" bzw. "welches Team gehoert zu diesem einen Task" ist laut Briefing eine
// UNIQUE-PLACES-Admin-Entscheidung, keine Team-Lead-Aufgabe (der Lead disponiert nur INNERHALB
// des eigenen, bereits zugewiesenen Teams - siehe api/task-assignments.js).
const { getRedis } = require('./_redis');
const { requireSession, requireAdmin } = require('./_auth');
const {
  getAllTeams, upsertTeam, getPropertyDefaults, setPropertyDefault, getAllTaskTeamOverrides, setTaskTeamOverride, getTeamById,
} = require('./_teams');

module.exports = async (req, res) => {
  try {
    const redis = await getRedis();

    if (req.method === 'GET') {
      if (!(await requireSession(req, res))) return;
      const [teams, propertyDefaults, taskTeamOverrides] = await Promise.all([
        getAllTeams(redis), getPropertyDefaults(redis), getAllTaskTeamOverrides(redis),
      ]);
      res.status(200).json({ teams, propertyDefaults, taskTeamOverrides });
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const session = await requireAdmin(req, res);
    if (!session) return;

    const { action } = req.body || {};

    if (action === 'setTeam') {
      const { team } = req.body;
      if (!team || !team.name) { res.status(400).json({ error: 'Name ist erforderlich.' }); return; }
      const saved = await upsertTeam(redis, team);
      res.status(200).json({ teams: await getAllTeams(redis), team: saved });
      return;
    }

    if (action === 'setPropertyDefault') {
      const { propertyCode, teamId } = req.body;
      if (!propertyCode) { res.status(400).json({ error: 'propertyCode ist erforderlich.' }); return; }
      if (teamId && !(await getTeamById(redis, teamId))) { res.status(400).json({ error: 'Unbekanntes Team.' }); return; }
      await setPropertyDefault(redis, propertyCode, teamId || null);
      res.status(200).json({ propertyDefaults: await getPropertyDefaults(redis) });
      return;
    }

    if (action === 'setTaskTeam') {
      const { taskId, teamId } = req.body;
      if (!taskId) { res.status(400).json({ error: 'taskId ist erforderlich.' }); return; }
      let teamName = '';
      if (teamId) {
        const team = await getTeamById(redis, teamId);
        if (!team) { res.status(400).json({ error: 'Unbekanntes Team.' }); return; }
        teamName = team.name;
      }
      const { getUserRawById } = require('./_users');
      const user = await getUserRawById(redis, session.userId);
      await setTaskTeamOverride(redis, taskId, teamId || null, teamName, user || { id: session.userId, name: session.userId });
      res.status(200).json({ taskTeamOverrides: await getAllTaskTeamOverrides(redis) });
      return;
    }

    res.status(400).json({ error: 'Unbekannte action.' });
  } catch (err) {
    console.error('[api/housekeeping-teams]', err);
    res.status(500).json({ error: err.message || 'Interner Fehler' });
  }
};
