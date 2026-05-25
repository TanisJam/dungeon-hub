/**
 * Pure parser helpers for spell metadata extraction.
 *
 * Handles the 3 shapes of components.m (discovery obs #678), ritual flag,
 * and concentration flag from 5etools spell JSON.
 *
 * Design: parsers live in compendium-import (not domain) because they encode
 * 5etools shape knowledge, not game rules (design #681 D-04).
 *
 * REQ-SP02-COMPONENTS-M, REQ-SP02-RITUAL, REQ-SP02-CONCENTRATION (spec #680).
 */

/**
 * Parse `components.m` from 5etools spell data.
 *
 * 3 shapes (discovery obs #678):
 *   1. absent / undefined  → { componentsM: false, componentsMCost: null }
 *   2. string              → { componentsM: true,  componentsMCost: null }
 *   3. object { text, cost?, consume? } → { componentsM: true, componentsMCost: cost ?? null }
 *
 * Cost is stored in copper pieces (as provided by 5etools).
 */
export function parseComponentsM(input: unknown): {
  componentsM: boolean;
  componentsMCost: number | null;
} {
  if (input === undefined || input === null) {
    return { componentsM: false, componentsMCost: null };
  }
  if (typeof input === 'string') {
    return { componentsM: true, componentsMCost: null };
  }
  if (typeof input === 'object' && !Array.isArray(input)) {
    const obj = input as Record<string, unknown>;
    const cost = typeof obj['cost'] === 'number' ? obj['cost'] : null;
    return { componentsM: true, componentsMCost: cost };
  }
  // Unexpected shape — treat as present, no cost.
  return { componentsM: true, componentsMCost: null };
}

/**
 * Parse `meta.ritual` from 5etools spell data.
 *
 * PHB p.201–202: "Certain spells have a special tag: ritual."
 * 5etools encodes this as `meta: { ritual: true }` (meta is absent when false).
 */
export function parseRitual(meta: unknown): boolean {
  if (meta === undefined || meta === null) return false;
  if (typeof meta !== 'object' || Array.isArray(meta)) return false;
  return (meta as Record<string, unknown>)['ritual'] === true;
}

/**
 * Parse concentration from 5etools spell duration array.
 *
 * PHB p.203: "Some spells require you to maintain concentration..."
 * 5etools encodes this as `duration: [{ concentration: true, ... }]`.
 *
 * NOTE: `meta.concentration` does NOT exist in 5etools (confirmed obs #678).
 * The ONLY authoritative path is `duration[].concentration`.
 */
export function parseConcentration(duration: unknown): boolean {
  if (!Array.isArray(duration)) return false;
  return (duration as Array<Record<string, unknown>>).some(
    (entry) => entry['concentration'] === true,
  );
}
