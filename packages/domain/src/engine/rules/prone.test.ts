/**
 * Tests for buildProneModifiers — Prone rule encoding.
 *
 * // PHB 292 Appendix A — Prone:
 * // "The creature has disadvantage on attack rolls.
 * //  An attack roll against the creature has advantage if the attacker is
 * //  within 5 feet of the creature. Otherwise, the attack roll has disadvantage."
 *
 * // PHB 173: "If circumstances cause a roll to have both advantage and
 * // disadvantage, you are considered to have neither of them..."
 *
 * REQ-PRONE-01: self-disadvantage + outgoing-aware grant/impose via attackers-of axis.
 */
import { describe, it, expect } from 'vitest';
import { buildProneModifiers } from './prone.js';
import { PRONE_CONDITION_DEF } from '../conditions/prone.js';
import { createInMemoryRegistry } from '../registry/query.js';
import { resolveRollMode } from '../resolve/roll-mode.js';
import type { EntityId, ModifierInstanceId } from '../types.js';
import type { EvaluationContext } from '../context.js';

function mkIid(s: string): ModifierInstanceId {
  return s as ModifierInstanceId;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function eid(s: string): EntityId {
  return s as EntityId;
}

// ── Scenario 1: prone creature's own attack → disadvantage ───────────────────

describe('buildProneModifiers — self attack-roll (PHB 292)', () => {
  it('prone creature has disadvantage on its own attack rolls', () => {
    // PHB 292 Appendix A: own attacks disadvantage
    const proneId = eid('prone-char');
    const registry = createInMemoryRegistry();

    const result = buildProneModifiers(proneId, () => PRONE_CONDITION_DEF);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    result.instances.forEach((inst) => registry.register(inst));

    // Resolve the prone creature's own attack roll
    const ctx: EvaluationContext = {
      self: { id: proneId, conditions: [{ name: 'Prone' }] },
      activeConditions: [{ name: 'Prone' }],
    };

    // Gather AdvantageMod instances for attack roll from the registry
    // (trigger 'on-attack-roll', self = proneId)
    const mods = registry.query({ trigger: 'on-attack-roll', self: proneId, ctx });
    const rollMode = resolveRollMode(mods, ctx);

    expect(rollMode.mode).toBe('disadvantage');
    const proneSrc = rollMode.breakdown.find((s) => s.label === 'Prone');
    expect(proneSrc).toBeDefined();
  });
});

// ── Scenario 2: melee attacker ≤5ft → advantage ──────────────────────────────

describe('buildProneModifiers — attacker advantage (PHB 292)', () => {
  it('melee attacker within 5ft gets advantage against prone target', () => {
    // PHB 292 Appendix A: ≤5ft melee → advantage against
    const proneId = eid('prone-target');
    const attackerId = eid('melee-attacker');
    const registry = createInMemoryRegistry();

    const result = buildProneModifiers(proneId, () => PRONE_CONDITION_DEF);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    result.instances.forEach((inst) => registry.register(inst));

    // Attacker context: melee, 5ft range
    const ctx: EvaluationContext = {
      self: { id: attackerId, conditions: [] },
      activeConditions: [],
      attacker: { id: attackerId, conditions: [] },
      target: { id: proneId, conditions: [{ name: 'Prone' }] },
      weaponInUse: { kind: 'melee', rangeFt: 5, properties: [] },
    };

    const mods = registry.query({ trigger: 'on-attack-roll', self: attackerId, ctx });
    const rollMode = resolveRollMode(mods, ctx);

    expect(rollMode.mode).toBe('advantage');
    const proneSrc = rollMode.breakdown.find((s) => s.label === 'Prone');
    expect(proneSrc).toBeDefined();
  });

  it('ranged attacker (>5ft) gets disadvantage against prone target', () => {
    // PHB 292 Appendix A: ranged → disadvantage against
    const proneId = eid('prone-target');
    const attackerId = eid('ranged-attacker');
    const registry = createInMemoryRegistry();

    const result = buildProneModifiers(proneId, () => PRONE_CONDITION_DEF);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    result.instances.forEach((inst) => registry.register(inst));

    // Attacker context: ranged, 30ft
    const ctx: EvaluationContext = {
      self: { id: attackerId, conditions: [] },
      activeConditions: [],
      attacker: { id: attackerId, conditions: [] },
      target: { id: proneId, conditions: [{ name: 'Prone' }] },
      weaponInUse: { kind: 'ranged', rangeFt: 30, properties: [] },
    };

    const mods = registry.query({ trigger: 'on-attack-roll', self: attackerId, ctx });
    const rollMode = resolveRollMode(mods, ctx);

    expect(rollMode.mode).toBe('disadvantage');
    const proneSrc = rollMode.breakdown.find((s) => s.label === 'Prone');
    expect(proneSrc).toBeDefined();
  });
});

// ── Scenario 3: Prone + advantage source → 5e cancellation (PHB 173) ─────────

describe('buildProneModifiers — 5e cancellation (PHB 173)', () => {
  it('Prone (disadvantage) + another advantage source → mode=normal; both in breakdown', () => {
    // PHB 173: any adv + any disadv = neither
    // PHB 292: prone creature's own attacks have disadvantage
    const proneId = eid('prone-char');
    const registry = createInMemoryRegistry();

    const result = buildProneModifiers(proneId, () => PRONE_CONDITION_DEF);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    result.instances.forEach((inst) => registry.register(inst));

    // Also register an external advantage source (e.g. Reckless Attack)
    registry.register({
      id: mkIid('reckless-adv'),
      label: 'Reckless Attack',
      def: { kind: 'advantage', mode: 'grant', rollType: 'attack' },
      scope: {
        owner: proneId,
        target: { axis: 'self' },
        trigger: 'on-attack-roll',
      },
    });

    const ctx: EvaluationContext = {
      self: { id: proneId, conditions: [{ name: 'Prone' }] },
      activeConditions: [{ name: 'Prone' }],
    };

    const mods = registry.query({ trigger: 'on-attack-roll', self: proneId, ctx });
    const rollMode = resolveRollMode(mods, ctx);

    // 5e cancellation: adv + disadv = normal
    expect(rollMode.mode).toBe('normal');

    // Both sources in breakdown
    const labels = rollMode.breakdown.map((s) => s.label);
    expect(labels.some((l) => l === 'Prone')).toBe(true);
    expect(labels.some((l) => l === 'Reckless Attack')).toBe(true);
  });
});

// ── Scenario 4: CONDITION_NOT_FOUND when resolver returns null ─────────────────

describe('buildProneModifiers — resolver error', () => {
  it('returns ok:false with CONDITION_NOT_FOUND when resolver returns null', () => {
    const proneId = eid('prone-char');
    const result = buildProneModifiers(proneId, () => null);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0]!.code).toBe('CONDITION_NOT_FOUND');
    expect(result.issues[0]!.expected).toBe('Prone');
  });
});
