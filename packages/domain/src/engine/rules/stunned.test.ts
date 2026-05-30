/**
 * Tests for buildStunnedModifiers — Stunned rule encoding.
 *
 * PHB p.292 — Stunned:
 *   "Attack rolls against the creature have advantage."
 *
 * REQ-COND-02 (domain): buildStunnedModifiers returns a ModifierInstance[] on the
 * 'attackers-of' axis that grants advantage to ALL attackers UNCONDITIONALLY.
 *
 * This test LIGHTS UP the previously-dead attackers-of registry path — buildProneModifiers
 * was barrel-exported but had zero call sites in production (see design ADR-6 CRITICAL DISCOVERY).
 * buildStunnedModifiers is the first production wiring of this path.
 *
 * Strict TDD — RED first.
 * Design ref: sdd/engine-forced-check-3a/design — ADR-6 (buildStunnedModifiers, attackers-of axis).
 */

import { describe, expect, it } from 'vitest';
import { buildStunnedModifiers } from './stunned.js';
import type { EntityId } from '../types.js';
import { STUNNED_CONDITION_DEF } from '../conditions/stunned.js';
import type { ConditionDefinition } from '../conditions/prone.js';

// ── Resolver stubs ────────────────────────────────────────────────────────────

function makeStunnedResolver(): (name: string) => ConditionDefinition | null {
  return (name: string) => {
    if (name === 'Stunned') return STUNNED_CONDITION_DEF;
    return null;
  };
}

function makeEmptyResolver(): (name: string) => ConditionDefinition | null {
  return () => null;
}

const targetId = 'target-001' as EntityId;

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('buildStunnedModifiers', () => {
  it(
    'returns ok:true with ModifierInstance[] when resolver returns STUNNED_CONDITION_DEF',
    () => {
      const result = buildStunnedModifiers(targetId, makeStunnedResolver());
      expect(result.ok).toBe(true);
    },
  );

  it(
    'returns at least one ModifierInstance on the attackers-of axis (PHB p.292 — attack rolls have advantage)',
    () => {
      const result = buildStunnedModifiers(targetId, makeStunnedResolver());
      if (!result.ok) throw new Error('expected ok:true');

      // Must have at least one attackers-of instance that grants advantage
      const attackersOfGrant = result.instances.filter(
        (m) =>
          m.scope.target.axis === 'attackers-of' &&
          'mode' in m.def &&
          m.def.mode === 'grant',
      );
      expect(attackersOfGrant.length).toBeGreaterThan(0);
    },
  );

  it(
    'attackers-of grant instance targets the given targetId (ids:[targetId])',
    () => {
      const result = buildStunnedModifiers(targetId, makeStunnedResolver());
      if (!result.ok) throw new Error('expected ok:true');

      const grantInstance = result.instances.find(
        (m) =>
          m.scope.target.axis === 'attackers-of' &&
          'mode' in m.def &&
          m.def.mode === 'grant',
      );
      expect(grantInstance).toBeDefined();
      if (grantInstance?.scope.target.axis === 'attackers-of') {
        expect(grantInstance.scope.target.ids).toContain(targetId);
      }
    },
  );

  it(
    'attackers-of grant instance has trigger="on-attack-roll" (PHB p.292 — attack rolls)',
    () => {
      const result = buildStunnedModifiers(targetId, makeStunnedResolver());
      if (!result.ok) throw new Error('expected ok:true');

      const grantInstance = result.instances.find(
        (m) =>
          m.scope.target.axis === 'attackers-of' &&
          'mode' in m.def &&
          m.def.mode === 'grant',
      );
      expect(grantInstance?.scope.trigger).toBe('on-attack-roll');
    },
  );

  it(
    'attackers-of grant instance has no imposePredicate in grantPredicate (unconditional, unlike Prone)',
    () => {
      // PHB p.292: Stunned advantage is UNCONDITIONAL — no range/weapon gate.
      // Unlike Prone (PHB 292-Prone) which requires melee AND within 5ft.
      const result = buildStunnedModifiers(targetId, makeStunnedResolver());
      if (!result.ok) throw new Error('expected ok:true');

      const grantInstance = result.instances.find(
        (m) =>
          m.scope.target.axis === 'attackers-of' &&
          'mode' in m.def &&
          m.def.mode === 'grant',
      );
      // The predicate should be alwaysTrue() = {op:'and', nodes:[]} — vacuous truth
      expect(grantInstance?.predicate).toBeDefined();
      expect(grantInstance?.predicate).toEqual({ op: 'and', nodes: [] });
    },
  );

  it(
    'returns ok:false with CONDITION_NOT_FOUND when resolver returns null',
    () => {
      const result = buildStunnedModifiers(targetId, makeEmptyResolver());
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.issues[0].code).toBe('CONDITION_NOT_FOUND');
      expect(result.issues[0].expected).toBe('Stunned');
    },
  );

  it(
    'instance label is "Stunned"',
    () => {
      const result = buildStunnedModifiers(targetId, makeStunnedResolver());
      if (!result.ok) throw new Error('expected ok:true');
      const grantInstance = result.instances.find(
        (m) =>
          m.scope.target.axis === 'attackers-of' &&
          'mode' in m.def &&
          m.def.mode === 'grant',
      );
      expect(grantInstance?.label).toBe('Stunned');
    },
  );
});
