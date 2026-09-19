import type { Lang } from './i18n';
import { translate } from './i18n';
import type { Room } from './types';

/** Baut die kompakte Aufenthalts-/Turnover-Zeile einer Room Card/Detailansicht. */
export function describeTurnover(room: Room, lang: Lang): string | null {
  const nightsSuffix = room.nights
    ? ` · ${translate(lang, room.nights === 1 ? 'nights_one' : 'nights_many', { n: room.nights })}`
    : '';

  if (room.departsTodayFlag && room.arrivesTodayFlag) return translate(lang, 'turnover_same_day') + nightsSuffix;
  if (room.departsTodayFlag) return translate(lang, 'turnover_departure') + nightsSuffix;
  if (room.arrivesTodayFlag) return translate(lang, 'turnover_arrival');
  if (room.stayover) return translate(lang, 'turnover_stayover') + nightsSuffix;
  return null;
}

/** Same-Day-Turnover braucht laut Briefing hohe operative Sichtbarkeit - unabhaengig vom
 * sonstigen Status. */
export function isSameDayTurnover(room: Room): boolean {
  return room.departsTodayFlag && room.arrivesTodayFlag;
}
