import { describe, expect, it } from 'vitest';
import { validateStats } from '../../../src/character/stats/validate.js';
import type {
  AbilityScores,
  StatGenerationMethod,
} from '../../../src/character/stats/types.js';
import type { StatGeneration } from '../../../src/rules-profile/types.js';

const ALL_ALLOWED: StatGeneration = { standardArray: true, pointBuy: true, roll: true };

const make = (overrides: Partial<AbilityScores> = {}): AbilityScores => ({
  str: 8,
  dex: 10,
  con: 12,
  int: 13,
  wis: 14,
  cha: 15,
  ...overrides,
});

describe('validateStats — method gating', () => {
  it('rechaza un método deshabilitado por la campaña', () => {
    const res = validateStats(make(), 'roll', {
      standardArray: true,
      pointBuy: true,
      roll: false,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.issues[0]?.code).toBe('STAT_METHOD_NOT_ALLOWED');
    if (res.issues[0]?.code === 'STAT_METHOD_NOT_ALLOWED') {
      expect(res.issues[0].allowed).toEqual(['standard-array', 'point-buy']);
    }
  });

  it.each<StatGenerationMethod>(['standard-array', 'point-buy', 'roll'])(
    'acepta el método "%s" cuando está habilitado',
    (method) => {
      // Usamos scores válidos para todos los métodos:
      // standard array 15-14-13-12-10-8 cumple también point buy 27 si los costos lo permiten
      // pero point buy max es 15 y 15+14+...=72 cost = 9+7+5+4+2+0 = 27 ✓
      const scores: AbilityScores = { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 };
      const res = validateStats(scores, method, ALL_ALLOWED);
      expect(res.ok).toBe(true);
    },
  );
});

describe('validateStats — standard array', () => {
  it('acepta el set canónico en cualquier orden', () => {
    const scores: AbilityScores = { str: 8, dex: 15, con: 10, int: 13, wis: 14, cha: 12 };
    expect(validateStats(scores, 'standard-array', ALL_ALLOWED).ok).toBe(true);
  });

  it('rechaza si falta un valor del set', () => {
    const scores: AbilityScores = { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 9 }; // 9 en vez de 8
    const res = validateStats(scores, 'standard-array', ALL_ALLOWED);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.issues[0]?.code).toBe('STANDARD_ARRAY_MISMATCH');
  });

  it('rechaza si hay duplicados', () => {
    const scores: AbilityScores = { str: 15, dex: 14, con: 14, int: 12, wis: 10, cha: 8 };
    const res = validateStats(scores, 'standard-array', ALL_ALLOWED);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.issues[0]?.code).toBe('STANDARD_ARRAY_MISMATCH');
  });
});

describe('validateStats — point buy', () => {
  it('acepta exactamente 27 puntos gastados', () => {
    // 15 (9) + 14 (7) + 13 (5) + 12 (4) + 10 (2) + 8 (0) = 27
    const scores: AbilityScores = { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 };
    expect(validateStats(scores, 'point-buy', ALL_ALLOWED).ok).toBe(true);
  });

  it('rechaza score < 8', () => {
    const scores = make({ str: 7 });
    const res = validateStats(scores, 'point-buy', ALL_ALLOWED);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.issues[0]?.code).toBe('POINT_BUY_SCORE_OUT_OF_RANGE');
      if (res.issues[0]?.code === 'POINT_BUY_SCORE_OUT_OF_RANGE') {
        expect(res.issues[0].key).toBe('str');
      }
    }
  });

  it('rechaza score > 15', () => {
    const scores = make({ cha: 16 });
    const res = validateStats(scores, 'point-buy', ALL_ALLOWED);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.issues[0]?.code).toBe('POINT_BUY_SCORE_OUT_OF_RANGE');
    }
  });

  it('rechaza total > 27', () => {
    // 15 (9) + 15 (9) + 15 (9) + 8 (0) + 8 (0) + 8 (0) = 27 ✓ — armamos algo mayor
    // 15+15+13+12+10+8 = 9+9+5+4+2+0 = 29
    const scores: AbilityScores = { str: 15, dex: 15, con: 13, int: 12, wis: 10, cha: 8 };
    const res = validateStats(scores, 'point-buy', ALL_ALLOWED);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      const issue = res.issues.find((i) => i.code === 'POINT_BUY_INVALID_TOTAL');
      expect(issue).toBeDefined();
      if (issue?.code === 'POINT_BUY_INVALID_TOTAL') {
        expect(issue.cost).toBe(29);
        expect(issue.budget).toBe(27);
      }
    }
  });

  it('rechaza total < 27', () => {
    // 8 (0) x 6 = 0
    const scores: AbilityScores = { str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 };
    const res = validateStats(scores, 'point-buy', ALL_ALLOWED);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      const issue = res.issues.find((i) => i.code === 'POINT_BUY_INVALID_TOTAL');
      expect(issue).toBeDefined();
      if (issue?.code === 'POINT_BUY_INVALID_TOTAL') expect(issue.cost).toBe(0);
    }
  });
});

describe('validateStats — roll', () => {
  it('acepta cualquier set en [3, 18]', () => {
    const scores: AbilityScores = { str: 18, dex: 3, con: 12, int: 16, wis: 7, cha: 11 };
    expect(validateStats(scores, 'roll', ALL_ALLOWED).ok).toBe(true);
  });

  it('rechaza un score fuera de [3, 18]', () => {
    const scores = make({ str: 19 });
    const res = validateStats(scores, 'roll', ALL_ALLOWED);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.issues[0]?.code).toBe('STAT_OUT_OF_RANGE');
    }
  });

  it('rechaza score < 3', () => {
    const scores = make({ con: 2 });
    const res = validateStats(scores, 'roll', ALL_ALLOWED);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.issues[0]?.code).toBe('STAT_OUT_OF_RANGE');
  });
});
