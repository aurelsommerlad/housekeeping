// Admin-Reservierungssuche (Punkt 5-9) - sucht LIVE gegen Apaleo (nicht nur die vier bereits
// geladenen Planungstage, siehe Punkt 8), ausschliesslich fuer role==='admin'. Serverseitig
// erzwungen (nicht nur ein im Frontend verstecktes Suchsymbol, siehe Punkt 9) - Housekeeper und
// (vorerst) auch Standortverantwortliche bekommen hier immer 403, unabhaengig davon, was der
// Client anzeigt.
//
// Verwendet `textSearch` (live gegen den echten Account bestaetigt: durchsucht Buchungsnummer/
// Reservierungs-ID UND Gastname in einem Aufruf, Teiltreffer moeglich, funktioniert ueber alle
// Properties hinweg ohne Datumsfilter - siehe Rechercheergebnis) statt getrennter Endpunkte fuer
// ID- vs. Namenssuche.
const { requireSession } = require('./_auth');
const { getRedis } = require('./_redis');
const { getUserRawById } = require('./_users');
const { apaleoFetch } = require('./_apaleo');

const MAX_RESULTS = 15;
const MIN_QUERY_LENGTH = 2;

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

    const redis = await getRedis();
    const session = await requireSession(req, res);
    if (!session) return;
    // Immer frisch laden statt der im Session-Cookie gecachten role - siehe api/_permissions.js.
    const user = await getUserRawById(redis, session.userId);
    if (!user) { res.status(401).json({ error: 'Nicht angemeldet.' }); return; }
    if (user.role !== 'admin') { res.status(403).json({ error: 'Nur für Administratoren.' }); return; }

    const { query } = req.body || {};
    const q = typeof query === 'string' ? query.trim() : '';
    if (q.length < MIN_QUERY_LENGTH) { res.status(200).json({ results: [] }); return; }

    const path = `/booking/v1/reservations?textSearch=${encodeURIComponent(q)}&pageSize=${MAX_RESULTS}`;
    const { status, data } = await apaleoFetch(path, 'GET');
    if (status >= 400) {
      const detail = typeof data.detail === 'string' ? data.detail
        : typeof data.message === 'string' ? data.message
        : typeof data.title === 'string' ? data.title
        : 'Apaleo-Fehler bei der Reservierungssuche.';
      res.status(status).json({ error: detail });
      return;
    }

    const list = (data.reservations || data.results || []).slice(0, MAX_RESULTS);
    const results = list.map((r) => ({
      reservationId: r.id,
      bookingId: r.bookingId || r.id,
      bookingDate: r.created ? String(r.created).slice(0, 10) : null,
      arrivalDate: r.arrival ? String(r.arrival).slice(0, 10) : '',
      departureDate: r.departure ? String(r.departure).slice(0, 10) : '',
      guestName: [r.primaryGuest?.firstName, r.primaryGuest?.lastName].filter(Boolean).join(' '),
      adults: typeof r.adults === 'number' ? r.adults : null,
      childrenCount: Array.isArray(r.childrenAges) ? r.childrenAges.length : 0,
      childAges: Array.isArray(r.childrenAges) ? r.childrenAges : [],
      propertyCode: r.property?.code || r.property?.id || '',
      propertyName: r.property?.name || '',
      unitId: r.unit?.id || '',
      unitName: r.unit?.name || r.unit?.id || '',
      status: r.status || '',
    }));
    res.status(200).json({ results });
  } catch (err) {
    console.error('[api/reservation-search]', err);
    res.status(500).json({ error: err.message || 'Interner Fehler' });
  }
};
