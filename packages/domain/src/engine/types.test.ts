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
import type { Modifier, EndCondition } from './types.js';

// ── EndCondition type tests (REQ-DUR-REST-01) ─────────────────────────────────
// Compile-time assertions: EndCondition must accept 'short-rest' and 'long-rest'.
// These are event-triggered removal conditions (not read-time evaluateDuration inputs).
// ResetTrigger (types.ts:96) already has these for a DIFFERENT axis — EndCondition
// gets its own copy. PHB p.186 — rest effects.
describe('EndCondition union (REQ-DUR-REST-01)', () => {
  it('accepts short-rest as a valid EndCondition', () => {
    const cond: EndCondition = 'short-rest';
    expect(cond).toBe('short-rest');
  });

  it('accepts long-rest as a valid EndCondition', () => {
    const cond: EndCondition = 'long-rest';
    expect(cond).toBe('long-rest');
  });
});

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
