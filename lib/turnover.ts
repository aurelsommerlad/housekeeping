import type { TurnoverInfo } from './types';

/** Baut die kompakte Aufenthalts-/Turnover-Zeile einer Unit Card, z. B. "Abreise heute · 4 Nächte". */
export function describeTurnover(turnover: TurnoverInfo): string | null {
  const nightsSuffix = turnover.nights ? ` · ${turnover.nights} ${turnover.nights === 1 ? 'Nacht' : 'Nächte'}` : '';

  if (turnover.departureToday && turnover.arrivalToday) return `Abreise und Anreise heute${nightsSuffix}`;
  if (turnover.departureToday) return `Abreise heute${nightsSuffix}`;
  if (turnover.arrivalToday) return `Anreise heute${nightsSuffix}`;
  if (turnover.stayover) return `Stayover${nightsSuffix}`;
  return null;
}
