/**
 * resolveStartingGrant — pure resolver, no RNG, no IO.
 *
 * REQ-SEQUIP-03 (PHB p.143):
 * - path === 'package' → grant class fixed items + selected option items +
 *   background fixed items + background choice items; background currency included.
 * - path === 'gold' → grant ZERO class package items; deposit goldValue × 100 cp;
 *   background fixed items still granted; background currency still included.
 *
 * REQ-SEQUIP-06: goldValue must be non-negative (returns ok:false otherwise).
 *
 * ADR-3: Resolver is FULLY PURE. The gold value (rolled OR entered) is passed IN
 * via selections.goldValue. No randomness here.
 *
 * Category key format (for classCategoryPicks / backgroundCategoryPicks):
 *   "row{rowIndex}-{slot}-cat{catIndexWithinOption}"
 *   e.g. "row1-a-cat0" = row index 1, slot 'a', first category ref in that option.
 *   This key is stable across parse→render→persist→resolve.
 */

import type { CoinCurrency } from '../inventory/coin-weight.js';
import type { ParsedBackgroundEquipment, ParsedCategoryRef, ParsedClassEquipment, ParsedRef } from './parse.js';
import type { EquipmentSelections, GrantSpec } from './shape.js';

// ─── Result Types ─────────────────────────────────────────────────────────────

export interface ResolveValidationIssue {
  code: 'GOLD_VALUE_NEGATIVE';
  got: number;
}

export type ResolveResult =
  | { ok: true; items: GrantSpec[]; currency: CoinCurrency }
  | { ok: false; issues: ResolveValidationIssue[] };

// ─── Internal Helpers ─────────────────────────────────────────────────────────

/**
 * Build the category key used in classCategoryPicks / backgroundCategoryPicks.
 * Format: "row{rowIndex}-{slot}-cat{catIndex}"
 */
function categoryKey(rowIndex: number, slot: string, catIndex: number): string {
  return `row${rowIndex}-${slot}-cat${catIndex}`;
}

/**
 * Extract GrantSpec items from a parsed refs array, resolving any category refs
 * via the picks map.
 *
 * @param refs       The parsed refs for a single option slot
 * @param picksMap   Record<key, { slug; source }> — category selections
 * @param rowIndex   Row index (for key generation)
 * @param slot       Slot key ('a', 'b', 'c') (for key generation)
 */
function refsToGrants(
  refs: readonly ParsedRef[],
  picksMap: Record<string, { slug: string; source: string }>,
  rowIndex: number,
  slot: string,
): GrantSpec[] {
  const grants: GrantSpec[] = [];
  let catIdx = 0;

  for (const ref of refs) {
    // Special item — never granted (ADR-7)
    if ('special' in ref) {
      continue;
    }

    // Category ref — resolve from picks map
    if ('equipmentType' in ref) {
      const key = categoryKey(rowIndex, slot, catIdx++);
      const pick = picksMap[key];
      if (pick) {
        grants.push({ slug: pick.slug, source: pick.source, quantity: (ref as ParsedCategoryRef).quantity });
      }
      // If no pick stored, skip gracefully (player may not have picked yet)
      continue;
    }

    // Regular item grant
    if ('slug' in ref) {
      grants.push({ slug: ref.slug, source: ref.source, quantity: ref.quantity });
    }
  }

  return grants;
}

/**
 * Resolve fixed items from a refs array (no choice involved — always granted on package path).
 * Category refs in fixedItems are also resolved via picksMap (keyed as "fixed-cat{idx}").
 */
function fixedRefsToGrants(
  refs: readonly ParsedRef[],
  picksMap: Record<string, { slug: string; source: string }>,
  prefix: string,
): GrantSpec[] {
  const grants: GrantSpec[] = [];
  let catIdx = 0;

  for (const ref of refs) {
    if ('special' in ref) continue;
    if ('equipmentType' in ref) {
      const key = `${prefix}-cat${catIdx++}`;
      const pick = picksMap[key];
      if (pick) {
        grants.push({ slug: pick.slug, source: pick.source, quantity: (ref as ParsedCategoryRef).quantity });
      }
      continue;
    }
    if ('slug' in ref) {
      grants.push({ slug: ref.slug, source: ref.source, quantity: ref.quantity });
    }
  }

  return grants;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Resolve the final item grant and currency from player selections.
 *
 * REQ-SEQUIP-03 (PHB p.143 — Starting Equipment / Starting Wealth by Class)
 * REQ-SEQUIP-06 — negative goldValue rejected
 */
export function resolveStartingGrant(
  parsedClass: ParsedClassEquipment,
  parsedBackground: ParsedBackgroundEquipment,
  selections: EquipmentSelections,
): ResolveResult {
  // REQ-SEQUIP-06: non-negative gold guard
  if (selections.classPath === 'gold') {
    const goldValue = selections.goldValue ?? 0;
    if (goldValue < 0) {
      return {
        ok: false,
        issues: [{ code: 'GOLD_VALUE_NEGATIVE', got: goldValue }],
      };
    }
  }

  const items: GrantSpec[] = [];
  let cp = 0;

  if (selections.classPath === 'package') {
    // Class fixed items (always granted on package path)
    items.push(
      ...fixedRefsToGrants(parsedClass.fixedItems, selections.classCategoryPicks, 'fixed'),
    );

    // Class choice rows — grant only the selected slot
    for (let rowIdx = 0; rowIdx < parsedClass.choiceRows.length; rowIdx++) {
      const row = parsedClass.choiceRows[rowIdx];
      if (!row) continue;
      const chosenSlot = selections.classRowChoices[rowIdx];
      if (!chosenSlot) continue; // no selection → skip row

      const option = row.options.find(o => o.slot === chosenSlot);
      if (!option) continue;

      items.push(
        ...refsToGrants(option.refs, selections.classCategoryPicks, rowIdx, chosenSlot),
      );
    }
  } else {
    // Gold path — deposit goldValue × 100 cp (1 gp = 100 cp, PHB p.143)
    const goldValue = selections.goldValue ?? 0;
    cp += goldValue * 100;
    // No class package items on gold path
  }

  // Background fixed items always granted (both paths)
  items.push(
    ...fixedRefsToGrants(parsedBackground.fixedItems, selections.backgroundCategoryPicks, 'bg-fixed'),
  );

  // Background choice rows (both paths)
  for (let rowIdx = 0; rowIdx < parsedBackground.choiceRows.length; rowIdx++) {
    const row = parsedBackground.choiceRows[rowIdx];
    if (!row) continue;
    const chosenSlot = selections.backgroundRowChoices[rowIdx];
    if (!chosenSlot) continue;

    const option = row.options.find(o => o.slot === chosenSlot);
    if (!option) continue;

    items.push(
      ...refsToGrants(option.refs, selections.backgroundCategoryPicks, rowIdx, chosenSlot),
    );
  }

  // Background currency (cp from containsValue — both paths)
  cp += parsedBackground.currency;

  const currency: CoinCurrency = cp > 0 ? { cp } : {};

  return { ok: true, items, currency };
}
