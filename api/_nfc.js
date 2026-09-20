// NFC-Tag-Verwaltung (Redis housekeeping:nfc_tags/housekeeping:nfc_units) - eigener,
// housekeeping-interner Namespace, komplett getrennt von Guest-Services-Keys.
//
// Sicherheitsmodell (siehe Briefing "Sicherheit"): ein NFC-Token ist KEINE Authentifizierung,
// nur ein Zeiger auf ein Apartment. Alle eigentlichen Rechte (Login, Property-Zugriff,
// Task-Aktionen) laufen weiterhin ausschliesslich ueber die bestehende Session-/Berechtigungs-
// pruefung (api/_auth.js, api/_permissions.js) - siehe app/api/nfc/[token]/route.ts.
//
// Token-Speicherung: der Redis-Hash-KEY ist der SHA-256-Hash des Tokens (`tokenHash`) - Scans
// werden also per exaktem Hash-Lookup aufgeloest, niemals durch Vergleich von Klartext-Token.
// Zusaetzlich wird das Token selbst AES-256-GCM-verschluesselt (mit einem serverseitigen, nie an
// den Client herausgegebenen Schluessel aus NFC_TOKEN_SECRET) mitgespeichert - NICHT im
// Klartext -, damit die Admin-Oberflaeche eine bereits eingerichtete URL spaeter erneut anzeigen
// ("URL kopieren"/"NFC-Tag testen") kann, ohne dauerhaft ein unverschluesseltes Token in Redis
// liegen zu haben. Ohne den Schluessel (nur als Umgebungsvariable vorhanden) ist das
// gespeicherte Ciphertext wertlos.
const crypto = require('crypto');
const { parseJSON } = require('./_redis');

const TAGS_HASH_KEY = 'housekeeping:nfc_tags';
// Zeigt je Apartment (propertyCode|unitId) auf den tokenHash des zuletzt erzeugten Tags -
// unabhaengig davon, ob dieser noch aktiv ist (siehe getActiveTagForUnit): so kann nach einer
// Deaktivierung jederzeit ein neues Tag fuer dasselbe Apartment eingerichtet werden, waehrend
// "Ersetzen" gezielt den aktuell AKTIVEN Tag ablösen kann.
const UNITS_HASH_KEY = 'housekeeping:nfc_units';

function unitKey(propertyCode, unitId) {
  return `${propertyCode}|${unitId}`;
}

// 24 zufaellige Bytes (base64url, ~32 Zeichen) - traegt keinerlei Information ueber Property/
// Unit/Apartmentname, wie im Briefing explizit gefordert.
function generateToken() {
  return crypto.randomBytes(24).toString('base64url');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function getEncryptionKey() {
  const secret = process.env.NFC_TOKEN_SECRET;
  if (!secret) {
    throw new Error('NFC_TOKEN_SECRET Umgebungsvariable ist nicht gesetzt.');
  }
  // SHA-256 des Secrets ergibt zuverlaessig exakt 32 Bytes fuer AES-256, unabhaengig von der
  // tatsaechlichen Laenge/Form des konfigurierten Secrets.
  return crypto.createHash('sha256').update(secret).digest();
}

function encryptToken(token) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return { tokenEnc: ciphertext.toString('hex'), tokenIv: iv.toString('hex'), tokenTag: cipher.getAuthTag().toString('hex') };
}

function decryptToken(record) {
  const key = getEncryptionKey();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(record.tokenIv, 'hex'));
  decipher.setAuthTag(Buffer.from(record.tokenTag, 'hex'));
  const plain = Buffer.concat([decipher.update(Buffer.from(record.tokenEnc, 'hex')), decipher.final()]);
  return plain.toString('utf8');
}

async function getTagByHash(redis, tokenHash) {
  const raw = await redis.hGet(TAGS_HASH_KEY, tokenHash);
  return raw ? parseJSON(raw, null) : null;
}

/** Der aktuell AKTIVE Tag eines Apartments, oder null (auch wenn frueher schon einmal ein - seither
 * deaktivierter/ersetzter - Tag existierte). */
async function getActiveTagForUnit(redis, propertyCode, unitId) {
  const tokenHash = await redis.hGet(UNITS_HASH_KEY, unitKey(propertyCode, unitId));
  if (!tokenHash) return null;
  const record = await getTagByHash(redis, tokenHash);
  return record && record.active ? record : null;
}

/** Fuer den Scan-Einstieg (app/api/nfc/[token]/route.ts): liefert den Tag-Datensatz NUR, wenn er
 * existiert UND aktiv ist - ein deaktivierter/unbekannter Token liefert null, ohne dass der
 * Aufrufer zwischen "nie existiert" und "deaktiviert" unterscheiden kann (Punkt "neutrale
 * Meldung", kein Informationsvorsprung fuer jemanden, der nur eine alte/ungueltige URL kennt). */
async function resolveActiveToken(redis, token) {
  const record = await getTagByHash(redis, hashToken(token));
  return record && record.active ? record : null;
}

/** Alle Apartments mit ihrem aktuellen NFC-Status (Punkt "Admin sieht alle Apartments") - liefert
 * bewusst NIEMALS tokenEnc/tokenIv/tokenTag an den Aufrufer (siehe api/nfc-tags.js), nur die fuer
 * die Listenansicht noetigen Metadaten. */
async function listUnitStatuses(redis) {
  const pointers = await redis.hGetAll(UNITS_HASH_KEY);
  const entries = await Promise.all(
    Object.entries(pointers).map(async ([key, tokenHash]) => {
      const record = await getTagByHash(redis, tokenHash);
      if (!record) return null;
      return [key, { active: !!record.active, createdAt: record.createdAt, createdByName: record.createdByName }];
    }),
  );
  const statuses = {};
  for (const entry of entries) {
    if (entry) statuses[entry[0]] = entry[1];
  }
  return statuses;
}

/** Erzeugt einen neuen Tag fuer ein Apartment - erwartet, dass der Aufrufer bereits geprueft hat,
 * dass kein aktiver Tag existiert (sonst waere "ersetzen" statt "einrichten" der richtige Weg,
 * siehe api/nfc-tags.js). Das Klartext-Token wird NUR zurueckgegeben (fuer die einmalige Anzeige
 * bei der Einrichtung), niemals selbst persistiert. */
async function createTag(redis, { propertyCode, unitId, unitName, createdBy, createdByName }) {
  const token = generateToken();
  const tokenHash = hashToken(token);
  const record = {
    tokenHash, propertyCode, unitId, unitName,
    createdAt: Date.now(), createdBy, createdByName, active: true,
    ...encryptToken(token),
  };
  await redis.hSet(TAGS_HASH_KEY, tokenHash, JSON.stringify(record));
  await redis.hSet(UNITS_HASH_KEY, unitKey(propertyCode, unitId), tokenHash);
  return { token, record };
}

async function deactivateTag(redis, tokenHash) {
  const record = await getTagByHash(redis, tokenHash);
  if (!record) return null;
  record.active = false;
  record.deactivatedAt = Date.now();
  await redis.hSet(TAGS_HASH_KEY, tokenHash, JSON.stringify(record));
  return record;
}

module.exports = {
  TAGS_HASH_KEY, UNITS_HASH_KEY, unitKey,
  generateToken, hashToken, encryptToken, decryptToken,
  getTagByHash, getActiveTagForUnit, resolveActiveToken, listUnitStatuses, createTag, deactivateTag,
};
