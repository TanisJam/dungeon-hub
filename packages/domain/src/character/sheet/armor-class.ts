/**
 * Pure AC calculator for the character sheet.
 *
 * Implements PHB p.144 (Armor table) + p.149 (Shield). Cited per branch.
 * Pure function: no IO, no Date, no Math.random. Returns { ac, warnings, formula }.
 *
 * Read-path tolerance (CLAUDE.md §11): legacy rows or armor projections missing
 * `ac`/`type` fall back to the unarmored branch without throwing.
 */
import type { InventoryItem, ItemCompendiumLite } from '../inventory/types.js';

export type ArmorClassWarningCode = 'INSUFFICIENT_STRENGTH_FOR_ARMOR';

export interface ComputeArmorClassInput {
  inventory: InventoryItem[];
  itemLites: Record<string, ItemCompendiumLite>;
  classes: Array<{ classSlug: string; level: number }>;
  abilities: { str: number; dex: number; con: number; wis: number };
}

export interface ComputeArmorClassOutput {
  /** Final armor class number. */
  ac: number;
  /** Non-blocking warning codes (e.g. STR too low for heavy armor). */
  warnings: ArmorClassWarningCode[];
  /** Human-readable formula breakdown. Stable enough to assert in tests. */
  formula: string;
}

/** 5etools type codes for body armor + shield. PHB p.144, p.149 categories. */
const LIGHT_ARMOR_TYPE = 'LA';
const MEDIUM_ARMOR_TYPE = 'MA';
const HEAVY_ARMOR_TYPE = 'HA';
const SHIELD_TYPE = 'S';

const BODY_ARMOR_TYPES: ReadonlySet<string> = new Set([
  LIGHT_ARMOR_TYPE,
  MEDIUM_ARMOR_TYPE,
  HEAVY_ARMOR_TYPE,
]);

/** Standard 5e ability modifier: floor((score - 10) / 2). */
function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

export function computeArmorClass(input: ComputeArmorClassInput): ComputeArmorClassOutput {
  const { inventory, itemLites, abilities, classes } = input;
  const dexMod = abilityModifier(abilities.dex);
  const conMod = abilityModifier(abilities.con);
  const wisMod = abilityModifier(abilities.wis);
  const warnings: ArmorClassWarningCode[] = [];

  // Find equipped body armor + shield (first match each).
  const armorLite = findFirstEquipped(inventory, itemLites, BODY_ARMOR_TYPES);
  const shieldLite = findFirstEquipped(inventory, itemLites, new Set([SHIELD_TYPE]));

  // PHB p.149 — Shield: +2 AC (defensive: cap to one shield even if two equipped).
  // Shield base AC is read from the lite (`ac: 2` in PHB chain-shirt-style projection)
  // so future homebrew shields with different values still work.
  const shieldBonus = shieldLite && typeof shieldLite.ac === 'number' ? shieldLite.ac : 0;
  const shieldFormula = shieldLite ? ` + ${shieldBonus} (${shieldLite.name})` : '';

  if (armorLite && typeof armorLite.ac === 'number') {
    const armorAc = armorLite.ac;

    // PHB p.144 — STR-min for heavy armor: rule punishes with -10 speed, NOT blocked AC.
    // We emit a non-blocking warning so the sheet can surface it; AC is unchanged.
    if (
      typeof armorLite.armorStrengthMin === 'number' &&
      abilities.str < armorLite.armorStrengthMin
    ) {
      warnings.push('INSUFFICIENT_STRENGTH_FOR_ARMOR');
    }

    // PHB p.144 — Light armor: AC = armor.ac + DEX
    if (armorLite.type === LIGHT_ARMOR_TYPE) {
      return {
        ac: armorAc + dexMod + shieldBonus,
        warnings,
        formula: `${armorAc} (${armorLite.name}) + DEX(${dexMod})${shieldFormula}`,
      };
    }

    // PHB p.144 — Medium armor: AC = armor.ac + min(DEX, 2)
    if (armorLite.type === MEDIUM_ARMOR_TYPE) {
      const cappedDex = Math.min(dexMod, 2);
      return {
        ac: armorAc + cappedDex + shieldBonus,
        warnings,
        formula: `${armorAc} (${armorLite.name}) + DEX(${cappedDex}, max +2)${shieldFormula}`,
      };
    }

    // PHB p.144 — Heavy armor: AC = armor.ac, DEX ignored.
    if (armorLite.type === HEAVY_ARMOR_TYPE) {
      return {
        ac: armorAc + shieldBonus,
        warnings,
        formula: `${armorAc} (${armorLite.name}) [no DEX]${shieldFormula}`,
      };
    }
  }

  // Unarmored branch (no body armor equipped).
  // PHB p.48 — Barbarian Unarmored Defense: 10 + DEX + CON (no armor).
  // PHB p.78 — Monk Unarmored Defense: 10 + DEX + WIS (no armor AND no shield).
  // The class features REQUIRE "no armor", so they apply only on this branch.
  // Best-of selection: when multiclass (e.g. Barb/Monk), pick the highest result.
  const hasBarbarian = classes.some((c) => c.classSlug === 'barbarian');
  const hasMonk = classes.some((c) => c.classSlug === 'monk');

  let baseAc = 10 + dexMod;
  let baseFormula = `10 + DEX(${dexMod})`;
  if (hasBarbarian) {
    const v = 10 + dexMod + conMod;
    if (v > baseAc) {
      baseAc = v;
      baseFormula = `10 + DEX(${dexMod}) + CON(${conMod}) [Barbarian Unarmored Defense]`;
    }
  }
  if (hasMonk && !shieldLite) {
    // PHB p.78 — Monk UD is forbidden while wielding a shield.
    const v = 10 + dexMod + wisMod;
    if (v > baseAc) {
      baseAc = v;
      baseFormula = `10 + DEX(${dexMod}) + WIS(${wisMod}) [Monk Unarmored Defense]`;
    }
  }

  return {
    ac: baseAc + shieldBonus,
    warnings,
    formula: `${baseFormula}${shieldFormula}`,
  };
}

function findFirstEquipped(
  inventory: InventoryItem[],
  itemLites: Record<string, ItemCompendiumLite>,
  acceptedTypes: ReadonlySet<string>,
): ItemCompendiumLite | null {
  for (const it of inventory) {
    if (it.state !== 'equipped') continue;
    const lite = itemLites[`${it.itemSlug}|${it.itemSource}`];
    if (!lite) continue;
    if (acceptedTypes.has(lite.type ?? '')) return lite;
  }
  return null;
}
