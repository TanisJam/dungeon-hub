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
 * Selects the ability modifier to use for a weapon attack roll.
 *
 * ADR-4 (engine-action-pipeline): extracted from computeWeaponAttackBonus so that
 * resolveWeaponAttack can call the same logic without duplicating the rule.
 *
 * PHB p.194 — Making an Attack: melee → STR, ranged → DEX.
 * PHB p.147 — Finesse: use the higher of STR or DEX (Slice B: favorable max default).
 * PHB p.195 — Thrown: melee default (STR) carried to thrown attacks.
 *
 * Accepts both 5etools property codes ('F', 'T') and spelled-out strings
 * ('finesse', 'thrown') — the same set computeWeaponAttackBonus previously handled.
 */
export function selectAttackAbility(
  strMod: number,
  dexMod: number,
  kind: 'melee' | 'ranged',
  properties: ReadonlyArray<string>,
): number {
  const hasFinesse = properties.includes('finesse') || properties.includes('F');
  const hasThrown = properties.includes('thrown') || properties.includes('T');

  if (hasFinesse || hasThrown) {
    // PHB p.147: player picks; Slice B defaults to the favorable max.
    return Math.max(strMod, dexMod);
  }
  if (kind === 'ranged') {
    // PHB p.194: ranged attack uses DEX.
    return dexMod;
  }
  // PHB p.194: melee attack uses STR by default.
  return strMod;
}

/**
 * Computes the weapon attack bonus for a character wielding a specific weapon.
 *
 * Formula (PHB p.194 + p.147):
 *   1. Pick abilityMod via selectAttackAbility (ADR-4: extracted helper).
 *   2. result = abilityMod + (isProficient ? proficiencyBonus : 0) + magicBonus
 */
export function computeWeaponAttackBonus(input: WeaponAttackBonusInput): number {
  const { strMod, dexMod, proficiencyBonus, isProficient, weaponCategory, properties, magicBonus } =
    input;

  const abilityMod = selectAttackAbility(strMod, dexMod, weaponCategory, properties);

  return abilityMod + (isProficient ? proficiencyBonus : 0) + magicBonus;
}

/**
 * Returns the ability key ('str' | 'dex') used for a weapon attack.
 *
 * Single source of truth for the finesse/thrown ability-selection rule.
 * Mirrors selectAttackAbility but returns the key string instead of the modifier value.
 * Used to populate WeaponInUse.abilityUsed so the usesAbility WorldQuery leaf can evaluate.
 *
 * Tie-break semantics: `dexMod > strMod ? 'dex' : 'str'`
 * STR wins on equal mods — CRITICAL for SCENARIO-02 and RAGE-R4 correctness.
 *
 * PHB p.194 — melee uses STR, ranged uses DEX.
 * PHB p.147 — Finesse: player picks; Slice B uses dexMod > strMod as the favorable default.
 * PHB p.195 — Thrown: treated as melee default (STR) when not finesse.
 *
 * REQ-CTX-01, SCENARIO-04, SCENARIO-05.
 */
export function selectAttackAbilityKind(
  strMod: number,
  dexMod: number,
  kind: 'melee' | 'ranged',
  properties: ReadonlyArray<string>,
): 'str' | 'dex' {
  const hasFinesse = properties.includes('finesse') || properties.includes('F');
  const hasThrown = properties.includes('thrown') || properties.includes('T');

  if (hasFinesse || hasThrown) {
    // PHB p.147: player picks; Slice B defaults to favorable max.
    // Tie-break: STR wins (dexMod > strMod ? 'dex' : 'str' — strict >, not >=).
    return dexMod > strMod ? 'dex' : 'str';
  }
  if (kind === 'ranged') {
    // PHB p.194: ranged attack uses DEX.
    return 'dex';
  }
  // PHB p.194: melee attack uses STR by default.
  return 'str';
}
