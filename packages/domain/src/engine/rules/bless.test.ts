/**
 * Tests for buildBlessModifiers — Bless rule encoding.
 *
 * // PHB 219: Bless — "Up to three creatures of your choice that you can see
 * // within range are blessed until the spell ends. Whenever a target makes an
 * // attack roll or a saving throw before the spell ends, the target can roll a
 * // d4 and add the number rolled to the attack roll or saving throw."
 * // Concentration, 1 minute.
 *
 * REQ-BLESS-01: cross-entity NumMod 1d4, concentration cleanup, round-trip.
 */
import { describe, it, expect } from 'vitest';
import { buildBlessModifiers } from './bless.js';
import { createInMemoryRegistry } from '../registry/query.js';
import { resolveStat } from '../resolve/stat.js';
import type { EntityId } from '../types.js';
import type { EvaluationContext } from '../context.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function eid(s: string): EntityId {
  return s as EntityId;
}

function makeCtx(selfId: EntityId): EvaluationContext {
  return {
    self: { id: selfId, conditions: [] },
    activeConditions: [],
  };
}

// ── Scenario 1: three targets each get +1d4 on attack-roll ───────────────────

describe('buildBlessModifiers — attack-roll breakdown (PHB 219)', () => {
  it('each of 3 targets has Bless +1d4 in attack-roll breakdown', () => {
    // PHB 219: +1d4 attack rolls + saving throws, concentration 1 min
    const registry = createInMemoryRegistry();
    const casterId = eid('caster');
    const targets = [eid('ally-A'), eid('ally-B'), eid('ally-C')];
    const token = 'bless-token-1';

    const instances = buildBlessModifiers(casterId, targets, token);
    instances.forEach((inst) => registry.register(inst));

    for (const targetId of targets) {
      const ctx = makeCtx(targetId);
      const result = resolveStat(targetId, 'attack-roll', 0, ctx, registry);
      const blessSource = result.breakdown.find((s) => s.label === `Bless (${casterId})`);
      expect(blessSource, `${targetId} should have Bless in attack-roll breakdown`).toBeDefined();
      expect(blessSource!.amount).toBe('1d4');
      expect(blessSource!.type).toBe('untyped');
    }
  });

  it('each of 3 targets has Bless +1d4 in saving-throw breakdown', () => {
    // PHB 219: +1d4 attack rolls + saving throws
    const registry = createInMemoryRegistry();
    const casterId = eid('caster');
    const targets = [eid('ally-A'), eid('ally-B'), eid('ally-C')];
    const token = 'bless-token-2';

    const instances = buildBlessModifiers(casterId, targets, token);
    instances.forEach((inst) => registry.register(inst));

    for (const targetId of targets) {
      const ctx = makeCtx(targetId);
      const result = resolveStat(targetId, 'saving-throw', 0, ctx, registry);
      const blessSource = result.breakdown.find((s) => s.label === `Bless (${casterId})`);
      expect(blessSource, `${targetId} should have Bless in saving-throw breakdown`).toBeDefined();
      expect(blessSource!.amount).toBe('1d4');
      expect(blessSource!.type).toBe('untyped');
    }
  });

  it('concentration ends → all 3 Bless instances removed from attack-roll breakdown', () => {
    // PHB 219: concentration 1 min — when caster loses concentration all targets lose Bless
    const registry = createInMemoryRegistry();
    const casterId = eid('caster');
    const targets = [eid('ally-A'), eid('ally-B'), eid('ally-C')];
    const token = 'bless-token-3';

    const instances = buildBlessModifiers(casterId, targets, token);
    instances.forEach((inst) => registry.register(inst));

    // Confirm Bless is active for each target BEFORE concentration ends
    for (const targetId of targets) {
      const ctx = makeCtx(targetId);
      const result = resolveStat(targetId, 'attack-roll', 0, ctx, registry);
      expect(result.breakdown.some((s) => s.label === `Bless (${casterId})`)).toBe(true);
    }

    // Concentration ends → remove all instances sharing the token
    registry.removeByConcentrationToken(token);

    // Confirm Bless is gone for all targets
    for (const targetId of targets) {
      const ctx = makeCtx(targetId);
      const result = resolveStat(targetId, 'attack-roll', 0, ctx, registry);
      expect(result.breakdown.some((s) => s.label === `Bless (${casterId})`)).toBe(false);
    }
  });

  it('per-target scoping: ally-A Bless does not affect ally-B when Bless only on A', () => {
    // Instances are scoped individually — A's Bless ≠ B's Bless
    const registry = createInMemoryRegistry();
    const casterId = eid('caster');
    const targetA = eid('ally-A');
    const targetB = eid('ally-B'); // NOT blessed
    const token = 'bless-token-4';

    // Only bless A
    const instances = buildBlessModifiers(casterId, [targetA], token);
    instances.forEach((inst) => registry.register(inst));

    const ctxB = makeCtx(targetB);
    const resultB = resolveStat(targetB, 'attack-roll', 0, ctxB, registry);
    expect(resultB.breakdown.some((s) => s.label === `Bless (${casterId})`)).toBe(false);
  });
});

// ── Scenario 2 (T7.2): round-trip serialization ───────────────────────────────

describe('buildBlessModifiers — round-trip serialization (PHB 219)', () => {
  it('targets still have Bless in attack-roll breakdown after serialize + reload', () => {
    // REQ-BLESS-01: "Round-trip — Bless survives serialization"
    const registry = createInMemoryRegistry();
    const casterId = eid('caster');
    const targets = [eid('ally-A'), eid('ally-B')];
    const token = 'bless-round-trip';

    const instances = buildBlessModifiers(casterId, targets, token);
    instances.forEach((inst) => registry.register(inst));

    // Serialize + reload into a fresh registry
    const serialized = JSON.stringify(instances);
    const reloaded: typeof instances = JSON.parse(serialized) as typeof instances;

    const freshRegistry = createInMemoryRegistry();
    reloaded.forEach((inst) => freshRegistry.register(inst));

    for (const targetId of targets) {
      const ctx = makeCtx(targetId);
      const result = resolveStat(targetId, 'attack-roll', 0, ctx, freshRegistry);
      const blessSource = result.breakdown.find((s) => s.label === `Bless (${casterId})`);
      expect(blessSource, `${targetId} should still have Bless after round-trip`).toBeDefined();
      expect(blessSource!.amount).toBe('1d4');
    }
  });
});
