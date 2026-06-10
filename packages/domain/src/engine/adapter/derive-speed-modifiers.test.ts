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
import { resolveStat } from '../resolve/stat.js';
import { createInMemoryRegistry } from '../registry/query.js';
import { applyExhaustionToSpeed } from '../../character/sheet/speed.js';
import type { EntityId } from '../types.js';
import type { EvaluationContext } from '../context.js';
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
    // PHB p.49: label must identify the feature by exact name for provenance clarity.
    // REQ-SPEED-12: label must be non-empty and human-readable.
    expect(mod.label).toBe('Fast Movement (+10)');
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
    expect(mod.def.kind).toBe('num');
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
    expect(mod.def.kind).toBe('num');
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
    expect(mod.def.kind).toBe('num');
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
    expect(mod.def.kind).toBe('num');
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
    expect(mod.def.kind).toBe('num');
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

// ── SCENARIO-20 — Monk-2, unarmored, no shield → +10 ────────────────────────

describe('deriveSpeedModifiers — SCENARIO-20: monk-2, unarmored, no shield', () => {
  it('emits exactly 1 mod with stat:speed, op:add, value:10 (PHB p.77-78)', () => {
    // PHB p.78: "Your speed increases by 10 feet while you are not wearing armor
    // or wielding a shield."
    // PHB p.77 Monk table: L2 → +10 ft Unarmored Movement.
    const result = deriveSpeedModifiers(
      {
        classes: [{ classSlug: 'monk', level: 2 }],
        inventory: [],
        itemLites: {},
      },
      CHAR_ID,
    );
    expect(result.mods).toHaveLength(1);
    const mod = result.mods[0]!;
    expect(mod.def.kind).toBe('num');
    expect(mod.def.stat).toBe('speed');
    expect(mod.def.op).toBe('add');
    expect(mod.def.value).toBe(10);
    expect(mod.def.category).toBe('untyped');
    expect(mod.label).toBe('Unarmored Movement (+10)');
  });
});

// ── SCENARIO-21 — Monk-1, below level gate → 0 mods ─────────────────────────

describe('deriveSpeedModifiers — SCENARIO-21: monk-1, level gate not met', () => {
  it('emits 0 mods — Unarmored Movement requires L2+ (PHB p.77 UM column: L1 = no bonus)', () => {
    // PHB p.77 Monk table: Unarmored Movement column — L1 has no bonus entry.
    // PHB p.78 feature description grants the bonus "starting at 2nd level" implicitly.
    const result = deriveSpeedModifiers(
      {
        classes: [{ classSlug: 'monk', level: 1 }],
        inventory: [],
        itemLites: {},
      },
      CHAR_ID,
    );
    expect(result.mods).toHaveLength(0);
  });
});

// ── SCENARIO-22 — Monk-6 → +15 ───────────────────────────────────────────────

describe('deriveSpeedModifiers — SCENARIO-22: monk-6 → +15', () => {
  it('emits 1 mod with value:15 — L6 threshold on Monk table (PHB p.77)', () => {
    // PHB p.77 Monk table: L6 → +15 ft Unarmored Movement.
    const result = deriveSpeedModifiers(
      {
        classes: [{ classSlug: 'monk', level: 6 }],
        inventory: [],
        itemLites: {},
      },
      CHAR_ID,
    );
    expect(result.mods).toHaveLength(1);
    const mod = result.mods[0]!;
    expect(mod.def.kind).toBe('num');
    expect(mod.def.value).toBe(15);
    expect(mod.label).toBe('Unarmored Movement (+15)');
  });
});

// ── SCENARIO-23 — Monk-10 → +20 ──────────────────────────────────────────────

describe('deriveSpeedModifiers — SCENARIO-23: monk-10 → +20', () => {
  it('emits 1 mod with value:20 — L10 threshold on Monk table (PHB p.77)', () => {
    // PHB p.77 Monk table: L10 → +20 ft Unarmored Movement.
    const result = deriveSpeedModifiers(
      {
        classes: [{ classSlug: 'monk', level: 10 }],
        inventory: [],
        itemLites: {},
      },
      CHAR_ID,
    );
    expect(result.mods).toHaveLength(1);
    const mod = result.mods[0]!;
    expect(mod.def.kind).toBe('num');
    expect(mod.def.value).toBe(20);
    expect(mod.label).toBe('Unarmored Movement (+20)');
  });
});

// ── SCENARIO-24 — Monk-14 → +25 ──────────────────────────────────────────────

describe('deriveSpeedModifiers — SCENARIO-24: monk-14 → +25', () => {
  it('emits 1 mod with value:25 — L14 threshold on Monk table (PHB p.77)', () => {
    // PHB p.77 Monk table: L14 → +25 ft Unarmored Movement.
    const result = deriveSpeedModifiers(
      {
        classes: [{ classSlug: 'monk', level: 14 }],
        inventory: [],
        itemLites: {},
      },
      CHAR_ID,
    );
    expect(result.mods).toHaveLength(1);
    const mod = result.mods[0]!;
    expect(mod.def.kind).toBe('num');
    expect(mod.def.value).toBe(25);
    expect(mod.label).toBe('Unarmored Movement (+25)');
  });
});

// ── SCENARIO-25 — Monk-18 → +30 (final threshold) ────────────────────────────

describe('deriveSpeedModifiers — SCENARIO-25: monk-18 → +30 (final threshold)', () => {
  it('emits 1 mod with value:30 — L18 is final UM threshold (PHB p.77)', () => {
    // PHB p.77 Monk table: L18 → +30 ft Unarmored Movement. L18 is the FINAL
    // increase — NOT L19/L20.
    const result = deriveSpeedModifiers(
      {
        classes: [{ classSlug: 'monk', level: 18 }],
        inventory: [],
        itemLites: {},
      },
      CHAR_ID,
    );
    expect(result.mods).toHaveLength(1);
    const mod = result.mods[0]!;
    expect(mod.def.kind).toBe('num');
    expect(mod.def.value).toBe(30);
    expect(mod.label).toBe('Unarmored Movement (+30)');
  });
});

// ── SCENARIO-26 — Monk-5 → +10 (inherits L2-5 band, NOT L5-keyed) ────────────

describe('deriveSpeedModifiers — SCENARIO-26: monk-5 → +10 (not L5-keyed)', () => {
  it('emits 1 mod with value:10 — L5 still in L2-5 band, bonus does NOT step up at 5 (PHB p.77)', () => {
    // PHB p.77 Monk table: L2-5 → +10 ft. L5 does NOT trigger a new threshold.
    // Proves the table is threshold-keyed at L2, not at L5 for UM.
    const result = deriveSpeedModifiers(
      {
        classes: [{ classSlug: 'monk', level: 5 }],
        inventory: [],
        itemLites: {},
      },
      CHAR_ID,
    );
    expect(result.mods).toHaveLength(1);
    const mod = result.mods[0]!;
    expect(mod.def.kind).toBe('num');
    expect(mod.def.value).toBe(10);
    expect(mod.label).toBe('Unarmored Movement (+10)');
  });
});

// ── SCENARIO-27 — Monk-2 + equipped shield → 0 mods ─────────────────────────

describe('deriveSpeedModifiers — SCENARIO-27: monk-2, equipped shield', () => {
  it('emits 0 mods — shield gate disqualifies (PHB p.78)', () => {
    // PHB p.78: "while you are not wearing armor or wielding a shield"
    const inventory = [makeInventoryItem('shield', 'phb')];
    const itemLites = makeLites([['shield', 'phb', 'S']]);
    const result = deriveSpeedModifiers(
      {
        classes: [{ classSlug: 'monk', level: 2 }],
        inventory,
        itemLites,
      },
      CHAR_ID,
    );
    expect(result.mods).toHaveLength(0);
  });
});

// ── SCENARIO-28 — Monk-2 + equipped light armor → 0 mods ────────────────────

describe('deriveSpeedModifiers — SCENARIO-28: monk-2, equipped light armor', () => {
  it('emits 0 mods — LA body armor disqualifies (PHB p.78; stricter than Fast Movement)', () => {
    // PHB p.78: "while you are not wearing armor" — ALL body armor disqualifies Monk UM.
    // This is stricter than Fast Movement (which only gates on heavy armor).
    const inventory = [makeInventoryItem('leather', 'phb')];
    const itemLites = makeLites([['leather', 'phb', 'LA']]);
    const result = deriveSpeedModifiers(
      {
        classes: [{ classSlug: 'monk', level: 2 }],
        inventory,
        itemLites,
      },
      CHAR_ID,
    );
    expect(result.mods).toHaveLength(0);
  });
});

// ── SCENARIO-29 — Monk-2 + equipped medium armor → 0 mods ───────────────────

describe('deriveSpeedModifiers — SCENARIO-29: monk-2, equipped medium armor', () => {
  it('emits 0 mods — MA body armor disqualifies (PHB p.78)', () => {
    // PHB p.78: "while you are not wearing armor" — medium armor (MA) disqualifies.
    const inventory = [makeInventoryItem('chain-shirt', 'phb')];
    const itemLites = makeLites([['chain-shirt', 'phb', 'MA']]);
    const result = deriveSpeedModifiers(
      {
        classes: [{ classSlug: 'monk', level: 2 }],
        inventory,
        itemLites,
      },
      CHAR_ID,
    );
    expect(result.mods).toHaveLength(0);
  });
});

// ── SCENARIO-30 — Multiclass Barb-5/Monk-2, unarmored → 2 mods, speed = 50 ──

describe('deriveSpeedModifiers — SCENARIO-30: barb-5/monk-2, unarmored (D3 mandatory stack proof)', () => {
  it('emits 2 mods (Fast Movement +10 AND Unarmored Movement +10); resolveStat speed = 50 (PHB p.49 + p.78)', () => {
    // PHB p.49: Barbarian Fast Movement at L5 → +10 (gate: no heavy armor).
    // PHB p.77-78: Monk Unarmored Movement at L2 → +10 (gate: no body armor, no shield).
    // Both untyped op:'add' modifiers STACK — no PHB anti-stack rule for speed bonuses.
    // Base 30 + 10 (FM) + 10 (UM) = 50. Design D3: RAW additive stack.
    const result = deriveSpeedModifiers(
      {
        classes: [
          { classSlug: 'barbarian', level: 5 },
          { classSlug: 'monk', level: 2 },
        ],
        inventory: [],
        itemLites: {},
      },
      CHAR_ID,
    );
    expect(result.mods).toHaveLength(2);

    const fmMod = result.mods.find((m) => m.label === 'Fast Movement (+10)');
    const umMod = result.mods.find((m) => m.label === 'Unarmored Movement (+10)');
    expect(fmMod).toBeDefined();
    expect(umMod).toBeDefined();

    expect(fmMod!.def.kind).toBe('num');
    expect(fmMod!.def.value).toBe(10);

    expect(umMod!.def.kind).toBe('num');
    expect(umMod!.def.value).toBe(10);

    // resolveStat integration: both mods registered → walk = 50.
    const registry = createInMemoryRegistry();
    const ctx: EvaluationContext = {
      self: { id: CHAR_ID, conditions: [] },
      activeConditions: [],
    };
    for (const mod of result.mods) {
      registry.register(mod);
    }
    const resolved = resolveStat(CHAR_ID, 'speed', 30, ctx, registry);
    expect(resolved.value).toBe(50);
    expect(resolved.breakdown).toHaveLength(2);
    const labels = resolved.breakdown.map((b) => b.label);
    expect(labels).toContain('Fast Movement (+10)');
    expect(labels).toContain('Unarmored Movement (+10)');
  });
});

// ── SCENARIO-31 — Provenance: resolveStat breakdown has UM label (W3 regression) ──

describe('deriveSpeedModifiers — SCENARIO-31: resolveStat provenance (W3 regression guard)', () => {
  it('resolveStat("speed", 30) = 40 and breakdown has exactly 1 entry labeled "Unarmored Movement (+10)" (PHB p.78)', () => {
    // Batch 3 W3 lesson: mods may be emitted but never flow through resolveStat.
    // This test proves the UM mod ACTUALLY reaches resolveStat and is summed.
    // PHB p.78: monk-2, unarmored, no shield → +10 walk. 30 + 10 = 40.
    const registry = createInMemoryRegistry();
    const ctx: EvaluationContext = {
      self: { id: CHAR_ID, conditions: [] },
      activeConditions: [],
    };
    const { mods } = deriveSpeedModifiers(
      {
        classes: [{ classSlug: 'monk', level: 2 }],
        inventory: [],
        itemLites: {},
      },
      CHAR_ID,
    );
    for (const mod of mods) {
      registry.register(mod);
    }
    const resolved = resolveStat(CHAR_ID, 'speed', 30, ctx, registry);
    expect(resolved.value).toBe(40);
    expect(resolved.breakdown).toHaveLength(1);
    expect(resolved.breakdown[0]!.label).toBe('Unarmored Movement (+10)');
    expect(resolved.breakdown[0]!.amount).toBe(10);
  });
});

// ── SCENARIO-32 — Composition order: UM boost then exhaustion halving ─────────

describe('deriveSpeedModifiers — SCENARIO-32: composition order (D5 lock)', () => {
  it('monk-2, base 30, exhaustion-2 → resolveStat=40 then applyExhaustionToSpeed → 20 (PHB p.78 + p.291)', () => {
    // PHB p.78: Monk UM bonus → walk = 40 (base 30 + 10).
    // PHB p.291: exhaustion level 2 halves speed. Applied AFTER boost: floor(40/2) = 20.
    // Proves order: boost (resolveStat) → then penalty (applyExhaustionToSpeed).
    // REQ-UM-09: "UM bonus applied before penalties" (D5 composition lock).
    const registry = createInMemoryRegistry();
    const ctx: EvaluationContext = {
      self: { id: CHAR_ID, conditions: [] },
      activeConditions: [],
    };
    const { mods } = deriveSpeedModifiers(
      {
        classes: [{ classSlug: 'monk', level: 2 }],
        inventory: [],
        itemLites: {},
      },
      CHAR_ID,
    );
    for (const mod of mods) {
      registry.register(mod);
    }
    // Step 1: resolve boosted walk speed.
    const boosted = resolveStat(CHAR_ID, 'speed', 30, ctx, registry);
    expect(boosted.value).toBe(40);
    // Step 2: apply exhaustion level 2 (speed-halved) after the boost.
    // PHB p.291: exhaustion L2 effect = speed halved.
    const exhaustedSpeed = applyExhaustionToSpeed(
      { walk: boosted.value },
      ['speed-halved'],
    );
    expect(exhaustedSpeed.walk).toBe(20); // floor(40/2) = 20, NOT floor(30/2)+10 = 25
  });
});

// ── SCENARIO-16 — resolveStat provenance: barbarian-5 unarmored speed = 40 ──

describe('deriveSpeedModifiers — SCENARIO-16: resolveStat provenance (REQ-SPEED-13)', () => {
  it('resolveStat("speed", 30, …) = 40 and breakdown has exactly 1 entry with label "Fast Movement (+10)" (PHB p.49)', () => {
    // PHB p.49: "Starting at 5th level, your speed increases by 10 feet while
    // you aren't wearing heavy armor." Base walk 30 → resolved 40.
    // REQ-SPEED-13 (provenance): SCENARIO-16 sub-requirement — breakdown must
    // include exactly 1 entry whose label contains 'Fast Movement' so that the
    // route can surface the modifier source to the client.
    const registry = createInMemoryRegistry();
    const ctx: EvaluationContext = {
      self: { id: CHAR_ID, conditions: [] },
      activeConditions: [],
    };

    // Derive and register Fast Movement modifier for a qualifying barbarian-5.
    const { mods } = deriveSpeedModifiers(
      {
        classes: [{ classSlug: 'barbarian', level: 5 }],
        inventory: [],
        itemLites: {},
      },
      CHAR_ID,
    );
    for (const mod of mods) {
      registry.register(mod);
    }

    const resolved = resolveStat(CHAR_ID, 'speed', 30, ctx, registry);

    // Total must be base 30 + Fast Movement +10 = 40.
    expect(resolved.value).toBe(40);

    // Breakdown provenance: exactly 1 entry with label containing 'Fast Movement'.
    const fastMovementSources = resolved.breakdown.filter(
      (s) => typeof s.label === 'string' && s.label.includes('Fast Movement'),
    );
    expect(fastMovementSources).toHaveLength(1);
    expect(fastMovementSources[0]!.label).toBe('Fast Movement (+10)');
    expect(fastMovementSources[0]!.amount).toBe(10);
  });
});
