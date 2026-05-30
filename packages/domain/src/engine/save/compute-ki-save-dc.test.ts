/**
 * Tests for computeKiSaveDc — Monk ki save DC formula.
 *
 * PHB p.78 — "Ki Save DC":
 *   "Some of your ki features require your target to make a saving throw to resist
 *    the feature's effects. The saving throw DC is calculated as follows:
 *    Ki save DC = 8 + your proficiency bonus + your Wisdom modifier."
 *
 * Strict TDD: test written BEFORE implementation.
 * Design ref: sdd/engine-stunning-strike/design — ADR-3.
 */

import { describe, it, expect } from 'vitest';
import { computeKiSaveDc } from './compute-ki-save-dc.js';

describe('computeKiSaveDc', () => {
  // PHB p.78: Ki save DC = 8 + proficiency bonus + Wisdom modifier

  it('Monk L5 standard (prof=3, wisMod=3 from Wis 16) → DC 14', () => {
    expect(computeKiSaveDc(3, 3)).toBe(14);
  });

  it('Monk L1 minimal (prof=2, wisMod=0 from Wis 10) → DC 10', () => {
    expect(computeKiSaveDc(2, 0)).toBe(10);
  });

  it('Monk L17 high-wisdom (prof=6, wisMod=5 from Wis 20) → DC 19', () => {
    expect(computeKiSaveDc(6, 5)).toBe(19);
  });

  it('negative wisMod (prof=4, wisMod=-1 from Wis 8) → DC 11', () => {
    // PHB p.78 formula: 8 + 4 + (-1) = 11
    expect(computeKiSaveDc(4, -1)).toBe(11);
  });
});
