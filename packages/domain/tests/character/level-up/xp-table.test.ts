import { describe, expect, it } from 'vitest';
import {
  XP_THRESHOLDS,
  xpForLevel,
  levelForXp,
  canReachLevel,
} from '../../../src/character/level-up/xp-table.js';

describe('XP_THRESHOLDS — PHB p.15', () => {
  it('tiene 20 niveles', () => {
    expect(XP_THRESHOLDS).toHaveLength(20);
  });
  it.each([
    [1, 0],
    [2, 300],
    [5, 6500],
    [10, 64000],
    [20, 355000],
  ])('level %i = %i XP', (level, xp) => {
    expect(xpForLevel(level)).toBe(xp);
  });
});

describe('levelForXp', () => {
  it.each([
    [0, 1],
    [299, 1],
    [300, 2],
    [899, 2],
    [900, 3],
    [354_999, 19],
    [355_000, 20],
    [1_000_000, 20], // clamp a 20
    [-1, 1], // edge: negativo
  ])('xp %i → level %i', (xp, level) => {
    expect(levelForXp(xp)).toBe(level);
  });
});

describe('canReachLevel', () => {
  it('null si tiene XP suficiente', () => {
    expect(canReachLevel(300, 2)).toBeNull();
    expect(canReachLevel(2700, 4)).toBeNull();
  });
  it('reporta missing si falta XP', () => {
    expect(canReachLevel(200, 2)).toEqual({ required: 300, current: 200, missing: 100 });
    expect(canReachLevel(0, 3)).toEqual({ required: 900, current: 0, missing: 900 });
  });
});

describe('xpForLevel — fuera de rango', () => {
  it('throws para level 0', () => {
    expect(() => xpForLevel(0)).toThrow();
  });
  it('throws para level 21', () => {
    expect(() => xpForLevel(21)).toThrow();
  });
});
