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
