/**
 * derive-speed-modifiers — barbarian class + armor state → speed NumMod[] adapter.
 *
 * Pure domain helper. No IO, no registry access.
 *
 * Projects the character's barbarian class levels and equipped armor state
 * into ModifierInstance[] ready for registry.register(), mirroring the
 * structure of derive-armor-class-modifiers.ts.
 *
 * Fast Movement (PHB p.49):
 *   "Starting at 5th level, your speed increases by 10 feet while you
 *    aren't wearing heavy armor."
 *
 * Qualification logic:
 *   1. Sum of all class entries where classSlug === 'barbarian' >= 5 (class level, not total).
 *   2. No heavy-armor item ('HA' type) is equipped in the body slot.
 *   Both conditions true → emit +10 NumMod; else emit nothing.
 *
 * Design ref: sdd/engine-barbarian-dsl-3/design D1-D3.
 * REQ-SPEED-01, REQ-SPEED-02, REQ-SPEED-03, REQ-SPEED-04, REQ-SPEED-05,
 * REQ-SPEED-11, REQ-SPEED-12, REQ-SPEED-13, REQ-OOS-01.
 */

import type { InventoryItem, ItemCompendiumLite } from '../../character/inventory/types.js';
import { findFirstEquipped } from '../../character/sheet/armor-class.js';
import type { EntityId } from '../types.js';
import type { ModifierInstance, ModifierInstanceId } from '../registry/types.js';

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * Narrow input slice consumed by the adapter.
 * Mirrors ArmorClassModifierInput structure (design D1).
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

/** 5etools type code for heavy armor. */
const HEAVY_ARMOR_TYPE = 'HA';

/** Module-scope ID counter — mirrors derive-armor-class-modifiers.ts:74-77. */
let _instanceCounter = 0;
function nextId(prefix: string): ModifierInstanceId {
  return `${prefix}-${++_instanceCounter}` as ModifierInstanceId;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Derives speed ModifierInstances from the character's barbarian class levels
 * and equipped inventory.
 *
 * Emits 0 or 1 ModifierInstance:
 *   - 1 when barbarian class level ≥ 5 AND no heavy armor equipped.
 *   - 0 otherwise.
 *
 * PHB p.49: "Starting at 5th level, your speed increases by 10 feet
 * while you aren't wearing heavy armor."
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

  // Gate 1: barbarian class level >= 5 (PHB p.49 — class level, not total level).
  // Filter all entries where classSlug === 'barbarian' and sum their levels.
  const barbarianLevel = classes
    .filter((c) => c.classSlug === 'barbarian')
    .reduce((sum, c) => sum + c.level, 0);

  if (barbarianLevel < 5) {
    return { mods: [] };
  }

  // Gate 2: no heavy armor equipped (PHB p.49 — "while you aren't wearing heavy armor").
  // Reuses findFirstEquipped from armor-class.ts (design D2).
  // REQ-SPEED-02: only equipped heavy armor disqualifies (state === 'equipped').
  const heavyArmorEquipped = findFirstEquipped(inventory, itemLites, new Set([HEAVY_ARMOR_TYPE]));

  if (heavyArmorEquipped !== null) {
    return { mods: [] };
  }

  // Both conditions met — emit +10 Fast Movement modifier.
  // REQ-SPEED-03: stat:'speed' → walk speed only (route applies to walk, not fly/swim/climb).
  // REQ-SPEED-13: 'speed' already present in StatKeySchema — do not add duplicate.
  const mod: ModifierInstance = {
    id: nextId('speed-fast-movement'),
    def: { kind: 'num', op: 'add', value: 10, stat: 'speed', category: 'untyped' },
    scope: { owner: charId, target: { axis: 'self' }, trigger: 'always' },
    label: 'Fast Movement (+10)',
  };

  return { mods: [mod] };
}
