// Einladungs-Route (Briefing "Team-/Benutzerverwaltung ueberarbeiten", Punkt "sicheres
// Einladungssystem"). Datenzugriff liegt in api/_invitations.js - diese Datei ist die EINZIGE
// Stelle, an der die Scoping-Regeln durchgesetzt werden ("niemals Rolle/Team/Standort
// ausschliesslich anhand von Client-Daten vergeben"):
//
// - admin            darf jede Rolle (admin/location_manager/housekeeper), beliebige Standorte,
//                     beliebiges Team, isLeader frei setzen.
// - location_manager darf NUR role:'housekeeper' einladen, NUR fuer eigene managedProperties
//                     (Teilmenge), Team NUR eines, dessen propertyIds die eigenen Standorte
//                     schneiden - isLeader wird IMMER hart auf false gesetzt (Teamleader-Ernennung
//                     bleibt admin-only, siehe Briefing Punkt "kann keine Teamleader ernennen").
// - Teamleader       (isTeamLead(actor), keine eigene Rolle) darf NUR role:'housekeeper' einladen,
//                     NUR in EIN Team, dessen Leiter er selbst ist (isTeamLeadOf), Standorte NUR
//                     als Teilmenge der Schnittmenge aus Team-propertyIds und eigenen
//                     properties - isLeader ebenfalls IMMER hart false.
//
// Alle drei Faelle gelten unabhaengig vom Inhalt des Request-Bodys - jedes vom Client gesendete
// role/teamId/isLeader/propertyIds-Feld wird gegen diese Regeln geprueft bzw. hart ueberschrieben,
// niemals ungeprueft uebernommen.
const { getRedis } = require('./_redis');
const { requireSession } = require('./_auth');
const { getUserRawById, getAllUsersRaw } = require('./_users');
const { getTeamById } = require('./_teams');
const {
  isAdmin, isLocationManager, isTeamLead, isTeamLeadOf, canInviteUser,
} = require('./_permissions');
const {
  getAllInvitations, getInvitationById, createInvitation, resendInvitation, revokeInvitation,
} = require('./_invitations');

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

module.exports = async (req, res) => {
  try {
    const redis = await getRedis();
    const session = await requireSession(req, res);
    if (!session) return;
    const actor = await getUserRawById(redis, session.userId);
    if (!actor || actor.active === false) {
      res.status(401).json({ error: 'Nicht angemeldet.' });
      return;
    }

    if (req.method === 'GET') {
      if (!canInviteUser(actor)) {
        res.status(403).json({ error: 'Keine Berechtigung.' });
        return;
      }
      const all = await getAllInvitations(redis);
      // Admin sieht alle Einladungen (Uebersicht/Nachvollziehbarkeit); Standortverantwortliche und
      // Teamleader sehen ausschliesslich die von ihnen selbst versendeten - niemals fremde
      // Einladungen anderer Standorte/Teams (kein Informationsvorsprung ueber andere Bereiche).
      const visible = isAdmin(actor) ? all : all.filter((inv) => inv.invitedBy === actor.id);
      res.status(200).json({ invitations: visible.map(({ tokenHash: _tokenHash, ...rest }) => rest) });
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    if (!canInviteUser(actor)) {
      res.status(403).json({ error: 'Keine Berechtigung, Einladungen zu versenden.' });
      return;
    }

    const { action } = req.body || {};

    if (action === 'create') {
      const { email, lang } = req.body || {};
      if (!isValidEmail(email)) {
        res.status(400).json({ error: 'Gueltige E-Mail-Adresse ist erforderlich.' });
        return;
      }
      const emailNorm = String(email).trim().toLowerCase();
      const allUsers = await getAllUsersRaw(redis);
      if (allUsers.some((u) => u.email && u.email.toLowerCase() === emailNorm)) {
        res.status(409).json({ error: 'Diese E-Mail-Adresse wird bereits verwendet.' });
        return;
      }
      const allInvitations = await getAllInvitations(redis);
      if (allInvitations.some((inv) => inv.email === emailNorm && inv.status === 'pending')) {
        res.status(409).json({ error: 'Fuer diese E-Mail-Adresse gibt es bereits eine ausstehende Einladung - bitte erneut senden statt neu einladen.' });
        return;
      }

      let scoped;
      try {
        scoped = await resolveInvitationScope(redis, actor, req.body || {});
      } catch (err) {
        res.status(403).json({ error: err.message });
        return;
      }

      const { invitation, token } = await createInvitation(redis, {
        email: emailNorm,
        role: scoped.role,
        propertyIds: scoped.propertyIds,
        teamId: scoped.teamId,
        isLeader: scoped.isLeader,
        lang: lang || actor.lang || 'de',
        invitedBy: actor.id,
        invitedByName: actor.name || actor.username,
      });
      res.status(200).json({ invitation, token });
      return;
    }

    if (action === 'resend' || action === 'revoke') {
      const { id } = req.body || {};
      if (!id) {
        res.status(400).json({ error: 'id ist erforderlich.' });
        return;
      }
      const existing = await getInvitationById(redis, id);
      if (!existing) {
        res.status(404).json({ error: 'Einladung nicht gefunden.' });
        return;
      }
      // Nur Admin oder die urspruenglich einladende Person selbst darf verwalten - schliesst aus,
      // dass ein Standortverantwortlicher/Teamleader die Einladung eines anderen Bereichs
      // widerruft/erneut sendet, ohne die komplette Scoping-Pruefung von 'create' zu duplizieren.
      if (!isAdmin(actor) && existing.invitedBy !== actor.id) {
        res.status(403).json({ error: 'Keine Berechtigung fuer diese Einladung.' });
        return;
      }
      try {
        if (action === 'resend') {
          const { invitation, token } = await resendInvitation(redis, id);
          res.status(200).json({ invitation, token });
        } else {
          const invitation = await revokeInvitation(redis, id);
          res.status(200).json({ invitation });
        }
      } catch (err) {
        res.status(400).json({ error: err.message });
      }
      return;
    }

    res.status(400).json({ error: 'Unbekannte action.' });
  } catch (err) {
    console.error('[api/invitations]', err);
    res.status(500).json({ error: err.message || 'Interner Fehler' });
  }
};

/** Siehe Kopfkommentar - leitet aus dem Request-Body und dem frisch geladenen Akteur-Datensatz die
 * tatsaechlich zulaessigen Einladungswerte ab (nie die vom Client gesendeten Werte ungeprueft
 * uebernehmen) und wirft bei jeder Regelverletzung einen fuer die Admin-/Team-UI verstaendlichen
 * Fehler. Async, weil fuer location_manager/Teamleader zusaetzlich der Team-Datensatz selbst
 * geladen werden muss (propertyIds-Schnittmenge). */
async function resolveInvitationScope(redis, actor, body) {
  const requestedRole = body.role === 'admin' || body.role === 'location_manager' ? body.role : 'housekeeper';
  const requestedProperties = Array.isArray(body.propertyIds) ? body.propertyIds.filter(Boolean) : [];
  const requestedTeamId = body.teamId || null;

  if (isAdmin(actor)) {
    if (requestedTeamId && !(await getTeamById(redis, requestedTeamId))) {
      throw new Error('Unbekanntes Team.');
    }
    return {
      role: requestedRole, propertyIds: requestedProperties, teamId: requestedTeamId, isLeader: !!body.isLeader,
    };
  }

  if (isLocationManager(actor)) {
    const managed = Array.isArray(actor.managedProperties) ? actor.managedProperties : [];
    const scopedProperties = requestedProperties.filter((p) => managed.includes(p));
    if (scopedProperties.length === 0) {
      throw new Error('Standortverantwortliche koennen nur fuer eigene Standorte einladen.');
    }
    if (requestedTeamId) {
      const team = await getTeamById(redis, requestedTeamId);
      const teamProperties = (team && team.propertyIds) || [];
      if (!team || !teamProperties.some((p) => managed.includes(p))) {
        throw new Error('Dieses Team ist keinem der eigenen Standorte zugeordnet.');
      }
    }
    return {
      role: 'housekeeper', propertyIds: scopedProperties, teamId: requestedTeamId, isLeader: false,
    };
  }

  if (isTeamLead(actor)) {
    if (!requestedTeamId || !isTeamLeadOf(actor, requestedTeamId)) {
      throw new Error('Ein Teamleader kann Mitarbeiter nur in das eigene Team einladen.');
    }
    const team = await getTeamById(redis, requestedTeamId);
    const teamProperties = (team && team.propertyIds) || [];
    const actorProperties = actor.properties === 'alle' || actor.properties === 'all'
      ? teamProperties
      : teamProperties.filter((p) => Array.isArray(actor.properties) && actor.properties.includes(p));
    const scopedProperties = requestedProperties.filter((p) => actorProperties.includes(p));
    return {
      role: 'housekeeper', propertyIds: scopedProperties, teamId: requestedTeamId, isLeader: false,
    };
  }

  throw new Error('Keine Berechtigung, Einladungen zu versenden.');
}
