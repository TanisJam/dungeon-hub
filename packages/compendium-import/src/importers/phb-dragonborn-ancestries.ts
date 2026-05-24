/**
 * PHB 2014 p.34 — Draconic Ancestry table for Dragonborn.
 *
 * Tech debt per CLAUDE.md §1.2: hardcoded reference data accepted until DI #513.
 * PHB 2014 ancestry table is stable (11 years, no errata). Single source of
 * truth — any correction must be made here and matched in spec #567.
 *
 * Decisions: #562 (full mapping), #566 (proposal), #567 (spec), #568 (design).
 */
import { slugify } from '../normalize.js';
import type { NormalizedRace } from '../types.js';

export type BreathWeaponShape = 'line' | 'cone';
export type BreathWeaponSavingThrow = 'dex' | 'con';
export type DamageType = 'acid' | 'cold' | 'fire' | 'lightning' | 'poison';

export interface DragonbornAncestry {
  /** Color name as it appears in PHB p.34. Capitalized. */
  color: 'Black' | 'Blue' | 'Brass' | 'Bronze' | 'Copper' | 'Gold' | 'Green' | 'Red' | 'Silver' | 'White';
  damageType: DamageType;
  shape: BreathWeaponShape;
  /** Display string: '5 ft × 30 ft' for line; '15 ft' for cone. */
  size: string;
  savingThrow: BreathWeaponSavingThrow;
}

/**
 * PHB 2014 p.34 — Draconic Ancestry table.
 * Each row maps one dragon color to its breath weapon characteristics.
 *
 * IMPORTANT: Green's breath shape is CONE and saving throw is CON (not line/Dex).
 * The save is NOT derivable from damage type — it is hardcoded per PHB p.34.
 */
export const PHB_DRAGONBORN_ANCESTRIES: readonly DragonbornAncestry[] = [
  { color: 'Black',  damageType: 'acid',      shape: 'line', size: '5 ft × 30 ft', savingThrow: 'dex' },
  { color: 'Blue',   damageType: 'lightning', shape: 'line', size: '5 ft × 30 ft', savingThrow: 'dex' },
  { color: 'Brass',  damageType: 'fire',      shape: 'line', size: '5 ft × 30 ft', savingThrow: 'dex' },
  { color: 'Bronze', damageType: 'lightning', shape: 'line', size: '5 ft × 30 ft', savingThrow: 'dex' },
  { color: 'Copper', damageType: 'acid',      shape: 'line', size: '5 ft × 30 ft', savingThrow: 'dex' },
  { color: 'Gold',   damageType: 'fire',      shape: 'cone', size: '15 ft',        savingThrow: 'dex' },
  { color: 'Green',  damageType: 'poison',    shape: 'cone', size: '15 ft',        savingThrow: 'con' },
  { color: 'Red',    damageType: 'fire',      shape: 'cone', size: '15 ft',        savingThrow: 'dex' },
  { color: 'Silver', damageType: 'cold',      shape: 'cone', size: '15 ft',        savingThrow: 'con' },
  { color: 'White',  damageType: 'cold',      shape: 'cone', size: '15 ft',        savingThrow: 'con' },
] as const;

/**
 * Emits 10 synthetic NormalizedRace subrace rows for PHB Dragonborn.
 *
 * Returns an empty array when the base race is NOT `dragonborn|PHB` — this
 * is the fail-safe: the expander is a no-op when the parent row is absent.
 *
 * Idempotent by construction — same input → same output. The importer upserts
 * by (slug, source) unique constraint, so re-runs are safe.
 *
 * After deploy, run `pnpm import:compendium` to materialize the 10 rows.
 */
export function expandDragonbornAncestries(baseRace: NormalizedRace): NormalizedRace[] {
  if (baseRace.slug !== 'dragonborn' || baseRace.source !== 'PHB') {
    return [];
  }
  return PHB_DRAGONBORN_ANCESTRIES.map((a): NormalizedRace => {
    const colorSlug = slugify(a.color);
    return {
      slug: `dragonborn--${colorSlug}`,
      source: 'PHB',
      // Subrace name = color only (bare color word).
      // displayName helper in _picker.tsx concatenates: "${subrace.name} ${parent.name}"
      // → "Black Dragonborn". Storing "Black Dragonborn" would produce "Black Dragonborn Dragonborn".
      // Design decision D-3 per design #568.
      name: a.color,
      reprintedAs: null,
      data: {
        breathWeapon: {
          damageType: a.damageType,
          shape: a.shape,
          size: a.size,
          savingThrow: a.savingThrow,
        },
        // Replaces the resist.choose block in the parent row with the resolved resistance.
        resist: [a.damageType],
      },
      isSubrace: true,
      parentSlug: 'dragonborn',
      parentSource: 'PHB',
    };
  });
}
