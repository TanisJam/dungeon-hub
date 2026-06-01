/**
 * Tests for rollStartingGold()
 *
 * Strict TDD — tests written BEFORE production code.
 *
 * REQ-SEQUIP-06 (PHB p.143 "Starting Wealth by Class"):
 * - Fighter: 5d4 × 10 gp (range: 50–200 gp)
 * - Wizard:  4d4 × 10 gp (range: 40–160 gp)
 *
 * ADR-3: RNG is injected — deterministic stubs used in tests.
 *
 * Dice formula: "{@dice 5d4 × 10|5d4 × 10|Starting Gold}" — the parser (parseGoldAlternative)
 * already strips the wrapper; rollStartingGold receives the dice expr "5d4 × 10".
 *
 * d4 range: 1–4. Formula: each die = Math.floor(rng() * 4) + 1 (maps [0,1) → 1..4).
 * Sum all dice rolls, then multiply by the multiplier integer after "×".
 */

import { describe, expect, it } from 'vitest';
// Imported after RED — will fail until roll-gold.ts exists
import { rollStartingGold } from './roll-gold.js';

describe('rollStartingGold', () => {
  it('returns the sum of rolled dice × multiplier (all max — 5d4×10 = 200)', () => {
    // PHB p.143 — Fighter max: 5 × 4 × 10 = 200 gp
    // rng always returns 0.99 → floor(0.99 × 4) + 1 = 4
    const maxRng = () => 0.99;
    expect(rollStartingGold('5d4 × 10', maxRng)).toBe(200);
  });

  it('returns min value for all-min rolls (5d4×10 = 50)', () => {
    // PHB p.143 — Fighter min: 5 × 1 × 10 = 50 gp
    // rng always returns 0 → floor(0 × 4) + 1 = 1
    const minRng = () => 0;
    expect(rollStartingGold('5d4 × 10', minRng)).toBe(50);
  });

  it('handles Wizard 4d4×10 — max = 160 (PHB p.143)', () => {
    const maxRng = () => 0.99;
    expect(rollStartingGold('4d4 × 10', maxRng)).toBe(160);
  });

  it('handles Wizard 4d4×10 — min = 40 (PHB p.143)', () => {
    const minRng = () => 0;
    expect(rollStartingGold('4d4 × 10', minRng)).toBe(40);
  });

  it('calls rng exactly N times for NdY dice expression', () => {
    // 5d4 → 5 calls to rng()
    let callCount = 0;
    const countingRng = () => { callCount++; return 0.5; };
    rollStartingGold('5d4 × 10', countingRng);
    expect(callCount).toBe(5);
  });

  it('produces mid-value with rng=0.5 for 5d4×10 (floor(0.5×4)+1 = 3 per die → 3×5×10 = 150)', () => {
    // Each die: floor(0.5 × 4) + 1 = floor(2) + 1 = 3
    // Sum: 3 × 5 = 15; × 10 = 150
    const midRng = () => 0.5;
    expect(rollStartingGold('5d4 × 10', midRng)).toBe(150);
  });

  it('produces a value in range [50, 200] for any valid rng on 5d4×10', () => {
    // Sanity check with Math.random-like values
    const deterministicRng = (() => {
      // LCG sequence for determinism
      let seed = 42;
      return () => {
        seed = (seed * 1664525 + 1013904223) & 0xffffffff;
        return (seed >>> 0) / 0xffffffff;
      };
    })();
    const result = rollStartingGold('5d4 × 10', deterministicRng);
    expect(result).toBeGreaterThanOrEqual(50);
    expect(result).toBeLessThanOrEqual(200);
  });

  it('handles a "×" multiplier with a Unicode times symbol (not "x")', () => {
    // The 5etools format uses Unicode "×" (U+00D7), not ASCII "x"
    // This test confirms the parser handles the actual character in the dice expr
    const maxRng = () => 0.99;
    expect(rollStartingGold('3d4 × 10', maxRng)).toBe(120); // 3 × 4 × 10
  });

  it('handles d6 dice expressions (for classes using 3d6×10, e.g. Rogue)', () => {
    // Rogue: 4d4 × 10; Barbarian: 2d4 × 10. Generic d-parser must handle any dY.
    // d6: range 1–6; rng=0 → 1; rng=0.99 → 6
    const minRng = () => 0;
    // "2d6 × 10" → 2 × 1 × 10 = 20
    expect(rollStartingGold('2d6 × 10', minRng)).toBe(20);
    const maxRng = () => 0.99;
    // "2d6 × 10" → 2 × 6 × 10 = 120
    expect(rollStartingGold('2d6 × 10', maxRng)).toBe(120);
  });
});
