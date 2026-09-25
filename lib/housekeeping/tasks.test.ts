import { describe, it, expect } from 'vitest';
import { buildTasks, taskId } from './tasks';
import type { ApaleoReservation, ApaleoUnit, BookingChangeRecord } from './types';

const PROPERTY = 'LAEKE';
const TODAY = '2026-09-25';

function unit(id: string, name: string): ApaleoUnit {
  return { id, name, property: { code: PROPERTY } };
}

function reservation(overrides: Partial<ApaleoReservation> & { id: string }): ApaleoReservation {
  return {
    unit: { id: 'LAEKE-101' },
    adults: 2,
    childrenAges: [],
    ...overrides,
  };
}

describe('buildTasks', () => {
  it('derives a turnover task when a unit has both a departing and an arriving reservation on the same day', () => {
    const departing = reservation({ id: 'DEP1', arrival: '2026-09-20', departure: `${TODAY}T10:00:00Z` });
    const arriving = reservation({ id: 'ARR1', arrival: `${TODAY}T15:00:00Z`, departure: '2026-09-28' });
    const tasks = buildTasks({
      propertyNames: { [PROPERTY]: 'Laeke' },
      units: [unit('LAEKE-101', '101')],
      reservations: [departing, arriving],
      doubleups: {},
      days: [TODAY],
      today: TODAY,
    });

    expect(tasks).toHaveLength(1);
    expect(tasks[0].type).toBe('turnover');
    expect(tasks[0].id).toBe(taskId(PROPERTY, 'LAEKE-101', TODAY, 'turnover', 'DEP1'));
    expect(tasks[0].departureReservationId).toBe('DEP1');
    expect(tasks[0].nextReservationId).toBe('ARR1');
  });

  it('derives a departure task when only a departing reservation exists for that day', () => {
    const departing = reservation({ id: 'DEP2', arrival: '2026-09-20', departure: `${TODAY}T10:00:00Z` });
    const tasks = buildTasks({
      propertyNames: { [PROPERTY]: 'Laeke' },
      units: [unit('LAEKE-101', '101')],
      reservations: [departing],
      doubleups: {},
      days: [TODAY],
      today: TODAY,
    });

    expect(tasks).toHaveLength(1);
    expect(tasks[0].type).toBe('departure');
    expect(tasks[0].id).toBe(taskId(PROPERTY, 'LAEKE-101', TODAY, 'departure', 'DEP2'));
  });

  it('derives a stayover task only when INTERCLEAN is booked for exactly that day', () => {
    const occupied = reservation({
      id: 'STAY1',
      arrival: '2026-09-20',
      departure: '2026-09-30',
      services: [{ service: { code: 'INTERCLEAN' }, dates: [{ serviceDate: TODAY }] }],
    });
    const tasks = buildTasks({
      propertyNames: { [PROPERTY]: 'Laeke' },
      units: [unit('LAEKE-101', '101')],
      reservations: [occupied],
      doubleups: {},
      days: [TODAY],
      today: TODAY,
    });

    expect(tasks).toHaveLength(1);
    expect(tasks[0].type).toBe('stayover');
    expect(tasks[0].id).toBe(taskId(PROPERTY, 'LAEKE-101', TODAY, 'stayover', 'STAY1'));
  });

  it('does not derive a stayover task for an occupied unit without an INTERCLEAN booking for that day', () => {
    const occupied = reservation({ id: 'STAY2', arrival: '2026-09-20', departure: '2026-09-30' });
    const tasks = buildTasks({
      propertyNames: { [PROPERTY]: 'Laeke' },
      units: [unit('LAEKE-101', '101')],
      reservations: [occupied],
      doubleups: {},
      days: [TODAY],
      today: TODAY,
    });

    expect(tasks).toHaveLength(0);
  });

  it('derives an extra task for today only, when a doubleup is registered but no cleaning is otherwise due', () => {
    const tasks = buildTasks({
      propertyNames: { [PROPERTY]: 'Laeke' },
      units: [unit('LAEKE-102', '102')],
      reservations: [],
      doubleups: { [`${PROPERTY}_102`]: { types: ['crib'] } },
      days: [TODAY],
      today: TODAY,
    });

    expect(tasks).toHaveLength(1);
    expect(tasks[0].type).toBe('extra');
    expect(tasks[0].doubleupTypes).toEqual(['crib']);
  });

  // Regressionstest fuer den Maskierungs-Bug (siehe Fix-Commit): eine Turnover-Aufgabe hat ZWEI
  // Reservierungen, aber bookingChanges ist ein Redis-Datensatz je reservationId - vor dem Fix
  // gewann die abreisende Seite IMMER (`bookingChanges[departingRes.id] || bookingChanges[...]`),
  // auch wenn die Aenderung der ankommenden Reservierung tatsaechlich die spaetere war.
  describe('turnover bookingChange resolution (moreRecentChange)', () => {
    const departing = reservation({ id: 'DEP3', arrival: '2026-09-20', departure: `${TODAY}T10:00:00Z` });
    const arriving = reservation({ id: 'ARR3', arrival: `${TODAY}T15:00:00Z`, departure: '2026-09-28' });

    function change(reservationId: string, changedAt: number): BookingChangeRecord {
      return { reservationId, changedAt, unitFrom: 'A', unitTo: 'B' };
    }

    it('prefers the arriving reservation change when it is strictly more recent', () => {
      const tasks = buildTasks({
        propertyNames: { [PROPERTY]: 'Laeke' },
        units: [unit('LAEKE-101', '101')],
        reservations: [departing, arriving],
        doubleups: {},
        days: [TODAY],
        today: TODAY,
        bookingChanges: { DEP3: change('DEP3', 1000), ARR3: change('ARR3', 2000) },
      });
      expect(tasks[0].bookingChange?.reservationId).toBe('ARR3');
    });

    it('prefers the departing reservation change when it is strictly more recent', () => {
      const tasks = buildTasks({
        propertyNames: { [PROPERTY]: 'Laeke' },
        units: [unit('LAEKE-101', '101')],
        reservations: [departing, arriving],
        doubleups: {},
        days: [TODAY],
        today: TODAY,
        bookingChanges: { DEP3: change('DEP3', 3000), ARR3: change('ARR3', 2000) },
      });
      expect(tasks[0].bookingChange?.reservationId).toBe('DEP3');
    });

    it('falls back to the departing reservation change on an exact changedAt tie', () => {
      const tasks = buildTasks({
        propertyNames: { [PROPERTY]: 'Laeke' },
        units: [unit('LAEKE-101', '101')],
        reservations: [departing, arriving],
        doubleups: {},
        days: [TODAY],
        today: TODAY,
        bookingChanges: { DEP3: change('DEP3', 1500), ARR3: change('ARR3', 1500) },
      });
      expect(tasks[0].bookingChange?.reservationId).toBe('DEP3');
    });

    it('uses the arriving reservation change when the departing side has none', () => {
      const tasks = buildTasks({
        propertyNames: { [PROPERTY]: 'Laeke' },
        units: [unit('LAEKE-101', '101')],
        reservations: [departing, arriving],
        doubleups: {},
        days: [TODAY],
        today: TODAY,
        bookingChanges: { ARR3: change('ARR3', 1500) },
      });
      expect(tasks[0].bookingChange?.reservationId).toBe('ARR3');
    });

    it('is null when neither side has a booking change', () => {
      const tasks = buildTasks({
        propertyNames: { [PROPERTY]: 'Laeke' },
        units: [unit('LAEKE-101', '101')],
        reservations: [departing, arriving],
        doubleups: {},
        days: [TODAY],
        today: TODAY,
        bookingChanges: {},
      });
      expect(tasks[0].bookingChange).toBeNull();
    });
  });
});
