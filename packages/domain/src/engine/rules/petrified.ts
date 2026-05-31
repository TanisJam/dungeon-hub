/**
 * buildPetrifiedModifiers — Petrified rule encoding.
 *
 * PHB p.291 — Petrified:
 *   "Attack rolls against the creature have advantage."
 *   "The creature automatically fails Strength and Dexterity saving throws."
 *   "The creature has resistance to all damage."
 *   "The creature is immune to poison and disease..."
 *
 * REQ-RI-10..11..14 / ADR-5
 *
 * Design — SPLIT RETURN:
 *   instances[]  → attackers-of AdvantageMod grant → registered in
 *                  buildAttackContext (registry path, resolveRollMode sees it).
 *   resistMods[] → TWO ResistMods → consumed by loadTargetResistMods (helper
 *                  path, NOT in registry — keeps registry attacker-centric).
 *
 *   Return type has a third channel over Stunned's BuildStunnedResult:
 *     ok:true  → { instances: ModifierInstance[], resistMods: ResistMod[] }
 *     ok:false → { issues: [ConditionNotFoundIssue] }
 *
 * WHY split (not just instances):
 *   ResistMods are resolved post-roll by applyDamageWithResist.
 *   AdvantageMod instances are resolved pre-roll via the registry.
 *   Forcing ResistMod into a ModifierInstance would overload the attacker-centric
 *   registry query with a non-roll, non-stat trigger — structural mismatch.
 *
 * // TODO #513: ConditionResolver → runtime catalog per §1.2.
 */
import type { EntityId } from '../types.js';
import type { ResistMod } from '../types.js';
import type { ModifierInstance, ModifierInstanceId } from '../registry/types.js';
import type { ConditionDefinition } from '../conditions/prone.js';
import type { ConditionNotFoundIssue } from './stunned.js';

// ── Re-export ConditionResolver so callers don't need to import from stunned ──
export type { ConditionResolver } from './stunned.js';

// ── Return type ───────────────────────────────────────────────────────────────

export type BuildPetrifiedResult =
  | { ok: true; instances: ModifierInstance[]; resistMods: ResistMod[] }
  | { ok: false; issues: [ConditionNotFoundIssue] };

// ── Helpers ───────────────────────────────────────────────────────────────────

function iid(s: string): ModifierInstanceId {
  return s as ModifierInstanceId;
}

// ── The two fixed ResistMods for Petrified (PHB p.291) ───────────────────────

/**
 * ResistMods produced by the Petrified condition.
 *
 * 1. Resist all damage (halve) — PHB p.291: "resistance to all damage"
 * 2. Immune to poison (zero)   — PHB p.291: "immune to poison and disease"
 *
 * NOTE: disease immunity is DEFERRED (no disease subsystem). Only poison-DAMAGE
 * immunity is modeled here (Poisoned-CONDITION immunity is in isImmuneToCondition).
 */
const PETRIFIED_RESIST_MODS: ResistMod[] = [
  { kind: 'resist', damageType: 'all', mode: 'half' },     // PHB p.291 — resist all damage
  { kind: 'resist', damageType: 'poison', mode: 'immune' }, // PHB p.291 — immune to poison damage
] as const;

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Builds the modifier instances and resistance mods for the Petrified condition.
 *
 * @param targetId           - ID of the entity that is petrified.
 * @param conditionResolver  - Injected resolver — returns PETRIFIED_CONDITION_DEF
 *                             or null if not found.
 * @returns BuildPetrifiedResult — ok:true with instances + resistMods, or
 *          ok:false with issues.
 */
export function buildPetrifiedModifiers(
  targetId: EntityId,
  conditionResolver: (name: string) => ConditionDefinition | null,
): BuildPetrifiedResult {
  const def = conditionResolver('Petrified');

  if (def === null) {
    return {
      ok: false,
      issues: [{ code: 'CONDITION_NOT_FOUND', expected: 'Petrified' }],
    };
  }

  const instances: ModifierInstance[] = [];

  // ── Attackers-of: ALL attackers → advantage (grant), unconditional ─────────
  // PHB p.291: "Attack rolls against the creature have advantage."
  // Unlike Prone (range/weapon-gated), Petrified advantage is UNCONDITIONAL.
  // predicate = alwaysTrue() = { op: 'and', nodes: [] } — mirrors Stunned (ADR-5).
  instances.push({
    id: iid(`petrified-outgoing-grant-${targetId}`),
    label: 'Petrified',
    def: { kind: 'advantage', mode: 'grant', rollType: 'attack' },
    scope: {
      owner: targetId,
      target: { axis: 'attackers-of', ids: [targetId] },
      trigger: 'on-attack-roll',
    },
    predicate: def.outgoingMod.grantPredicate,
  });

  return {
    ok: true,
    instances,
    // resistMods: fixed ResistMods for Petrified — consumed by loadTargetResistMods
    // in the API layer (NOT registered in the modifier registry).
    resistMods: [...PETRIFIED_RESIST_MODS],
  };
}
