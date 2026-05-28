/**
 * Tests for buildFrightenedModifiers — Frightened condition.
 *
 * // PHB 290 (Appendix A — Frightened): "A frightened creature has disadvantage
 * // on ability checks and attack rolls while the source of its fear is within
 * // its line of sight."
 * // FLAG: "can't willingly move closer to the source of its fear" is movement
 * // logic — OUT OF SCOPE. Only the roll-disadvantage half is encoded here.
 *
 * REQ-RULE-FRIGHTENED-01: authored via DSL pipeline (parseRule → compileRule).
 *
 * Scenarios:
 *   (a) Fear source visible → resolveRollMode for attack includes
 *       {source:'Frightened', type:'AdvantageMod', mode:'impose'} (disadvantage)
 *   (b) Fear source NOT visible → predicate fails → not applied
 *   (c) Round-trip: predicate {op:'query', q:{kind:'canSee',...}} survives JSON cycle
 */

// RED SENTINEL — builder does not exist yet; this import will fail = RED
import { buildFrightenedModifiers } from './frightened.js';
import { describe, it, expect } from 'vitest';
import { createInMemoryRegistry } from '../registry/query.js';
import { resolveRollMode } from '../resolve/roll-mode.js';
import type { EntityId } from '../types.js';
import type { ModifierInstance } from '../registry/types.js';
import type { EvaluationContext } from '../context.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function eid(s: string): EntityId {
  return s as EntityId;
}

const CHAR_ID = eid('fighter-frightened');
const FEAR_SOURCE_ID = eid('dragon-1');

/**
 * Make a context with the fear source (caster) visible or not.
 * canSee predicate uses ctx.currentAction.id as the casterId, plus
 * ctx.visibility.selfCanSee to resolve visibility.
 */
function makeCtxWithVisibility(
  selfId: EntityId,
  casterId: EntityId,
  canSee: boolean,
): EvaluationContext {
  return {
    self: { id: selfId, conditions: [] },
    activeConditions: [],
    // canSee uses ctx.visibility?.selfCanSee.includes(casterId) ?? true
    visibility: canSee
      ? { selfCanSee: [casterId] }
      : { selfCanSee: [] },
    // currentAction.id is used as casterId in the canSee evaluator (predicate/evaluate.ts)
    currentAction: { id: casterId, type: 'attack', phase: 'DECLARED' },
  };
}

// ── Scenario (a): Fear source visible — disadvantage applies ──────────────────

describe('buildFrightenedModifiers — disadvantage on attacks+checks while fear source visible (PHB 290)', () => {
  it('(a) fear source visible → resolveRollMode includes Frightened disadvantage (mode:impose)', () => {
    // PHB 290: disadvantage on attack rolls while source of fear is within line of sight.
    // The canSee predicate: {op:'query', q:{kind:'canSee', entity:'self', of:'caster'}}
    const registry = createInMemoryRegistry();
    const instances = buildFrightenedModifiers(CHAR_ID, FEAR_SOURCE_ID);
    instances.forEach((inst: ModifierInstance) => registry.register(inst));

    // Fear source IS visible
    const ctx = makeCtxWithVisibility(CHAR_ID, FEAR_SOURCE_ID, true);

    // Gather all modifier instances for attack roll
    const allInstances = registry.query({ trigger: 'always', self: CHAR_ID, ctx, rollType: 'attack' });
    const result = resolveRollMode(allInstances, ctx);

    // Should have disadvantage
    expect(result.mode).toBe('disadvantage');

    const frightenedSource = result.breakdown.find(
      (s) => s.label === 'Frightened',
    );
    expect(frightenedSource, 'Frightened should appear in breakdown when fear source visible').toBeDefined();
    expect(frightenedSource!.type).toBe('AdvantageMod');
    // AdvantageMod impose = amount -1 (see resolveRollMode: grant=1, impose=-1)
    expect(frightenedSource!.amount).toBe(-1);
  });

  // ── Scenario (b): Fear source NOT visible ─────────────────────────────────────

  it('(b) fear source NOT visible → Frightened predicate fails → no disadvantage', () => {
    // PHB 290: disadvantage ONLY while source is in line of sight.
    // When canSee=false, the predicate {op:'query', q:{kind:'canSee',...}} returns false.
    const registry = createInMemoryRegistry();
    const instances = buildFrightenedModifiers(CHAR_ID, FEAR_SOURCE_ID);
    instances.forEach((inst: ModifierInstance) => registry.register(inst));

    // Fear source is NOT visible
    const ctx = makeCtxWithVisibility(CHAR_ID, FEAR_SOURCE_ID, false);

    const allInstances = registry.query({ trigger: 'always', self: CHAR_ID, ctx, rollType: 'attack' });
    const result = resolveRollMode(allInstances, ctx);

    // Predicate fails → no disadvantage
    expect(result.mode).toBe('normal');

    const frightenedSource = result.breakdown.find(
      (s) => s.label === 'Frightened',
    );
    expect(frightenedSource, 'Frightened should NOT appear when fear source not visible').toBeUndefined();
  });

  // ── Scenario (c): Round-trip ─────────────────────────────────────────────────

  it('(c) round-trip: canSee predicate survives JSON serialize + reload', () => {
    // REQ-RULE-FRIGHTENED-01: predicate is plain JSON (no closures) — round-trip safe.
    const instances = buildFrightenedModifiers(CHAR_ID, FEAR_SOURCE_ID);

    // Verify predicate is present on at least one instance
    const hasPredicate = instances.some(
      (inst) => inst.predicate !== undefined,
    );
    expect(hasPredicate, 'At least one instance should carry a canSee predicate').toBe(true);

    // Serialize + reload
    const serialized = JSON.stringify(instances);
    const reloaded: ModifierInstance[] = JSON.parse(serialized) as ModifierInstance[];

    // Predicate should still be present after reload
    const reloadedHasPredicate = reloaded.some((inst) => inst.predicate !== undefined);
    expect(reloadedHasPredicate, 'Predicate should survive round-trip').toBe(true);

    // Register reloaded instances and confirm behavior is preserved
    const freshRegistry = createInMemoryRegistry();
    reloaded.forEach((inst: ModifierInstance) => freshRegistry.register(inst));

    // With fear source visible → disadvantage still applies
    const ctxVisible = makeCtxWithVisibility(CHAR_ID, FEAR_SOURCE_ID, true);
    const visibleInstances = freshRegistry.query({
      trigger: 'always',
      self: CHAR_ID,
      ctx: ctxVisible,
      rollType: 'attack',
    });
    const visibleResult = resolveRollMode(visibleInstances, ctxVisible);
    expect(visibleResult.mode).toBe('disadvantage');
  });
});
