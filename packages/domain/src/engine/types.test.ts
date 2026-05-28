/**
 * Tests for ProficiencyMod type guard — engine/types.ts
 *
 * REQ-PROF-01: ProficiencyMod — 10th modifier kind (Scenario: Homebrew ref passes)
 *
 * Phase 1 isolated: only the type + guard are tested here, NO resolveStat touch.
 * resolveStat integration is Phase 2 (resolve/stat.test.ts).
 */
import { describe, it, expect } from 'vitest';
import { isProficiencyMod } from './types.js';
import type { Modifier } from './types.js';

describe('isProficiencyMod — type guard (REQ-PROF-01)', () => {
  it('returns true for a valid ProficiencyMod shape (homebrew ref)', () => {
    // REQ-PROF-01: free string on ref — homebrew skill "lore-of-the-ancients" MUST pass
    const mod: Modifier = {
      kind: 'proficiency',
      domain: 'skill',
      ref: 'lore-of-the-ancients',
    };
    expect(isProficiencyMod(mod)).toBe(true);
  });

  it('returns false for a NumMod (kind: "num")', () => {
    const mod: Modifier = { kind: 'num', op: 'add', value: 2, stat: 'str', category: 'item' };
    expect(isProficiencyMod(mod)).toBe(false);
  });
});
