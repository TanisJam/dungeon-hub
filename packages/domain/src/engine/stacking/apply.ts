/**
 * applyStacking — type-level stacking with provenance assembly.
 *
 * Implements the stacking strategy for numeric modifiers:
 *   1. Accept only instances whose def.kind === 'num'.
 *   2. Group by category (untyped / item / status / circumstance).
 *   3. Within each category apply STACKING_STRATEGIES[category]:
 *      - 'all-stack':    every instance contributes.
 *      - 'keep-highest': only the largest scalar value contributes.
 *      DiceExpr values ('1d4') are treated as 0 for keep-highest comparison
 *      (they don't reduce a real value; they're included as-is when they win).
 *   4. Between categories, all selected values are summed on top of base.
 *   5. Build a Source entry per selected modifier + one 'base' entry.
 *
 * NOTE: strategy lives on the CATEGORY, never the instance (§3.1).
 * Do NOT add a per-instance `stackable` flag — that is explicitly the footgun.
 *
 * Design ref: sdd/resolution-engine/design — §3.1 "type-level stacking".
 * REQ-RESOLVE-01: provenance round-trip, pull-first.
 */
import { STACKING_STRATEGIES } from './categories.js';
import type { ModifierInstance } from '../registry/types.js';
import type { NumMod, StackCategory, DiceExpr } from '../types.js';
import type { EntityRef } from '../context.js';
import type { Resolved, Source } from '../provenance.js';

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Numeric value of a DiceExpr | number for keep-highest comparison.
 * Dice expressions compare as 0 (unknown at this layer — engine doesn't roll).
 */
function numericValue(v: DiceExpr | number): number {
  return typeof v === 'number' ? v : 0;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Applies type-level stacking to a list of NumMod instances and returns the
 * resolved numeric value plus a full provenance breakdown.
 *
 * @param mods    - All modifier instances to consider (non-NumMod instances are silently skipped).
 * @param base    - The base (unmodified) value of the stat.
 * @param selfRef - The resolving entity (for provenance origin).
 * @returns `Resolved<number>` with final value and ordered breakdown.
 */
export function applyStacking(
  mods: ModifierInstance[],
  base: number,
  selfRef: EntityRef,
): Resolved<number> {
  // ── Step 1: filter to NumMod only ─────────────────────────────────────────
  const numMods = mods.filter((m): m is ModifierInstance & { def: NumMod } => m.def.kind === 'num');

  // ── Step 2: group by category ──────────────────────────────────────────────
  const byCategory = new Map<StackCategory, Array<ModifierInstance & { def: NumMod }>>();
  for (const mod of numMods) {
    const cat = mod.def.category;
    const existing = byCategory.get(cat);
    if (existing) {
      existing.push(mod);
    } else {
      byCategory.set(cat, [mod]);
    }
  }

  // ── Step 3: apply per-category strategy and collect selected instances ─────
  const selectedSources: Source[] = [];
  let totalBonus = 0;

  for (const [category, group] of byCategory) {
    const strategy = STACKING_STRATEGIES[category];

    if (strategy === 'all-stack') {
      // Every instance contributes.
      for (const mod of group) {
        const amount = mod.def.value;
        if (typeof amount === 'number') {
          totalBonus += amount;
        }
        // DiceExpr: include in breakdown but don't add to numeric total.
        selectedSources.push({
          label: mod.id,
          amount,
          type: category,
          modifierId: mod.id,
          origin: selfRef,
        });
      }
    } else {
      // 'keep-highest': pick the instance with the highest numeric value.
      let best: (ModifierInstance & { def: NumMod }) | undefined;
      for (const mod of group) {
        if (best === undefined || numericValue(mod.def.value) > numericValue(best.def.value)) {
          best = mod;
        }
      }
      if (best !== undefined) {
        const amount = best.def.value;
        if (typeof amount === 'number') {
          totalBonus += amount;
        }
        selectedSources.push({
          label: best.id,
          amount,
          type: category,
          modifierId: best.id,
          origin: selfRef,
        });
      }
    }
  }

  // ── Step 4: assemble breakdown (base first, then mods) ────────────────────
  const baseSource: Source = {
    label: 'base',
    amount: base,
    type: 'untyped',
    origin: selfRef,
  };

  const breakdown: Source[] = [baseSource, ...selectedSources];

  return {
    value: base + totalBonus,
    breakdown,
  };
}
