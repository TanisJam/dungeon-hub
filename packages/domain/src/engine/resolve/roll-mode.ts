/**
 * resolveRollMode — 5e advantage / disadvantage resolution.
 *
 * // PHB 173: "If circumstances cause a roll to have both advantage and
 * // disadvantage, you are considered to have neither of them, regardless
 * // of how many circumstances grant advantage or impose disadvantage."
 *
 * Rule: ANY advantage + ANY disadvantage → normal (not "net").
 * Breakdown lists ALL contributing sources for traceability regardless of outcome.
 *
 * Design ref: sdd/resolution-engine/design — "resolveRollMode" / advantage cancellation.
 */
import type { ModifierInstance } from '../registry/types.js';
import type { AdvantageMod } from '../types.js';
import type { EvaluationContext } from '../context.js';
import type { Source } from '../provenance.js';

// ── Return type ───────────────────────────────────────────────────────────────

export interface RollModeResult {
  mode: 'advantage' | 'disadvantage' | 'normal';
  breakdown: Source[];
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Resolves the final roll mode from a list of AdvantageMod instances.
 *
 * @param mods - Modifier instances to consider (non-AdvantageMod instances are silently skipped).
 * @param ctx  - The evaluation context (provides selfRef for provenance origin).
 * @returns `RollModeResult` with the final mode and full provenance breakdown.
 */
export function resolveRollMode(
  mods: ModifierInstance[],
  ctx: EvaluationContext,
): RollModeResult {
  const selfRef = ctx.self;

  // ── Filter to AdvantageMod instances only ─────────────────────────────────
  const advMods = mods.filter(
    (inst): inst is ModifierInstance & { def: AdvantageMod } => inst.def.kind === 'advantage',
  );

  if (advMods.length === 0) {
    return { mode: 'normal', breakdown: [] };
  }

  // ── Build provenance sources for ALL instances (required for traceability) ─
  // Use inst.label when present (human-readable), else fall back to id.
  const breakdown: Source[] = advMods.map((inst) => ({
    label: inst.label ?? inst.id,
    // Use a symbolic amount to indicate advantage/disadvantage direction
    amount: inst.def.mode === 'grant' ? 1 : -1,
    type: 'AdvantageMod',
    modifierId: inst.id,
    origin: selfRef,
  }));

  // ── 5e cancellation rule (PHB 173) ─────────────────────────────────────────
  const hasAdvantage = advMods.some((inst) => inst.def.mode === 'grant');
  const hasDisadvantage = advMods.some((inst) => inst.def.mode === 'impose');

  let mode: 'advantage' | 'disadvantage' | 'normal';
  if (hasAdvantage && hasDisadvantage) {
    // ANY adv + ANY disadv = normal, regardless of count on either side.
    mode = 'normal';
  } else if (hasAdvantage) {
    mode = 'advantage';
  } else {
    mode = 'disadvantage';
  }

  return { mode, breakdown };
}
