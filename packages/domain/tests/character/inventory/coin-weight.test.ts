import { describe, it, expect } from 'vitest';
import { coinWeight } from '../../../src/character/inventory/coin-weight.js';

// PHB 2014 p.143: "Coins are small and light; 50 coins weigh 1 pound."
// Denominations: cp, sp, ep, gp, pp — all treated equally for weight purposes.

describe('coinWeight', () => {
  it('zero coins → 0 lb', () => {
    expect(coinWeight({ cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 })).toBe(0);
  });

  it('exactly 50 cp → 1 lb', () => {
    // PHB p.143: 50 coins = 1 lb.
    expect(coinWeight({ cp: 50 })).toBe(1);
  });

  it('25 cp + 25 sp (50 total) → 1 lb (mixed denominations sum)', () => {
    // Each denomination counts as 1 coin toward the 50-coin-per-lb rule.
    expect(coinWeight({ cp: 25, sp: 25 })).toBe(1);
  });

  it('49 coins → 0 lb (floor, not round)', () => {
    // Floor division: 49 / 50 = 0.98 → 0 lb.
    expect(coinWeight({ cp: 49 })).toBe(0);
  });

  it('missing/null currency → 0 lb (safe fallback)', () => {
    expect(coinWeight(null)).toBe(0);
    expect(coinWeight(undefined)).toBe(0);
    expect(coinWeight({})).toBe(0);
  });

  it('5000 coins (100 gp × 50) → 100 lb', () => {
    // 5000 / 50 = 100.
    expect(coinWeight({ gp: 5000 })).toBe(100);
  });
});
