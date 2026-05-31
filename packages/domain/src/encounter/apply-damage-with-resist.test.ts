/**
 * TDD tests for applyDamageWithResist — pure damage resolution with resist/immune.
 *
 * REQ-RI-01..05 / ADR-3
 *
 * PHB p.197 — Damage Resistance and Immunity:
 *   "If a creature or an object has resistance to a damage type, damage of
 *    that type is halved against it. If a creature or an object has immunity
 *    to a damage type, damage of that type is ignored."
 *
 * PHB p.197 — Order: "Resistance and then vulnerability are applied after
 *   all other modifiers to damage."
 *
 * PHB p.197 — No stacking: "If a creature has resistance to a damage type,
 *   the damage is halved. Multiple instances of resistance don't stack —
 *   a creature is either resistant or not."
 *
 * Strict TDD — RED first.
 */
import { describe, it, expect } from 'vitest';
import { applyDamageWithResist } from './apply-damage-with-resist.js';
import type { ResistMod } from '../engine/types.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function halfMod(damageType: string): ResistMod {
  return { kind: 'resist', damageType, mode: 'half' };
}

function immuneMod(damageType: string): ResistMod {
  return { kind: 'resist', damageType, mode: 'immune' };
}

// ── Scenario RI-01: resistance halves odd damage (floor) ──────────────────────

describe('applyDamageWithResist — REQ-RI-01: resistance halves (floor)', () => {
  it('fire resistance on 7 fire damage → finalDamage=3, newHp=hpCurrent-3 (PHB p.197)', () => {
    // PHB p.197: "halved against it" — floor(7/2) = 3
    const result = applyDamageWithResist({
      hpCurrent: 20,
      rolledDamage: 7,
      damageType: 'fire',
      resistMods: [halfMod('fire')],
    });
    expect(result.finalDamage).toBe(3);
    expect(result.newHp).toBe(17); // 20 - 3
    expect(result.breakdown.outcome).toBe('half');
    expect(result.breakdown.rolledDamage).toBe(7);
    expect(result.breakdown.finalDamage).toBe(3);
  });

  it('piercing resistance on 8 piercing damage → finalDamage=4 (even number, floor=4, PHB p.197)', () => {
    // PHB p.197: floor(8/2) = 4
    const result = applyDamageWithResist({
      hpCurrent: 15,
      rolledDamage: 8,
      damageType: 'piercing',
      resistMods: [halfMod('piercing')],
    });
    expect(result.finalDamage).toBe(4);
    expect(result.newHp).toBe(11); // 15 - 4
    expect(result.breakdown.outcome).toBe('half');
  });
});

// ── Scenario RI-02: immunity zeros damage ─────────────────────────────────────

describe('applyDamageWithResist — REQ-RI-02: immunity zeros damage', () => {
  it('poison immunity on 12 poison damage → finalDamage=0, newHp unchanged (PHB p.197)', () => {
    // PHB p.197: "damage of that type is ignored"
    const result = applyDamageWithResist({
      hpCurrent: 30,
      rolledDamage: 12,
      damageType: 'poison',
      resistMods: [immuneMod('poison')],
    });
    expect(result.finalDamage).toBe(0);
    expect(result.newHp).toBe(30); // no change
    expect(result.breakdown.outcome).toBe('immune');
  });
});

// ── Scenario RI-03: no resistance → full damage (identity) ───────────────────

describe('applyDamageWithResist — REQ-RI-03: no resistance → full damage', () => {
  it('no resistMods, slashing damage 9 → finalDamage=9, outcome=none (PHB p.197)', () => {
    // PHB p.197: no resistance/immunity → damage unchanged
    const result = applyDamageWithResist({
      hpCurrent: 25,
      rolledDamage: 9,
      damageType: 'slashing',
      resistMods: [],
    });
    expect(result.finalDamage).toBe(9);
    expect(result.newHp).toBe(16); // 25 - 9
    expect(result.breakdown.outcome).toBe('none');
  });

  it('non-matching mod (fire resist on cold damage) → finalDamage=rolledDamage (identity)', () => {
    // Cold hit on a fire-resistant target — fire resist does not apply to cold
    const result = applyDamageWithResist({
      hpCurrent: 20,
      rolledDamage: 5,
      damageType: 'cold',
      resistMods: [halfMod('fire')], // fire resist, not cold
    });
    expect(result.finalDamage).toBe(5);
    expect(result.breakdown.outcome).toBe('none');
  });
});

// ── Scenario RI-04: resistance does NOT stack (PHB p.197) ────────────────────

describe('applyDamageWithResist — REQ-RI-04: no-stack — two half-mods halve once', () => {
  it('two bludgeoning half-mods on 10 damage → finalDamage=5, not 2 or 3 (PHB p.197)', () => {
    // PHB p.197: "Multiple instances of resistance don't stack" — halve ONCE
    const result = applyDamageWithResist({
      hpCurrent: 30,
      rolledDamage: 10,
      damageType: 'bludgeoning',
      resistMods: [halfMod('bludgeoning'), halfMod('bludgeoning')],
    });
    expect(result.finalDamage).toBe(5); // halved ONCE (not quartered)
    expect(result.breakdown.outcome).toBe('half');
  });
});

// ── Scenario RI-05: immunity beats resistance (PHB p.197) ────────────────────

describe('applyDamageWithResist — REQ-RI-05: immune beats half', () => {
  it('poison + resist-all + immune-poison (Petrified) → finalDamage=0, not 4 (PHB p.197)', () => {
    // PHB p.291: Petrified has resist-all + immune-poison.
    // PHB p.197: immunity WINS over resistance. Result = 0.
    const result = applyDamageWithResist({
      hpCurrent: 20,
      rolledDamage: 8,
      damageType: 'poison',
      resistMods: [
        { kind: 'resist', damageType: 'all', mode: 'half' },    // all-resist
        { kind: 'resist', damageType: 'poison', mode: 'immune' }, // poison immune
      ],
    });
    expect(result.finalDamage).toBe(0);
    expect(result.breakdown.outcome).toBe('immune');
  });

  it('both half AND immune on same type → finalDamage=0 (immune wins)', () => {
    const result = applyDamageWithResist({
      hpCurrent: 15,
      rolledDamage: 6,
      damageType: 'fire',
      resistMods: [halfMod('fire'), immuneMod('fire')],
    });
    expect(result.finalDamage).toBe(0);
    expect(result.breakdown.outcome).toBe('immune');
  });
});

// ── Scenario RI-06: 'all' matches any typed damage ───────────────────────────

describe("applyDamageWithResist — REQ-RI-06: 'all' damageType matches any hit", () => {
  it("'all' resistance on fire damage 6 → finalDamage=3 (PHB p.197, Petrified scenario)", () => {
    // PHB p.291: Petrified resist-all → halve any damage type
    const result = applyDamageWithResist({
      hpCurrent: 20,
      rolledDamage: 6,
      damageType: 'fire',
      resistMods: [{ kind: 'resist', damageType: 'all', mode: 'half' }],
    });
    expect(result.finalDamage).toBe(3);
    expect(result.breakdown.outcome).toBe('half');
  });

  it("'all' resistance on force (Magic Missile) 5 → finalDamage=2 (floor(5/2), PHB p.197)", () => {
    // PHB p.197: 'all' matches force type too
    const result = applyDamageWithResist({
      hpCurrent: 10,
      rolledDamage: 5,
      damageType: 'force',
      resistMods: [{ kind: 'resist', damageType: 'all', mode: 'half' }],
    });
    expect(result.finalDamage).toBe(2); // floor(5/2)
    expect(result.breakdown.outcome).toBe('half');
  });
});

// ── Scenario: newHp clamps at 0 ───────────────────────────────────────────────

describe('applyDamageWithResist — newHp clamps at 0 (PHB p.197)', () => {
  it('overkill damage still clamps to newHp=0 (no negative HP)', () => {
    // PHB p.197: "Hit points can't go below 0"
    const result = applyDamageWithResist({
      hpCurrent: 2,
      rolledDamage: 100,
      damageType: 'slashing',
      resistMods: [], // full damage (100) > hpCurrent (2)
    });
    expect(result.newHp).toBe(0);
    expect(result.finalDamage).toBe(100); // no resist, full damage
  });

  it('with half-resist: overkill still clamps to 0 (floor(100/2)=50 > hpCurrent=3)', () => {
    const result = applyDamageWithResist({
      hpCurrent: 3,
      rolledDamage: 100,
      damageType: 'fire',
      resistMods: [halfMod('fire')],
    });
    expect(result.finalDamage).toBe(50);
    expect(result.newHp).toBe(0); // clamped
  });
});
