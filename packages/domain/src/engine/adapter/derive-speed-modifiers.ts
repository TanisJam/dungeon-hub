/**
 * derive-speed-modifiers — barbarian class + armor state → speed NumMod[] adapter.
 *
 * Pure domain helper. No IO, no registry access.
 *
 * Projects the character's class levels and equipped armor state into
 * ModifierInstance[] ready for registry.register(), mirroring the structure
 * of derive-armor-class-modifiers.ts.
 *
 * Fast Movement (PHB p.49):
 *   "Starting at 5th level, your speed increases by 10 feet while you
 *    aren't wearing heavy armor."
 *
 * Unarmored Movement (PHB p.77-78):
 *   "Your speed increases by 10 feet while you are not wearing armor or
 *   wielding a shield. This bonus increases when you reach certain monk
 *   levels, as shown in the Monk table."
 *
 * Qualification logic (Fast Movement):
 *   1. Sum of all class entries where classSlug === 'barbarian' >= 5 (class level, not total).
 *   2. No heavy-armor item ('HA' type) is equipped in the body slot.
 *   Both conditions true → emit +10 NumMod; else emit nothing.
 *
 * Qualification logic (Unarmored Movement):
 *   1. Sum of all class entries where classSlug === 'monk' >= 2 (class level, not total).
 *   2. No body armor (LA/MA/HA) is equipped.
 *   3. No shield ('S') is equipped.
 *   All three conditions true → emit +N NumMod (N from umBonusForMonkLevel); else emit nothing.
 *
 * Both branches are independent — their mods stack additively (both untyped op:'add').
 * A Barb-5/Monk-2, unarmored character gets both +10 mods → walk = base + 20.
 * No PHB anti-stack rule exists for speed bonuses (contrast PHB p.198 Extra Attack).
 *
 * Design ref: sdd/engine-barbarian-dsl-3/design D1-D3,
 *             sdd/engine-barbarian-dsl-4/design D1-D5.
 * REQ-SPEED-01, REQ-SPEED-02, REQ-SPEED-03, REQ-SPEED-04, REQ-SPEED-05,
 * REQ-SPEED-11, REQ-SPEED-12, REQ-SPEED-13, REQ-OOS-01.
 * REQ-UM-01..14, REQ-REG-01, REQ-OOS-04.
 */

import type { InventoryItem, ItemCompendiumLite } from '../../character/inventory/types.js';
import { findFirstEquipped, BODY_ARMOR_TYPES, SHIELD_TYPE } from '../../character/sheet/armor-class.js';
import type { EntityId } from '../types.js';
import type { ModifierInstance, ModifierInstanceId } from '../registry/types.js';

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * Narrow input slice consumed by the adapter.
 * Mirrors ArmorClassModifierInput structure (design D1).
 * REQ-OOS-04 / REQ-UM-08: shape MUST NOT gain new fields — existing 3 fields carry
 * everything needed for both Fast Movement and Unarmored Movement.
 */
export interface SpeedModifierInput {
  inventory: InventoryItem[];
  itemLites: Record<string, ItemCompendiumLite>;
  classes: Array<{ classSlug: string; level: number }>;
}

export interface SpeedModifierResult {
  mods: ModifierInstance[];
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/** 5etools type code for heavy armor. Used by Fast Movement gate only. */
const HEAVY_ARMOR_TYPE = 'HA';

/** Module-scope ID counter — mirrors derive-armor-class-modifiers.ts:74-77. */
let _instanceCounter = 0;
function nextId(prefix: string): ModifierInstanceId {
  return `${prefix}-${++_instanceCounter}` as ModifierInstanceId;
}

/**
 * Returns the Unarmored Movement speed bonus for a given monk class level.
 *
 * PHB p.77 Monk table, Unarmored Movement column:
 *   L<2  → +0  (no bonus)
 *   L2-5 → +10
 *   L6-9 → +15
 *   L10-13 → +20
 *   L14-17 → +25
 *   L18+   → +30 (final threshold — NOT L19/L20)
 *
 * Descending-threshold form mirrors attacksForClass in extra-attacks.ts (D2).
 * Module-private: no other consumer (mirrors Fighter threshold inlining pattern).
 */
function umBonusForMonkLevel(level: number): number {
  if (level >= 18) return 30;
  if (level >= 14) return 25;
  if (level >= 10) return 20;
  if (level >= 6)  return 15;
  if (level >= 2)  return 10;
  return 0;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Derives speed ModifierInstances from the character's class levels and
 * equipped inventory.
 *
 * Emits 0, 1, or 2 ModifierInstances (one per independent qualifying branch):
 *   - Fast Movement: barbarian class level ≥ 5 AND no heavy armor equipped.
 *   - Unarmored Movement: monk class level ≥ 2 AND no body armor AND no shield.
 *   Both can fire simultaneously (additive untyped speed bonuses — D3 RAW stack).
 *
 * PHB p.49: "Starting at 5th level, your speed increases by 10 feet
 * while you aren't wearing heavy armor."
 * PHB p.78: "Your speed increases by 10 feet while you are not wearing
 * armor or wielding a shield."
 *
 * @param input  - Narrow slice: classes, inventory, itemLites.
 * @param charId - EntityId of the owning character.
 * @returns { mods: ModifierInstance[] }
 */
export function deriveSpeedModifiers(
  input: SpeedModifierInput,
  charId: EntityId,
): SpeedModifierResult {
  const { inventory, itemLites, classes } = input;

  // Accumulate mods from independent branches (REQ-UM-07: early-return → accumulate).
  const mods: ModifierInstance[] = [];

  // ── Branch 1: Fast Movement (PHB p.49) ─────────────────────────────────────
  //
  // Gate 1: barbarian class level >= 5 (PHB p.49 — class level, not total level).
  const barbarianLevel = classes
    .filter((c) => c.classSlug === 'barbarian')
    .reduce((sum, c) => sum + c.level, 0);

  if (barbarianLevel >= 5) {
    // Gate 2: no heavy armor equipped (PHB p.49 — "while you aren't wearing heavy armor").
    // Reuses findFirstEquipped from armor-class.ts (design D2).
    // REQ-SPEED-02: only equipped heavy armor disqualifies (state === 'equipped').
    const heavyArmorEquipped = findFirstEquipped(inventory, itemLites, new Set([HEAVY_ARMOR_TYPE]));

    if (heavyArmorEquipped === null) {
      // Both conditions met — emit +10 Fast Movement modifier.
      // REQ-SPEED-03: stat:'speed' → walk speed only.
      // REQ-SPEED-13: 'speed' already in StatKeySchema.
      mods.push({
        id: nextId('speed-fast-movement'),
        def: { kind: 'num', op: 'add', value: 10, stat: 'speed', category: 'untyped' },
        scope: { owner: charId, target: { axis: 'self' }, trigger: 'always' },
        label: 'Fast Movement (+10)',
      });
    }
  }

  // ── Branch 2: Unarmored Movement (PHB p.77-78) ──────────────────────────────
  //
  // Gate 1: monk class level >= 2 (PHB p.77 UM column; class level, not total).
  // REQ-UM-04: monk class level = sum of classSlug==='monk' entries.
  const monkLevel = classes
    .filter((c) => c.classSlug === 'monk')
    .reduce((sum, c) => sum + c.level, 0);

  const umBonus = umBonusForMonkLevel(monkLevel);

  if (umBonus > 0) {
    // Gate 2: no body armor equipped (PHB p.78 — "not wearing armor").
    // REQ-UM-02: ALL body armor disqualifies (LA/MA/HA — stricter than Fast Movement).
    // BODY_ARMOR_TYPES = Set(['LA','MA','HA']) from armor-class.ts:21.
    const bodyArmorEquipped = findFirstEquipped(inventory, itemLites, BODY_ARMOR_TYPES);

    // Gate 3: no shield equipped (PHB p.78 — "not wielding a shield").
    // REQ-UM-03: SHIELD_TYPE = 'S' from armor-class.ts:19.
    const shieldEquipped = findFirstEquipped(inventory, itemLites, new Set([SHIELD_TYPE]));

    if (bodyArmorEquipped === null && shieldEquipped === null) {
      // All three conditions met — emit +N Unarmored Movement modifier.
      // REQ-UM-05: exact mod shape. REQ-UM-14: id prefix 'speed-unarmored-movement'.
      mods.push({
        id: nextId('speed-unarmored-movement'),
        def: { kind: 'num', op: 'add', value: umBonus, stat: 'speed', category: 'untyped' },
        scope: { owner: charId, target: { axis: 'self' }, trigger: 'always' },
        label: `Unarmored Movement (+${umBonus})`,
      });
    }
  }

  return { mods };
}
