/**
 * Tests for buildGuidanceModifiers — Guidance cantrip.
 *
 * // PHB 248 (Cantrips — Guidance): "You touch one willing creature. Once before the
 * // spell ends, the target can roll a d4 and add the number rolled to one ability
 * // check of its choice. It can roll the die before or after making the ability check."
 * // Concentration, 1 minute.
 *
 * REQ-RULE-GUIDANCE-01: authored via DSL pipeline (parseRule → compileRule).
 *
 * Design decision (LOCKED): Guidance is modeled as a cross-entity NumMod{value:'1d4'}
 * scoped to the target via axis:'entities'. Trigger:'always'. The "one ability check of
 * its choice" selection is deferred (// TODO: choice-runtime). The caster's concentration
 * token wires the duration/removal.
 *
 * Scenarios:
 *   (a) Guidance active → target's skill.athletics breakdown includes +1d4
 *       {source:'Guidance (<casterId>)', amount:'1d4', type:'untyped'}
 *   (b) Concentration ends (removeByConcentrationToken) → 1d4 gone from breakdown
 *   (c) Round-trip: concentration token preserved after JSON serialize + reload
 */

// RED SENTINEL — builder does not exist yet; this import will fail = RED
import { buildGuidanceModifiers } from './guidance.js';
import { describe, it, expect } from 'vitest';
import { createInMemoryRegistry } from '../registry/query.js';
import { resolveStat } from '../resolve/stat.js';
import type { EntityId } from '../types.js';
import type { ModifierInstance } from '../registry/types.js';
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

const CASTER_ID = eid('cleric-1');
const TARGET_ID = eid('ally-1');
const TOKEN = 'guidance-token-1';

// ── Scenario (a): Guidance active — target gets +1d4 ─────────────────────────

describe('buildGuidanceModifiers — cross-entity +1d4 ability check, concentration (PHB 248)', () => {
  it('(a) guidance active → target skill.athletics breakdown includes {source:Guidance, amount:1d4, type:untyped}', () => {
    // PHB 248: target can add 1d4 to one ability check.
    // Cross-entity NumMod{value:'1d4'} scoped to target via axis:'entities'.
    const registry = createInMemoryRegistry();
    const instances = buildGuidanceModifiers(CASTER_ID, TARGET_ID, TOKEN);
    instances.forEach((inst: ModifierInstance) => registry.register(inst));

    const ctx = makeCtx(TARGET_ID);
    const result = resolveStat(TARGET_ID, 'skill.athletics', 0, ctx, registry);

    const guidanceSource = result.breakdown.find(
      (s) => s.label === `Guidance (${CASTER_ID})`,
    );
    expect(guidanceSource, 'Guidance +1d4 should appear in skill.athletics breakdown').toBeDefined();
    expect(guidanceSource!.amount).toBe('1d4');
    expect(guidanceSource!.type).toBe('untyped');
  });

  it('(a2) guidance does NOT affect the caster own skill check (cross-entity — only target)', () => {
    // Cross-entity scope: caster is NOT the target; Guidance only helps the target.
    const registry = createInMemoryRegistry();
    const instances = buildGuidanceModifiers(CASTER_ID, TARGET_ID, TOKEN);
    instances.forEach((inst: ModifierInstance) => registry.register(inst));

    const casterCtx = makeCtx(CASTER_ID);
    const result = resolveStat(CASTER_ID, 'skill.athletics', 0, casterCtx, registry);

    const guidanceSource = result.breakdown.find(
      (s) => s.label === `Guidance (${CASTER_ID})`,
    );
    expect(guidanceSource, 'Guidance should NOT affect caster own skill check').toBeUndefined();
  });

  // ── Scenario (b): Concentration ends ─────────────────────────────────────────

  it('(b) concentration ends → 1d4 removed from target breakdown', () => {
    // PHB 248: concentration, 1 minute. When caster loses concentration, guidance ends.
    const registry = createInMemoryRegistry();
    const instances = buildGuidanceModifiers(CASTER_ID, TARGET_ID, TOKEN);
    instances.forEach((inst: ModifierInstance) => registry.register(inst));

    // Confirm guidance is active before concentration ends
    const ctx = makeCtx(TARGET_ID);
    const before = resolveStat(TARGET_ID, 'skill.athletics', 0, ctx, registry);
    expect(before.breakdown.some((s) => s.label === `Guidance (${CASTER_ID})`)).toBe(true);

    // Concentration ends
    registry.removeByConcentrationToken(TOKEN);

    // Guidance should be gone
    const after = resolveStat(TARGET_ID, 'skill.athletics', 0, ctx, registry);
    expect(after.breakdown.some((s) => s.label === `Guidance (${CASTER_ID})`)).toBe(false);
  });

  // ── Scenario (c): Round-trip ─────────────────────────────────────────────────

  it('(c) round-trip: concentration token preserved after JSON serialize + reload', () => {
    // REQ-RULE-GUIDANCE-01: round-trip with concentration token intact.
    const instances = buildGuidanceModifiers(CASTER_ID, TARGET_ID, TOKEN);

    // Verify concentration token is present on at least one instance
    const hasToken = instances.some(
      (inst) => inst.duration?.concentrationToken === TOKEN,
    );
    expect(hasToken, 'At least one instance should carry the concentration token').toBe(true);

    // Serialize + reload
    const serialized = JSON.stringify(instances);
    const reloaded: ModifierInstance[] = JSON.parse(serialized) as ModifierInstance[];

    const freshRegistry = createInMemoryRegistry();
    reloaded.forEach((inst: ModifierInstance) => freshRegistry.register(inst));

    // Guidance should still work after reload
    const ctx = makeCtx(TARGET_ID);
    const result = resolveStat(TARGET_ID, 'skill.athletics', 0, ctx, freshRegistry);
    const guidanceSource = result.breakdown.find(
      (s) => s.label === `Guidance (${CASTER_ID})`,
    );
    expect(guidanceSource, 'Guidance should still work after round-trip').toBeDefined();
    expect(guidanceSource!.amount).toBe('1d4');

    // Concentration token should still work after reload
    freshRegistry.removeByConcentrationToken(TOKEN);
    const afterRemoval = resolveStat(TARGET_ID, 'skill.athletics', 0, ctx, freshRegistry);
    expect(afterRemoval.breakdown.some((s) => s.label === `Guidance (${CASTER_ID})`)).toBe(
      false,
    );
  });
});
