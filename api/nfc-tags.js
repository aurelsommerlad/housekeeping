// Admin-Verwaltung der NFC-Tags (Punkt "NFC-Verwaltung") - Einrichten/Anzeigen/Deaktivieren/
// Ersetzen. Ausschliesslich fuer role==='admin' (serverseitig erzwungen, nicht nur versteckt in
// der UI) - Standortverantwortliche/Housekeeper haben hier keinerlei Zugriff, auch nicht lesend,
// da bereits die Liste (welches Apartment hat einen aktiven Tag) fuer die eigentliche NFC-
// Funktion nicht noetig ist (der Scan-Einstieg selbst laeuft ueber app/api/nfc/[token]/route.ts
// mit eigener, vom Token abgeleiteter Berechtigungspruefung).
const { getRedis } = require('./_redis');
const { requireSession } = require('./_auth');
const { getUserRawById } = require('./_users');
const {
  getActiveTagForUnit, listUnitStatuses, createTag, deactivateTag, decryptToken,
} = require('./_nfc');

function originFromReq(req) {
  const proto = req.headers['x-forwarded-proto'] || (req.socket && req.socket.encrypted ? 'https' : 'http');
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}

function tagUrl(req, token) {
  return `${originFromReq(req)}/nfc/${token}`;
}

module.exports = async (req, res) => {
  try {
    const redis = await getRedis();
    const session = await requireSession(req, res);
    if (!session) return;
    // Immer frisch laden statt der im Session-Cookie gecachten role - siehe api/_permissions.js.
    const user = await getUserRawById(redis, session.userId);
    if (!user) { res.status(401).json({ error: 'Nicht angemeldet.' }); return; }
    if (user.role !== 'admin') { res.status(403).json({ error: 'Nur für Administratoren.' }); return; }

    if (req.method === 'GET') {
      res.status(200).json({ statuses: await listUnitStatuses(redis) });
      return;
    }

    if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

    const { action, propertyCode, unitId, unitName } = req.body || {};
    if (!propertyCode || !unitId) { res.status(400).json({ error: 'propertyCode und unitId sind erforderlich.' }); return; }

    if (action === 'create') {
      const existing = await getActiveTagForUnit(redis, propertyCode, unitId);
      if (existing) {
        res.status(409).json({ error: 'Für dieses Apartment ist bereits ein aktiver NFC-Tag eingerichtet. Nutze stattdessen "Tag ersetzen".' });
        return;
      }
      const { token, record } = await createTag(redis, {
        propertyCode, unitId, unitName: unitName || unitId, createdBy: user.id, createdByName: user.name || user.username,
      });
      res.status(200).json({
        url: tagUrl(req, token),
        status: { active: true, createdAt: record.createdAt, createdByName: record.createdByName },
      });
      return;
    }

    if (action === 'reveal') {
      const existing = await getActiveTagForUnit(redis, propertyCode, unitId);
      if (!existing) { res.status(404).json({ error: 'Kein aktiver NFC-Tag für dieses Apartment.' }); return; }
      const token = decryptToken(existing);
      res.status(200).json({ url: tagUrl(req, token) });
      return;
    }

    if (action === 'deactivate') {
      const existing = await getActiveTagForUnit(redis, propertyCode, unitId);
      if (!existing) { res.status(404).json({ error: 'Kein aktiver NFC-Tag für dieses Apartment.' }); return; }
      await deactivateTag(redis, existing.tokenHash);
      res.status(200).json({ ok: true });
      return;
    }

    if (action === 'replace') {
      // Punkt "Tag ersetzen": alten Token SOFORT ungueltig machen (deaktivieren), dann einen
      // neuen erzeugen - beide Schritte hier nacheinander auf derselben Anfrage, damit nie ein
      // Zwischenzustand mit zwei gleichzeitig aktiven Tags fuer dasselbe Apartment sichtbar wird.
      const existing = await getActiveTagForUnit(redis, propertyCode, unitId);
      if (!existing) {
        res.status(404).json({ error: 'Kein aktiver NFC-Tag zum Ersetzen vorhanden - nutze stattdessen "NFC-Tag einrichten".' });
        return;
      }
      await deactivateTag(redis, existing.tokenHash);
      const { token, record } = await createTag(redis, {
        propertyCode, unitId, unitName: unitName || existing.unitName || unitId, createdBy: user.id, createdByName: user.name || user.username,
      });
      res.status(200).json({
        url: tagUrl(req, token),
        status: { active: true, createdAt: record.createdAt, createdByName: record.createdByName },
      });
      return;
    }

    res.status(400).json({ error: 'Unbekannte action.' });
  } catch (err) {
    console.error('[api/nfc-tags]', err);
    res.status(500).json({ error: err.message || 'Interner Fehler' });
  }
};
