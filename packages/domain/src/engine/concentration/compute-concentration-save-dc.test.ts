/**
 * TDD tests — engine-concentration-break-damage (Batch A, Task A1)
 *
 * Covers:
 *   - REQ-CB-02: DC formula (PHB p.203)
 *
 * Strict TDD — tests written RED first, each RED→GREEN cycle documented.
 *
 * PHB p.203 — DC formula:
 *   "The DC equals 10 or half the damage you take, whichever number is higher."
 *   computeConcentrationSaveDc(finalDamage) = max(10, floor(finalDamage / 2))
 */
import { describe, it, expect } from 'vitest';
import { computeConcentrationSaveDc } from './compute-concentration-save-dc.js';

describe('computeConcentrationSaveDc — REQ-CB-02 (PHB p.203)', () => {
  // PHB p.203 — DC = 10 or half the damage taken, whichever is higher

  it('finalDamage=0 → DC 10 (guard: zero damage, max wins)', () => {
    expect(computeConcentrationSaveDc(0)).toBe(10);
  });

  it('finalDamage=8 → DC 10 (floor(8/2)=4 < 10, max wins)', () => {
    expect(computeConcentrationSaveDc(8)).toBe(10);
  });

  it('finalDamage=19 → DC 10 (floor(19/2)=9 < 10, max wins)', () => {
    expect(computeConcentrationSaveDc(19)).toBe(10);
  });

  it('finalDamage=20 → DC 10 (floor(20/2)=10, max(10,10)=10)', () => {
    expect(computeConcentrationSaveDc(20)).toBe(10);
  });

  it('finalDamage=21 → DC 10 (floor(21/2)=10, max(10,10)=10)', () => {
    expect(computeConcentrationSaveDc(21)).toBe(10);
  });

  it('finalDamage=22 → DC 11 (floor(22/2)=11 > 10, half wins)', () => {
    expect(computeConcentrationSaveDc(22)).toBe(11);
  });

  it('finalDamage=30 → DC 15 (floor(30/2)=15 > 10, half wins)', () => {
    expect(computeConcentrationSaveDc(30)).toBe(15);
  });

  it('finalDamage=50 → DC 25 (floor(50/2)=25 > 10, half wins)', () => {
    expect(computeConcentrationSaveDc(50)).toBe(25);
  });
});
