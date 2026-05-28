/**
 * buildCounterspellReaction — Counterspell rule encoding.
 *
 * // PHB 228: "You attempt to interrupt a creature in the process of casting a
 * // spell. If the creature is casting a spell of 3rd level or lower, its spell
 * // fails and has no effect. If it is casting a spell of 4th level or higher,
 * // make an ability check using your spellcasting ability. The DC equals 10 +
 * // the spell's level."
 * // Reaction trigger: "when you see a creature within 60 feet of you casting."
 *
 * REQ-COUNTERSPELL-01: reaction EventTrigger + UsageMod + ForcedCheck.
 *
 * Design:
 *   - buildCounterspellReaction returns { ok: true, fire(action, ctx) } or
 *     { ok: false, issues } if no slot resolver injected.
 *   - fire() evaluates: canSee + attackerWithin(60) → if fails, outcome='predicate-failed'.
 *   - Consumes a slot from SpellSlotResolver.
 *   - If slotTier >= spellLevel → drive action to CANCELLED (auto-cancel).
 *   - If slotTier < spellLevel → drive action to INTERRUPTED, return forced-check
 *     with dc = 10 + spellLevel.
 *   - SLOT_TIER_INSUFFICIENT issue shape: {expected: slotTier, got: spellLevel} (§6).
 *
 * // TODO #513: SpellSlotResolver → runtime pool per §1.2.
 */
import { evaluatePredicate } from '../predicate/evaluate.js';
import { and, attackerWithin, canSee } from '../predicate/ast.js';
import { advancePhase } from '../pipeline/state-machine.js';
import type { EntityId } from '../types.js';
import type { EvaluationContext } from '../context.js';
import type { ActionInFlight } from '../pipeline/phases.js';

// ── SpellSlotResolver ─────────────────────────────────────────────────────────

export interface SlotPool {
  tier: number;
  available: boolean;
}

/**
 * Injected resolver — returns the best available spell slot for the
 * counterspeller, or null if no slots remain.
 *
 * // TODO #513: SpellSlotResolver → runtime catalog per §1.2.
 */
export type SpellSlotResolver = (casterId: EntityId) => SlotPool | null;

// ── Issue codes ───────────────────────────────────────────────────────────────

export interface SlotTierInsufficientIssue {
  /** §6 naming: expected = slotTier (what we have), got = spellLevel (what we need). */
  code: 'SLOT_TIER_INSUFFICIENT';
  expected: number;
  got: number;
}

export interface ResolverNotInjectedIssue {
  code: 'RESOLVER_NOT_INJECTED';
  expected: string;
}

// ── Fire result ───────────────────────────────────────────────────────────────

export type CounterspellFireResult =
  | { ok: true; outcome: 'cancelled'; action: ActionInFlight }
  | { ok: true; outcome: 'forced-check'; dc: number; action: ActionInFlight }
  | { ok: true; outcome: 'predicate-failed'; action: ActionInFlight }
  | { ok: false; issues: [SlotTierInsufficientIssue] };

// ── Build result ──────────────────────────────────────────────────────────────

export type BuildCounterspellResult =
  | {
      ok: true;
      fire: (action: ActionInFlight, ctx: EvaluationContext) => CounterspellFireResult;
    }
  | { ok: false; issues: [ResolverNotInjectedIssue] };

// ── Range predicate ───────────────────────────────────────────────────────────

/** PHB 228: reaction fires when target is within 60ft AND counterspeller can see caster. */
const COUNTERSPELL_RANGE_PREDICATE = and(canSee('caster'), attackerWithin(60));

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Builds the Counterspell reaction handler.
 *
 * @param counterspellerId - Entity ID of the creature readying Counterspell.
 * @param slotResolver     - Injected resolver returning the best available
 *                          spell slot for this creature.
 * @returns BuildCounterspellResult — ok:true with a fire() method, or
 *          ok:false with RESOLVER_NOT_INJECTED.
 */
export function buildCounterspellReaction(
  counterspellerId: EntityId,
  slotResolver: SpellSlotResolver | null | undefined,
): BuildCounterspellResult {
  if (slotResolver === null || slotResolver === undefined) {
    return {
      ok: false,
      issues: [{ code: 'RESOLVER_NOT_INJECTED', expected: 'SpellSlotResolver' }],
    };
  }

  return {
    ok: true,

    /**
     * Fires the Counterspell reaction.
     *
     * Called when the caster's action reaches CAST_ANNOUNCED.
     * Evaluates the range/visibility predicate, consumes a slot, and either
     * auto-cancels the spell or returns a ForcedCheck for the caller to resolve.
     */
    fire(action: ActionInFlight, ctx: EvaluationContext): CounterspellFireResult {
      // ── Predicate check (range + visibility) ─────────────────────────────────
      let predicatePasses: boolean;
      try {
        predicatePasses = evaluatePredicate(COUNTERSPELL_RANGE_PREDICATE, ctx);
      } catch {
        // Missing ctx field (e.g. no weaponInUse.rangeFt) → treat as out-of-range.
        predicatePasses = false;
      }

      if (!predicatePasses) {
        return { ok: true, outcome: 'predicate-failed', action };
      }

      // ── Consume slot ──────────────────────────────────────────────────────────
      const slot = slotResolver(counterspellerId);
      const spellLevel = action.spellLevel ?? 0;

      if (slot === null || !slot.available) {
        // No slot available — treated as SLOT_TIER_INSUFFICIENT
        return {
          ok: false,
          issues: [{ code: 'SLOT_TIER_INSUFFICIENT', expected: 0, got: spellLevel }],
        };
      }

      const slotTier = slot.tier;

      // ── Auto-cancel: slot tier >= spell level ─────────────────────────────────
      if (slotTier >= spellLevel) {
        // Drive to INTERRUPTED first, then to CANCELLED
        const interrupted = advancePhase(action, 'reaction');
        if (!interrupted.ok) {
          // Shouldn't happen at CAST_ANNOUNCED — guard defensively
          return { ok: true, outcome: 'predicate-failed', action };
        }
        const cancelled = advancePhase(interrupted.action, 'counter-success');
        if (!cancelled.ok) {
          return { ok: true, outcome: 'predicate-failed', action };
        }
        return { ok: true, outcome: 'cancelled', action: cancelled.action };
      }

      // ── Forced check: slot tier < spell level ─────────────────────────────────
      // Drive to INTERRUPTED; caller resolves check and calls advancePhase
      // with 'counter-success' or 'counter-fail'.
      const interrupted = advancePhase(action, 'reaction');
      if (!interrupted.ok) {
        return { ok: true, outcome: 'predicate-failed', action };
      }

      const dc = 10 + spellLevel;

      return {
        ok: true,
        outcome: 'forced-check',
        dc,
        action: interrupted.action,
      };
    },
  };
}
