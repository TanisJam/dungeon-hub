/**
 * TDD tests for buildHexRider — STRICT TDD (RED first, per engine-hex SDD).
 *
 * PHB p.251 — Hex:
 *   "You place a curse on a creature that you can see within range. Until the spell ends,
 *   you deal an extra 1d6 necrotic damage to the target whenever you hit it with an attack."
 *
 * PHB p.196 — Critical Hits:
 *   "Roll all of the attack's damage dice twice and add them together."
 *   (1d6 Hex die doubles to 2d6 on a critical hit — same path as Sneak Attack / Divine Smite.)
 */
import { describe, it, expect } from 'vitest';
import { buildHexRider } from './hex.js';
import { evaluatePredicate } from '../predicate/evaluate.js';
import type { EntityId } from '../types.js';
import type { EvaluationContext } from '../context.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function eid(s: string): EntityId {
  return s as EntityId;
}

const ATTACKER_ID = eid('char-A');
const TARGET_ID = eid('char-T');

/** Minimal ctx for predicate evaluation — avoids resolveWeaponAttack overhead. */
function makeCtx(overrides: Partial<EvaluationContext> = {}): EvaluationContext {
  return {
    self: { id: ATTACKER_ID, conditions: [] },
    activeConditions: [],
    target: { id: TARGET_ID, conditions: [] },
    attacker: { id: ATTACKER_ID, conditions: [] },
    ...overrides,
  };
}

// ── REQ-HEX-01: Factory shape ─────────────────────────────────────────────────

describe('buildHexRider — factory shape (REQ-HEX-01)', () => {
  it(
    'returns array of 1 instance with 1d6 necrotic NumMod, label Hex, on-hit scope, and hasEffectFromSelf predicate — PHB p.251',
    () => {
      // PHB p.251: "+1d6 necrotic damage to the target whenever you hit it with an attack."
      // Fixed 1d6, NOT level-scaled. Predicate is hasEffectFromSelf('Hex').
      const riders = buildHexRider(ATTACKER_ID, TARGET_ID);

      expect(riders).toHaveLength(1);
      const rider = riders[0]!;

      // NumMod def shape
      expect(rider.def.kind).toBe('num');
      if (rider.def.kind === 'num') {
        expect(rider.def.op).toBe('add');
        expect(rider.def.value).toBe('1d6');
        expect(rider.def.stat).toBe('damage');
      }

      // Label
      expect(rider.label).toBe('Hex');

      // Scope: on-hit, owned by attacker
      expect(rider.scope.trigger).toBe('on-hit');
      expect(rider.scope.target.axis).toBe('entities');
      if (rider.scope.target.axis === 'entities') {
        expect(rider.scope.target.ids).toEqual([ATTACKER_ID]);
      }

      // Predicate: must be present (hasEffectFromSelf node)
      expect(rider.predicate).toBeDefined();
    },
  );
});

// ── REQ-HEX-02: Predicate fires when target is hexed by attacker ──────────────

describe('buildHexRider — predicate: fires for own-hexed target (REQ-HEX-02)', () => {
  it(
    'evaluates true when targetCombatantEffects contains Hex from attacker combatant — PHB p.251',
    () => {
      // PHB p.251: "whenever you hit it with an attack" — only YOUR hex triggers the damage.
      // hasEffectFromSelf compares effect.sourceCombatantId === ctx.attackerCombatantId.
      const riders = buildHexRider(ATTACKER_ID, TARGET_ID);
      const rider = riders[0]!;

      const ctx = makeCtx({
        attackerCombatantId: 'comb-A',
        targetCombatantEffects: [
          { effectName: 'Hex', sourceCombatantId: 'comb-A' },
        ],
      });

      const result = evaluatePredicate(rider.predicate!, ctx);
      expect(result).toBe(true);
    },
  );
});

// ── REQ-HEX-03: Predicate does NOT fire for different source combatant ─────────

describe('buildHexRider — predicate: does not fire for wrong source (REQ-HEX-03)', () => {
  it(
    'evaluates false when Hex effect is sourced by a different combatant — PHB p.251',
    () => {
      // PHB p.251: "a curse on a creature" placed by YOU — only the caster's own hex fires.
      // B attacks a target hexed by A → B's predicate returns false.
      const riders = buildHexRider(eid('char-B'), TARGET_ID);
      const rider = riders[0]!;

      const ctx = makeCtx({
        attackerCombatantId: 'comb-B',
        targetCombatantEffects: [
          { effectName: 'Hex', sourceCombatantId: 'comb-A' }, // hex is A's, not B's
        ],
      });

      const result = evaluatePredicate(rider.predicate!, ctx);
      expect(result).toBe(false);
    },
  );
});

// ── REQ-HEX-04: Predicate does NOT fire when target not hexed ─────────────────

describe('buildHexRider — predicate: does not fire when not hexed (REQ-HEX-04)', () => {
  it(
    'evaluates false when targetCombatantEffects is empty — PHB p.251',
    () => {
      // PHB p.251: the +1d6 is conditional on the hex curse being active.
      const riders = buildHexRider(ATTACKER_ID, TARGET_ID);
      const rider = riders[0]!;

      const ctx = makeCtx({
        attackerCombatantId: 'comb-A',
        targetCombatantEffects: [],
      });

      const result = evaluatePredicate(rider.predicate!, ctx);
      expect(result).toBe(false);
    },
  );
});

// ── REQ-HEX-08: Predicate does NOT fire for null-source Hex ───────────────────

describe('buildHexRider — predicate: null source never fires (REQ-HEX-08)', () => {
  it(
    'evaluates false when sourceCombatantId is null (caster combatant deleted — ON DELETE SET NULL) — PHB p.251',
    () => {
      // hasEffectFromSelf: null !== any UUID → always false.
      // Slice A ON DELETE SET NULL semantics.
      const riders = buildHexRider(ATTACKER_ID, TARGET_ID);
      const rider = riders[0]!;

      const ctx = makeCtx({
        attackerCombatantId: 'comb-A',
        targetCombatantEffects: [
          { effectName: 'Hex', sourceCombatantId: null },
        ],
      });

      const result = evaluatePredicate(rider.predicate!, ctx);
      expect(result).toBe(false);
    },
  );
});
