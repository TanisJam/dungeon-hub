/**
 * buildPoisonedModifiers — Poisoned rule encoding.
 *
 * PHB p.292 — Appendix A: Conditions, Poisoned:
 *   "A poisoned creature has disadvantage on attack rolls and ability checks."
 *
 * REQ-COND-POISON-01: self impose (disadvantage) on attack rolls.
 * REQ-COND-POISON-02: self impose (disadvantage) on ability checks.
 *
 * Design:
 *   Emits 2 ModifierInstance entries (no outgoing — Poisoned is purely self-affecting):
 *     (1) Self-scoped AdvantageMod (impose) trigger:'on-attack-roll', rollType:'attack':
 *         own attack rolls have disadvantage (PHB p.292).
 *     (2) Self-scoped AdvantageMod (impose) trigger:'always', rollType:'check':
 *         own ability checks have disadvantage (PHB p.292).
 *         Uses trigger:'always' + rollType:'check' — the engine's pattern for
 *         check modifiers (matching Frightened, which also uses trigger:'always').
 *
 *   Returns { ok: false, issues: [{code:'CONDITION_NOT_FOUND', expected:'Poisoned'}] }
 *   if the conditionResolver returns null.
 *
 * // TODO #513: ConditionResolver → runtime catalog per §1.2.
 */
import type { EntityId } from '../types.js';
import type { ModifierInstance, ModifierInstanceId } from '../registry/types.js';
import type { ConditionDefinition } from '../conditions/prone.js';

// ── ConditionResolver type ────────────────────────────────────────────────────

/**
 * Injected resolver — returns the ConditionDefinition for 'Poisoned', or null
 * if the condition is not found in the catalog.
 */
export type ConditionResolver = (name: string) => ConditionDefinition | null;

// ── Issue codes ───────────────────────────────────────────────────────────────

export interface ConditionNotFoundIssue {
  code: 'CONDITION_NOT_FOUND';
  expected: string;
}

// ── Return type ───────────────────────────────────────────────────────────────

export type BuildPoisonedResult =
  | { ok: true; instances: ModifierInstance[] }
  | { ok: false; issues: [ConditionNotFoundIssue] };

// ── Helpers ───────────────────────────────────────────────────────────────────

function iid(s: string): ModifierInstanceId {
  return s as ModifierInstanceId;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Builds the modifier instances for the Poisoned condition.
 *
 * @param targetId          - ID of the entity that is poisoned.
 * @param conditionResolver - Injected resolver — returns POISONED_CONDITION_DEF
 *                           or null if not found.
 * @returns BuildPoisonedResult — ok:true with instances, or ok:false with issues.
 */
export function buildPoisonedModifiers(
  targetId: EntityId,
  conditionResolver: ConditionResolver,
): BuildPoisonedResult {
  const def = conditionResolver('Poisoned');

  if (def === null) {
    return {
      ok: false,
      issues: [{ code: 'CONDITION_NOT_FOUND', expected: 'Poisoned' }],
    };
  }

  const instances: ModifierInstance[] = [];

  // ── (1) Self-scoped: own attack rolls → disadvantage ────────────────────────
  // PHB p.292: "A poisoned creature has disadvantage on attack rolls"
  instances.push({
    id: iid(`poisoned-self-attack-${targetId}`),
    label: 'Poisoned',
    def: def.selfMod, // kind:'advantage', mode:'impose', rollType:'attack'
    scope: {
      owner: targetId,
      target: { axis: 'self' },
      trigger: 'on-attack-roll',
    },
  });

  // ── (2) Self-scoped: own ability checks → disadvantage ──────────────────────
  // PHB p.292: "A poisoned creature has disadvantage on ... ability checks"
  // Uses trigger:'always' + rollType:'check' (engine pattern for check modifiers,
  // matching Frightened which also uses trigger:'always' for check disadvantage).
  instances.push({
    id: iid(`poisoned-self-check-${targetId}`),
    label: 'Poisoned',
    def: { kind: 'advantage', mode: 'impose', rollType: 'check' },
    scope: {
      owner: targetId,
      target: { axis: 'self' },
      trigger: 'always',
    },
  });

  return { ok: true, instances };
}
