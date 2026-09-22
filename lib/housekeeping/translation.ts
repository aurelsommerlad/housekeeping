/**
 * Anzeige-Hilfsfunktionen fuer automatisch uebersetzte, frei eingegebene operative Texte
 * (Briefing "automatische Uebersetzung frei eingegebener operativer Texte") - genutzt sowohl fuer
 * TaskNotice.translation als auch ManualTask.descriptionTranslation (siehe types.ts). Rein lesend:
 * erzeugt/aendert nie eine Uebersetzung, das passiert ausschliesslich serverseitig beim Speichern
 * (api/_translate.js).
 */
import type { FreeTextTranslation } from './types';
import type { Lang } from './i18n';

/** Punkt 8: Anzeige in der aktuellen App-Sprache, mit Fallback auf den Originaltext - NIE eine
 * leere Notiz wegen fehlgeschlagener Uebersetzung (auch wenn `translation` komplett fehlt, z. B.
 * bei aelteren, vor diesem Feature erstellten Datensaetzen). */
export function resolveFreeText(translation: FreeTextTranslation | null | undefined, sourceText: string, lang: Lang): string {
  if (!translation) return sourceText;
  if (lang === translation.sourceLanguage) return translation.sourceText || sourceText;
  const candidate = translation.translations[lang];
  return candidate && candidate.trim() ? candidate : (translation.sourceText || sourceText);
}

/** Punkt 9: "Original anzeigen" nur sinnvoll/anzuzeigen, wenn ueberhaupt uebersetzt wurde UND die
 * aktuelle Sprache von der Quellsprache abweicht. */
export function canShowOriginal(translation: FreeTextTranslation | null | undefined, lang: Lang): boolean {
  return !!translation && translation.sourceLanguage !== lang;
}

/** Punkt 12: true, wenn fuer die aktuelle Anzeigesprache eine Uebersetzung explizit fehlgeschlagen
 * ist (fuer den admin-seitigen "Übersetzung erneut versuchen"-Hinweis - Housekeeper sehen dafuer
 * nur den automatischen sourceText-Fallback, nie eine Fehlermeldung). */
export function translationFailedFor(translation: FreeTextTranslation | null | undefined, lang: Lang): boolean {
  return !!translation && translation.sourceLanguage !== lang && translation.translationStatus[lang] === 'failed';
}
