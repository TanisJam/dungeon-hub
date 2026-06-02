/**
 * Unit tests for character knowledge default rules.
 *
 * RED commit — written FIRST before implementation.
 *
 * Reqs: REQ-CK-GATE-01, REQ-CK-GATE-02 (spec #1626)
 *
 * HOUSE RULE — Bestiary statblock gating:
 *   RAW (PHB p.177-179, Intelligence-based ability checks) has no per-character
 *   statblock gate. Hiding a statblock per character is an intentional platform
 *   divergence for anti-metagaming. Per CLAUDE.md §1.1 this is a house rule.
 *   isMonsterKnownByDefault() → always false (no RAW default; gate requires a row).
 *
 * HOUSE RULE — Layered visibility gate (seesEntry):
 *   DM bypasses all layers. Player needs: (!isSecret) && (knows || defaulted).
 *   No RAW basis — anti-metagaming platform divergence.
 */
import { describe, it, expect } from 'vitest';
import { isMonsterKnownByDefault, seesEntry } from './default-rules.js';

// ── isMonsterKnownByDefault ─────────────────────────────────────────────────

describe('isMonsterKnownByDefault — REQ-CK-GATE-02', () => {
  it('always returns false (HOUSE RULE — bestiary has no default, anti-metagaming platform divergence; no RAW basis)', () => {
    // Bestiary entries ALWAYS require an explicit character_knowledge row.
    // No monster is "known by default" — the DM must grant it.
    expect(isMonsterKnownByDefault()).toBe(false);
  });
});

// ── seesEntry ────────────────────────────────────────────────────────────────

describe('seesEntry — REQ-CK-GATE-01 (HOUSE RULE layered gate)', () => {
  // (a) DM view → always true regardless of knows/secret/defaulted
  it('dm view → always true, even when knows=false and isSecret=true', () => {
    // HOUSE RULE: DM bypasses BOTH layers. No RAW gate for DM perception.
    expect(seesEntry('dm', true, false, false)).toBe(true);
  });

  it('dm view → true even when entry is secret and not known', () => {
    expect(seesEntry('dm', true, false, false)).toBe(true);
  });

  it('dm view → true when knows=true', () => {
    expect(seesEntry('dm', false, true, false)).toBe(true);
  });

  // (b) player + not secret + knows=true → true
  it('player + isSecret=false + knows=true → true (known monster, not DM-secret)', () => {
    // HOUSE RULE: player sees a non-secret entry they have a knowledge row for.
    expect(seesEntry('player', false, true, false)).toBe(true);
  });

  // (c) player + knows=false + defaulted=false → false
  it('player + knows=false + defaulted=false → false (not in known-set, no default rule)', () => {
    // HOUSE RULE: player cannot see an entry with no knowledge row and no default.
    expect(seesEntry('player', false, false, false)).toBe(false);
  });

  // (d) player + isSecret=true → false even if knows=true
  it('player + isSecret=true + knows=true → false (DM secret overrides individual knowledge)', () => {
    // HOUSE RULE: DM-secret entries are hidden from ALL players regardless of
    // their knowledge row. Layer 1 (world-visibility) blocks before layer 2.
    expect(seesEntry('player', true, true, false)).toBe(false);
  });

  // Additional: player + defaulted=true (wave 2 items default-known)
  it('player + isSecret=false + knows=false + defaulted=true → true (default rule applies)', () => {
    // This path is used by Wave 2 items where common/null rarity → implicitly known.
    expect(seesEntry('player', false, false, true)).toBe(true);
  });
});
