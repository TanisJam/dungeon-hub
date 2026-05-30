/**
 * Tests for ProficiencyMod type guard — engine/types.ts
 *
 * REQ-PROF-01: ProficiencyMod — 10th modifier kind (Scenario: Homebrew ref passes)
 *
 * Phase 1 isolated: only the type + guard are tested here, NO resolveStat touch.
 * resolveStat integration is Phase 2 (resolve/stat.test.ts).
 *
 * REQ-ERB-TYPES-02: 'on-incoming-attack' added to Trigger union.
 * REQ-ERB-TYPES-03: { kind:'ac-bonus', value:number } added to ReactionEffect union.
 *
 * PHB p.275 — Shield: "+5 bonus to AC until the start of your next turn, including
 *   against the triggering attack." Reaction triggered WHEN HIT by an attack.
 */
import { describe, it, expect } from 'vitest';
import { isProficiencyMod } from './types.js';
import type { Modifier, EndCondition, Trigger, ReactionEffect } from './types.js';

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

// ── Trigger widening (REQ-ERB-TYPES-02) ──────────────────────────────────────

describe("Trigger — 'on-incoming-attack' (REQ-ERB-TYPES-02)", () => {
  it("'on-incoming-attack' is a valid Trigger value", () => {
    // GIVEN the widened Trigger union
    const t: Trigger = 'on-incoming-attack';
    expect(t).toBe('on-incoming-attack');
  });

  it('existing trigger values still valid (non-breaking widening)', () => {
    // ADR-2: additive widening — all pre-existing values must remain assignable
    const existing: Trigger[] = [
      'always',
      'on-attack-roll',
      'on-save',
      'on-cast',
      'on-attacked',
      'on-hit',
      'on-damage',
    ];
    for (const t of existing) {
      expect(typeof t).toBe('string');
    }
    expect(existing).toHaveLength(7);
  });
});

// ── ReactionEffect widening (REQ-ERB-TYPES-03) ───────────────────────────────

describe('ReactionEffect — ac-bonus variant (REQ-ERB-TYPES-03)', () => {
  it("{ kind: 'ac-bonus', value: 5 } is a valid ReactionEffect (PHB p.275 Shield +5)", () => {
    // PHB p.275: Shield grants +5 bonus to AC — this effect encodes that bonus
    const effect: ReactionEffect = { kind: 'ac-bonus', value: 5 };
    expect(effect.kind).toBe('ac-bonus');
    expect((effect as { kind: 'ac-bonus'; value: number }).value).toBe(5);
  });

  it("existing counter variant unchanged — { kind: 'counter', autoIfSlotGe: 3 } still valid (ADR-2)", () => {
    // PHB p.228: Counterspell counter arm must remain byte-identical
    const effect: ReactionEffect = { kind: 'counter', autoIfSlotGe: 3 };
    expect(effect.kind).toBe('counter');
    expect((effect as { kind: 'counter'; autoIfSlotGe: number }).autoIfSlotGe).toBe(3);
  });

  it('exhaustive switch on ReactionEffect handles both arms (counter + ac-bonus)', () => {
    // Compile-time: this function fails tsc if either arm is missing.
    // Executed at runtime to verify narrowing works correctly.
    function handle(effect: ReactionEffect): string {
      switch (effect.kind) {
        case 'counter':
          return `counter-ge${effect.autoIfSlotGe}`;
        case 'ac-bonus':
          return `ac+${effect.value}`;
        default: {
          const _exhaustive: never = effect;
          return _exhaustive;
        }
      }
    }

    expect(handle({ kind: 'counter', autoIfSlotGe: 2 })).toBe('counter-ge2');
    expect(handle({ kind: 'ac-bonus', value: 5 })).toBe('ac+5');
  });
});
