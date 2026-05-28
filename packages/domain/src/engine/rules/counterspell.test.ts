/**
 * Tests for buildCounterspellReaction — Counterspell rule encoding.
 *
 * // PHB 228: "You attempt to interrupt a creature in the process of casting a
 * // spell. If the creature is casting a spell of 3rd level or lower, its spell
 * // fails and has no effect. If it is casting a spell of 4th level or higher,
 * // make an ability check using your spellcasting ability. The DC equals 10 +
 * // the spell's level."
 * // Reaction trigger: "when you see a creature within 60 feet of you casting a
 * // spell."
 *
 * REQ-COUNTERSPELL-01: reaction EventTrigger + UsageMod + ForcedCheck.
 */
import { describe, it, expect } from 'vitest';
import { buildCounterspellReaction } from './counterspell.js';
import { advancePhase } from '../pipeline/state-machine.js';
import type { EntityId } from '../types.js';
import type { ActionInFlight } from '../pipeline/phases.js';
import type { EvaluationContext } from '../context.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function eid(s: string): EntityId {
  return s as EntityId;
}

/** Spell action at CAST_ANNOUNCED — the interruption window. */
function spellAction(id: string, spellLevel: number): ActionInFlight {
  return { id, type: 'spell', phase: 'CAST_ANNOUNCED', spellLevel };
}

/** EvaluationContext for the counterspeller (A) intercepting caster B. */
function makeCounterspellCtx(opts: {
  counterspellerId: EntityId;
  casterId: EntityId;
  distanceFt: number;
  spellLevel: number;
  canSee?: boolean;
}): EvaluationContext {
  const { counterspellerId, casterId, distanceFt, spellLevel, canSee = true } = opts;
  return {
    self: { id: counterspellerId, conditions: [] },
    activeConditions: [],
    attacker: { id: counterspellerId, conditions: [] },
    target: { id: casterId, conditions: [] },
    weaponInUse: { kind: 'ranged', rangeFt: distanceFt, properties: [] },
    currentAction: { id: casterId, type: 'spell', phase: 'CAST_ANNOUNCED', spellLevel },
    ...(canSee
      ? { visibility: { selfCanSee: [casterId] } }
      : {}),
  };
}

// ── Scenario 1: slot ≥ spell level → auto-cancel ────────────────────────────

describe('buildCounterspellReaction — auto-cancel (PHB 228)', () => {
  it('slot tier >= spell level → action transitions to CANCELLED', () => {
    // PHB 228: slot 3 >= spell level 2 → auto-cancel
    const counterspellerId = eid('wizard-A');
    const casterId = eid('enemy-B');

    // SpellSlotResolver: returns tier 3 slot
    const slotResolver = (_id: EntityId) => ({ tier: 3, available: true });

    const reaction = buildCounterspellReaction(counterspellerId, slotResolver);
    expect(reaction.ok).toBe(true);
    if (!reaction.ok) return;

    const ctx = makeCounterspellCtx({
      counterspellerId,
      casterId,
      distanceFt: 30,
      spellLevel: 2,
    });

    const result = reaction.fire(spellAction(casterId, 2), ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Should be auto-cancelled
    expect(result.outcome).toBe('cancelled');
    expect(result.action.phase).toBe('CANCELLED');
  });

  it('slot tier === spell level → also auto-cancels (>= boundary)', () => {
    // PHB 228: "3rd level or lower" — level 3 slot for level 3 spell cancels
    const counterspellerId = eid('wizard-A');
    const casterId = eid('enemy-B');
    const slotResolver = (_id: EntityId) => ({ tier: 3, available: true });

    const reaction = buildCounterspellReaction(counterspellerId, slotResolver);
    expect(reaction.ok).toBe(true);
    if (!reaction.ok) return;

    const ctx = makeCounterspellCtx({
      counterspellerId,
      casterId,
      distanceFt: 30,
      spellLevel: 3,
    });

    const result = reaction.fire(spellAction(casterId, 3), ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.outcome).toBe('cancelled');
  });
});

// ── Scenario 2: slot < spell level → ForcedCheck ────────────────────────────

describe('buildCounterspellReaction — ForcedCheck (PHB 228)', () => {
  it('slot tier < spell level → returns forced-check result with dc = 10 + spellLevel', () => {
    // PHB 228: level 3 slot vs level 5 spell → DC 15
    const counterspellerId = eid('wizard-A');
    const casterId = eid('enemy-B');
    const slotResolver = (_id: EntityId) => ({ tier: 3, available: true });

    const reaction = buildCounterspellReaction(counterspellerId, slotResolver);
    expect(reaction.ok).toBe(true);
    if (!reaction.ok) return;

    const ctx = makeCounterspellCtx({
      counterspellerId,
      casterId,
      distanceFt: 30,
      spellLevel: 5,
    });

    const result = reaction.fire(spellAction(casterId, 5), ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.outcome).toBe('forced-check');
    if (result.outcome !== 'forced-check') return;
    expect(result.dc).toBe(15); // 10 + 5
    expect(result.action.phase).toBe('INTERRUPTED');
  });

  it('check-pass → action transitions to CANCELLED', () => {
    // PHB 228: ability check succeeds → spell fails
    const counterspellerId = eid('wizard-A');
    const casterId = eid('enemy-B');
    const slotResolver = (_id: EntityId) => ({ tier: 3, available: true });

    const reaction = buildCounterspellReaction(counterspellerId, slotResolver);
    expect(reaction.ok).toBe(true);
    if (!reaction.ok) return;

    const ctx = makeCounterspellCtx({
      counterspellerId,
      casterId,
      distanceFt: 30,
      spellLevel: 5,
    });

    // First get to INTERRUPTED via the forced-check
    const fireResult = reaction.fire(spellAction(casterId, 5), ctx);
    expect(fireResult.ok).toBe(true);
    if (!fireResult.ok) return;
    expect(fireResult.outcome).toBe('forced-check');

    // Check passes → CANCELLED
    const cancelResult = advancePhase(fireResult.action, 'counter-success');
    expect(cancelResult.ok).toBe(true);
    if (!cancelResult.ok) return;
    expect(cancelResult.action.phase).toBe('CANCELLED');
  });

  it('check-fail → action continues to RESOLVING', () => {
    // PHB 228: ability check fails → spell resolves normally
    const counterspellerId = eid('wizard-A');
    const casterId = eid('enemy-B');
    const slotResolver = (_id: EntityId) => ({ tier: 3, available: true });

    const reaction = buildCounterspellReaction(counterspellerId, slotResolver);
    expect(reaction.ok).toBe(true);
    if (!reaction.ok) return;

    const ctx = makeCounterspellCtx({
      counterspellerId,
      casterId,
      distanceFt: 30,
      spellLevel: 5,
    });

    const fireResult = reaction.fire(spellAction(casterId, 5), ctx);
    expect(fireResult.ok).toBe(true);
    if (!fireResult.ok) return;

    // Check fails → RESOLVING
    const resolveResult = advancePhase(fireResult.action, 'counter-fail');
    expect(resolveResult.ok).toBe(true);
    if (!resolveResult.ok) return;
    expect(resolveResult.action.phase).toBe('RESOLVING');
  });
});

// ── Scenario 3: distance > 60ft → reaction predicate fails ──────────────────

describe('buildCounterspellReaction — range gate (PHB 228)', () => {
  it('caster beyond 60ft → reaction does not fire, action unaffected', () => {
    // PHB 228: reaction triggers only "within 60 feet of you"
    const counterspellerId = eid('wizard-A');
    const casterId = eid('enemy-B');
    const slotResolver = (_id: EntityId) => ({ tier: 3, available: true });

    const reaction = buildCounterspellReaction(counterspellerId, slotResolver);
    expect(reaction.ok).toBe(true);
    if (!reaction.ok) return;

    const ctx = makeCounterspellCtx({
      counterspellerId,
      casterId,
      distanceFt: 70, // beyond 60ft range
      spellLevel: 2,
    });

    const result = reaction.fire(spellAction(casterId, 2), ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Predicate fails → reaction does not fire → action unchanged
    expect(result.outcome).toBe('predicate-failed');
    expect(result.action.phase).toBe('CAST_ANNOUNCED');
  });
});
