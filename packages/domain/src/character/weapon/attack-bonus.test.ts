/**
 * TDD tests for computeWeaponAttackBonus — STRICT TDD (RED first).
 *
 * Reqs: CWAB-FORMULA-01, CWAB-FORMULA-02 (spec #1070)
 *
 * PHB p.194 — Making an Attack:
 *   "When you make an attack, your attack bonus applies to the attack roll.
 *    Your attack bonus with a weapon or unarmed strike is:
 *    Ability Modifier + Proficiency Bonus (if proficient)"
 *
 * PHB p.147 — Finesse property:
 *   "When making an attack with a finesse weapon, you use your choice of your
 *    Strength or Dexterity modifier for the attack and damage rolls."
 *    → Slice B default: max(STR, DEX) is the favorable choice.
 */
import { describe, it, expect } from 'vitest';
import { computeWeaponAttackBonus } from './attack-bonus.js';

describe('computeWeaponAttackBonus — CWAB-FORMULA-01: ability modifier selection', () => {
  it('melee non-finesse weapon uses STR modifier (PHB p.194)', () => {
    // PHB p.194: melee weapon attack uses STR modifier by default.
    const result = computeWeaponAttackBonus({
      strMod: 3,
      dexMod: 1,
      proficiencyBonus: 2,
      isProficient: false,
      weaponCategory: 'melee',
      properties: [],
      magicBonus: 0,
    });
    // abilityMod=3 (STR), isProficient=false so +0 prof, magicBonus=0 → result=3
    expect(result).toBe(3);
  });

  it('ranged weapon uses DEX modifier (PHB p.194)', () => {
    // PHB p.194: ranged weapon attack uses DEX modifier.
    const result = computeWeaponAttackBonus({
      strMod: 3,
      dexMod: 2,
      proficiencyBonus: 2,
      isProficient: false,
      weaponCategory: 'ranged',
      properties: [],
      magicBonus: 0,
    });
    // abilityMod=2 (DEX), isProficient=false → result=2
    expect(result).toBe(2);
  });

  it('finesse weapon picks higher mod when DEX wins (PHB p.147)', () => {
    // PHB p.147 Finesse: player uses choice of STR or DEX.
    // Slice B uses max(STR, DEX) as the favorable default.
    const result = computeWeaponAttackBonus({
      strMod: 1,
      dexMod: 4,
      proficiencyBonus: 2,
      isProficient: false,
      weaponCategory: 'melee',
      properties: ['finesse'],
      magicBonus: 0,
    });
    // DEX(4) > STR(1) → abilityMod=4, no prof → result=4
    expect(result).toBe(4);
  });

  it('finesse weapon picks higher mod when STR wins (PHB p.147)', () => {
    // PHB p.147 Finesse: STR wins here.
    const result = computeWeaponAttackBonus({
      strMod: 3,
      dexMod: 1,
      proficiencyBonus: 2,
      isProficient: false,
      weaponCategory: 'melee',
      properties: ['finesse'],
      magicBonus: 0,
    });
    // STR(3) > DEX(1) → abilityMod=3, no prof → result=3
    expect(result).toBe(3);
  });
});

describe('computeWeaponAttackBonus — CWAB-FORMULA-02: proficiency and magic bonus', () => {
  it('proficient weapon adds proficiency bonus (PHB p.194)', () => {
    // PHB p.194: add proficiency bonus when proficient with the weapon.
    const result = computeWeaponAttackBonus({
      strMod: 3,
      dexMod: 0,
      proficiencyBonus: 2,
      isProficient: true,
      weaponCategory: 'melee',
      properties: [],
      magicBonus: 0,
    });
    // abilityMod=3 (STR), isProficient=true, proficiencyBonus=2, magicBonus=0 → result=5
    expect(result).toBe(5);
  });

  it('non-proficient weapon omits proficiency bonus (PHB p.194)', () => {
    const result = computeWeaponAttackBonus({
      strMod: 3,
      dexMod: 0,
      proficiencyBonus: 2,
      isProficient: false,
      weaponCategory: 'melee',
      properties: [],
      magicBonus: 0,
    });
    // abilityMod=3 (STR), isProficient=false → result=3
    expect(result).toBe(3);
  });

  it('magic weapon adds magic bonus on top (DB2 — Slice B uses magicBonus=0 for non-magic, integer for magic)', () => {
    // DB2 (design #1071): magicBonus passed explicitly — caller supplies the bonus.
    const result = computeWeaponAttackBonus({
      strMod: 3,
      dexMod: 0,
      proficiencyBonus: 2,
      isProficient: true,
      weaponCategory: 'melee',
      properties: [],
      magicBonus: 1,
    });
    // abilityMod=3, prof=2, magic=1 → result=6
    expect(result).toBe(6);
  });
});
