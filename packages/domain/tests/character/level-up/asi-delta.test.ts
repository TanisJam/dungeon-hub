import { describe, expect, it } from 'vitest';
import { validateAsiDelta } from '../../../src/character/level-up/asi-delta-validator.js';
import type { AbilityScores } from '../../../src/character/stats/types.js';

// REQ-CLU-ASI-DELTA-CONSTRAINT (spec §):
// +2 to one ability OR +1 to two distinct abilities. Sum=2. Each resulting score ≤20.

const BASE_SCORES: AbilityScores = { str: 14, dex: 14, con: 14, int: 14, wis: 14, cha: 14 };

describe('validateAsiDelta', () => {
  it('DELTA-1: +2 a un solo atributo es válido', () => {
    const result = validateAsiDelta({ str: 2 }, BASE_SCORES);
    expect(result.ok).toBe(true);
  });

  it('DELTA-2: +1 a dos atributos distintos es válido', () => {
    const result = validateAsiDelta({ str: 1, dex: 1 }, BASE_SCORES);
    expect(result.ok).toBe(true);
  });

  it('DELTA-3: +3 a un atributo falla (sum > 2)', () => {
    const result = validateAsiDelta({ str: 3 }, BASE_SCORES);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('ASI_DELTA_INVALID');
  });

  it('DELTA-4: +1 a tres atributos distintos falla (sum > 2)', () => {
    const result = validateAsiDelta({ str: 1, dex: 1, con: 1 }, BASE_SCORES);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('ASI_DELTA_INVALID');
  });

  it('DELTA-5: score resultante > 20 falla (cap violado)', () => {
    // STR 20 + 1 = 21 → inválido
    const highScores: AbilityScores = { ...BASE_SCORES, str: 20 };
    const result = validateAsiDelta({ str: 1, dex: 1 }, highScores);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('ASI_DELTA_INVALID');
  });

  it('DELTA-6: score resultante exactamente 20 es válido (límite del cap)', () => {
    // STR 19 + 1 = 20 → válido
    const scores: AbilityScores = { ...BASE_SCORES, str: 19 };
    const result = validateAsiDelta({ str: 1, dex: 1 }, scores);
    expect(result.ok).toBe(true);
  });
});
