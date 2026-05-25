/**
 * Unit tests for spell metadata parsers.
 *
 * Covers the 3 shapes of components.m (PHB p.203 — Material components),
 * ritual flag (PHB p.201–202 — Ritual tag), and concentration flag
 * (PHB p.203 — Concentration).
 *
 * Discovery obs #678: components.m has exactly 3 shapes in 5etools data:
 *   1. absent/undefined — no material component
 *   2. string — non-costly material
 *   3. object { text, cost, consume? } — costly material
 *
 * REQ-SP02-COMPONENTS-M, REQ-SP02-RITUAL, REQ-SP02-CONCENTRATION (spec #680).
 */
import { describe, expect, it } from 'vitest';
import { parseComponentsM, parseRitual, parseConcentration } from './spells-meta.js';

// ---------------------------------------------------------------------------
// parseComponentsM
// ---------------------------------------------------------------------------
describe('parseComponentsM', () => {
  it('shape 1: absent (undefined) → componentsM=false, cost=null', () => {
    expect(parseComponentsM(undefined)).toEqual({
      componentsM: false,
      componentsMCost: null,
    });
  });

  it('shape 2: string → componentsM=true, cost=null', () => {
    expect(parseComponentsM('a pinch of sulfur')).toEqual({
      componentsM: true,
      componentsMCost: null,
    });
  });

  it('shape 3: object with cost → componentsM=true, cost=50000', () => {
    expect(parseComponentsM({ text: 'diamonds worth 500gp', cost: 50000 })).toEqual({
      componentsM: true,
      componentsMCost: 50000,
    });
  });

  it('shape 3b: object without cost → componentsM=true, cost=null', () => {
    expect(parseComponentsM({ text: 'a gem' })).toEqual({
      componentsM: true,
      componentsMCost: null,
    });
  });
});

// ---------------------------------------------------------------------------
// parseRitual
// ---------------------------------------------------------------------------
describe('parseRitual', () => {
  it('meta with ritual=true → true', () => {
    expect(parseRitual({ ritual: true })).toBe(true);
  });

  it('meta absent (undefined) → false', () => {
    expect(parseRitual(undefined)).toBe(false);
  });

  it('meta without ritual key → false', () => {
    expect(parseRitual({})).toBe(false);
  });

  it('meta with ritual=false → false', () => {
    expect(parseRitual({ ritual: false })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// parseConcentration
// ---------------------------------------------------------------------------
describe('parseConcentration', () => {
  it('single-entry array with concentration=true → true', () => {
    expect(parseConcentration([{ concentration: true }])).toBe(true);
  });

  it('multi-entry array where second has concentration=true → true', () => {
    expect(parseConcentration([{}, { concentration: true }])).toBe(true);
  });

  it('array with no concentration=true entry → false', () => {
    expect(parseConcentration([{}])).toBe(false);
  });

  it('undefined duration → false', () => {
    expect(parseConcentration(undefined)).toBe(false);
  });

  it('empty array → false', () => {
    expect(parseConcentration([])).toBe(false);
  });
});
