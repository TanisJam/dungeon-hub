/**
 * Shared AC helpers for the character sheet.
 *
 * After Gate B (engine-ac-authoritative), `computeArmorClass` is deleted.
 * This file retains:
 *   - `findFirstEquipped` — inventory query helper used by the engine adapter.
 *   - `BODY_ARMOR_TYPES`, `SHIELD_TYPE` — type-code sets used by the adapter.
 *   - `ArmorClassWarningCode` — warning type used by the adapter + route.
 *   - `formulaFromBreakdown` — engine-breakdown → formula string helper (ADR-3/4).
 *
 * REQ-AC-GATEB-01: computeArmorClass deleted; all AC computation now engine-authoritative.
 */
import type { InventoryItem, ItemCompendiumLite } from '../inventory/types.js';
import type { Breakdown } from '../../engine/provenance.js';

export type ArmorClassWarningCode = 'INSUFFICIENT_STRENGTH_FOR_ARMOR';

/** 5etools type codes for body armor + shield. PHB p.144, p.149 categories. */
export const SHIELD_TYPE = 'S';

export const BODY_ARMOR_TYPES: ReadonlySet<string> = new Set(['LA', 'MA', 'HA']);

export function findFirstEquipped(
  inventory: InventoryItem[],
  itemLites: Record<string, ItemCompendiumLite>,
  acceptedTypes: ReadonlySet<string>,
): ItemCompendiumLite | null {
  for (const it of inventory) {
    if (it.state !== 'equipped') continue;
    const lite = itemLites[`${it.itemSlug}|${it.itemSource}`];
    if (!lite) continue;
    if (acceptedTypes.has(lite.type ?? '')) return lite;
  }
  return null;
}

/**
 * Derives a human-readable formula string from an engine AC breakdown.
 *
 * Filters out the synthetic base-0 source (emitted by resolveStat but
 * carrying no real contribution) and joins remaining source labels with ' + '.
 *
 * ADR-3/4: provenance-first formula — derived from the same labels the engine
 * emits, not from a parallel hand-built string.
 *
 * REQ-AC-FORMULA-01: non-empty for every archetype (adapter always emits ≥1 non-base source).
 *
 * @param breakdown - Ordered list of Source entries from resolveStat().breakdown.
 * @returns Human-readable formula string, e.g. "Leather Armor (base 11) + DEX +3".
 */
export function formulaFromBreakdown(breakdown: Breakdown): string {
  return breakdown
    .filter((s) => !(s.label === 'base' && s.amount === 0))
    .map((s) => s.label)
    .join(' + ');
}
