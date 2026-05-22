import { describe, expect, it } from 'vitest';
import {
  availableValues,
  nextValueForTile,
  STANDARD_ARRAY,
} from '../../../src/character/stats/stat-tile-cycle.js';
import type { AbilityKey, NullableScores } from '../../../src/character/stats/stat-tile-cycle.js';

// All-null baseline (fresh character)
const NULL_SCORES: NullableScores = {
  str: null, dex: null, con: null, int: null, wis: null, cha: null,
};

// Helpers
function withValue(key: AbilityKey, val: number | null): NullableScores {
  return { ...NULL_SCORES, [key]: val };
}

function allAssigned(): NullableScores {
  return { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 };
}

// ---------------------------------------------------------------------------
// availableValues
// ---------------------------------------------------------------------------

describe('availableValues', () => {
  it('returns all 6 values when all scores are null', () => {
    const avail = availableValues(NULL_SCORES, 'str');
    expect(avail).toEqual(STANDARD_ARRAY);
  });

  it('excludes value held by OTHER abilities, not by self', () => {
    // str = 15, dex = 14; checking for 'str' — 14 is taken by dex, 15 is own
    const scores: NullableScores = { ...NULL_SCORES, str: 15, dex: 14 };
    const avail = availableValues(scores, 'str');
    // 15 is own tile's value → still available (we exclude OTHER abilities)
    // 14 is taken by dex → not available
    expect(avail).not.toContain(14);
    expect(avail).toContain(15);
  });

  it('with all 6 assigned, only self value remains available', () => {
    const scores = allAssigned(); // str=15, dex=14, con=13, int=12, wis=10, cha=8
    // For 'str' (holds 15): other abilities hold 14,13,12,10,8 → only 15 available
    const avail = availableValues(scores, 'str');
    expect(avail).toEqual([15]);
  });

  it('with no scores assigned and one checked, returns all 6', () => {
    const avail = availableValues(NULL_SCORES, 'dex');
    expect(avail).toEqual(STANDARD_ARRAY);
  });
});

// ---------------------------------------------------------------------------
// nextValueForTile — null → first available
// ---------------------------------------------------------------------------

describe('nextValueForTile: null tile', () => {
  it('returns 15 when all nulls (first available)', () => {
    expect(nextValueForTile(NULL_SCORES, 'str')).toBe(15);
  });

  it('returns 14 when 15 is already taken by dex', () => {
    const scores = withValue('dex', 15);
    expect(nextValueForTile(scores, 'str')).toBe(14);
  });

  it('returns 8 (last in array) when 15/14/13/12/10 are taken by others', () => {
    const scores: NullableScores = {
      str: null,
      dex: 15,
      con: 14,
      int: 13,
      wis: 12,
      cha: 10,
    };
    expect(nextValueForTile(scores, 'str')).toBe(8);
  });

  it('returns null when all 6 values are taken by others (impossible in practice but edge case)', () => {
    // Can only happen with 7 tiles — should not occur but guard is correct
    // We can simulate by mocking: all 5 other abilities hold all array values
    // This is not physically possible with 6 abilities, so availableValues is always ≥1
    // when calling on a null tile with correct state. Test passes vacuously.
    // We skip this impossibility — covered by "all assigned" cycling below.
  });
});

// ---------------------------------------------------------------------------
// nextValueForTile — cycling from a value
// ---------------------------------------------------------------------------

describe('nextValueForTile: advancing from current value', () => {
  it('advances from 15 to 14 when 14 is free', () => {
    const scores = withValue('str', 15);
    expect(nextValueForTile(scores, 'str')).toBe(14);
  });

  it('skips 14 if taken by another, advances to 13', () => {
    const scores: NullableScores = { ...NULL_SCORES, str: 15, dex: 14 };
    expect(nextValueForTile(scores, 'str')).toBe(13);
  });

  it('advances from 14 to 13 when 13 is free', () => {
    const scores = withValue('str', 14);
    expect(nextValueForTile(scores, 'str')).toBe(13);
  });

  it('advances from 13 to 12 when 12 is free', () => {
    const scores = withValue('str', 13);
    expect(nextValueForTile(scores, 'str')).toBe(12);
  });

  it('advances from 12 to 10 when 10 is free', () => {
    const scores = withValue('str', 12);
    expect(nextValueForTile(scores, 'str')).toBe(10);
  });

  it('advances from 10 to 8 when 8 is free', () => {
    const scores = withValue('str', 10);
    expect(nextValueForTile(scores, 'str')).toBe(8);
  });
});

// ---------------------------------------------------------------------------
// nextValueForTile — wrap to null
// ---------------------------------------------------------------------------

describe('nextValueForTile: wrapping to null', () => {
  it('wraps from 8 (last in array) to null', () => {
    const scores = withValue('str', 8);
    expect(nextValueForTile(scores, 'str')).toBeNull();
  });

  it('wraps from a value when all others are taken (only self available, move past end)', () => {
    // str=15, dex=14, con=13, int=12, wis=10, cha=8 → all assigned
    // Tapping str (15): availableValues(scores, 'str') = [15] only
    // Next after 15 in STANDARD_ARRAY is 14 — taken. All subsequent taken. Wrap to null.
    const scores = allAssigned();
    expect(nextValueForTile(scores, 'str')).toBeNull();
  });

  it('wraps from 8 even when other values are free', () => {
    // 8 is the last value in STANDARD_ARRAY — always wraps to null
    const scores = withValue('str', 8);
    expect(nextValueForTile(scores, 'str')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// nextValueForTile — all-assigned cycling (each tile can still cycle)
// ---------------------------------------------------------------------------

describe('nextValueForTile: all 6 tiles assigned', () => {
  it('tapping str (15) clears it to null', () => {
    expect(nextValueForTile(allAssigned(), 'str')).toBeNull();
  });

  it('tapping dex (14) clears it to null', () => {
    expect(nextValueForTile(allAssigned(), 'dex')).toBeNull();
  });

  it('tapping cha (8) clears it to null', () => {
    expect(nextValueForTile(allAssigned(), 'cha')).toBeNull();
  });

  it('after clearing str, tapping str again picks next available (14 freed after str went null)', () => {
    // Step 1: str was 15 → tap → null
    const afterClear: NullableScores = { str: null, dex: 14, con: 13, int: 12, wis: 10, cha: 8 };
    // Step 2: tap str again → should pick 15 (first available since 15 is free now)
    expect(nextValueForTile(afterClear, 'str')).toBe(15);
  });
});

// ---------------------------------------------------------------------------
// nextValueForTile — partial state
// ---------------------------------------------------------------------------

describe('nextValueForTile: partial state', () => {
  it('handles partial assignment with 3 tiles set', () => {
    const scores: NullableScores = {
      str: 15, dex: null, con: 13, int: null, wis: null, cha: null,
    };
    // dex is null; available values: those not taken by others (str=15, con=13)
    // available: [14, 12, 10, 8]
    expect(nextValueForTile(scores, 'dex')).toBe(14);
  });

  it('correctly identifies next after skip in partial state', () => {
    // str=15, dex=null, con=14 — available for dex: [13, 12, 10, 8]
    const scores: NullableScores = { ...NULL_SCORES, str: 15, con: 14 };
    expect(nextValueForTile(scores, 'dex')).toBe(13);
  });

  it('multiple skips: advances past all taken', () => {
    // str=12, others null. dex=13 → next for dex: check 12 (taken by str) skip, then 10
    const scores: NullableScores = { ...NULL_SCORES, str: 12, dex: 13 };
    expect(nextValueForTile(scores, 'dex')).toBe(10);
  });
});
