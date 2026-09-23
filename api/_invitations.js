// Einladungs-Verwaltung (Briefing "Team-/Benutzerverwaltung ueberarbeiten", Punkt "sicheres
// Einladungssystem") - eigener, ausschliesslich unter housekeeping:* liegender Redis-Namespace,
// komplett getrennt von den bestehenden User-/Session-Keys (api/_users.js/api/_auth.js).
//
// Sicherheitsmodell, analog zum bereits bestehenden NFC-Token-Muster (siehe api/_nfc.js): das
// Einladungs-Token wird NIE im Klartext gespeichert, nur sein SHA-256-Hash. Anders als beim
// NFC-Tag braucht eine Einladung aber zusaetzlich eine vom Token UNABHAENGIGE, stabile Identitaet
// (die Invitation-Id) - Admin/Standortverantwortliche/Teamleader muessen eine ausstehende
// Einladung verwalten (erneut senden/widerrufen) koennen, OHNE das aktuelle Token zu kennen, und
// "erneut senden" muss das alte Token sofort invalidieren und durch ein neues ersetzen, waehrend
// dieselbe Einladung (gleiche Id, gleiche Admin-Listenzeile) bestehen bleibt. Deshalb zwei Hashes:
//
// - housekeeping:invitations        Hash, Key = Invitation-Id  -> Invitation-Record (inkl. tokenHash)
// - housekeeping:invitation_tokens  Hash, Key = tokenHash       -> Invitation-Id (Zeiger, wie
//                                   api/_nfc.js#UNITS_HASH_KEY -> TAGS_HASH_KEY, nur mit
//                                   vertauschten Rollen: hier ist die Id die stabile, dem Admin
//                                   bekannte Identitaet, nicht das - bei jedem Neuversand
//                                   wechselnde - Token).
//
// Rollen-/Standort-/Team-Scoping (wer darf wen mit welchen Rechten einladen) wird bewusst NICHT
// hier geprueft, sondern ausschliesslich in api/invitations.js (dort auch die serverseitige
// Durchsetzung - "niemals Rolle/Team/Standort ausschliesslich anhand von Client-Daten vergeben").
// Diese Datei ist reine Datenzugriffsschicht.
const crypto = require('crypto');
const { parseJSON } = require('./_redis');
const { createUserFromInvitation } = require('./_users');

const INVITATIONS_HASH_KEY = 'housekeeping:invitations';
const INVITATION_TOKENS_HASH_KEY = 'housekeeping:invitation_tokens';
// 7 Tage - lang genug fuer eine realistische Reaktionszeit, aber ein verlorenes/abgefangenes
// Einladungs-Link-Token verliert nach spaetestens einer Woche jeden Wert.
const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function generateToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** Streicht tokenHash aus einem Invitation-Record, bevor er an einen API-Aufrufer geht - der Hash
 * selbst ist zwar kein Klartext-Secret, aber es gibt keinen Grund, ihn ueberhaupt zu exponieren. */
function sanitizeInvitation(inv) {
  if (!inv) return inv;
  const { tokenHash: _tokenHash, ...rest } = inv;
  return rest;
}

async function getInvitationById(redis, id) {
  if (!id) return null;
  const raw = await redis.hGet(INVITATIONS_HASH_KEY, id);
  return raw ? parseJSON(raw, null) : null;
}

async function getAllInvitations(redis) {
  const all = await redis.hGetAll(INVITATIONS_HASH_KEY);
  return Object.values(all).map((v) => parseJSON(v, null)).filter(Boolean);
}

async function getInvitationByToken(redis, token) {
  if (!token) return null;
  const id = await redis.hGet(INVITATION_TOKENS_HASH_KEY, hashToken(token));
  if (!id) return null;
  return getInvitationById(redis, id);
}

/** Legt eine neue Einladung an. `input` ist vom Aufrufer bereits vollstaendig serverseitig
 * validiert/gescoped (siehe api/invitations.js) - diese Funktion vertraut den uebergebenen
 * Feldern. Gibt das Klartext-Token NUR bei Erzeugung (bzw. beim erneuten Senden, siehe
 * resendInvitation) zurueck - es wird selbst nie gespeichert. */
async function createInvitation(redis, input) {
  const id = crypto.randomBytes(12).toString('hex');
  const token = generateToken();
  const now = Date.now();
  const record = {
    id,
    email: String(input.email).trim().toLowerCase(),
    role: input.role,
    propertyIds: Array.isArray(input.propertyIds) ? input.propertyIds : [],
    teamId: input.teamId || null,
    isLeader: !!input.isLeader,
    lang: input.lang || 'de',
    invitedBy: input.invitedBy,
    invitedByName: input.invitedByName || '',
    createdAt: now,
    expiresAt: now + INVITATION_TTL_MS,
    status: 'pending',
    tokenHash: hashToken(token),
  };
  await redis.hSet(INVITATIONS_HASH_KEY, id, JSON.stringify(record));
  await redis.hSet(INVITATION_TOKENS_HASH_KEY, record.tokenHash, id);
  return { invitation: sanitizeInvitation(record), token };
}

/** Erneutes Senden (Punkt "Einladungslink erneut senden"): das alte Token wird durch ein neues
 * ersetzt (alter Token-Zeiger wird geloescht - ein noch nicht abgelaufener alter Link funktioniert
 * danach sofort nicht mehr), dieselbe Invitation-Id/dieselben Empfaenger-/Rechtedaten bleiben
 * bestehen. Nur fuer noch offene Einladungen sinnvoll (status 'pending') - eine bereits
 * angenommene/widerrufene Einladung wird nicht "wiederbelebt", sondern braucht eine neue Einladung.
 */
async function resendInvitation(redis, id) {
  const existing = await getInvitationById(redis, id);
  if (!existing) throw new Error('Einladung nicht gefunden.');
  if (existing.status !== 'pending') throw new Error('Nur eine ausstehende Einladung kann erneut gesendet werden.');
  await redis.hDel(INVITATION_TOKENS_HASH_KEY, existing.tokenHash);
  const token = generateToken();
  const now = Date.now();
  const record = { ...existing, expiresAt: now + INVITATION_TTL_MS, tokenHash: hashToken(token) };
  await redis.hSet(INVITATIONS_HASH_KEY, id, JSON.stringify(record));
  await redis.hSet(INVITATION_TOKENS_HASH_KEY, record.tokenHash, id);
  return { invitation: sanitizeInvitation(record), token };
}

/** Widerruft eine Einladung (Punkt "Einladung widerrufen") - der eigentliche Schutz ist
 * status:'revoked' (jede Pruefung, ob ein Token noch verwendbar ist, prueft IMMER zuerst
 * status==='pending', siehe getInvitationInfo/acceptInvitation), NICHT das Loeschen des
 * Token-Zeigers: der Zeiger bleibt bewusst bestehen, damit die Einladungsseite bei einem bereits
 * widerrufenen Link "widerrufen" statt einer nichtssagenden "nicht gefunden"-Meldung anzeigen kann
 * (anders als beim Resend, siehe dort - hier gibt es kein "neueres, gueltiges" Token, das mit dem
 * alten Zeiger kollidieren koennte). */
async function revokeInvitation(redis, id) {
  const existing = await getInvitationById(redis, id);
  if (!existing) throw new Error('Einladung nicht gefunden.');
  const record = { ...existing, status: 'revoked' };
  await redis.hSet(INVITATIONS_HASH_KEY, id, JSON.stringify(record));
  return sanitizeInvitation(record);
}

/** Fuer die Einladungsseite (GET-Info, noch OHNE das Token zu verbrauchen) - liefert nur, was fuer
 * die Anzeige/Vorbefuellung noetig ist (E-Mail bleibt dort bewusst unveraenderlich, siehe Briefing).
 * Unterscheidet 'not_found' explizit von 'expired'/'accepted'/'revoked', damit die Seite eine
 * passende Meldung zeigen kann, OHNE selbst irgendetwas zu veraendern. Das ist unbedenklich, da
 * nur besitzt, wer bereits das (kryptographisch zufaellige, nur per E-Mail verteilte) Token kennt -
 * anders als beim NFC-Scan-Einstieg (siehe api/_nfc.js#resolveActiveToken), der oeffentlich
 * erreichbar ist und deshalb bewusst NICHT zwischen "nie existiert" und "deaktiviert" unterscheidet. */
async function getInvitationInfo(redis, token) {
  const invitation = await getInvitationByToken(redis, token);
  if (!invitation) return { status: 'not_found' };
  if (invitation.status !== 'pending') return { status: invitation.status };
  if (Date.now() > invitation.expiresAt) return { status: 'expired' };
  return {
    status: 'pending', email: invitation.email, role: invitation.role, lang: invitation.lang,
  };
}

/** Nimmt eine Einladung an (Punkt "Einladungsseite"): erzeugt den echten User-Datensatz (ueber
 * api/_users.js#createUserFromInvitation - Rolle/Standorte/Team kommen dabei AUSSCHLIESSLICH aus
 * der bereits serverseitig gescopten Invitation, niemals aus dem Request-Body dieses Aufrufs) und
 * markiert die Einladung als verbraucht (status:'accepted'). Einmalgebrauch wird dabei
 * ausschliesslich ueber DIESEN status-Wechsel durchgesetzt (jeder weitere Versuch mit demselben
 * Token schlaegt an der status==='pending'-Pruefung oben fehl) - der Token-Zeiger selbst bleibt
 * bewusst bestehen (siehe revokeInvitation-Kommentar: dieselbe Begruendung gilt hier). */
async function acceptInvitation(redis, token, { firstName, lastName, password }) {
  const invitation = await getInvitationByToken(redis, token);
  if (!invitation) throw new Error('Einladung nicht gefunden oder bereits verwendet.');
  if (invitation.status !== 'pending') throw new Error('Diese Einladung ist nicht mehr gueltig.');
  if (Date.now() > invitation.expiresAt) throw new Error('Diese Einladung ist abgelaufen.');

  const user = await createUserFromInvitation(redis, {
    firstName, lastName, email: invitation.email, password,
    role: invitation.role, propertyIds: invitation.propertyIds, teamId: invitation.teamId,
    isLeader: invitation.isLeader, lang: invitation.lang,
  });

  const record = {
    ...invitation, status: 'accepted', acceptedAt: Date.now(), userId: user.id,
  };
  await redis.hSet(INVITATIONS_HASH_KEY, invitation.id, JSON.stringify(record));
  return { user, invitation: sanitizeInvitation(record) };
}

module.exports = {
  INVITATIONS_HASH_KEY,
  INVITATION_TOKENS_HASH_KEY,
  INVITATION_TTL_MS,
  sanitizeInvitation,
  getInvitationById,
  getAllInvitations,
  getInvitationByToken,
  createInvitation,
  resendInvitation,
  revokeInvitation,
  getInvitationInfo,
  acceptInvitation,
};
