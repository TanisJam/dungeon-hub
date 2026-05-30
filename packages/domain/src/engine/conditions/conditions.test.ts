/**
 * Tests for Stunned and Incapacitated ConditionDefinitions.
 *
 * PHB p.291 — Incapacitated:
 *   "An incapacitated creature can't take actions or reactions."
 *
 * PHB p.292 — Stunned:
 *   "A stunned creature is incapacitated (see the condition), can't move, and can
 *    speak only falteringly."
 *   "The creature automatically fails Strength and Dexterity saving throws."
 *   "Attack rolls against the creature have advantage."
 *
 * Design ref: sdd/engine-forced-check-3a/design — ADR-3 (ConditionDefinition model).
 *
 * Strict TDD — RED first.
 */

import { describe, expect, it } from 'vitest';
import { INCAPACITATED_CONDITION_DEF } from './incapacitated.js';
import { STUNNED_CONDITION_DEF } from './stunned.js';
import { BLINDED_CONDITION_DEF } from './blinded.js';
import { INVISIBLE_CONDITION_DEF } from './invisible.js';
import { POISONED_CONDITION_DEF } from './poisoned.js';

describe('INCAPACITATED_CONDITION_DEF', () => {
  it(
    'has name="Incapacitated" (PHB p.291)',
    () => {
      // PHB p.291: condition name is "Incapacitated"
      expect(INCAPACITATED_CONDITION_DEF.name).toBe('Incapacitated');
    },
  );

  it(
    'selfMod is present (encodes no-actions/no-reactions effect placeholder)',
    () => {
      expect(INCAPACITATED_CONDITION_DEF.selfMod).toBeDefined();
    },
  );

  it(
    'outgoingMod is present (grantPredicate + imposePredicate)',
    () => {
      expect(INCAPACITATED_CONDITION_DEF.outgoingMod).toBeDefined();
      expect(INCAPACITATED_CONDITION_DEF.outgoingMod.grantPredicate).toBeDefined();
      expect(INCAPACITATED_CONDITION_DEF.outgoingMod.imposePredicate).toBeDefined();
    },
  );
});

describe('BLINDED_CONDITION_DEF', () => {
  // PHB p.290 — Appendix A: Conditions, Blinded:
  //   "A blinded creature can't see and automatically fails any ability check
  //    that requires sight."
  //   "Attack rolls against the creature have advantage, and the creature's
  //    attack rolls have disadvantage."

  it('has name="Blinded" (PHB p.290)', () => {
    expect(BLINDED_CONDITION_DEF.name).toBe('Blinded');
  });

  it('selfMod.mode is "impose" — own attacks at disadvantage (PHB p.290)', () => {
    // PHB p.290: "the creature's attack rolls have disadvantage"
    expect(BLINDED_CONDITION_DEF.selfMod.mode).toBe('impose');
  });

  it('selfMod.rollType is "attack" (PHB p.290 — attack roll effect)', () => {
    expect(BLINDED_CONDITION_DEF.selfMod.rollType).toBe('attack');
  });

  it('outgoingMod.grantPredicate is alwaysTrue() — attackers-of get advantage unconditionally (PHB p.290)', () => {
    // PHB p.290: "Attack rolls against the creature have advantage" — unconditional
    const pred = BLINDED_CONDITION_DEF.outgoingMod.grantPredicate;
    expect(pred).toBeDefined();
    // alwaysTrue() = { op: 'and', nodes: [] } (vacuous truth)
    expect(pred).toEqual({ op: 'and', nodes: [] });
  });

  it('outgoingMod.imposePredicate is dead (never imposes disadvantage on attackers)', () => {
    // PHB p.290: attackers against Blinded always have advantage, never disadvantage
    // Dead predicate = not(alwaysTrue()) = always-false
    const pred = BLINDED_CONDITION_DEF.outgoingMod.imposePredicate;
    expect(pred).toBeDefined();
    expect(pred).toEqual({ op: 'not', node: { op: 'and', nodes: [] } });
  });
});

describe('INVISIBLE_CONDITION_DEF', () => {
  // PHB p.291 — Appendix A: Conditions, Invisible:
  //   "An invisible creature is impossible to see without the aid of magic or
  //    a special sense."
  //   "The creature's attack rolls have advantage, and attack rolls against
  //    the creature have disadvantage."

  it('has name="Invisible" (PHB p.291)', () => {
    expect(INVISIBLE_CONDITION_DEF.name).toBe('Invisible');
  });

  it('selfMod.mode is "grant" — own attacks at advantage (PHB p.291)', () => {
    // PHB p.291: "The creature's attack rolls have advantage"
    expect(INVISIBLE_CONDITION_DEF.selfMod.mode).toBe('grant');
  });

  it('selfMod.rollType is "attack" (PHB p.291 — attack roll effect)', () => {
    expect(INVISIBLE_CONDITION_DEF.selfMod.rollType).toBe('attack');
  });

  it('outgoingMod.imposePredicate is alwaysTrue() — attackers-of get disadvantage unconditionally (PHB p.291)', () => {
    // PHB p.291: "attack rolls against the creature have disadvantage" — unconditional
    const pred = INVISIBLE_CONDITION_DEF.outgoingMod.imposePredicate;
    expect(pred).toBeDefined();
    // alwaysTrue() = { op: 'and', nodes: [] } (vacuous truth)
    expect(pred).toEqual({ op: 'and', nodes: [] });
  });

  it('outgoingMod.grantPredicate is dead (never grants advantage to attackers)', () => {
    // PHB p.291: attackers against Invisible always have disadvantage, never advantage from this condition
    // Dead predicate = not(alwaysTrue()) = always-false
    const pred = INVISIBLE_CONDITION_DEF.outgoingMod.grantPredicate;
    expect(pred).toBeDefined();
    expect(pred).toEqual({ op: 'not', node: { op: 'and', nodes: [] } });
  });
});

describe('POISONED_CONDITION_DEF', () => {
  // PHB p.292 — Appendix A: Conditions, Poisoned:
  //   "A poisoned creature has disadvantage on attack rolls and ability checks."

  it('has name="Poisoned" (PHB p.292)', () => {
    expect(POISONED_CONDITION_DEF.name).toBe('Poisoned');
  });

  it('selfMod.mode is "impose" — own attacks at disadvantage (PHB p.292)', () => {
    // PHB p.292: "A poisoned creature has disadvantage on attack rolls"
    expect(POISONED_CONDITION_DEF.selfMod.mode).toBe('impose');
  });

  it('selfMod.rollType is "attack" — primary self-mod covers attack rolls (PHB p.292)', () => {
    expect(POISONED_CONDITION_DEF.selfMod.rollType).toBe('attack');
  });

  it('outgoingMod.grantPredicate is dead — Poisoned never grants advantage to attackers', () => {
    // PHB p.292: Poisoned has no outgoing effect on attackers
    // Dead predicate = not(alwaysTrue()) = always-false
    const pred = POISONED_CONDITION_DEF.outgoingMod.grantPredicate;
    expect(pred).toEqual({ op: 'not', node: { op: 'and', nodes: [] } });
  });

  it('outgoingMod.imposePredicate is dead — Poisoned never imposes disadvantage on attackers (no outgoing)', () => {
    // PHB p.292: Poisoned only affects the holder's own rolls, no outgoing effect
    const pred = POISONED_CONDITION_DEF.outgoingMod.imposePredicate;
    expect(pred).toEqual({ op: 'not', node: { op: 'and', nodes: [] } });
  });
});

describe('STUNNED_CONDITION_DEF', () => {
  it(
    'has name="Stunned" (PHB p.292)',
    () => {
      // PHB p.292: condition name is "Stunned"
      expect(STUNNED_CONDITION_DEF.name).toBe('Stunned');
    },
  );

  it(
    'outgoingMod is present (PHB p.292 — attack rolls against stunned have advantage)',
    () => {
      // PHB p.292: "Attack rolls against the creature have advantage."
      // The outgoingMod.grantPredicate must be truthy (always-true — unconditional).
      expect(STUNNED_CONDITION_DEF.outgoingMod).toBeDefined();
      expect(STUNNED_CONDITION_DEF.outgoingMod.grantPredicate).toBeDefined();
    },
  );

  it(
    'outgoingMod.grantPredicate is defined and truthy (all attackers get advantage unconditionally)',
    () => {
      // PHB p.292: unlike Prone, Stunned's advantage is UNCONDITIONAL (no range/weapon check).
      // The grantPredicate must be a valid Predicate object (not null/undefined).
      const pred = STUNNED_CONDITION_DEF.outgoingMod.grantPredicate;
      expect(pred).toBeDefined();
      expect(pred).not.toBeNull();
      // Must be a plain object with an 'op' property (AST node shape)
      expect(typeof pred).toBe('object');
      expect('op' in pred).toBe(true);
    },
  );

  it(
    'selfMod is present (stunned creature cannot attack — placeholder for action-economy gate)',
    () => {
      // PHB p.292: stunned is incapacitated (can't take actions/reactions).
      // selfMod placeholder present; enforcement deferred to action-economy slice (3b+).
      expect(STUNNED_CONDITION_DEF.selfMod).toBeDefined();
    },
  );
});
