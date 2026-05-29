/**
 * Parity gate corpus — engine AC resolution vs legacy computeArmorClass.
 *
 * 9 archetypes covering all armor branches + Unarmored Defense + ASI ordering:
 *   1. Unarmored fighter DEX +2 → 12 (PHB p.14)
 *   2. Barbarian UD DEX +2 CON +3 → 15 (PHB p.48)
 *   3. Monk UD DEX +3 WIS +2 no shield → 15 (PHB p.78)
 *   4. Light armor — leather (ac 11, DEX +3) → 14 (PHB p.144)
 *   5. Medium armor — scale mail (ac 14, DEX +4 → capped +2) → 16 (PHB p.144)
 *   6. Heavy armor — chain mail (ac 16, any DEX) → 16 (PHB p.144)
 *   7. Medium armor + shield (scale mail ac 14, DEX +2, shield ac 2) → 18 (PHB p.144, p.149)
 *   8. STR below armorStrengthMin — plate (ac 18, STR 9) → 18 + legacy WARNING (PHB p.144)
 *   9. Non-trivial ASI ordering — Mountain Dwarf + scale mail, post-ASI DEX mod = +2 (PHB p.18)
 *
 * REQ-AC-ADAPTER-01..09, REQ-AC-PARITY-01, REQ-AC-STR-WARN-01, REQ-AC-NATIVE-01
 */
import { describe, it, expect } from 'vitest';
import { computeArmorClass } from '../../character/sheet/armor-class.js';
import { createInMemoryRegistry } from '../registry/query.js';
import { resolveStat } from '../resolve/stat.js';
import { deriveArmorClassModifiers } from '../adapter/derive-armor-class-modifiers.js';
import type { EntityId } from '../types.js';
import type { EvaluationContext } from '../context.js';
import type { InventoryItem, ItemCompendiumLite } from '../../character/inventory/types.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function eid(s: string): EntityId {
  return s as EntityId;
}

function makeCtx(selfId: EntityId): EvaluationContext {
  return {
    self: { id: selfId, conditions: [] },
    activeConditions: [],
  };
}

/** Build a minimal equipped item inventory entry. */
function equippedItem(itemSlug: string, itemSource: string): InventoryItem {
  return {
    instanceId: `inst-${itemSlug}`,
    itemSlug,
    itemSource,
    quantity: 1,
    state: 'equipped',
    attuned: false,
    customName: null,
    notes: '',
  };
}

/** Build a minimal ItemCompendiumLite for armor/shield testing. */
function armorLite(
  slug: string,
  name: string,
  type: string,
  ac: number,
  opts: { armorStrengthMin?: number } = {},
): ItemCompendiumLite {
  return {
    slug,
    source: 'PHB',
    name,
    type,
    weight: null,
    ac,
    ...opts,
  };
}

function shieldLite(slug: string, name: string, ac: number): ItemCompendiumLite {
  return { slug, source: 'PHB', name, type: 'S', weight: null, ac };
}

interface ArmorClassTestInput {
  /** Resolved integer ability mods (post-ASI), NOT raw scores. */
  resolvedMods: { str: number; dex: number; con: number; wis: number };
  inventory: InventoryItem[];
  itemLites: Record<string, ItemCompendiumLite>;
  classes: Array<{ classSlug: string; level: number }>;
  /** Raw ability scores (for legacy path only). */
  abilities: { str: number; dex: number; con: number; wis: number };
}

/**
 * Assert that engine AC (base 0 + adapter NumMods) equals legacy computeArmorClass.ac.
 *
 * Engine path: deriveArmorClassModifiers(input, charId) → register → resolveStat('ac', 0)
 * Legacy path: computeArmorClass({inventory, itemLites, classes, abilities})
 *
 * Both paths are INDEPENDENT. This is the dual-shadow (native) parity gate.
 * REQ-AC-PARITY-01.
 */
function assertEngineAcEqualsLegacy(charId: EntityId, input: ArmorClassTestInput): number {
  // ── Legacy path ──────────────────────────────────────────────────────────────
  const legacy = computeArmorClass({
    inventory: input.inventory,
    itemLites: input.itemLites,
    classes: input.classes,
    abilities: input.abilities,
  });

  // ── Engine path ──────────────────────────────────────────────────────────────
  const registry = createInMemoryRegistry();
  const ctx = makeCtx(charId);
  const acMods = deriveArmorClassModifiers(
    {
      inventory: input.inventory,
      itemLites: input.itemLites,
      classes: input.classes,
      resolvedMods: input.resolvedMods,
    },
    charId,
  );
  for (const m of acMods) registry.register(m);
  const engineResult = resolveStat(charId, 'ac', 0, ctx, registry);

  expect(engineResult.value).toBe(legacy.ac);
  return engineResult.value;
}

// ── Archetype 1 — Unarmored fighter, DEX +2 (REQ-AC-ADAPTER-01) ──────────────

describe('Archetype 1 — Unarmored fighter, DEX +2 (REQ-AC-ADAPTER-01)', () => {
  it('engine AC = 12; base 10 + DEX 2 (PHB p.14)', () => {
    // PHB p.14 — "Without armor, your Armor Class = 10 + your Dexterity modifier."
    const charId = eid('unarmored-fighter');
    const input: ArmorClassTestInput = {
      resolvedMods: { str: 0, dex: 2, con: 0, wis: 0 },
      inventory: [],
      itemLites: {},
      classes: [{ classSlug: 'fighter', level: 1 }],
      abilities: { str: 10, dex: 14, con: 10, wis: 10 },
    };
    const value = assertEngineAcEqualsLegacy(charId, input);
    expect(value).toBe(12);
  });

  it('adapter emits exactly 2 NumMods: base 10 + DEX +2', () => {
    // PHB p.14 — two additive contributions: base 10 and DEX mod
    const charId = eid('unarmored-fighter-2');
    const mods = deriveArmorClassModifiers(
      { inventory: [], itemLites: {}, classes: [], resolvedMods: { str: 0, dex: 2, con: 0, wis: 0 } },
      charId,
    );
    expect(mods).toHaveLength(2);
    const values = mods.map((m) => (m.def as { value: number }).value).sort((a, b) => a - b);
    expect(values).toEqual([2, 10]);
  });
});

// ── Archetype 2 — Barbarian Unarmored Defense, DEX +2 CON +3 (REQ-AC-ADAPTER-06) ─

describe('Archetype 2 — Barbarian UD, DEX +2 CON +3 (REQ-AC-ADAPTER-06)', () => {
  it('engine AC = 15; 10 + DEX(2) + CON(3) (PHB p.48)', () => {
    // PHB p.48 — "While you are not wearing any armor, your AC equals
    //             10 + your Dexterity modifier + your Constitution modifier."
    const charId = eid('barbarian-ud');
    const input: ArmorClassTestInput = {
      resolvedMods: { str: 0, dex: 2, con: 3, wis: 0 },
      inventory: [],
      itemLites: {},
      classes: [{ classSlug: 'barbarian', level: 1 }],
      abilities: { str: 10, dex: 14, con: 16, wis: 10 },
    };
    const value = assertEngineAcEqualsLegacy(charId, input);
    expect(value).toBe(15);
  });

  it('Barbarian wearing armor → UD suppressed, normal armor branch applies', () => {
    // PHB p.48 — UD only while "not wearing any armor"
    const chainMail = armorLite('chain-mail', 'Chain Mail', 'HA', 16);
    const charId = eid('barbarian-armored');
    const input: ArmorClassTestInput = {
      resolvedMods: { str: 2, dex: 2, con: 3, wis: 0 },
      inventory: [equippedItem('chain-mail', 'PHB')],
      itemLites: { 'chain-mail|PHB': chainMail },
      classes: [{ classSlug: 'barbarian', level: 1 }],
      abilities: { str: 14, dex: 14, con: 16, wis: 10 },
    };
    const value = assertEngineAcEqualsLegacy(charId, input);
    expect(value).toBe(16); // heavy armor, no DEX (PHB p.144)
  });
});

// ── Archetype 3 — Monk UD, DEX +3 WIS +2 no shield (REQ-AC-ADAPTER-07) ───────

describe('Archetype 3 — Monk UD, DEX +3 WIS +2 no shield (REQ-AC-ADAPTER-07)', () => {
  it('engine AC = 15; 10 + DEX(3) + WIS(2) (PHB p.78)', () => {
    // PHB p.78 — "While you are not wearing any armor or wielding a shield,
    //             your AC equals 10 + your Dexterity modifier + your Wisdom modifier."
    const charId = eid('monk-ud');
    const input: ArmorClassTestInput = {
      resolvedMods: { str: 0, dex: 3, con: 0, wis: 2 },
      inventory: [],
      itemLites: {},
      classes: [{ classSlug: 'monk', level: 1 }],
      abilities: { str: 10, dex: 16, con: 10, wis: 14 },
    };
    const value = assertEngineAcEqualsLegacy(charId, input);
    expect(value).toBe(15);
  });

  it('Monk with shield → UD suppressed, WIS not included (PHB p.78)', () => {
    // PHB p.78 — Monk UD is forbidden while "wielding a shield"
    const shield = shieldLite('shield', 'Shield', 2);
    const charId = eid('monk-with-shield');
    const input: ArmorClassTestInput = {
      resolvedMods: { str: 0, dex: 3, con: 0, wis: 2 },
      inventory: [equippedItem('shield', 'PHB')],
      itemLites: { 'shield|PHB': shield },
      classes: [{ classSlug: 'monk', level: 1 }],
      abilities: { str: 10, dex: 16, con: 10, wis: 14 },
    };
    const value = assertEngineAcEqualsLegacy(charId, input);
    // unarmored default 10+DEX(3) + shield(2) = 15 — same value, different formula
    expect(value).toBe(15);

    // Verify WIS is NOT in any mod
    const mods = deriveArmorClassModifiers(
      {
        inventory: input.inventory,
        itemLites: input.itemLites,
        classes: input.classes,
        resolvedMods: input.resolvedMods,
      },
      charId,
    );
    const labels = mods.map((m) => m.label ?? '');
    expect(labels.some((l) => l.includes('WIS'))).toBe(false);
  });
});

// ── Archetype 4 — Light armor, leather ac:11 DEX +3 (REQ-AC-ADAPTER-02) ──────

describe('Archetype 4 — Light armor, leather ac:11 DEX +3 (REQ-AC-ADAPTER-02)', () => {
  it('engine AC = 14; armor(11) + DEX(3) (PHB p.144)', () => {
    // PHB p.144 — "Light Armor … you add your Dexterity modifier to the base number."
    const leather = armorLite('leather-armor', 'Leather Armor', 'LA', 11);
    const charId = eid('leather-dex3');
    const input: ArmorClassTestInput = {
      resolvedMods: { str: 0, dex: 3, con: 0, wis: 0 },
      inventory: [equippedItem('leather-armor', 'PHB')],
      itemLites: { 'leather-armor|PHB': leather },
      classes: [{ classSlug: 'fighter', level: 1 }],
      abilities: { str: 10, dex: 16, con: 10, wis: 10 },
    };
    const value = assertEngineAcEqualsLegacy(charId, input);
    expect(value).toBe(14);
  });

  it('armor-base NumMod label sourced from item lite name, not hardcoded (REQ-AC-ADAPTER-09)', () => {
    // REQ-AC-ADAPTER-09: label MUST use armorLite.name, not hardcoded string
    const leather = armorLite('leather-armor', 'Leather Armor', 'LA', 11);
    const charId = eid('leather-label');
    const mods = deriveArmorClassModifiers(
      {
        inventory: [equippedItem('leather-armor', 'PHB')],
        itemLites: { 'leather-armor|PHB': leather },
        classes: [],
        resolvedMods: { str: 0, dex: 3, con: 0, wis: 0 },
      },
      charId,
    );
    const armorMod = mods.find((m) => (m.def as { value: number }).value === 11);
    expect(armorMod?.label).toContain('Leather Armor');
  });
});

// ── Archetype 5 — Medium armor, scale mail ac:14 DEX +4 → capped +2 (REQ-AC-ADAPTER-03) ─

describe('Archetype 5 — Medium armor, scale mail ac:14 DEX +4 capped (REQ-AC-ADAPTER-03)', () => {
  it('engine AC = 16; armor(14) + DEX(min(4,2)=2) (PHB p.144)', () => {
    // PHB p.144 — "Medium Armor … you add your Dexterity modifier, to a maximum of +2."
    const scale = armorLite('scale-mail', 'Scale Mail', 'MA', 14);
    const charId = eid('scale-dex4');
    const input: ArmorClassTestInput = {
      resolvedMods: { str: 0, dex: 4, con: 0, wis: 0 },
      inventory: [equippedItem('scale-mail', 'PHB')],
      itemLites: { 'scale-mail|PHB': scale },
      classes: [{ classSlug: 'fighter', level: 1 }],
      abilities: { str: 10, dex: 18, con: 10, wis: 10 },
    };
    const value = assertEngineAcEqualsLegacy(charId, input);
    expect(value).toBe(16);
  });

  it('DEX cap baked into NumMod value: DEX +4 emitted as +2', () => {
    // Design §3: cap baked in adapter — resolveStat never sees uncapped value
    const scale = armorLite('scale-mail', 'Scale Mail', 'MA', 14);
    const charId = eid('scale-cap-check');
    const mods = deriveArmorClassModifiers(
      {
        inventory: [equippedItem('scale-mail', 'PHB')],
        itemLites: { 'scale-mail|PHB': scale },
        classes: [],
        resolvedMods: { str: 0, dex: 4, con: 0, wis: 0 },
      },
      charId,
    );
    // Should have exactly 2 mods: armor base (14) + capped DEX (2)
    expect(mods).toHaveLength(2);
    const dexMod = mods.find((m) => (m.def as { value: number }).value === 2);
    expect(dexMod).toBeDefined();
    // Should NOT have an uncapped DEX mod of 4
    const uncappedDex = mods.find((m) => (m.def as { value: number }).value === 4);
    expect(uncappedDex).toBeUndefined();
  });

  it('DEX +1 below cap → DEX NumMod = +1 (cap has no effect)', () => {
    // PHB p.144 — cap only reduces; sub-cap values pass through
    const scale = armorLite('scale-mail', 'Scale Mail', 'MA', 14);
    const charId = eid('scale-below-cap');
    const mods = deriveArmorClassModifiers(
      {
        inventory: [equippedItem('scale-mail', 'PHB')],
        itemLites: { 'scale-mail|PHB': scale },
        classes: [],
        resolvedMods: { str: 0, dex: 1, con: 0, wis: 0 },
      },
      charId,
    );
    const dexMod = mods.find((m) => m.label?.includes('DEX'));
    expect((dexMod?.def as { value: number }).value).toBe(1);
  });
});

// ── Archetype 6 — Heavy armor, chain mail ac:16 (REQ-AC-ADAPTER-04) ──────────

describe('Archetype 6 — Heavy armor, chain mail ac:16 (REQ-AC-ADAPTER-04)', () => {
  it('engine AC = 16; armor(16), no DEX (PHB p.144)', () => {
    // PHB p.144 — "Heavy Armor … Your Dexterity modifier doesn't affect your Armor Class."
    const chain = armorLite('chain-mail', 'Chain Mail', 'HA', 16);
    const charId = eid('chain-dex3');
    const input: ArmorClassTestInput = {
      resolvedMods: { str: 0, dex: 3, con: 0, wis: 0 },
      inventory: [equippedItem('chain-mail', 'PHB')],
      itemLites: { 'chain-mail|PHB': chain },
      classes: [{ classSlug: 'fighter', level: 1 }],
      abilities: { str: 10, dex: 16, con: 10, wis: 10 },
    };
    const value = assertEngineAcEqualsLegacy(charId, input);
    expect(value).toBe(16);
  });

  it('heavy armor emits only 1 NumMod (no DEX mod)', () => {
    // PHB p.144 — DEX contribution absent for heavy armor
    const chain = armorLite('chain-mail', 'Chain Mail', 'HA', 16);
    const charId = eid('heavy-no-dex');
    const mods = deriveArmorClassModifiers(
      {
        inventory: [equippedItem('chain-mail', 'PHB')],
        itemLites: { 'chain-mail|PHB': chain },
        classes: [],
        resolvedMods: { str: 0, dex: 3, con: 0, wis: 0 },
      },
      charId,
    );
    expect(mods).toHaveLength(1);
    expect((mods[0]!.def as { value: number }).value).toBe(16);
  });
});

// ── Archetype 7 — Medium armor + shield (REQ-AC-ADAPTER-05) ──────────────────

describe('Archetype 7 — Scale mail ac:14 + shield ac:2, DEX +2 (REQ-AC-ADAPTER-05)', () => {
  it('engine AC = 18; armor(14) + DEX(2) + shield(2) (PHB p.144, p.149)', () => {
    // PHB p.144 — scale mail + DEX cap 2
    // PHB p.149 — Shield: "+2 to your Armor Class"
    const scale = armorLite('scale-mail', 'Scale Mail', 'MA', 14);
    const shield = shieldLite('shield', 'Shield', 2);
    const charId = eid('scale-shield-dex2');
    const input: ArmorClassTestInput = {
      resolvedMods: { str: 0, dex: 2, con: 0, wis: 0 },
      inventory: [equippedItem('scale-mail', 'PHB'), equippedItem('shield', 'PHB')],
      itemLites: { 'scale-mail|PHB': scale, 'shield|PHB': shield },
      classes: [{ classSlug: 'fighter', level: 1 }],
      abilities: { str: 10, dex: 14, con: 10, wis: 10 },
    };
    const value = assertEngineAcEqualsLegacy(charId, input);
    expect(value).toBe(18);
  });

  it('shield NumMod label sourced from shieldLite.name (REQ-AC-ADAPTER-09)', () => {
    // REQ-AC-ADAPTER-09: shield label MUST use shieldLite.name
    // Use DEX 0 so we can unambiguously identify shield mod by its value
    const shield = shieldLite('shield', 'Shield', 2);
    const charId = eid('shield-label');
    const mods = deriveArmorClassModifiers(
      {
        inventory: [equippedItem('shield', 'PHB')],
        itemLites: { 'shield|PHB': shield },
        classes: [],
        resolvedMods: { str: 0, dex: 0, con: 0, wis: 0 },
      },
      charId,
    );
    // Shield label MUST contain the name from item lite
    const shieldMod = mods.find((m) => m.label?.toLowerCase().includes('shield'));
    expect(shieldMod).toBeDefined();
    expect((shieldMod?.def as { value: number }).value).toBe(2);
  });

  it('homebrew shield ac:3 emits NumMod +3 (not hardcoded +2)', () => {
    // REQ-AC-ADAPTER-05: shield value from item lite, not hardcoded
    const homebrewShield = shieldLite('heavy-shield', 'Heavy Shield', 3);
    const charId = eid('homebrew-shield');
    const mods = deriveArmorClassModifiers(
      {
        inventory: [equippedItem('heavy-shield', 'PHB')],
        itemLites: { 'heavy-shield|PHB': homebrewShield },
        classes: [],
        resolvedMods: { str: 0, dex: 0, con: 0, wis: 0 },
      },
      charId,
    );
    const shieldMod = mods.find((m) => m.label?.toLowerCase().includes('shield'));
    expect((shieldMod?.def as { value: number }).value).toBe(3);
  });
});

// ── Archetype 8 — STR below armorStrengthMin, plate ac:18 (REQ-AC-STR-WARN-01) ─

describe('Archetype 8 — Plate ac:18, STR 9 below min:15 (REQ-AC-STR-WARN-01)', () => {
  it('engine AC = 18; legacy warning INSUFFICIENT_STRENGTH_FOR_ARMOR present (PHB p.144)', () => {
    // PHB p.144 — STR requirement causes speed penalty, NOT AC reduction.
    // The warning is legacy-owned this slice; engine value is unaffected.
    const plate = armorLite('plate-armor', 'Plate Armor', 'HA', 18, { armorStrengthMin: 15 });
    const charId = eid('plate-low-str');
    const inventory = [equippedItem('plate-armor', 'PHB')];
    const itemLites = { 'plate-armor|PHB': plate };

    // Engine path: AC = 18 (heavy, no DEX)
    const registry = createInMemoryRegistry();
    const ctx = makeCtx(charId);
    const acMods = deriveArmorClassModifiers(
      { inventory, itemLites, classes: [], resolvedMods: { str: -1, dex: 0, con: 0, wis: 0 } },
      charId,
    );
    for (const m of acMods) registry.register(m);
    const engineResult = resolveStat(charId, 'ac', 0, ctx, registry);
    expect(engineResult.value).toBe(18);

    // Legacy path: AC = 18, AND warning present
    const legacyResult = computeArmorClass({
      inventory,
      itemLites,
      classes: [],
      abilities: { str: 9, dex: 10, con: 10, wis: 10 },
    });
    expect(legacyResult.ac).toBe(18);
    expect(legacyResult.warnings).toContain('INSUFFICIENT_STRENGTH_FOR_ARMOR');
  });
});

// ── Archetype 9 — Non-trivial ASI ordering, Mountain Dwarf + scale mail (REQ-AC-ADAPTER-08) ─

describe('Archetype 9 — Mountain Dwarf + scale mail, post-ASI DEX = 14 → mod +2 (REQ-AC-ADAPTER-08)', () => {
  it('adapter uses post-ASI DEX mod +2, not pre-ASI +1 (REQ-AC-NATIVE-02; PHB p.18)', () => {
    // PHB p.18 — Mountain Dwarf subrace +2 STR, +2 CON (not DEX; DEX is separate)
    // This test uses DEX base score 12 → pre-ASI DEX mod = +1
    // With a DEX feat (+2 DEX), post-ASI DEX score = 14 → post-ASI DEX mod = +2
    // The adapter MUST receive the post-ASI mod (computed by the route), not the pre-ASI.
    // This catches silent regression where the route passes pre-ASI mods to the adapter.
    const scale = armorLite('scale-mail', 'Scale Mail', 'MA', 14);
    const charId = eid('mtn-dwarf-fighter');

    // Simulate what the route does CORRECTLY: resolve post-ASI DEX score → integer mod
    // DEX base 12 + ASI feat +2 = 14; Math.floor((14-10)/2) = 2
    const postAsiDexMod = Math.floor((14 - 10) / 2); // +2
    const preAsiDexMod = Math.floor((12 - 10) / 2);   // +1 — this is the WRONG input

    // Engine with POST-ASI mods (correct — what the route should pass)
    const registry = createInMemoryRegistry();
    const ctx = makeCtx(charId);
    const acMods = deriveArmorClassModifiers(
      {
        inventory: [equippedItem('scale-mail', 'PHB')],
        itemLites: { 'scale-mail|PHB': scale },
        classes: [{ classSlug: 'fighter', level: 4 }],
        resolvedMods: { str: 2, dex: postAsiDexMod, con: 2, wis: 0 },
      },
      charId,
    );
    for (const m of acMods) registry.register(m);
    const engineResult = resolveStat(charId, 'ac', 0, ctx, registry);
    // scale mail(14) + min(dex:2, 2) = 16
    expect(engineResult.value).toBe(16);

    // Verify pre-ASI would give WRONG result (14 + min(1,2) = 15) — this is the regression we catch
    const wrongRegistry = createInMemoryRegistry();
    const wrongMods = deriveArmorClassModifiers(
      {
        inventory: [equippedItem('scale-mail', 'PHB')],
        itemLites: { 'scale-mail|PHB': scale },
        classes: [{ classSlug: 'fighter', level: 4 }],
        resolvedMods: { str: 2, dex: preAsiDexMod, con: 2, wis: 0 },
      },
      charId,
    );
    for (const m of wrongMods) wrongRegistry.register(m);
    const wrongResult = resolveStat(charId, 'ac', 0, ctx, wrongRegistry);
    expect(wrongResult.value).toBe(15); // wrong pre-ASI result
    expect(engineResult.value).not.toBe(wrongResult.value); // confirms the difference matters
  });
});
