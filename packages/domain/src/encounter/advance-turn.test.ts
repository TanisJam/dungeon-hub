import { describe, it, expect } from 'vitest';
import { advanceTurn } from './advance-turn.js';

const A = { id: 'A', initiative: 18, insertionOrder: 0, hpCurrent: 30 };
const B = { id: 'B', initiative: 15, insertionOrder: 1, hpCurrent: 7 };
const C = { id: 'C', initiative: 13, insertionOrder: 2, hpCurrent: 22 };

describe('advanceTurn (encounter rotation)', () => {
  it('AT-FORWARD-01: steps to the next lower-initiative alive combatant', () => {
    const r = advanceTurn({
      combatants: [A, B, C],
      currentCombatantId: 'B',
      round: 1,
    });
    expect(r.currentCombatantId).toBe('C');
    expect(r.round).toBe(1);
    expect(r.wrapped).toBe(false);
    expect(r.allDead).toBe(false);
  });

  it('AT-WRAP-INCREMENT-02: wraps to first and increments round when current is last', () => {
    const r = advanceTurn({
      combatants: [A, B, C],
      currentCombatantId: 'C',
      round: 1,
    });
    expect(r.currentCombatantId).toBe('A');
    expect(r.round).toBe(2);
    expect(r.wrapped).toBe(true);
  });

  it('AT-SKIP-DEAD-03: skips combatants with hpCurrent=0', () => {
    const r = advanceTurn({
      combatants: [A, { ...B, hpCurrent: 0 }, C],
      currentCombatantId: 'A',
      round: 1,
    });
    expect(r.currentCombatantId).toBe('C');
    expect(r.round).toBe(1);
    expect(r.wrapped).toBe(false);
  });

  it('AT-ALL-DEAD-EDGE-04: returns current unchanged + allDead when only current is alive', () => {
    const r = advanceTurn({
      combatants: [A, { ...B, hpCurrent: 0 }, { ...C, hpCurrent: 0 }],
      currentCombatantId: 'A',
      round: 1,
    });
    expect(r.currentCombatantId).toBe('A');
    expect(r.round).toBe(1);
    expect(r.wrapped).toBe(false);
    expect(r.allDead).toBe(true);
  });
});
