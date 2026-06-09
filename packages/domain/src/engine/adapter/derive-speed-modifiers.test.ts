/**
 * Unit tests for deriveSpeedModifiers — adapter that projects barbarian class
 * levels and equipped armor into ModifierInstance[] for stat:'speed'.
 *
 * Source rules:
 *   PHB p.49 — Barbarian Fast Movement:
 *     "Starting at 5th level, your speed increases by 10 feet while
 *      you aren't wearing heavy armor."
 *
 * REQ-SPEED-14 (strict TDD), SCENARIO-01 through SCENARIO-15, SCENARIO-18, SCENARIO-19.
 */
import { describe, it, expect } from 'vitest';
import { deriveSpeedModifiers } from './derive-speed-modifiers.js';
import type { EntityId } from '../types.js';
import type { InventoryItem, ItemCompendiumLite } from '../../character/inventory/types.js';

function eid(s: string): EntityId {
  return s as EntityId;
}

const CHAR_ID = eid('char-speed-test');

// Helper to build a minimal InventoryItem
function makeInventoryItem(
  itemSlug: string,
  itemSource: string,
  state: InventoryItem['state'] = 'equipped',
): InventoryItem {
  return {
    instanceId: `inst-${itemSlug}`,
    itemSlug,
    itemSource,
    quantity: 1,
    state,
    attuned: false,
    customName: null,
    notes: '',
  };
}

// Helper to build an ItemCompendiumLite for armor
function makeArmorLite(slug: string, source: string, type: string): ItemCompendiumLite {
  return {
    slug,
    source,
    name: slug,
    type,
    weight: 15,
  };
}

// Helper to build itemLites record
function makeLites(entries: Array<[string, string, string]>): Record<string, ItemCompendiumLite> {
  const record: Record<string, ItemCompendiumLite> = {};
  for (const [slug, source, type] of entries) {
    record[`${slug}|${source}`] = makeArmorLite(slug, source, type);
  }
  return record;
}

// ── SCENARIO-01 — Barbarian 5, unarmored, base 30 ────────────────────────────

describe('deriveSpeedModifiers — SCENARIO-01: barbarian 5, unarmored', () => {
  it('emits exactly 1 mod with stat:speed, op:add, value:10 (PHB p.49)', () => {
    // PHB p.49: "Starting at 5th level, your speed increases by 10 feet
    // while you aren't wearing heavy armor."
    const result = deriveSpeedModifiers(
      {
        classes: [{ classSlug: 'barbarian', level: 5 }],
        inventory: [],
        itemLites: {},
      },
      CHAR_ID,
    );
    expect(result.mods).toHaveLength(1);
    const mod = result.mods[0]!;
    expect(mod.def.kind).toBe('num');
    if (mod.def.kind === 'num') {
      expect(mod.def.stat).toBe('speed');
      expect(mod.def.op).toBe('add');
      expect(mod.def.value).toBe(10);
      expect(mod.def.category).toBe('untyped');
    }
    expect(mod.scope.owner).toBe(CHAR_ID);
    expect(mod.scope.target).toEqual({ axis: 'self' });
    expect(mod.scope.trigger).toBe('always');
    expect(mod.label).toBeDefined();
    expect(typeof mod.label).toBe('string');
    expect((mod.label as string).length).toBeGreaterThan(0);
  });
});

// ── SCENARIO-02 — Barbarian 5, light armor ('LA') ────────────────────────────

describe('deriveSpeedModifiers — SCENARIO-02: barbarian 5, light armor', () => {
  it('emits 1 mod value:10 — light armor does not disqualify (PHB p.49)', () => {
    // PHB p.49: "while you aren't wearing heavy armor" — light armor qualifies
    const inventory = [makeInventoryItem('leather', 'phb')];
    const itemLites = makeLites([['leather', 'phb', 'LA']]);
    const result = deriveSpeedModifiers(
      {
        classes: [{ classSlug: 'barbarian', level: 5 }],
        inventory,
        itemLites,
      },
      CHAR_ID,
    );
    expect(result.mods).toHaveLength(1);
    const mod = result.mods[0]!;
    if (mod.def.kind === 'num') expect(mod.def.value).toBe(10);
  });
});

// ── SCENARIO-03 — Barbarian 5, medium armor ('MA') ───────────────────────────

describe('deriveSpeedModifiers — SCENARIO-03: barbarian 5, medium armor', () => {
  it('emits 1 mod value:10 — medium armor does not disqualify (PHB p.49)', () => {
    // PHB p.49: "while you aren't wearing heavy armor" — medium armor qualifies
    const inventory = [makeInventoryItem('chain-shirt', 'phb')];
    const itemLites = makeLites([['chain-shirt', 'phb', 'MA']]);
    const result = deriveSpeedModifiers(
      {
        classes: [{ classSlug: 'barbarian', level: 5 }],
        inventory,
        itemLites,
      },
      CHAR_ID,
    );
    expect(result.mods).toHaveLength(1);
    const mod = result.mods[0]!;
    if (mod.def.kind === 'num') expect(mod.def.value).toBe(10);
  });
});

// ── SCENARIO-04 — Barbarian 5, heavy armor equipped ──────────────────────────

describe('deriveSpeedModifiers — SCENARIO-04: barbarian 5, heavy armor equipped', () => {
  it('emits 0 mods — heavy armor disqualifies (PHB p.49)', () => {
    // PHB p.49: "while you aren't wearing heavy armor"
    const inventory = [makeInventoryItem('plate', 'phb')];
    const itemLites = makeLites([['plate', 'phb', 'HA']]);
    const result = deriveSpeedModifiers(
      {
        classes: [{ classSlug: 'barbarian', level: 5 }],
        inventory,
        itemLites,
      },
      CHAR_ID,
    );
    expect(result.mods).toHaveLength(0);
  });
});

// ── SCENARIO-08 — Non-barbarian character ────────────────────────────────────

describe('deriveSpeedModifiers — SCENARIO-08: non-barbarian character (ranger)', () => {
  it('emits 0 mods — Fast Movement is barbarian-only (PHB p.49)', () => {
    // PHB p.49 feature belongs to Barbarian class only
    const result = deriveSpeedModifiers(
      {
        classes: [{ classSlug: 'ranger', level: 5 }],
        inventory: [],
        itemLites: {},
      },
      CHAR_ID,
    );
    expect(result.mods).toHaveLength(0);
  });
});

// ── SCENARIO-09 — Barbarian 4 (below level gate) ─────────────────────────────

describe('deriveSpeedModifiers — SCENARIO-09: barbarian 4, level gate not met', () => {
  it('emits 0 mods — "Starting at 5th level" (PHB p.49)', () => {
    // PHB p.49: "Starting at 5th level, your speed increases by 10 feet..."
    const result = deriveSpeedModifiers(
      {
        classes: [{ classSlug: 'barbarian', level: 4 }],
        inventory: [],
        itemLites: {},
      },
      CHAR_ID,
    );
    expect(result.mods).toHaveLength(0);
  });
});

// ── SCENARIO-10 — Multiclass: Barbarian 5 / Wizard 2 qualifies ───────────────

describe('deriveSpeedModifiers — SCENARIO-10: barbarian 5 / wizard 2, qualifies', () => {
  it('emits 1 mod — barbarian level 5 qualifies regardless of total level (PHB p.49)', () => {
    // PHB p.49: class level gate, not total level. Barb5/Wiz2 = barb level 5 ≥ 5.
    const result = deriveSpeedModifiers(
      {
        classes: [
          { classSlug: 'barbarian', level: 5 },
          { classSlug: 'wizard', level: 2 },
        ],
        inventory: [],
        itemLites: {},
      },
      CHAR_ID,
    );
    expect(result.mods).toHaveLength(1);
    const mod = result.mods[0]!;
    if (mod.def.kind === 'num') expect(mod.def.value).toBe(10);
  });
});

// ── SCENARIO-11 — Multiclass: Barbarian 4 / Fighter 3, total 7 but barb < 5 ──

describe('deriveSpeedModifiers — SCENARIO-11: barbarian 4 / fighter 3, barb level insufficient', () => {
  it('emits 0 mods — total level 7 irrelevant; barbarian level 4 < 5 (PHB p.49)', () => {
    // PHB p.49: the gate is barbarian CLASS level, not total level.
    // Barb4/Fighter3 has total 7 but barbarian level = 4 < 5 → no bonus.
    const result = deriveSpeedModifiers(
      {
        classes: [
          { classSlug: 'barbarian', level: 4 },
          { classSlug: 'fighter', level: 3 },
        ],
        inventory: [],
        itemLites: {},
      },
      CHAR_ID,
    );
    expect(result.mods).toHaveLength(0);
  });
});

// ── SCENARIO-12 — Two barbarian entries summing to 5 ─────────────────────────

describe('deriveSpeedModifiers — SCENARIO-12: two barbarian entries summing to 5', () => {
  it('emits 1 mod — sum of barbarian levels 3+2=5 qualifies (PHB p.49)', () => {
    // PHB p.49: filter-and-sum on classSlug. Edge case: two barb entries.
    const result = deriveSpeedModifiers(
      {
        classes: [
          { classSlug: 'barbarian', level: 3 },
          { classSlug: 'barbarian', level: 2 },
        ],
        inventory: [],
        itemLites: {},
      },
      CHAR_ID,
    );
    expect(result.mods).toHaveLength(1);
    const mod = result.mods[0]!;
    if (mod.def.kind === 'num') expect(mod.def.value).toBe(10);
  });
});

// ── SCENARIO-13 — Empty classes (legacy row) ─────────────────────────────────

describe('deriveSpeedModifiers — SCENARIO-13: empty classes', () => {
  it('emits 0 mods and does not throw (REQ-SPEED-11 legacy tolerance)', () => {
    // Read-path tolerance: legacy rows with no classes must not error.
    const result = deriveSpeedModifiers(
      { classes: [], inventory: [], itemLites: {} },
      CHAR_ID,
    );
    expect(result.mods).toHaveLength(0);
  });
});

// ── SCENARIO-14 — Empty inventory (unarmored) ────────────────────────────────

describe('deriveSpeedModifiers — SCENARIO-14: barbarian 5, empty inventory (unarmored)', () => {
  it('emits 1 mod — empty inventory = unarmored = qualifies (PHB p.49)', () => {
    // PHB p.49: no armor worn → qualifies. Empty inventory = not wearing anything.
    const result = deriveSpeedModifiers(
      {
        classes: [{ classSlug: 'barbarian', level: 5 }],
        inventory: [],
        itemLites: {},
      },
      CHAR_ID,
    );
    expect(result.mods).toHaveLength(1);
  });
});

// ── SCENARIO-15 — Barbarian 5, shield only (no body armor) ───────────────────

describe('deriveSpeedModifiers — SCENARIO-15: barbarian 5, shield only', () => {
  it('emits 1 mod — shield does not disqualify; only heavy armor does (PHB p.49)', () => {
    // PHB p.49: "while you aren't wearing heavy armor" — shield is not heavy armor.
    const inventory = [makeInventoryItem('shield', 'phb')];
    const itemLites = makeLites([['shield', 'phb', 'S']]);
    const result = deriveSpeedModifiers(
      {
        classes: [{ classSlug: 'barbarian', level: 5 }],
        inventory,
        itemLites,
      },
      CHAR_ID,
    );
    expect(result.mods).toHaveLength(1);
  });
});

// ── SCENARIO-18 — Barbarian 10 (level well above gate) ───────────────────────

describe('deriveSpeedModifiers — SCENARIO-18: barbarian 10', () => {
  it('emits exactly 1 mod value:10 — no scaling at higher levels (PHB p.49, flat +10)', () => {
    // PHB p.49: flat +10, not scaling. No second +10 at higher levels.
    const result = deriveSpeedModifiers(
      {
        classes: [{ classSlug: 'barbarian', level: 10 }],
        inventory: [],
        itemLites: {},
      },
      CHAR_ID,
    );
    expect(result.mods).toHaveLength(1);
    const mod = result.mods[0]!;
    if (mod.def.kind === 'num') expect(mod.def.value).toBe(10);
  });
});

// ── SCENARIO-19 — Barbarian 5, heavy armor UNEQUIPPED ────────────────────────

describe('deriveSpeedModifiers — SCENARIO-19: barbarian 5, heavy armor unequipped (carried)', () => {
  it('emits 1 mod — unequipped heavy armor does not disqualify (PHB p.49)', () => {
    // PHB p.49: "while you aren't WEARING heavy armor" — carried ≠ wearing.
    const inventory = [makeInventoryItem('plate', 'phb', 'carried')];
    const itemLites = makeLites([['plate', 'phb', 'HA']]);
    const result = deriveSpeedModifiers(
      {
        classes: [{ classSlug: 'barbarian', level: 5 }],
        inventory,
        itemLites,
      },
      CHAR_ID,
    );
    expect(result.mods).toHaveLength(1);
  });
});
