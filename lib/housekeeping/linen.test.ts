import { describe, it, expect } from 'vitest';
import { estimateLinenQuantity } from './linen';
import type { LinenEstimationRule, TaskReservationSummary } from './types';
import type { ResolvedTask } from './tasks';

function occupancy(adults: number | null, childrenCount: number): TaskReservationSummary {
  return {
    reservationId: 'R1',
    bookingId: 'R1',
    bookingDate: '2026-09-20',
    arrivalDate: '2026-09-20',
    departureDate: '2026-09-25',
    guestName: 'Test Guest',
    adults,
    childrenCount,
    childAges: Array(childrenCount).fill(8),
    hasDog: false,
    hasCrib: false,
    checkedIn: false,
  };
}

// Nur die von estimateLinenQuantity() tatsaechlich gelesenen Felder (type/nextReservationInfo/
// reservationInfo) werden befuellt - der Rest von ResolvedTask ist fuer diese reine Funktion
// irrelevant.
function task(type: 'turnover' | 'departure' | 'stayover', reservationInfo: TaskReservationSummary | null, nextReservationInfo: TaskReservationSummary | null = null): ResolvedTask {
  return { type, reservationInfo, nextReservationInfo } as unknown as ResolvedTask;
}

describe('estimateLinenQuantity', () => {
  it('returns null when no rule is configured', () => {
    expect(estimateLinenQuantity(undefined, task('departure', occupancy(2, 0)))).toBeNull();
  });

  it("returns null for rule.type 'none'", () => {
    const rule: LinenEstimationRule = { type: 'none' };
    expect(estimateLinenQuantity(rule, task('departure', occupancy(2, 0)))).toBeNull();
  });

  it("returns the fixed quantity for rule.type 'fixed', independent of occupancy", () => {
    const rule: LinenEstimationRule = { type: 'fixed', quantity: 3 };
    expect(estimateLinenQuantity(rule, task('departure', null))).toBe(3);
  });

  it("computes ceil(multiplier * adults) for rule.type 'perAdult'", () => {
    const rule: LinenEstimationRule = { type: 'perAdult', multiplier: 1.5 };
    expect(estimateLinenQuantity(rule, task('departure', occupancy(2, 0)))).toBe(3);
    expect(estimateLinenQuantity(rule, task('departure', occupancy(3, 0)))).toBe(5); // ceil(4.5)
  });

  it("computes ceil(multiplier * (adults + childrenCount)) for rule.type 'perGuest'", () => {
    const rule: LinenEstimationRule = { type: 'perGuest', multiplier: 1 };
    expect(estimateLinenQuantity(rule, task('departure', occupancy(2, 1)))).toBe(3);
  });

  it('returns null for perAdult/perGuest when adults is unknown (null)', () => {
    const rule: LinenEstimationRule = { type: 'perAdult', multiplier: 1 };
    expect(estimateLinenQuantity(rule, task('departure', occupancy(null, 0)))).toBeNull();
  });

  it('returns null when the relevant reservation info is missing entirely', () => {
    const rule: LinenEstimationRule = { type: 'perAdult', multiplier: 1 };
    expect(estimateLinenQuantity(rule, task('departure', null))).toBeNull();
  });

  // Briefing "Bei Turnover ist die fuer den Waeschebedarf massgebliche Belegung die ANKOMMENDE
  // Reservierung (fuer die wird vorbereitet)" - reservationInfo (abreisend) muss dabei ignoriert
  // werden, selbst wenn es gesetzt ist.
  it('uses nextReservationInfo (arriving guest) for a turnover task, not reservationInfo', () => {
    const rule: LinenEstimationRule = { type: 'perAdult', multiplier: 1 };
    const t = task('turnover', occupancy(5, 0), occupancy(2, 0));
    expect(estimateLinenQuantity(rule, t)).toBe(2);
  });

  it('uses reservationInfo for a non-turnover task', () => {
    const rule: LinenEstimationRule = { type: 'perAdult', multiplier: 1 };
    const t = task('stayover', occupancy(4, 0));
    expect(estimateLinenQuantity(rule, t)).toBe(4);
  });

  it('returns null for a turnover task when nextReservationInfo is missing, even if reservationInfo exists', () => {
    const rule: LinenEstimationRule = { type: 'perAdult', multiplier: 1 };
    const t = task('turnover', occupancy(5, 0), null);
    expect(estimateLinenQuantity(rule, t)).toBeNull();
  });
});
