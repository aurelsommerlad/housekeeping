import { describe, it, expect } from 'vitest';
import { dateOnly, fieldChanged, normalizeForCompare, hasRealChange } from './_booking-change-compare.js';

describe('dateOnly', () => {
  it('truncates a full ISO timestamp to the calendar day', () => {
    expect(dateOnly('2026-09-23T15:00:00Z')).toBe('2026-09-23');
  });

  it('is idempotent on an already-truncated date', () => {
    expect(dateOnly('2026-09-23')).toBe('2026-09-23');
  });

  it('returns null for falsy input', () => {
    expect(dateOnly(null)).toBeNull();
    expect(dateOnly(undefined)).toBeNull();
    expect(dateOnly('')).toBeNull();
  });
});

describe('fieldChanged', () => {
  it('is true when both sides are known and different', () => {
    expect(fieldChanged('2026-09-23', '2026-09-24')).toBe(true);
  });

  it('is false when both sides are known and identical', () => {
    expect(fieldChanged('2026-09-23', '2026-09-23')).toBe(false);
  });

  it('is false when either side is missing (null/undefined) - not a real change', () => {
    expect(fieldChanged(null, '2026-09-23')).toBe(false);
    expect(fieldChanged('2026-09-23', null)).toBe(false);
    expect(fieldChanged(undefined, undefined)).toBe(false);
    expect(fieldChanged(null, null)).toBe(false);
  });
});

describe('normalizeForCompare', () => {
  it('normalizes date-kind values via dateOnly', () => {
    expect(normalizeForCompare('date', '2026-09-23T18:00:00Z')).toBe('2026-09-23');
  });

  it('normalizes number-kind values to Number, even from a string', () => {
    expect(normalizeForCompare('number', '4')).toBe(4);
    expect(normalizeForCompare('number', 4)).toBe(4);
  });

  it('passes other kinds through unchanged', () => {
    expect(normalizeForCompare('string', 'UNIT-1')).toBe('UNIT-1');
  });

  it('leaves null/undefined untouched regardless of kind', () => {
    expect(normalizeForCompare('date', null)).toBeNull();
    expect(normalizeForCompare('number', undefined)).toBeUndefined();
  });
});

describe('hasRealChange', () => {
  it('is false for a null/undefined record', () => {
    expect(hasRealChange(null)).toBe(false);
    expect(hasRealChange(undefined)).toBe(false);
  });

  it('is false for a record with no *From/*To pair at all', () => {
    expect(hasRealChange({ reservationId: 'r1', changedAt: 123 })).toBe(false);
  });

  it('is true for a genuine arrival-date change', () => {
    expect(hasRealChange({ arrivalFrom: '2026-09-23', arrivalTo: '2026-09-24' })).toBe(true);
  });

  // Regressionstest fuer den live reproduzierten Bug ("17.09. -> 17.09."): ein Alt-Datensatz mit
  // identischem Kalendertag, aber unterschiedlicher Uhrzeit, darf NICHT als Aenderung gelten.
  it('is false when a stale record only differs in time-of-day on the same calendar day', () => {
    expect(hasRealChange({ arrivalFrom: '2026-09-17T15:00:00Z', arrivalTo: '2026-09-17T18:00:00Z' })).toBe(false);
  });

  it('is true for a genuine adults-count change even as strings (legacy record)', () => {
    expect(hasRealChange({ adultsFrom: '2', adultsTo: '3' })).toBe(true);
  });

  it('is false when adults count is identical as string vs. number (legacy record)', () => {
    expect(hasRealChange({ adultsFrom: '2', adultsTo: 2 })).toBe(false);
  });

  it('is true for a genuine unit change', () => {
    expect(hasRealChange({ unitFrom: 'UNIT-1', unitTo: 'UNIT-2' })).toBe(true);
  });

  // hasRealChange() selbst schuetzt nur gegen ein Paar, das nach Normalisierung auf BEIDEN Seiten
  // vorhanden, aber identisch ist (der live reproduzierte Stale-Record-Bug oben) - ein Paar mit nur
  // einer bekannten Seite wird als Aenderung gewertet (die eigentliche Absicherung gegen genau
  // diesen Fall liegt bereits eine Ebene frueher in fieldChanged(), das beim SCHREIBEN verhindert,
  // dass ein solches unvollstaendiges Paar ueberhaupt jemals gespeichert wird).
  it('treats a pair with only one known side as changed (guarded at write time by fieldChanged instead)', () => {
    expect(hasRealChange({ arrivalFrom: '2026-09-23' })).toBe(true);
  });
});
