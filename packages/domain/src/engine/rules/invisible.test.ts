/**
 * Tests for buildInvisibleModifiers — Invisible rule encoding.
 *
 * PHB p.291 — Appendix A: Conditions, Invisible:
 *   "Attack rolls against the creature have disadvantage, and the creature's
 *    attack rolls have advantage."
 *
 * REQ-COND-INVIS-01: attackers-of impose (disadvantage) — unconditional.
 * REQ-COND-INVIS-02: self grant (advantage) on own attacks.
 *
 * Strict TDD — RED first.
 */

import { describe, expect, it } from 'vitest';
import { buildInvisibleModifiers } from './invisible.js';
import type { EntityId } from '../types.js';
import { INVISIBLE_CONDITION_DEF } from '../conditions/invisible.js';
import type { ConditionDefinition } from '../conditions/prone.js';

// ── Resolver stubs ────────────────────────────────────────────────────────────

function makeInvisibleResolver(): (name: string) => ConditionDefinition | null {
  return (name: string) => {
    if (name === 'Invisible') return INVISIBLE_CONDITION_DEF;
    return null;
  };
}

function makeEmptyResolver(): (name: string) => ConditionDefinition | null {
  return () => null;
}

const targetId = 'target-001' as EntityId;

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('buildInvisibleModifiers', () => {
  it('returns ok:false with CONDITION_NOT_FOUND when resolver returns null', () => {
    // PHB p.291: builder requires a valid Invisible ConditionDefinition
    const result = buildInvisibleModifiers(targetId, makeEmptyResolver());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0].code).toBe('CONDITION_NOT_FOUND');
    expect(result.issues[0].expected).toBe('Invisible');
  });

  it('returns ok:true with ModifierInstance[] when resolver returns INVISIBLE_CONDITION_DEF', () => {
    const result = buildInvisibleModifiers(targetId, makeInvisibleResolver());
    expect(result.ok).toBe(true);
  });

  it('emits a self grant instance (axis:"self", mode:"grant", trigger:"on-attack-roll") — PHB p.291', () => {
    // PHB p.291: "The creature's attack rolls have advantage"
    const result = buildInvisibleModifiers(targetId, makeInvisibleResolver());
    if (!result.ok) throw new Error('expected ok:true');

    const selfGrant = result.instances.find(
      (m) =>
        m.scope.target.axis === 'self' &&
        'mode' in m.def &&
        m.def.mode === 'grant',
    );
    expect(selfGrant).toBeDefined();
    expect(selfGrant?.scope.trigger).toBe('on-attack-roll');
    expect(selfGrant?.scope.owner).toBe(targetId);
  });

  it('emits an attackers-of impose instance (axis:"attackers-of", mode:"impose") — PHB p.291', () => {
    // PHB p.291: "attack rolls against the creature have disadvantage"
    const result = buildInvisibleModifiers(targetId, makeInvisibleResolver());
    if (!result.ok) throw new Error('expected ok:true');

    const attackersOfImpose = result.instances.find(
      (m) =>
        m.scope.target.axis === 'attackers-of' &&
        'mode' in m.def &&
        m.def.mode === 'impose',
    );
    expect(attackersOfImpose).toBeDefined();
    expect(attackersOfImpose?.scope.trigger).toBe('on-attack-roll');
  });

  it('attackers-of impose targets the given targetId (ids:[targetId])', () => {
    const result = buildInvisibleModifiers(targetId, makeInvisibleResolver());
    if (!result.ok) throw new Error('expected ok:true');

    const imposeInstance = result.instances.find(
      (m) =>
        m.scope.target.axis === 'attackers-of' &&
        'mode' in m.def &&
        m.def.mode === 'impose',
    );
    expect(imposeInstance).toBeDefined();
    if (imposeInstance?.scope.target.axis === 'attackers-of') {
      expect(imposeInstance.scope.target.ids).toContain(targetId);
    }
  });

  it('attackers-of impose predicate is alwaysTrue() — unconditional (PHB p.291)', () => {
    // PHB p.291: Invisible disadvantage for attackers is unconditional
    const result = buildInvisibleModifiers(targetId, makeInvisibleResolver());
    if (!result.ok) throw new Error('expected ok:true');

    const imposeInstance = result.instances.find(
      (m) =>
        m.scope.target.axis === 'attackers-of' &&
        'mode' in m.def &&
        m.def.mode === 'impose',
    );
    expect(imposeInstance?.predicate).toEqual({ op: 'and', nodes: [] });
  });

  it('instance labels are "Invisible"', () => {
    const result = buildInvisibleModifiers(targetId, makeInvisibleResolver());
    if (!result.ok) throw new Error('expected ok:true');
    for (const inst of result.instances) {
      expect(inst.label).toBe('Invisible');
    }
  });
});
