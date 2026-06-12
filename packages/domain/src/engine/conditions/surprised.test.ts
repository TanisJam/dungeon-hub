/**
 * Unit tests — isSurprisedFirstTurn + isSurpriseExempt predicates.
 *
 * PHB p.189 — Surprise:
 *   "If you're surprised, you can't move or take an action on your first turn of the
 *    combat, and you can't take a reaction until that turn ends."
 *
 * PHB p.50 — Feral Instinct (Barbarian):
 *   "If you are surprised at the beginning of combat and aren't incapacitated, you can
 *    act normally on your first turn, but only if you enter your rage before doing
 *    anything else on that turn." Requires "By 7th level."
 *
 * Strict TDD — RED first: tests written before surprised.ts exists.
 * REQ-SUR-S2-01 (predicate shape), REQ-SUR-S3-02 (isSurpriseExempt).
 * ADR-2: honest-contract — no dead fields (no round, no ragedThisTurn, no character context).
 * REQ-HYGIENE-06: no ctx-build tests needed — predicates are plain boolean functions.
 */

import { describe, expect, it } from 'vitest';
import { isSurprisedFirstTurn, isSurpriseExempt } from './surprised.js';

// ── isSurprisedFirstTurn truth table ─────────────────────────────────────────
// Gate predicate: surprised=true AND firstTurnActed=false (PHB p.189).
// 4 cases from the surprised×firstTurnActed cross product.
// ADR-2: NO round condition, NO character context.

describe('isSurprisedFirstTurn (PHB p.189)', () => {
  it('SURP-U1: surprised=true, firstTurnActed=false → true (gate active)', () => {
    // PHB p.189: combatant is surprised and has not yet acted → gate fires.
    expect(isSurprisedFirstTurn(true, false)).toBe(true);
  });

  it('SURP-U2: surprised=true, firstTurnActed=true → false (gate lifted after turn ends)', () => {
    // PHB p.189: "you can't take a reaction until that turn ends" — after turn ends, gate lifts.
    expect(isSurprisedFirstTurn(true, true)).toBe(false);
  });

  it('SURP-U3: surprised=false, firstTurnActed=false → false (never gated if not surprised)', () => {
    // REQ-SUR-X-03: non-surprised combatants are never gated.
    // DEFAULT false rows: gate is inert (ADR-1 read-path tolerance).
    expect(isSurprisedFirstTurn(false, false)).toBe(false);
  });

  it('SURP-U4: surprised=false, firstTurnActed=true → false (not surprised, also acted)', () => {
    // Both flags set to their post-surprise-resolution state: no gate.
    expect(isSurprisedFirstTurn(false, true)).toBe(false);
  });
});

// ── isSurpriseExempt truth table ──────────────────────────────────────────────
// Feral Instinct carve-out: barbarianLevel >= 7 AND NOT incapacitated (PHB p.50).
// ADR-2 honest-contract note: this predicate does NOT take surprised/firstTurnActed/ragedThisTurn.
// Caller already knows the gate fired (isSurprisedFirstTurn=true); the predicate just decides exemption.
// Documentation per post-design #2256: rejected attempts are no-ops (no per-turn tracking needed).

describe('isSurpriseExempt (PHB p.50 Feral Instinct carve-out)', () => {
  it('SURP-U5: barbarianLevel=7, isIncapacitated=false → true (exempt, can rage despite surprise)', () => {
    // PHB p.50: "By 7th level" — L7 qualifies. Not incapacitated → carve-out applies.
    expect(isSurpriseExempt(7, false)).toBe(true);
  });

  it('SURP-U6: barbarianLevel=6, isIncapacitated=false → false (L6 below threshold)', () => {
    // PHB p.50: "By 7th level" — L6 does NOT qualify.
    expect(isSurpriseExempt(6, false)).toBe(false);
  });

  it('SURP-U7: barbarianLevel=7, isIncapacitated=true → false (incapacitated blocks carve-out)', () => {
    // PHB p.50: "aren't incapacitated" — incapacitated state removes the exception.
    expect(isSurpriseExempt(7, true)).toBe(false);
  });

  it('SURP-U8: barbarianLevel=6, isIncapacitated=true → false (both conditions fail)', () => {
    // L6 AND incapacitated — neither condition for the carve-out is met.
    expect(isSurpriseExempt(6, true)).toBe(false);
  });

  it('SURP-U9: barbarianLevel=20, isIncapacitated=false → true (L20 barbarian qualifies)', () => {
    // L20 barbarian — well above L7 threshold; carve-out applies.
    expect(isSurpriseExempt(20, false)).toBe(true);
  });

  it('SURP-U10: barbarianLevel=0, isIncapacitated=false → false (non-barbarian)', () => {
    // barbarianLevel=0: not a barbarian at all — no Feral Instinct.
    expect(isSurpriseExempt(0, false)).toBe(false);
  });
});
