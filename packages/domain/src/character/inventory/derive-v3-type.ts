/**
 * V3 type projection for inventory items.
 *
 * Reqs: DIVT-MAP-01, DIVT-BOOK-01 (spec #1063)
 * Design: DA decision D2 — pure domain projection, NOT a DB column.
 *
 * Maps 5etools type codes + rarity to one of 8 v3 UI taxonomy types.
 * Mapping is evaluated top-to-bottom; first match wins.
 */
import type { ItemCompendiumLite } from './types.js';
import { normalizeRarity } from './normalize-rarity.js';

/**
 * V3 UI taxonomy for inventory items.
 * "book" and "quest" are NOT derivable from 5etools codes in Slice A (D4 deferred).
 * They return only via `v3TypeOverride` (Slice C).
 */
export type V3ItemType =
  | 'weapon'
  | 'armor'
  | 'consumable'
  | 'magic'
  | 'food'
  | 'trinket'
  | 'book'
  | 'quest';

/** 5etools type codes that map directly to V3ItemType. Precedence: checked first. */
const WEAPON_TYPES = new Set(['M', 'R']);
const ARMOR_TYPES = new Set(['LA', 'MA', 'HA', 'S']);
const CONSUMABLE_TYPES = new Set(['P', 'SC']);
const MAGIC_TYPES = new Set(['RD', 'ST', 'WD', 'RG']);

/** Rarity tiers that indicate a magic item (when type code is not already matched). */
const MAGIC_RARITIES = new Set(['uncommon', 'rare', 'very-rare', 'legendary', 'artifact']);

/**
 * Derives the v3 UI type for an inventory item.
 *
 * Precedence (top-to-bottom):
 * 1. `v3TypeOverride` — if explicitly provided and non-null/undefined, wins over all else (D4 / Slice C)
 * 2. Weapon codes: `'M' | 'R'` → `'weapon'` (PHB p.149)
 * 3. Armor codes: `'LA' | 'MA' | 'HA' | 'S'` → `'armor'` (PHB p.144)
 * 4. Food: `'FD'` → `'food'`
 * 5. Consumable: `'P' | 'SC'` → `'consumable'` (potion/scroll — PHB p.153)
 * 6. Magic codes: `'RD' | 'ST' | 'WD' | 'RG'` → `'magic'` (5etools rod/staff/wand/ring)
 * 7. Gear with charges: `'G'` + `charges > 0` → `'consumable'` (PHB p.150 — Holy Water)
 * 8. Rarity fallback: rarity ∈ {uncommon, rare, very-rare, legendary, artifact} → `'magic'` (DMG p.135)
 * 9. Default: `'trinket'` (catches `'G'` without charges, `null`, and unknowns)
 *
 * @param item - The compendium lite data for the item
 * @param v3TypeOverride - Optional override (D4 shape pre-lock; always null/undefined in Slice A)
 */
export function deriveV3Type(
  item: ItemCompendiumLite,
  v3TypeOverride?: V3ItemType | null,
): V3ItemType {
  // Override wins over all derivation (D4 — Slice C passes a stored override value)
  if (v3TypeOverride != null) return v3TypeOverride;

  const t = item.type;

  if (t != null && WEAPON_TYPES.has(t)) return 'weapon';
  if (t != null && ARMOR_TYPES.has(t)) return 'armor';
  if (t === 'FD') return 'food';
  if (t != null && CONSUMABLE_TYPES.has(t)) return 'consumable';
  if (t != null && MAGIC_TYPES.has(t)) return 'magic';

  // Gear with charges → consumable (PHB p.150: Holy Water, Torch have charges)
  if (t === 'G' && typeof item.charges === 'number' && item.charges > 0) return 'consumable';

  // Rarity-driven magic fallback (DMG p.135)
  const rarity = normalizeRarity(item.rarity);
  if (rarity != null && MAGIC_RARITIES.has(rarity)) return 'magic';

  // Default: trinket (catches 'G' without charges, null type, and unknowns)
  return 'trinket';
}
