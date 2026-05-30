/**
 * Tests for isShieldableHit — pure domain predicate for Shield reaction window.
 *
 * PHB p.275 — Shield:
 *   "You can cast this spell when you are hit by an attack... you gain a +5 bonus to AC,
 *   including against the triggering attack, until the start of your next turn."
 *   Shield is a REACTION — you choose to cast it AFTER you know you were hit.
 *
 * PHB p.194 — Critical Hits:
 *   "If the d20 roll for an attack is a 20, the attack hits regardless of any modifiers
 *   or the target's AC." — A crit cannot be blocked by +5 AC, so no window is opened.
 *
 * ADR-1 (engine-reaction-bus design): predicate = hit && !crit && (total - targetAc) < 5.
 *   The gap<5 filter is a UX optimization (opening window only when Shield can change the
 *   outcome), NOT a PHB gate. PC/slot/reaction_used checks are API-layer state concerns.
 *
 * REQ-ERB-TYPES-01: pure domain function — no IO, no DB, no fetch.
 * Strict TDD — RED first (task 2.3 RED).
 */

import { describe, expect, it } from 'vitest';
import { isShieldableHit } from './shieldable-hit.js';

// ── Helper shape ──────────────────────────────────────────────────────────────

type HitParams = {
  hit: boolean;
  crit: boolean;
  total: number;
  targetAc: number;
};

describe('isShieldableHit (PHB p.275 Shield reaction window — pure predicate)', () => {
  // ── TRUE cases ────────────────────────────────────────────────────────────────

  it('returns true when hit, not crit, and gap < 5 (shield would change outcome)', () => {
    // PHB p.275: Player can cast Shield when they are hit by an attack.
    // gap = total - targetAc = 15 - 14 = 1 → shield +5 makes AC 19, attack misses.
    const params: HitParams = { hit: true, crit: false, total: 15, targetAc: 14 };
    expect(isShieldableHit(params)).toBe(true);
  });

  it('returns true when gap is exactly 4 (boundary: 4 < 5)', () => {
    // gap = 17 - 13 = 4 → shield makes AC 18, attack (total 17) would miss.
    const params: HitParams = { hit: true, crit: false, total: 17, targetAc: 13 };
    expect(isShieldableHit(params)).toBe(true);
  });

  it('returns true when gap is 0 (hit exactly at AC boundary)', () => {
    // gap = 15 - 15 = 0 → total equals AC exactly, which is a hit per PHB p.194.
    // With +5 shield → newAc = 20, total 15 < 20 → miss.
    const params: HitParams = { hit: true, crit: false, total: 15, targetAc: 15 };
    expect(isShieldableHit(params)).toBe(true);
  });

  // ── FALSE: crit ───────────────────────────────────────────────────────────────

  it('returns false when crit=true, even if gap < 5 (PHB p.194 — crit always hits)', () => {
    // PHB p.194: nat-20 hits regardless of AC. +5 AC cannot prevent a crit.
    // ADR-6 (engine-reaction-bus design): crit bypasses Shield window entirely.
    const params: HitParams = { hit: true, crit: true, total: 20, targetAc: 18 };
    expect(isShieldableHit(params)).toBe(false);
  });

  it('returns false when crit=true and gap=1 (extreme shieldable-looking case)', () => {
    // Paranoia check: crit always wins regardless of gap.
    const params: HitParams = { hit: true, crit: true, total: 20, targetAc: 19 };
    expect(isShieldableHit(params)).toBe(false);
  });

  // ── FALSE: miss ───────────────────────────────────────────────────────────────

  it('returns false when hit=false (miss — Shield cannot be cast on a miss, PHB p.275)', () => {
    // PHB p.275: "when you are hit by an attack" — miss does not trigger Shield.
    const params: HitParams = { hit: false, crit: false, total: 10, targetAc: 15 };
    expect(isShieldableHit(params)).toBe(false);
  });

  it('returns false when hit=false even with gap appearing < 5', () => {
    // Auto-miss (nat-1) or total < AC → no window.
    const params: HitParams = { hit: false, crit: false, total: 14, targetAc: 15 };
    expect(isShieldableHit(params)).toBe(false);
  });

  // ── FALSE: gap >= 5 ───────────────────────────────────────────────────────────

  it('returns false when gap is exactly 5 (ADR-1: gap<5 is strict)', () => {
    // gap = 5: total - targetAc = 5 → with +5, newAc = targetAc + 5 = total, still a hit.
    // Opening the window would do nothing — UX optimization excludes it.
    const params: HitParams = { hit: true, crit: false, total: 20, targetAc: 15 };
    expect(isShieldableHit(params)).toBe(false);
  });

  it('returns false when gap >= 5 (Shield would not change outcome)', () => {
    // gap = 22 - 14 = 8 → +5 AC → newAc = 19, 22 >= 19 → still a hit. Window pointless.
    const params: HitParams = { hit: true, crit: false, total: 22, targetAc: 14 };
    expect(isShieldableHit(params)).toBe(false);
  });
});
