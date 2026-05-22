/**
 * StatTile cycle algorithm for the Standard Array method.
 *
 * This module is the WEB APP copy. The canonical TDD-verified implementation
 * lives in packages/domain/src/character/stats/stat-tile-cycle.ts.
 * Keep both in sync if the algorithm changes.
 */

export const ABILITY_KEYS = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
export type AbilityKey = (typeof ABILITY_KEYS)[number];

export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8] as const;

/** Scores that may be unassigned (null) during wizard stat-tile interaction. */
export type NullableScores = Record<AbilityKey, number | null>;

/**
 * Returns the subset of STANDARD_ARRAY values not currently held by any
 * ability OTHER than `excludeAbility`.
 */
export function availableValues(
  scores: NullableScores,
  excludeAbility: AbilityKey,
): readonly number[] {
  const takenByOthers = new Set<number>();
  for (const key of ABILITY_KEYS) {
    if (key === excludeAbility) continue;
    const v = scores[key];
    if (v !== null) takenByOthers.add(v);
  }
  return STANDARD_ARRAY.filter((v) => !takenByOthers.has(v));
}

/**
 * Computes the next value for a tile when tapped.
 * - null → first available
 * - value v → next available after v in STANDARD_ARRAY order
 * - no next available → null (wrap/clear)
 */
export function nextValueForTile(
  scores: NullableScores,
  ability: AbilityKey,
): number | null {
  const current = scores[ability];
  const avail = availableValues(scores, ability);

  if (current === null) {
    return avail[0] ?? null;
  }

  const currentIdx = (STANDARD_ARRAY as readonly number[]).indexOf(current);

  if (currentIdx === -1 || currentIdx === STANDARD_ARRAY.length - 1) {
    return null;
  }

  for (let i = currentIdx + 1; i < STANDARD_ARRAY.length; i++) {
    const candidate = STANDARD_ARRAY[i]!;
    if (avail.includes(candidate)) {
      return candidate;
    }
  }

  return null;
}
