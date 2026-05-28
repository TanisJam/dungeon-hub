/**
 * Unit tests for normalizeRarity.
 *
 * RED commit — written FIRST before implementation.
 *
 * Reqs: DIRN-DMG-01 (spec #1063)
 * DMG p.135 — Rarity table: common, uncommon, rare, very rare, legendary, artifact.
 */
import { describe, it, expect } from 'vitest';
import { normalizeRarity } from './normalize-rarity.js';

// ── DIRN-DMG-01: Canonical rarity tier ────────────────────────────────────

describe('normalizeRarity — known rarity values (DIRN-DMG-01)', () => {
  it('1.7 "very rare" (with space) → "very-rare" (DMG p.135 — "Very Rare" is the canonical tier name)', () => {
    // 5etools ships "very rare" with a space; we normalize to hyphenated CSS-safe slug.
    expect(normalizeRarity('very rare')).toBe('very-rare');
  });

  it('"very-rare" (already hyphenated) → "very-rare" (idempotent)', () => {
    expect(normalizeRarity('very-rare')).toBe('very-rare');
  });

  it('"common" → "common" (DMG p.135)', () => {
    expect(normalizeRarity('common')).toBe('common');
  });

  it('"uncommon" → "uncommon" (DMG p.135)', () => {
    expect(normalizeRarity('uncommon')).toBe('uncommon');
  });

  it('"rare" → "rare" (DMG p.135)', () => {
    expect(normalizeRarity('rare')).toBe('rare');
  });

  it('"legendary" → "legendary" (DMG p.135)', () => {
    expect(normalizeRarity('legendary')).toBe('legendary');
  });

  it('"artifact" → "artifact" (DMG p.135)', () => {
    expect(normalizeRarity('artifact')).toBe('artifact');
  });
});

describe('normalizeRarity — edge/unknown inputs (DIRN-DMG-01)', () => {
  it('1.8 "varies" → null (not a rarity tier — 5etools uses this for per-variant items)', () => {
    expect(normalizeRarity('varies')).toBeNull();
  });

  it('"none" → null (5etools uses "none" when item has no rarity)', () => {
    expect(normalizeRarity('none')).toBeNull();
  });

  it('"" (empty string) → null', () => {
    expect(normalizeRarity('')).toBeNull();
  });

  it('null → null', () => {
    expect(normalizeRarity(null)).toBeNull();
  });

  it('undefined → null', () => {
    expect(normalizeRarity(undefined)).toBeNull();
  });

  it('"unknown" → null (unrecognized value)', () => {
    expect(normalizeRarity('unknown')).toBeNull();
  });

  it('"Very Rare" (mixed case) → "very-rare" (case-insensitive normalization)', () => {
    expect(normalizeRarity('Very Rare')).toBe('very-rare');
  });
});
