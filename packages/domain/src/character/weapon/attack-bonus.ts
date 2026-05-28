/**
 * computeWeaponAttackBonus — pure domain function.
 *
 * Reqs: CWAB-FORMULA-01, CWAB-FORMULA-02 (spec #1070)
 * Design: DB2 (design #1071)
 *
 * PHB p.194 — Making an Attack:
 *   "Your attack bonus with a weapon is: Ability Modifier + Proficiency Bonus (if proficient)"
 *
 * PHB p.147 — Finesse property:
 *   "When making an attack with a finesse weapon, you use your choice of your
 *    Strength or Dexterity modifier for the attack and damage rolls."
 *    → Slice B defaults to max(STR, DEX) as the favorable choice.
 *    Per-instance override deferred to Slice C / future SDD.
 *
 * Note on `magicBonus`: Slice B always passes 0 for non-identified items.
 * Magic-weapon identification wired in Slice C (inventory-v3-advanced).
 */
export interface WeaponAttackBonusInput {
  strMod: number;
  dexMod: number;
  proficiencyBonus: number;
  isProficient: boolean;
  weaponCategory: 'melee' | 'ranged';
  /** 5etools property codes. Key codes: 'F' (finesse), 'T' (thrown), etc. */
  properties: ReadonlyArray<string>;
  /** 0 for non-magic / unidentified weapons (Slice B default). DB2. */
  magicBonus: number;
}

/**
 * Computes the weapon attack bonus for a character wielding a specific weapon.
 *
 * Formula (PHB p.194 + p.147):
 *   1. Pick abilityMod:
 *      - ranged + NOT thrown → DEX
 *      - melee + NOT finesse → STR
 *      - finesse OR thrown   → max(STR, DEX)
 *   2. result = abilityMod + (isProficient ? proficiencyBonus : 0) + magicBonus
 */
export function computeWeaponAttackBonus(input: WeaponAttackBonusInput): number {
  const { strMod, dexMod, proficiencyBonus, isProficient, weaponCategory, properties, magicBonus } =
    input;

  const hasFinesse = properties.includes('finesse') || properties.includes('F');
  const hasThrown = properties.includes('thrown') || properties.includes('T');

  let abilityMod: number;
  if (hasFinesse || hasThrown) {
    // PHB p.147: player picks; Slice B defaults to the favorable max.
    abilityMod = Math.max(strMod, dexMod);
  } else if (weaponCategory === 'ranged') {
    // PHB p.194: ranged attack uses DEX.
    abilityMod = dexMod;
  } else {
    // PHB p.194: melee attack uses STR by default.
    abilityMod = strMod;
  }

  return abilityMod + (isProficient ? proficiencyBonus : 0) + magicBonus;
}
