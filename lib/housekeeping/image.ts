'use client';

/**
 * Client-seitige Bildkompression fuer Vorfall-Fotos (Briefing Punkt 5: "Bilder vor Upload
 * sinnvoll komprimieren, damit Smartphone-Fotos nicht unnoetig mehrere MB uebertragen") -
 * reine Canvas-Skalierung/Reencoding, keine zusaetzliche Abhaengigkeit noetig. Laeuft ausschliesslich
 * im Browser (kein SSR-Import dieser Datei), das Ergebnis ist eine JPEG-Data-URL, die direkt an
 * api/incident-photos.js gesendet wird - Redis/der Server sehen davon nur die zurueckgegebene
 * Blob-URL, nie diese Data-URL selbst (siehe api.ts#incidentPhotosApi).
 */
const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.72;

export async function compressImageFile(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas wird nicht unterstuetzt.');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
}
