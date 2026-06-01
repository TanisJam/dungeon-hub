/**
 * TDD tests for extraAttacksPerAction + budget predicates — STRICT TDD (RED first).
 *
 * REQ-AE-08: extraAttacksPerAction pure fn (PHB p.198)
 * REQ-AE-02: isActionAvailable predicate
 * REQ-AE-03: isBonusActionAvailable predicate
 *
 * PHB p.198 Extra Attack table:
 *   Fighter   L5–L10  → 2 attacks
 *   Fighter   L11–L19 → 3 attacks
 *   Fighter   L20     → 4 attacks
 *   Barbarian L5+     → 2 attacks (PHB p.49)
 *   Paladin   L5+     → 2 attacks (PHB p.84)
 *   Ranger    L5+     → 2 attacks (PHB p.89)
 *   Any other class   → 1 attack
 *   Classless/NPC     → 1 attack
 *   Multiclass        → MAX across classes (no stacking, PHB p.198 / Sage Advice)
 */

import { describe, it, expect } from 'vitest';
import {
  extraAttacksPerAction,
  isActionAvailable,
  isBonusActionAvailable,
  type ClassWithLevel,
} from './extra-attacks.js';

// ── helpers ───────────────────────────────────────────────────────────────────

function cls(slug: string, level: number): ClassWithLevel {
  return { slug, level };
}

// ── extraAttacksPerAction ─────────────────────────────────────────────────────

describe('extraAttacksPerAction — Fighter (PHB p.72 Extra Attack)', () => {
  it('Fighter L1 → 1 attack (below Extra Attack threshold)', () => {
    expect(extraAttacksPerAction([cls('fighter', 1)])).toBe(1);
  });

  it('Fighter L4 → 1 attack (still below L5 threshold)', () => {
    expect(extraAttacksPerAction([cls('fighter', 4)])).toBe(1);
  });

  it('Fighter L5 → 2 attacks (PHB p.72: Extra Attack at 5th level)', () => {
    // PHB p.72: "Beginning at 5th level, you can attack twice, instead of once."
    expect(extraAttacksPerAction([cls('fighter', 5)])).toBe(2);
  });

  it('Fighter L10 → 2 attacks (still in L5–L10 band)', () => {
    expect(extraAttacksPerAction([cls('fighter', 10)])).toBe(2);
  });

  it('Fighter L11 → 3 attacks (PHB p.72: Extra Attack 2 at 11th level)', () => {
    // PHB p.72: "At 11th level, you can attack three times."
    expect(extraAttacksPerAction([cls('fighter', 11)])).toBe(3);
  });

  it('Fighter L19 → 3 attacks (still in L11–L19 band)', () => {
    expect(extraAttacksPerAction([cls('fighter', 19)])).toBe(3);
  });

  it('Fighter L20 → 4 attacks (PHB p.72: Extra Attack 3 at 20th level)', () => {
    // PHB p.72: "At 20th level, you can attack four times."
    expect(extraAttacksPerAction([cls('fighter', 20)])).toBe(4);
  });
});

describe('extraAttacksPerAction — Barbarian (PHB p.49)', () => {
  it('Barbarian L4 → 1 attack (below L5 threshold)', () => {
    expect(extraAttacksPerAction([cls('barbarian', 4)])).toBe(1);
  });

  it('Barbarian L5 → 2 attacks (PHB p.49: Extra Attack at 5th level)', () => {
    // PHB p.49: "Beginning at 5th level, you can attack twice."
    expect(extraAttacksPerAction([cls('barbarian', 5)])).toBe(2);
  });

  it('Barbarian L20 → 2 attacks (max for Barbarian — no further thresholds)', () => {
    expect(extraAttacksPerAction([cls('barbarian', 20)])).toBe(2);
  });
});

describe('extraAttacksPerAction — Paladin (PHB p.84)', () => {
  it('Paladin L4 → 1 attack (below L5 threshold)', () => {
    expect(extraAttacksPerAction([cls('paladin', 4)])).toBe(1);
  });

  it('Paladin L5 → 2 attacks (PHB p.84: Extra Attack at 5th level)', () => {
    // PHB p.84: "Beginning at 5th level, you can attack twice."
    expect(extraAttacksPerAction([cls('paladin', 5)])).toBe(2);
  });
});

describe('extraAttacksPerAction — Ranger (PHB p.89)', () => {
  it('Ranger L4 → 1 attack (below L5 threshold)', () => {
    expect(extraAttacksPerAction([cls('ranger', 4)])).toBe(1);
  });

  it('Ranger L5 → 2 attacks (PHB p.89: Extra Attack at 5th level)', () => {
    // PHB p.89: "Beginning at 5th level, you can attack twice."
    expect(extraAttacksPerAction([cls('ranger', 5)])).toBe(2);
  });
});

describe('extraAttacksPerAction — Non-martial classes (always 1)', () => {
  it('Wizard L20 → 1 attack (no Extra Attack feature, PHB p.198)', () => {
    // PHB p.198: only specific classes grant Extra Attack.
    expect(extraAttacksPerAction([cls('wizard', 20)])).toBe(1);
  });

  it('Cleric L10 → 1 attack (no Extra Attack for Clerics)', () => {
    expect(extraAttacksPerAction([cls('cleric', 10)])).toBe(1);
  });

  it('Rogue L20 → 1 attack (Rogues do not get Extra Attack)', () => {
    expect(extraAttacksPerAction([cls('rogue', 20)])).toBe(1);
  });
});

describe('extraAttacksPerAction — Classless / empty array (NPC, REQ-AE-08)', () => {
  it('Empty classes array → 1 attack (defensive: NPC attacker, PHB p.198)', () => {
    expect(extraAttacksPerAction([])).toBe(1);
  });
});

describe('extraAttacksPerAction — Multiclass (MAX no stacking, Sage Advice / PHB p.198)', () => {
  it('Fighter L5 / Wizard L5 → 2 (Fighter grants 2, Wizard grants 1 — max=2)', () => {
    // Sage Advice: "if you have multiple classes that give you Extra Attack, those
    // features don't let you make more than two attacks." (PHB p.198)
    // MAX approach: max(2, 1) = 2
    expect(extraAttacksPerAction([cls('fighter', 5), cls('wizard', 5)])).toBe(2);
  });

  it('Fighter L11 / Barbarian L5 → 3 (Fighter grants 3, Barb grants 2 — max=3)', () => {
    // Fighter L11 → 3 attacks; Barbarian L5 → 2 attacks.
    // MAX no stacking: max(3, 2) = 3, NOT 3+2=5.
    expect(extraAttacksPerAction([cls('fighter', 11), cls('barbarian', 5)])).toBe(3);
  });

  it('Fighter L4 / Barbarian L5 → 2 (Fighter<L5 grants 1, Barb L5 grants 2 — max=2)', () => {
    // Fighter L4 → 1 attack (no Extra Attack yet); Barbarian L5 → 2 attacks.
    // max(1, 2) = 2. Barbarian wins.
    expect(extraAttacksPerAction([cls('fighter', 4), cls('barbarian', 5)])).toBe(2);
  });

  it('Wizard L10 / Cleric L10 → 1 (no Extra Attack from either class)', () => {
    expect(extraAttacksPerAction([cls('wizard', 10), cls('cleric', 10)])).toBe(1);
  });

  it('Paladin L5 / Ranger L5 → 2 (both grant 2, MAX is still 2 — no stacking)', () => {
    // Both grant 2; MAX(2, 2) = 2, NOT 4.
    expect(extraAttacksPerAction([cls('paladin', 5), cls('ranger', 5)])).toBe(2);
  });
});

// ── isActionAvailable (REQ-AE-02) ────────────────────────────────────────────

describe('isActionAvailable — action budget predicate (REQ-AE-02)', () => {
  it('isActionAvailable(false) → true (action has NOT been used yet)', () => {
    // PHB p.189: each combatant has one action per turn; unused = available.
    expect(isActionAvailable(false)).toBe(true);
  });

  it('isActionAvailable(true) → false (action already used this turn)', () => {
    expect(isActionAvailable(true)).toBe(false);
  });
});

// ── isBonusActionAvailable (REQ-AE-03) ───────────────────────────────────────

describe('isBonusActionAvailable — bonus-action budget predicate (REQ-AE-03)', () => {
  it('isBonusActionAvailable(false) → true (bonus action has NOT been used)', () => {
    // PHB p.189: one bonus action per turn; unused = available.
    expect(isBonusActionAvailable(false)).toBe(true);
  });

  it('isBonusActionAvailable(true) → false (bonus action already used this turn)', () => {
    expect(isBonusActionAvailable(true)).toBe(false);
  });
});
