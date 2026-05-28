import { describe, expect, it } from 'vitest';
import {
  RECHARGE_5ETOOLS_MAP,
  extractAc,
  extractStealth,
  extractArmorStrengthMin,
  extractRarity,
  extractReqAttune,
  extractDmg1,
  extractDmgType,
  extractEntriesSummary,
} from '../../../../src/use-cases/characters/load-item-data.js';

/**
 * Unit tests for RECHARGE_5ETOOLS_MAP / extractRecharge mapping logic.
 *
 * PHB p.141 / 5etools alignment:
 * - `"restLong"` → `'long'`  (5etools for "recharges on long rest")
 * - `"restShort"` → `'short'` (defensive; mirrors restLong)
 * - `"dawn"` → `'dawn'`      (pass-through)
 * - Unknown → pass-through (domain recharge field allows string | null)
 *
 * REQ-R02-EXTRACT-RECHARGE-RESTLONG
 * REQ-R02-EXTRACT-RECHARGE-DAWN
 * REQ-R02-EXTRACT-RECHARGE-UNKNOWN
 */
describe('RECHARGE_5ETOOLS_MAP — 5etools → domain recharge mapping', () => {
  // REQ-R02-EXTRACT-RECHARGE-RESTLONG
  it('maps restLong → long (PHB p.141: recharges on long rest)', () => {
    expect(RECHARGE_5ETOOLS_MAP['restLong']).toBe('long');
  });

  // REQ-R02-EXTRACT-RECHARGE-DAWN
  it('maps dawn → dawn (no-op pass-through)', () => {
    expect(RECHARGE_5ETOOLS_MAP['dawn']).toBe('dawn');
  });

  // defensive mapping
  it('maps restShort → short', () => {
    expect(RECHARGE_5ETOOLS_MAP['restShort']).toBe('short');
  });

  // REQ-R02-EXTRACT-RECHARGE-UNKNOWN
  it('unknown value is NOT in the map (passes through unchanged via ?? r)', () => {
    // The map has no entry for 'midnight' — caller uses `?? r` fallback.
    expect(RECHARGE_5ETOOLS_MAP['midnight']).toBeUndefined();
  });
});

/**
 * Unit tests for the armor field extractors used by `loadItemData` /
 * `loadItemDataMany`. These cover the JSONB → ItemCompendiumLite projection
 * for armor data per REQ-CIP-ARMOR-FIELDS and REQ-CIP-LEGACY-MISSING (spec #843).
 *
 * PHB p.144 (Armor) shapes (verified against `data/5etools/data/items-base.json`):
 * - Chain Shirt (PHB): `{ type: "MA", ac: 13 }` — no stealth, no strength.
 * - Plate Armor (PHB): `{ type: "HA", ac: 18, strength: "15", stealth: true }`.
 *   IMPORTANT: 5etools encodes `strength` as a STRING; we parse to number.
 * - Shield (PHB): `{ type: "S", ac: 2 }` — `ac: 2` is the BONUS, not total AC.
 *   The domain `computeArmorClass` interprets the value correctly per `lite.type`.
 * - Rope (PHB): `{ type: "G" }` — no armor fields at all → projected lite has
 *   `ac`/`stealth`/`armorStrengthMin` all undefined (legacy / non-armor tolerance).
 */
describe('extractAc — REQ-CIP-ARMOR-FIELDS', () => {
  it('reads numeric ac from armor JSONB (e.g. chain shirt = 13)', () => {
    expect(extractAc({ ac: 13 })).toBe(13);
  });

  it('reads shield bonus as ac (shield = 2; the value is the bonus, not total AC)', () => {
    // PHB p.149 — Shield grants +2 AC. The domain `computeArmorClass` adds
    // this to the body-armor or unarmored branch when type === 'S'.
    expect(extractAc({ ac: 2, type: 'S' })).toBe(2);
  });

  it('returns undefined when ac is absent (non-armor item)', () => {
    expect(extractAc({ name: 'Rope, Hempen', type: 'G' })).toBeUndefined();
  });

  it('returns undefined for null / non-object input (legacy tolerance)', () => {
    expect(extractAc(null)).toBeUndefined();
    expect(extractAc(undefined)).toBeUndefined();
    expect(extractAc('not-an-object')).toBeUndefined();
  });

  it('returns undefined when ac is non-numeric (defensive)', () => {
    expect(extractAc({ ac: 'thirteen' })).toBeUndefined();
    expect(extractAc({ ac: Number.NaN })).toBeUndefined();
  });
});

describe('extractStealth — REQ-CIP-ARMOR-FIELDS', () => {
  it('reads true when armor imposes stealth disadvantage (e.g. plate)', () => {
    // PHB p.144 — heavy armor without explicit DEX cap imposes stealth disadv.
    expect(extractStealth({ ac: 18, stealth: true })).toBe(true);
  });

  it('reads false when explicitly set (defensive — some rows encode false)', () => {
    expect(extractStealth({ ac: 13, stealth: false })).toBe(false);
  });

  it('returns undefined when stealth is absent (most items, non-armor)', () => {
    expect(extractStealth({ ac: 11 })).toBeUndefined();
    expect(extractStealth({ type: 'G' })).toBeUndefined();
  });

  it('returns undefined for null / non-object input', () => {
    expect(extractStealth(null)).toBeUndefined();
    expect(extractStealth(undefined)).toBeUndefined();
  });
});

describe('extractArmorStrengthMin — REQ-CIP-ARMOR-FIELDS', () => {
  it('parses string strength to number (5etools encodes as STRING: "15")', () => {
    // PHB p.144 — Plate strength=15. 5etools ships this as `"strength": "15"`.
    expect(extractArmorStrengthMin({ strength: '15' })).toBe(15);
    expect(extractArmorStrengthMin({ strength: '13' })).toBe(13);
  });

  it('accepts numeric strength (defensive — homebrew or future data)', () => {
    expect(extractArmorStrengthMin({ strength: 15 })).toBe(15);
  });

  it('returns undefined when strength is absent (non-heavy armor, non-armor)', () => {
    expect(extractArmorStrengthMin({ ac: 13 })).toBeUndefined();
    expect(extractArmorStrengthMin({ type: 'G' })).toBeUndefined();
  });

  it('returns undefined for empty string or unparseable value', () => {
    expect(extractArmorStrengthMin({ strength: '' })).toBeUndefined();
    expect(extractArmorStrengthMin({ strength: 'heavy' })).toBeUndefined();
  });

  it('returns undefined for null / non-object input', () => {
    expect(extractArmorStrengthMin(null)).toBeUndefined();
    expect(extractArmorStrengthMin(undefined)).toBeUndefined();
  });
});

describe('armor extractors — combined fixtures (REQ-CIP-LEGACY-MISSING)', () => {
  // Real-shape fixtures verified against data/5etools/data/items-base.json.

  it('chain shirt: ac=13, stealth/armorStrengthMin undefined', () => {
    const data = { name: 'Chain Shirt', source: 'PHB', type: 'MA', ac: 13, armor: true };
    expect(extractAc(data)).toBe(13);
    expect(extractStealth(data)).toBeUndefined();
    expect(extractArmorStrengthMin(data)).toBeUndefined();
  });

  it('plate armor: ac=18, stealth=true, armorStrengthMin=15', () => {
    const data = {
      name: 'Plate Armor',
      source: 'PHB',
      type: 'HA',
      ac: 18,
      strength: '15',
      armor: true,
      stealth: true,
    };
    expect(extractAc(data)).toBe(18);
    expect(extractStealth(data)).toBe(true);
    expect(extractArmorStrengthMin(data)).toBe(15);
  });

  it('shield: ac=2 (bonus), no stealth, no armorStrengthMin', () => {
    const data = { name: 'Shield', source: 'PHB', type: 'S', ac: 2 };
    expect(extractAc(data)).toBe(2);
    expect(extractStealth(data)).toBeUndefined();
    expect(extractArmorStrengthMin(data)).toBeUndefined();
  });

  it('rope / non-armor: all three undefined', () => {
    const data = { name: 'Rope, Hempen (50 feet)', source: 'PHB', type: 'G', weight: 10 };
    expect(extractAc(data)).toBeUndefined();
    expect(extractStealth(data)).toBeUndefined();
    expect(extractArmorStrengthMin(data)).toBeUndefined();
  });
});

/**
 * Unit tests for extractRarity and extractReqAttune.
 *
 * Design decision sdd/inventory-v3-list/design #1064 — D3:
 * rarity + reqAttune are projected from JSONB at read time, mirroring extractCostCp.
 * DMG p.135 — Rarity. PHB p.136-138 — Attunement.
 *
 * ACSE-SHAPE-01 (spec #1063): enriched inventory items include rarity + reqAttune.
 */
describe('extractRarity — sdd/inventory-v3-list ACSE-SHAPE-01', () => {
  it('4.4a returns the rarity string when present (happy path — e.g. magic ring "rare")', () => {
    // DMG p.135: Ring of Protection is "Rare, requires attunement"
    expect(extractRarity({ rarity: 'rare', reqAttune: true })).toBe('rare');
  });

  it('4.4b returns null when rarity field is absent (mundane items — no rarity in 5etools)', () => {
    // Most PHB mundane items (rope, chain shirt, longsword) have no rarity field.
    expect(extractRarity({ name: 'Longsword', type: 'M' })).toBeNull();
  });

  it('returns null for null / non-object input', () => {
    expect(extractRarity(null)).toBeNull();
    expect(extractRarity(undefined)).toBeNull();
  });

  it('returns "very rare" (with space) verbatim — normalization is callers responsibility', () => {
    // extractRarity does NOT normalize; normalizeRarity() handles that.
    expect(extractRarity({ rarity: 'very rare' })).toBe('very rare');
  });
});

describe('extractReqAttune — sdd/inventory-v3-list ACSE-SHAPE-01', () => {
  it('4.5a returns true when reqAttune is boolean true (any-class attunement)', () => {
    // PHB p.136: "Some magic items require a creature to be attuned to them"
    expect(extractReqAttune({ rarity: 'rare', reqAttune: true })).toBe(true);
  });

  it('4.5b returns null when reqAttune is absent (non-attunement item)', () => {
    expect(extractReqAttune({ rarity: 'rare' })).toBeNull();
  });

  it('returns the class restriction string when reqAttune is a string', () => {
    // 5etools uses strings like "by a spellcaster" for class-restricted attunement.
    expect(extractReqAttune({ reqAttune: 'by a spellcaster' })).toBe('by a spellcaster');
  });

  it('returns null for boolean false (no attunement required)', () => {
    expect(extractReqAttune({ reqAttune: false })).toBeNull();
  });

  it('returns null for null / non-object input', () => {
    expect(extractReqAttune(null)).toBeNull();
    expect(extractReqAttune(undefined)).toBeNull();
  });
});

/**
 * Unit tests for new detail-projection extractors.
 *
 * Reqs: ACIDE-NONN1-03 (spec #1070) — extractor seam for detail endpoint.
 * Design: DBE6 (design #1071) — extend projectItemRow with includeDetail flag.
 *
 * PHB p.149 — Weapons table (dmg1 + dmgType codes).
 */
describe('extractDmg1 — ACIDE-NONN1-03: weapon damage dice', () => {
  it('returns damage dice string from 5etools dmg1 field (e.g. "1d8")', () => {
    // PHB p.149 — longsword: 1d8 slashing (versatile 1d10)
    expect(extractDmg1({ dmg1: '1d8' })).toBe('1d8');
  });

  it('returns null when dmg1 is absent (non-weapon item)', () => {
    expect(extractDmg1({ type: 'G', name: 'Rope' })).toBeNull();
  });

  it('returns null for null / non-object input', () => {
    expect(extractDmg1(null)).toBeNull();
    expect(extractDmg1(undefined)).toBeNull();
  });
});

describe('extractDmgType — ACIDE-NONN1-03: weapon damage type humanization', () => {
  it('humanizes S (slashing) → "Cortante" (PHB p.149)', () => {
    expect(extractDmgType({ dmgType: 'S' })).toBe('Cortante');
  });

  it('humanizes P (piercing) → "Perforante" (PHB p.149)', () => {
    expect(extractDmgType({ dmgType: 'P' })).toBe('Perforante');
  });

  it('humanizes B (bludgeoning) → "Contundente" (PHB p.149)', () => {
    expect(extractDmgType({ dmgType: 'B' })).toBe('Contundente');
  });

  it('returns null when dmgType is absent (non-weapon)', () => {
    expect(extractDmgType({ type: 'G' })).toBeNull();
  });

  it('returns null for null / non-object input', () => {
    expect(extractDmgType(null)).toBeNull();
  });
});

describe('extractEntriesSummary — ACIDE-NONN1-03: item description text', () => {
  it('joins first string paragraph(s) to a single string', () => {
    const data = { entries: ['Drink this potion to heal.', 'Additional note.'] };
    const result = extractEntriesSummary(data);
    expect(result).toContain('Drink this potion to heal.');
  });

  it('truncates to 240 chars with ellipsis when text is longer', () => {
    const longText = 'A'.repeat(300);
    const result = extractEntriesSummary({ entries: [longText] });
    expect(result).not.toBeNull();
    expect(result!.length).toBeLessThanOrEqual(243); // 240 + '...'
    expect(result!.endsWith('...')).toBe(true);
  });

  it('returns null when entries is absent', () => {
    expect(extractEntriesSummary({ type: 'P' })).toBeNull();
  });

  it('returns null for null / non-object input', () => {
    expect(extractEntriesSummary(null)).toBeNull();
  });

  it('skips non-string entries (tables, lists) and uses only string paragraphs', () => {
    const data = { entries: [{ type: 'table', rows: [] }, 'Actual text here.'] };
    const result = extractEntriesSummary(data);
    expect(result).toBe('Actual text here.');
  });
});
