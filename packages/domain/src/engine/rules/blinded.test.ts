/**
 * Tests for buildBlindedModifiers — Blinded rule encoding.
 *
 * PHB p.290 — Appendix A: Conditions, Blinded:
 *   "Attack rolls against the creature have advantage, and the creature's
 *    attack rolls have disadvantage."
 *
 * REQ-COND-BLIND-01: attackers-of grant (advantage) — unconditional.
 * REQ-COND-BLIND-02: self impose (disadvantage) on own attacks.
 *
 * Strict TDD — RED first.
 */

import { describe, expect, it } from 'vitest';
import { buildBlindedModifiers } from './blinded.js';
import type { EntityId } from '../types.js';
import { BLINDED_CONDITION_DEF } from '../conditions/blinded.js';
import type { ConditionDefinition } from '../conditions/prone.js';

// ── Resolver stubs ────────────────────────────────────────────────────────────

function makeBlindedResolver(): (name: string) => ConditionDefinition | null {
  return (name: string) => {
    if (name === 'Blinded') return BLINDED_CONDITION_DEF;
    return null;
  };
}

function makeEmptyResolver(): (name: string) => ConditionDefinition | null {
  return () => null;
}

const targetId = 'target-001' as EntityId;

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('buildBlindedModifiers', () => {
  it('returns ok:false with CONDITION_NOT_FOUND when resolver returns null', () => {
    // PHB p.290: builder requires a valid Blinded ConditionDefinition
    const result = buildBlindedModifiers(targetId, makeEmptyResolver());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0].code).toBe('CONDITION_NOT_FOUND');
    expect(result.issues[0].expected).toBe('Blinded');
  });

  it('returns ok:true with ModifierInstance[] when resolver returns BLINDED_CONDITION_DEF', () => {
    const result = buildBlindedModifiers(targetId, makeBlindedResolver());
    expect(result.ok).toBe(true);
  });

  it('emits a self impose instance (axis:"self", mode:"impose", trigger:"on-attack-roll") — PHB p.290', () => {
    // PHB p.290: "the creature's attack rolls have disadvantage"
    const result = buildBlindedModifiers(targetId, makeBlindedResolver());
    if (!result.ok) throw new Error('expected ok:true');

    const selfImpose = result.instances.find(
      (m) =>
        m.scope.target.axis === 'self' &&
        'mode' in m.def &&
        m.def.mode === 'impose',
    );
    expect(selfImpose).toBeDefined();
    expect(selfImpose?.scope.trigger).toBe('on-attack-roll');
    expect(selfImpose?.scope.owner).toBe(targetId);
  });

  it('emits an attackers-of grant instance (axis:"attackers-of", mode:"grant") — PHB p.290', () => {
    // PHB p.290: "Attack rolls against the creature have advantage"
    const result = buildBlindedModifiers(targetId, makeBlindedResolver());
    if (!result.ok) throw new Error('expected ok:true');

    const attackersOfGrant = result.instances.find(
      (m) =>
        m.scope.target.axis === 'attackers-of' &&
        'mode' in m.def &&
        m.def.mode === 'grant',
    );
    expect(attackersOfGrant).toBeDefined();
    expect(attackersOfGrant?.scope.trigger).toBe('on-attack-roll');
  });

  it('attackers-of grant targets the given targetId (ids:[targetId])', () => {
    const result = buildBlindedModifiers(targetId, makeBlindedResolver());
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
  });

  it('attackers-of grant predicate is alwaysTrue() — unconditional (PHB p.290)', () => {
    // PHB p.290: unlike Prone, Blinded outgoing advantage has no range/weapon gate
    const result = buildBlindedModifiers(targetId, makeBlindedResolver());
    if (!result.ok) throw new Error('expected ok:true');

    const grantInstance = result.instances.find(
      (m) =>
        m.scope.target.axis === 'attackers-of' &&
        'mode' in m.def &&
        m.def.mode === 'grant',
    );
    expect(grantInstance?.predicate).toEqual({ op: 'and', nodes: [] });
  });

  it('instance labels are "Blinded"', () => {
    const result = buildBlindedModifiers(targetId, makeBlindedResolver());
    if (!result.ok) throw new Error('expected ok:true');
    for (const inst of result.instances) {
      expect(inst.label).toBe('Blinded');
    }
  });
});
