/**
 * Unit tests for deriveV3Type.
 *
 * RED commit — these tests are written FIRST, before the implementation exists.
 * They must ALL fail at this commit.
 *
 * Reqs: DIVT-MAP-01, DIVT-BOOK-01 (spec #1063)
 * PHB citations inline per test.
 */
import { describe, it, expect } from 'vitest';
import type { ItemCompendiumLite } from './types.js';
import { deriveV3Type } from './derive-v3-type.js';

function makeLite(overrides: Partial<ItemCompendiumLite> = {}): ItemCompendiumLite {
  return {
    slug: 'test-item',
    source: 'PHB',
    name: 'Test Item',
    type: null,
    weight: null,
    ...overrides,
  };
}

// ── DIVT-MAP-01: Type mapping from 5etools codes ────────────────────────────

describe('deriveV3Type — weapon types (DIVT-MAP-01)', () => {
  it('1.1 type="M" (melee weapon) → "weapon" (PHB p.149 — Weapons table, Simple Melee)', () => {
    expect(deriveV3Type(makeLite({ type: 'M' }))).toBe('weapon');
  });

  it('type="R" (ranged weapon) → "weapon" (PHB p.149 — Weapons table, Simple Ranged)', () => {
    expect(deriveV3Type(makeLite({ type: 'R' }))).toBe('weapon');
  });
});

describe('deriveV3Type — magic rod type (DIVT-MAP-01)', () => {
  it('1.2 type="RD" (rod) → "magic" (5etools convention: rods/staves/wands/rings are magic)', () => {
    expect(deriveV3Type(makeLite({ type: 'RD' }))).toBe('magic');
  });

  it('type="ST" (staff) → "magic"', () => {
    expect(deriveV3Type(makeLite({ type: 'ST' }))).toBe('magic');
  });

  it('type="WD" (wand) → "magic"', () => {
    expect(deriveV3Type(makeLite({ type: 'WD' }))).toBe('magic');
  });

  it('type="RG" (ring) → "magic"', () => {
    expect(deriveV3Type(makeLite({ type: 'RG' }))).toBe('magic');
  });
});

describe('deriveV3Type — rarity-driven magic fallback (DIVT-MAP-01)', () => {
  it('1.3 type=null + rarity="rare" → "magic" (DMG p.135 — Rarity table, rarity-driven fallback)', () => {
    expect(deriveV3Type(makeLite({ type: null, rarity: 'rare' }))).toBe('magic');
  });

  it('type=null + rarity="uncommon" → "magic" (DMG p.135)', () => {
    expect(deriveV3Type(makeLite({ type: null, rarity: 'uncommon' }))).toBe('magic');
  });

  it('type=null + rarity="legendary" → "magic" (DMG p.135)', () => {
    expect(deriveV3Type(makeLite({ type: null, rarity: 'legendary' }))).toBe('magic');
  });

  it('type=null + rarity="common" → "trinket" (common rarity is NOT magic-tier — DMG p.135)', () => {
    expect(deriveV3Type(makeLite({ type: null, rarity: 'common' }))).toBe('trinket');
  });
});

describe('deriveV3Type — gear with charges → consumable (DIVT-MAP-01)', () => {
  it('1.4 type="G" + charges=3 → "consumable" (PHB p.150 — Adventuring Gear: Holy Water has charges)', () => {
    // PHB p.150: Holy Water (Flask) deals damage to undead when used — functions like consumable.
    expect(deriveV3Type(makeLite({ type: 'G', charges: 3 }))).toBe('consumable');
  });

  it('type="G" + charges=1 → "consumable" (min charge count still consumable)', () => {
    expect(deriveV3Type(makeLite({ type: 'G', charges: 1 }))).toBe('consumable');
  });
});

describe('deriveV3Type — unknown/null type fallback (DIVT-MAP-01)', () => {
  it('1.5 type=null + rarity=null → "trinket" (unknown fallback)', () => {
    expect(deriveV3Type(makeLite({ type: null, rarity: null }))).toBe('trinket');
  });

  it('type="G" without charges → "trinket" (generic gear with no charges)', () => {
    expect(deriveV3Type(makeLite({ type: 'G' }))).toBe('trinket');
  });
});

// ── DIVT-BOOK-01: Book/quest deferred to Slice C ──────────────────────────

describe('deriveV3Type — book/quest D4 deferral (DIVT-BOOK-01)', () => {
  it('1.6 type="G" + no charges + v3TypeOverride=null → "trinket" (not "book" — D4 deferred, DIVT-BOOK-01)', () => {
    // D4: book/quest are not derivable from 5etools codes in Slice A.
    // Spellbooks, adventure journals etc. resolve to "trinket" until Slice C ships v3TypeOverride.
    // charges omitted (exactOptionalPropertyTypes) → same as no charges present.
    expect(deriveV3Type(makeLite({ type: 'G' }), null)).toBe('trinket');
  });
});

// ── Override param (D2 shape pre-lock) ─────────────────────────────────────

describe('deriveV3Type — v3TypeOverride wins over derivation', () => {
  it('v3TypeOverride="weapon" overrides even when type would map to "trinket"', () => {
    expect(deriveV3Type(makeLite({ type: null }), 'weapon')).toBe('weapon');
  });

  it('v3TypeOverride=undefined defers to normal derivation', () => {
    expect(deriveV3Type(makeLite({ type: 'M' }), undefined)).toBe('weapon');
  });
});
