/**
 * Tests for buildWildShapeModifiers — Wild Shape rule encoding.
 *
 * // PHB 66-67: Wild Shape — Druid feature.
 * // "Your game statistics are replaced by the statistics of the beast, but
 * //  you retain your alignment, personality, and... your Intelligence, Wisdom,
 * //  and Charisma scores..."
 * // "You also retain all of your skill and saving throw proficiencies, in
 * //  addition to gaining those of the creature. If the creature has the same
 * //  proficiency in a skill or saving throw... you use whichever bonus is higher."
 * // PHB 66: Equipment handling in Wild Shape is DM-discretion.
 * // PHB 66: Wild Shape ends when you drop to 0 hit points or the duration expires.
 *
 * REQ-WILDSHAPE-01: ReplaceMod + retention + max-self-beast + gmRuling + EndCondition revert.
 *
 * TWO-PATH RECONCILIATION (orchestrator requirement):
 *   These tests assert stat resolution by calling resolveStat(...) against the
 *   registry (the ReplaceMod registry path from Phase 4). NOT via applyFormSwitch
 *   directly. This proves the registry substitution path and the form-switching
 *   subsystem agree. See Phase 7 design note.
 */
import { describe, it, expect } from 'vitest';
import { buildWildShapeModifiers } from './wild-shape.js';
import { createInMemoryRegistry } from '../registry/query.js';
import { resolveStat } from '../resolve/stat.js';
import { applyFormSwitch } from '../form-switching/substitute.js';
import type { EntityId } from '../types.js';
import type { EvaluationContext } from '../context.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

/** Self (druid) stats. */
const DRUID_STATS = {
  str: 10,
  dex: 12,
  con: 13,
  int: 14,
  wis: 16,
  cha: 11,
  'skill.perception': 5, // self perception bonus
};

/** Wolf beast stats. */
const WOLF_STATS = {
  str: 18,
  dex: 15,
  con: 14,
  int: 3,
  wis: 12,
  cha: 7,
  'skill.perception': 3, // beast perception bonus (lower than self)
};

function eid(s: string): EntityId {
  return s as EntityId;
}

function makeCtx(selfId: EntityId): EvaluationContext {
  return {
    self: { id: selfId, conditions: [] },
    activeConditions: [],
  };
}

// ── Scenario 1: physical stats → beast values (via resolveStat registry path) ─

describe('buildWildShapeModifiers — physical stat substitution (PHB 66)', () => {
  it('STR resolves to beast value via resolveStat registry path', () => {
    // PHB 66: physical stats replaced; INT/WIS/CHA retained.
    // TWO-PATH: must go through resolveStat + registry, NOT only applyFormSwitch.
    const charId = eid('druid');
    const beastId = eid('wolf');
    const registry = createInMemoryRegistry();

    const beastStatResolver = (_id: EntityId) => WOLF_STATS;
    const result = buildWildShapeModifiers(charId, beastId, beastStatResolver);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    result.instances.forEach((inst) => registry.register(inst));

    const ctx = makeCtx(charId);
    // END-TO-END via resolveStat (registry substitution path — Phase 4)
    const strResult = resolveStat(charId, 'str', DRUID_STATS.str, ctx, registry);

    expect(strResult.value).toBe(18); // beast STR=18
    const beastSource = strResult.breakdown.find(
      (s) => s.type === 'ReplaceMod' || s.label.includes('Wild Shape'),
    );
    expect(beastSource).toBeDefined();
    expect(beastSource!.amount).toBe(18);

    // TWO-PATH RECONCILIATION: applyFormSwitch must produce identical result
    const formSwitchResult = applyFormSwitch({
      selfStats: DRUID_STATS,
      beastStats: WOLF_STATS,
      stat: 'str',
      retain: ['int', 'wis', 'cha'],
    });
    expect(formSwitchResult.gmRuling).toBeUndefined();
    if (formSwitchResult.gmRuling) return;
    expect(formSwitchResult.value).toBe(strResult.value);
  });
});

// ── Scenario 2: INT retained from self ────────────────────────────────────────

describe('buildWildShapeModifiers — INT retention (PHB 66)', () => {
  it('INT resolves to self value (not beast) via resolveStat registry path', () => {
    // PHB 66: INT/WIS/CHA retained from self
    const charId = eid('druid');
    const beastId = eid('wolf');
    const registry = createInMemoryRegistry();

    const beastStatResolver = (_id: EntityId) => WOLF_STATS;
    const result = buildWildShapeModifiers(charId, beastId, beastStatResolver);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    result.instances.forEach((inst) => registry.register(inst));

    const ctx = makeCtx(charId);
    // INT: should retain self value (14), not beast value (3)
    const intResult = resolveStat(charId, 'int', DRUID_STATS.int, ctx, registry);

    expect(intResult.value).toBe(14); // self INT=14 retained

    // TWO-PATH RECONCILIATION: applyFormSwitch must agree
    const formSwitchResult = applyFormSwitch({
      selfStats: DRUID_STATS,
      beastStats: WOLF_STATS,
      stat: 'int',
      retain: ['int', 'wis', 'cha'],
    });
    expect(formSwitchResult.gmRuling).toBeUndefined();
    if (formSwitchResult.gmRuling) return;
    expect(formSwitchResult.value).toBe(intResult.value);
  });
});

// ── Scenario 3: skill.perception → max(self, beast) ──────────────────────────

describe('buildWildShapeModifiers — max(self,beast) skill policy (PHB 66)', () => {
  it('skill.perception resolves to max(self=5, beast=3) = 5 via resolveStat', () => {
    // PHB 66: "whichever bonus is higher" for overlapping proficiencies
    const charId = eid('druid');
    const beastId = eid('wolf');
    const registry = createInMemoryRegistry();

    const beastStatResolver = (_id: EntityId) => WOLF_STATS;
    const result = buildWildShapeModifiers(charId, beastId, beastStatResolver);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    result.instances.forEach((inst) => registry.register(inst));

    const ctx = makeCtx(charId);
    const skillResult = resolveStat(
      charId,
      'skill.perception',
      DRUID_STATS['skill.perception'],
      ctx,
      registry,
    );

    expect(skillResult.value).toBe(5); // max(5, 3) = 5

    // TWO-PATH RECONCILIATION: applyFormSwitch must agree
    const formSwitchResult = applyFormSwitch({
      selfStats: DRUID_STATS,
      beastStats: WOLF_STATS,
      stat: 'skill.perception',
      retain: ['int', 'wis', 'cha'],
      policy: 'max-self-beast',
    });
    expect(formSwitchResult.gmRuling).toBeUndefined();
    if (formSwitchResult.gmRuling) return;
    expect(formSwitchResult.value).toBe(skillResult.value);
  });
});

// ── Scenario 4: equipment → gmRuling ─────────────────────────────────────────

describe('buildWildShapeModifiers — equipment gmRuling (PHB 66)', () => {
  it('equipment resolution returns gmRuling result', () => {
    // PHB 66: Equipment handling in Wild Shape is DM-discretion.
    const charId = eid('druid');
    const beastId = eid('wolf');

    const beastStatResolver = (_id: EntityId) => WOLF_STATS;
    const result = buildWildShapeModifiers(charId, beastId, beastStatResolver);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const equipResult = result.resolveEquipment();
    expect(equipResult.gmRuling).toBe(true);
    expect(equipResult.description).toContain('DM-discretion');
  });
});

// ── Scenario 5: 0 HP → all ReplaceMod instances removed → STR returns self ───

describe('buildWildShapeModifiers — revert at 0 HP (PHB 66)', () => {
  it('removing all Wild Shape instances reverts STR to self value', () => {
    // PHB 66: Wild Shape ends at 0 HP (hp-reaches-zero EndCondition)
    const charId = eid('druid');
    const beastId = eid('wolf');
    const registry = createInMemoryRegistry();

    const beastStatResolver = (_id: EntityId) => WOLF_STATS;
    const result = buildWildShapeModifiers(charId, beastId, beastStatResolver);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    result.instances.forEach((inst) => registry.register(inst));

    // Confirm beast STR active
    const ctx = makeCtx(charId);
    const beforeRevert = resolveStat(charId, 'str', DRUID_STATS.str, ctx, registry);
    expect(beforeRevert.value).toBe(18);

    // 0 HP → revert: remove all Wild Shape instances
    result.revert(registry);

    // After revert: STR returns to self value
    const afterRevert = resolveStat(charId, 'str', DRUID_STATS.str, ctx, registry);
    expect(afterRevert.value).toBe(10); // self STR
  });
});

// ── Scenario 6: round-trip serialization ─────────────────────────────────────

describe('buildWildShapeModifiers — round-trip serialization (PHB 66)', () => {
  it('beast STR preserved after serialize + reload into fresh registry', () => {
    // REQ-WILDSHAPE-01: round-trip — serialize + reload → beast value preserved
    const charId = eid('druid');
    const beastId = eid('wolf');
    const registry = createInMemoryRegistry();

    const beastStatResolver = (_id: EntityId) => WOLF_STATS;
    const result = buildWildShapeModifiers(charId, beastId, beastStatResolver);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    result.instances.forEach((inst) => registry.register(inst));

    // Serialize instances
    const serialized = JSON.stringify(result.instances);
    const reloaded = JSON.parse(serialized) as typeof result.instances;

    // Fresh registry with reloaded instances
    const freshRegistry = createInMemoryRegistry();
    reloaded.forEach((inst) => freshRegistry.register(inst));

    const ctx = makeCtx(charId);
    const strResult = resolveStat(charId, 'str', DRUID_STATS.str, ctx, freshRegistry);
    expect(strResult.value).toBe(18); // beast STR preserved
  });
});

// ── Scenario 7: RESOLVER_NOT_INJECTED error ───────────────────────────────────

describe('buildWildShapeModifiers — resolver injection', () => {
  it('returns ok:false with RESOLVER_NOT_INJECTED when resolver is null', () => {
    const charId = eid('druid');
    const beastId = eid('wolf');

    const result = buildWildShapeModifiers(charId, beastId, null);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0]!.code).toBe('RESOLVER_NOT_INJECTED');
    expect(result.issues[0]!.expected).toBe('BeastStatResolver');
  });
});
