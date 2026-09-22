import type { I18nKey } from './i18n';

/** Aus TasksScreen.tsx ausgelagert (Desktop-Admin-Layout) - dieselbe Tagesbeschriftung
 * ("Heute"/"Morgen"/konkreter Wochentag) jetzt auch von DesktopAdminSidebar.tsx nutzbar, ohne die
 * Logik zu duplizieren. */
export const DAY_LABEL_KEYS = ['day_today', 'day_tomorrow'] as const;
export const DAY_LOCALES: Record<string, string> = { de: 'de-DE', en: 'en-GB', pl: 'pl-PL', ro: 'ro-RO' };

/** "Mo 21." statt eines vagen "+2 Tage" - der konkrete Wochentag/Kalendertag ist bei der
 * Einsatzplanung sofort eindeutig, waehrend "Heute"/"Morgen" fuer die ersten beiden Tage
 * (schneller erfassbar) unveraendert bleiben. */
export function shortDayLabel(iso: string, locale: string): string {
  const d = new Date(`${iso}T00:00:00`);
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(d).replace(/[.,]/g, '');
  return `${weekday} ${d.getDate()}.`;
}

/** Dieselbe Positionslogik wie die Tagesnavigation in TasksScreen.tsx (Index 0/1 = Heute/Morgen,
 * sonst konkreter Tag) - hier ueber `planningDays.indexOf(date)` statt eines Schleifenindex, damit
 * auch Aufrufer ohne eigene Iteration (z. B. DesktopAdminSidebar.tsx) denselben Text erhalten. */
export function dayHeadingLabel(t: (key: I18nKey) => string, lang: string, date: string, planningDays: string[]): string {
  const idx = planningDays.indexOf(date);
  if (idx >= 0 && idx < DAY_LABEL_KEYS.length) return t(DAY_LABEL_KEYS[idx]);
  return shortDayLabel(date, DAY_LOCALES[lang] || 'de-DE');
}
