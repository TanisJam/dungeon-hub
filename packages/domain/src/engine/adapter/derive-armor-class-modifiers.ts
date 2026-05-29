/**
 * derive-armor-class-modifiers — inventory + resolved mods → AC NumMod[] adapter.
 *
 * Pure domain helper. No IO, no registry access.
 *
 * Projects the character's equipped armor, shield, class features, and resolved
 * integer ability modifiers into ModifierInstance[] ready for registry.register().
 * base 0 → resolveStat sums all emitted NumMods.
 *
 * Mirrors deriveAbilityScoreModifiers in structure and purity.
 * Design ref: sdd/engine-ac-parity/design §2-§4.
 *
 * DEX-cap baking (design §3):
 *   light/unarmored: full DEX
 *   medium: min(dexMod, 2)  — cap baked into the emitted NumMod value
 *   heavy: no DEX NumMod emitted at all
 *
 * Best-of (UD — design §2): resolved INSIDE the adapter by choosing which set
 * of NumMods to emit; resolveStat stays a dumb summer.
 *
 * Label format per parity ledger §4b guardrail:
 *   armor-base: armorLite.name (from DB — NOT hardcoded)
 *   shield:     shieldLite.name (from DB — NOT hardcoded)
 *   DEX:        "DEX +{n}" or "DEX +{n} (max +2)" for medium
 *   UD-ability: "CON +{n} (Barbarian Unarmored Defense)" / "WIS +{n} (Monk Unarmored Defense)"
 *   base:       "Unarmored (base 10)"
 *
 * REQ-AC-ADAPTER-01..09, REQ-AC-NATIVE-01, REQ-AC-PARITY-01
 */

import type { InventoryItem, ItemCompendiumLite } from '../../character/inventory/types.js';
import {
  findFirstEquipped,
  BODY_ARMOR_TYPES,
  SHIELD_TYPE,
} from '../../character/sheet/armor-class.js';
import type { EntityId } from '../types.js';
import type { ModifierInstance, ModifierInstanceId } from '../registry/types.js';

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * Narrow input slice consumed by the adapter.
 * resolvedMods MUST be post-ASI integer mods (i.e. Math.floor((score-10)/2))
 * computed by the caller (route). NOT raw scores. (REQ-AC-ADAPTER-08)
 */
export interface ArmorClassModifierInput {
  inventory: InventoryItem[];
  itemLites: Record<string, ItemCompendiumLite>;
  classes: Array<{ classSlug: string; level: number }>;
  /** Post-ASI integer ability modifiers. Caller converts scores → mods before calling. */
  resolvedMods: { str: number; dex: number; con: number; wis: number };
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/** 5etools type codes for armor categories. */
const LIGHT_ARMOR_TYPE = 'LA';
const MEDIUM_ARMOR_TYPE = 'MA';
const HEAVY_ARMOR_TYPE = 'HA';

let _instanceCounter = 0;
function nextId(prefix: string): ModifierInstanceId {
  return `${prefix}-${++_instanceCounter}` as ModifierInstanceId;
}

function numMod(
  id: ModifierInstanceId,
  value: number,
  charId: EntityId,
  label: string,
): ModifierInstance {
  return {
    id,
    def: { kind: 'num', op: 'add', value, stat: 'ac', category: 'untyped' },
    scope: { owner: charId, target: { axis: 'self' }, trigger: 'always' },
    label,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Derives a flat list of AC ModifierInstances from the character's equipped
 * inventory, class features, and resolved integer ability modifiers.
 *
 * All NumMods use stat:'ac', op:'add', category:'untyped'.
 * Engine sums them on base 0 via resolveStat('ac', 0, ...).
 *
 * @param input  - Narrow slice: inventory, itemLites, classes, resolvedMods (integer mods).
 * @param charId - EntityId of the owning character.
 * @returns Flat array of ModifierInstances ready for registry.register().
 */
export function deriveArmorClassModifiers(
  input: ArmorClassModifierInput,
  charId: EntityId,
): ModifierInstance[] {
  const { inventory, itemLites, classes, resolvedMods } = input;
  const { dex, con, wis } = resolvedMods;

  // ── Detect equipped body armor and shield ────────────────────────────────────
  const armorLiteVal = findFirstEquipped(inventory, itemLites, BODY_ARMOR_TYPES);
  const shieldLiteVal = findFirstEquipped(inventory, itemLites, new Set([SHIELD_TYPE]));

  // Shield NumMod (applies to all branches that allow shields)
  // Value from item lite — homebrew-safe (REQ-AC-ADAPTER-05, REQ-AC-ADAPTER-09)
  const shieldBonus =
    shieldLiteVal && typeof shieldLiteVal.ac === 'number' ? shieldLiteVal.ac : 0;

  // ── Armored branch ───────────────────────────────────────────────────────────
  if (armorLiteVal && typeof armorLiteVal.ac === 'number') {
    const armorAc = armorLiteVal.ac;
    const instances: ModifierInstance[] = [];

    // Base NumMod: armor.ac from item lite (label uses item name from DB — §4b)
    instances.push(
      numMod(
        nextId('ac-armor-base'),
        armorAc,
        charId,
        `${armorLiteVal.name} (base ${armorAc})`,
      ),
    );

    // DEX contribution — depends on armor type
    if (armorLiteVal.type === LIGHT_ARMOR_TYPE) {
      // PHB p.144 — Light armor: full DEX (always emitted, even if 0, for breakdown clarity)
      instances.push(numMod(nextId('ac-dex'), dex, charId, `DEX +${dex}`));
    } else if (armorLiteVal.type === MEDIUM_ARMOR_TYPE) {
      // PHB p.144 — Medium armor: min(DEX, 2); cap baked into NumMod value
      const cappedDex = Math.min(dex, 2);
      const label = cappedDex < dex ? `DEX +${cappedDex} (max +2)` : `DEX +${cappedDex}`;
      instances.push(numMod(nextId('ac-dex'), cappedDex, charId, label));
    }
    // Heavy armor: no DEX NumMod emitted (PHB p.144 — DEX ignored)

    // Shield NumMod (armored characters can still use a shield)
    if (shieldLiteVal && shieldBonus !== 0) {
      instances.push(
        numMod(
          nextId('ac-shield'),
          shieldBonus,
          charId,
          `${shieldLiteVal.name} (+${shieldBonus})`,
        ),
      );
    }

    return instances;
  }

  // ── Unarmored branch ─────────────────────────────────────────────────────────
  // PHB p.48 — Barbarian UD: 10 + DEX + CON (no armor)
  // PHB p.78 — Monk UD: 10 + DEX + WIS (no armor AND no shield)
  // Best-of: pick highest total candidate, emit that set of NumMods

  const hasBarbarian = classes.some((c) => c.classSlug === 'barbarian');
  const hasMonk = classes.some((c) => c.classSlug === 'monk');

  // Candidate sets (total, emitter function)
  type Candidate = { total: number; emit: () => ModifierInstance[] };

  // Default unarmored: 10 + DEX (PHB p.14)
  const defaultCandidate: Candidate = {
    total: 10 + dex,
    emit: () => [
      numMod(nextId('ac-base'), 10, charId, 'Unarmored (base 10)'),
      numMod(nextId('ac-dex'), dex, charId, `DEX +${dex}`),
    ],
  };

  let best: Candidate = defaultCandidate;

  if (hasBarbarian) {
    // PHB p.48 — Barbarian UD: 10 + DEX + CON
    const barbarianTotal = 10 + dex + con;
    if (barbarianTotal > best.total) {
      best = {
        total: barbarianTotal,
        emit: () => [
          numMod(nextId('ac-base'), 10, charId, 'Unarmored (base 10)'),
          numMod(nextId('ac-dex'), dex, charId, `DEX +${dex}`),
          numMod(nextId('ac-con'), con, charId, `CON +${con} (Barbarian Unarmored Defense)`),
        ],
      };
    }
  }

  if (hasMonk && !shieldLiteVal) {
    // PHB p.78 — Monk UD: 10 + DEX + WIS (only when NO shield equipped)
    const monkTotal = 10 + dex + wis;
    if (monkTotal > best.total) {
      best = {
        total: monkTotal,
        emit: () => [
          numMod(nextId('ac-base'), 10, charId, 'Unarmored (base 10)'),
          numMod(nextId('ac-dex'), dex, charId, `DEX +${dex}`),
          numMod(nextId('ac-wis'), wis, charId, `WIS +${wis} (Monk Unarmored Defense)`),
        ],
      };
    }
  }

  const instances = best.emit();

  // Shield NumMod for unarmored (Monk UD already excluded via !shieldLiteVal above)
  if (shieldLiteVal && shieldBonus !== 0) {
    instances.push(
      numMod(
        nextId('ac-shield'),
        shieldBonus,
        charId,
        `${shieldLiteVal.name} (+${shieldBonus})`,
      ),
    );
  }

  return instances;
}
