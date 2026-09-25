// Serverseitiger Proxy zu Apaleo. Der Client Secret verlaesst diesen Prozess nie.
// Erfordert eine gueltige Session - anonyme Zugriffe auf die PMS-Daten sind nicht erlaubt.
//
// Token-/Fetch-Logik liegt in api/_apaleo.js (gemeinsam mit api/reservation-search.js genutzt).
//
// Sicherheit (Phase-1-Haertung): dieser Proxy reichte `path`/`method`/`body` bisher UNGEPRUEFT an
// Apaleo durch - jede angemeldete, auch rechtelose Reinigungskraft haette darueber JEDEN
// Apaleo-Endpunkt mit JEDER Methode aufrufen koennen (z. B. Reservierungen stornieren, Folios
// lesen, fremde Property-Daten abfragen). Erlaubt sind jetzt ausschliesslich die vier Endpunkte,
// die der Client (lib/housekeeping/api.ts) tatsaechlich verwendet - alles andere wird mit 403
// abgelehnt:
//  - GET /inventory/v1/properties: liefert ohnehin nur die Liste aller Haeuser (keine
//    property-spezifischen Detaildaten), daher ohne zusaetzliche Zugriffspruefung.
//  - GET /inventory/v1/units und GET /booking/v1/reservations: das jeweilige
//    propertyIds-/propertyId-Query wird gegen hasPropertyAccess() geprueft, damit niemand ueber
//    einen manipulierten Query-Parameter Daten eines fremden Standorts abfragen kann.
//  - PUT /operations/v1/units-condition: bleibt bewusst fuer JEDEN angemeldeten Nutzer offen (nicht
//    nur Admin) - jede Reinigungskraft setzt genau hierueber beim Abschliessen einer Reinigung die
//    Unit-Condition auf 'Clean' (siehe useHousekeepingApp.ts#setUnitCondition-Aufrufe). Der Body
//    wird stattdessen strikt auf das erwartete Schema geprueft, statt ihn blind durchzureichen.
const { getRedis } = require('./_redis');
const { requireSession } = require('./_auth');
const { getUserRawById } = require('./_users');
const { hasPropertyAccess } = require('./_permissions');
const { apaleoFetch } = require('./_apaleo');

const VALID_UNIT_CONDITIONS = new Set(['Clean', 'CleanToBeInspected', 'Dirty']);
const MAX_UNIT_CONDITIONS_PER_REQUEST = 20;

function queryParam(path, name) {
  const qIndex = path.indexOf('?');
  if (qIndex === -1) return null;
  return new URLSearchParams(path.slice(qIndex + 1)).get(name);
}

function isAllowedRequest(user, httpMethod, basePath, path, body) {
  if (httpMethod === 'GET' && basePath === '/inventory/v1/properties') return true;

  if (httpMethod === 'GET' && basePath === '/inventory/v1/units') {
    const propertyIds = (queryParam(path, 'propertyIds') || '').split(',').map((v) => v.trim()).filter(Boolean);
    return propertyIds.length > 0 && propertyIds.every((code) => hasPropertyAccess(user, code));
  }

  if (httpMethod === 'GET' && basePath === '/booking/v1/reservations') {
    const propertyId = queryParam(path, 'propertyId');
    return !!propertyId && hasPropertyAccess(user, propertyId);
  }

  if (httpMethod === 'PUT' && basePath === '/operations/v1/units-condition') {
    const conditions = body && Array.isArray(body.unitsConditions) ? body.unitsConditions : null;
    return !!conditions && conditions.length > 0 && conditions.length <= MAX_UNIT_CONDITIONS_PER_REQUEST &&
      conditions.every((c) => c && typeof c.id === 'string' && VALID_UNIT_CONDITIONS.has(c.condition));
  }

  return false;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  try {
    const session = await requireSession(req, res);
    if (!session) return;
    const redis = await getRedis();
    const user = await getUserRawById(redis, session.userId);
    if (!user) { res.status(401).json({ error: 'Nicht angemeldet.' }); return; }

    const { path, method, body } = req.body || {};
    if (!path || typeof path !== 'string' || !path.startsWith('/')) {
      res.status(400).json({ error: 'path ist erforderlich und muss mit / beginnen.' });
      return;
    }
    const httpMethod = String(method || 'GET').toUpperCase();
    const basePath = path.split('?')[0];
    if (!isAllowedRequest(user, httpMethod, basePath, path, body)) {
      res.status(403).json({ error: 'Dieser Apaleo-Zugriff ist nicht erlaubt.' });
      return;
    }

    const { status, data } = await apaleoFetch(path, method, body);
    // Apaleo antwortet bei 0 Treffern (z. B. keine Abreisen an einem Tag/Property) mit
    // HTTP 204 No Content und OHNE Body - verifiziert live gegen den echten Account. Ein 204
    // darf laut HTTP-Spec NIE einen Body tragen; res.status(204).json({}) wuerde genau das tun
    // und kann je nach Client/Proxy-Schicht zu einer fehlerhaften Response-Framing fuehren, bei
    // der der Fetch im Browser haengen bleibt (das Promise loest sich weder auf noch lehnt es
    // ab - ein try/catch beim Aufrufer kann das nicht abfangen). apaleoFetch() wandelt einen
    // solchen 204 deshalb bereits in einen 200er mit leerem Objekt um.
    res.status(status).json(data);
  } catch (err) {
    console.error('[api/apaleo]', err);
    res.status(500).json({ error: err.message || 'Interner Fehler' });
  }
};
