/**
 * Tests for buildPoisonedModifiers — Poisoned rule encoding.
 *
 * PHB p.292 — Appendix A: Conditions, Poisoned:
 *   "A poisoned creature has disadvantage on attack rolls and ability checks."
 *
 * REQ-COND-POISON-01: self impose (disadvantage) on attack rolls.
 * REQ-COND-POISON-02: self impose (disadvantage) on ability checks.
 *
 * Strict TDD — RED first.
 */

import { describe, expect, it } from 'vitest';
import { buildPoisonedModifiers } from './poisoned.js';
import type { EntityId } from '../types.js';
import { POISONED_CONDITION_DEF } from '../conditions/poisoned.js';
import type { ConditionDefinition } from '../conditions/prone.js';

// ── Resolver stubs ────────────────────────────────────────────────────────────

function makePoisonedResolver(): (name: string) => ConditionDefinition | null {
  return (name: string) => {
    if (name === 'Poisoned') return POISONED_CONDITION_DEF;
    return null;
  };
}

function makeEmptyResolver(): (name: string) => ConditionDefinition | null {
  return () => null;
}

const targetId = 'target-001' as EntityId;

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('buildPoisonedModifiers', () => {
  it('returns ok:false with CONDITION_NOT_FOUND when resolver returns null', () => {
    // PHB p.292: builder requires a valid Poisoned ConditionDefinition
    const result = buildPoisonedModifiers(targetId, makeEmptyResolver());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0].code).toBe('CONDITION_NOT_FOUND');
    expect(result.issues[0].expected).toBe('Poisoned');
  });

  it('returns ok:true with ModifierInstance[] when resolver returns POISONED_CONDITION_DEF', () => {
    const result = buildPoisonedModifiers(targetId, makePoisonedResolver());
    expect(result.ok).toBe(true);
  });

  it('emits a self impose on attack rolls (axis:"self", mode:"impose", trigger:"on-attack-roll") — PHB p.292', () => {
    // PHB p.292: "A poisoned creature has disadvantage on attack rolls"
    const result = buildPoisonedModifiers(targetId, makePoisonedResolver());
    if (!result.ok) throw new Error('expected ok:true');

    const attackImpose = result.instances.find(
      (m) =>
        m.scope.target.axis === 'self' &&
        'mode' in m.def &&
        m.def.mode === 'impose' &&
        m.scope.trigger === 'on-attack-roll',
    );
    expect(attackImpose).toBeDefined();
    expect(attackImpose?.scope.owner).toBe(targetId);
  });

  it('emits a self impose on ability checks (axis:"self", mode:"impose", rollType:"check", trigger:"always") — PHB p.292', () => {
    // PHB p.292: "A poisoned creature has disadvantage on ... ability checks"
    // check disadvantage uses trigger:'always' + rollType:'check' (engine pattern, matching Frightened)
    const result = buildPoisonedModifiers(targetId, makePoisonedResolver());
    if (!result.ok) throw new Error('expected ok:true');

    const checkImpose = result.instances.find(
      (m) =>
        m.scope.target.axis === 'self' &&
        'mode' in m.def &&
        m.def.mode === 'impose' &&
        'rollType' in m.def &&
        m.def.rollType === 'check',
    );
    expect(checkImpose).toBeDefined();
    expect(checkImpose?.scope.owner).toBe(targetId);
    expect(checkImpose?.scope.trigger).toBe('always');
  });

  it('emits exactly 2 self instances — no outgoing (Poisoned has no attackers-of effect)', () => {
    // PHB p.292: Poisoned only affects the holder's own rolls
    const result = buildPoisonedModifiers(targetId, makePoisonedResolver());
    if (!result.ok) throw new Error('expected ok:true');

    const attackersOfInstances = result.instances.filter(
      (m) => m.scope.target.axis === 'attackers-of',
    );
    expect(attackersOfInstances).toHaveLength(0);
    expect(result.instances).toHaveLength(2);
  });

  it('instance labels are "Poisoned"', () => {
    const result = buildPoisonedModifiers(targetId, makePoisonedResolver());
    if (!result.ok) throw new Error('expected ok:true');
    for (const inst of result.instances) {
      expect(inst.label).toBe('Poisoned');
    }
  });
});
