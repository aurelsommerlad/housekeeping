// Foto-Upload fuer Housekeeping-Vorfaelle (Briefing Punkt 5) - persistente Speicherung ueber
// Vercel Blob (die im Projekt bislang einzige verfuegbare, ohne neue Fremdinfrastruktur nutzbare
// Blob-Loesung, siehe README.md) statt dauerhaft in Redis: Redis speichert ausschliesslich die
// zurueckgegebene URL im Incident-Datensatz (siehe api/_incidents.js), nie das Bild selbst.
//
// Der Client komprimiert Fotos bereits vor dem Upload (siehe ReportIncidentSheet.tsx), dieser
// Endpunkt validiert unabhaengig davon trotzdem MIME-Type und Groesse (Punkt 12 - nie dem Client
// vertrauen). Empfaengt das Bild als Base64-Data-URL im JSON-Body (kein Multipart-Parsing noetig,
// bleibt migrationsarm) - das ist ein rein TRANSIENTER Transport, NICHT die persistente
// Speicherform (die bleibt ausschliesslich der Vercel-Blob-Pfad).
const crypto = require('crypto');
const { put } = require('@vercel/blob');
const { requireSession } = require('./_auth');
const { getRedis } = require('./_redis');
const { getUserRawById } = require('./_users');
const { hasPropertyAccess, propertyCodeFromTaskId } = require('./_permissions');

const ALLOWED_MIME_TO_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
// Grosszuegig ueber dem client-seitigen Kompressionsziel (Punkt 5 "sinnvoll komprimieren") -
// verhindert lediglich einen missbraeuchlich riesigen Upload, keine scharfe Zielgroesse.
const MAX_BYTES = 8 * 1024 * 1024;

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const redis = await getRedis();
    const session = await requireSession(req, res);
    if (!session) return;
    const user = await getUserRawById(redis, session.userId);
    if (!user) { res.status(401).json({ error: 'Nicht angemeldet.' }); return; }
    if (user.active === false) { res.status(403).json({ error: 'Dieses Benutzerkonto ist deaktiviert.' }); return; }

    const { taskId, dataUrl } = req.body || {};
    if (!taskId) { res.status(400).json({ error: 'taskId ist erforderlich.' }); return; }
    const propertyCode = propertyCodeFromTaskId(taskId);
    if (!hasPropertyAccess(user, propertyCode)) {
      res.status(403).json({ error: 'Kein Zugriff auf dieses Property.' });
      return;
    }

    const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(String(dataUrl || ''));
    if (!match) { res.status(400).json({ error: 'Ungueltiges Bildformat.' }); return; }
    const mimeType = match[1].toLowerCase();
    const ext = ALLOWED_MIME_TO_EXT[mimeType];
    if (!ext) { res.status(400).json({ error: 'Nur JPEG, PNG oder WebP sind erlaubt.' }); return; }

    const buffer = Buffer.from(match[2], 'base64');
    if (buffer.length === 0 || buffer.length > MAX_BYTES) {
      res.status(400).json({ error: 'Bild ist leer oder zu gross.' });
      return;
    }

    // Unerratbarer Dateiname (Punkt 5): weder Property/Unit/taskId noch fortlaufende Nummern im
    // Pfad - ein 32 Byte Zufallswert plus Vercel Blobs eigenem addRandomSuffix zusammen machen
    // ein Erraten/Aufzaehlen praktisch unmoeglich, ohne dass der Pfad selbst irgendetwas ueber
    // Property/Reinigung verraet.
    const pathname = `housekeeping-incidents/${crypto.randomBytes(16).toString('hex')}.${ext}`;
    const blob = await put(pathname, buffer, { access: 'public', contentType: mimeType, addRandomSuffix: true });

    res.status(200).json({ url: blob.url });
  } catch (err) {
    console.error('[api/incident-photos]', err);
    res.status(500).json({ error: err.message || 'Interner Fehler' });
  }
};
