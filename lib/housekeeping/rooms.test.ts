import { describe, it, expect } from 'vitest';
import { unitCondition } from './rooms';
import type { ApaleoUnit } from './types';

describe('unitCondition', () => {
  // Regressionstest fuer den live reproduzierten Bug ("alle Apartments stehen auf Fertig"): der
  // reale Apaleo-Zustand liegt unter `status.condition`, nicht unter einem Top-Level-`condition`
  // (live gegen den echten Account verifiziert) - ohne den Fix haette jede dieser Einheiten
  // faelschlich 'Clean' zurueckgegeben.
  it("reads the condition from status.condition", () => {
    const unit: ApaleoUnit = { id: 'U1', status: { condition: 'Dirty' } };
    expect(unitCondition(unit)).toBe('Dirty');
  });

  it('passes through CleanToBeInspected unchanged', () => {
    const unit: ApaleoUnit = { id: 'U2', status: { condition: 'CleanToBeInspected' } };
    expect(unitCondition(unit)).toBe('CleanToBeInspected');
  });

  it("falls back to 'Clean' when status is entirely missing", () => {
    const unit: ApaleoUnit = { id: 'U3' };
    expect(unitCondition(unit)).toBe('Clean');
  });

  it("falls back to 'Clean' when status.condition is missing", () => {
    const unit: ApaleoUnit = { id: 'U4', status: { isOccupied: true } };
    expect(unitCondition(unit)).toBe('Clean');
  });
});
