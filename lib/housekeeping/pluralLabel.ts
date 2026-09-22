import type { I18nKey } from './i18n';

/** Aus TasksScreen.tsx ausgelagert (Desktop-Admin-Layout) - dieselbe Stelle fuer korrektes
 * Singular/Plural, jetzt auch von DesktopAdminSidebar.tsx genutzt: waehlt je nach `n` den
 * `_one`/`_many` Nomen-Schluessel und setzt "<n> <Nomen>" zusammen (nur `n === 1` ist Singular,
 * `0` zaehlt sprachlich als Plural: "0 Reinigungen"). */
export function countLabel(t: (key: I18nKey) => string, n: number, oneKey: I18nKey, manyKey: I18nKey): string {
  return `${n} ${t(n === 1 ? oneKey : manyKey)}`;
}
