import { ABILITY_KEYS } from './types.js';
import type { AbilityKey } from './types.js';

export type { AbilityKey };

export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8] as const;
export type StandardArrayValue = (typeof STANDARD_ARRAY)[number];

/** Scores that may be unassigned (null) during wizard stat-tile interaction. */
export type NullableScores = Record<AbilityKey, number | null>;

/**
 * Returns the subset of STANDARD_ARRAY values not currently held by any
 * ability OTHER than `excludeAbility`. The tile's own value does NOT count
 * as "taken" — it's still available so the tile can stay at its current value
 * or wrap past it.
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
 *
 * Algorithm:
 * - If tile is null: return first value in `availableValues`.
 * - If tile has value `v`: find `v`'s index in STANDARD_ARRAY, then scan
 *   forward through the remaining indices (after v's position) for the next
 *   value that is in `availableValues`. If none found → wrap to null (clear).
 * - Tapping 8 (last in STANDARD_ARRAY) always wraps to null.
 */
export function nextValueForTile(
  scores: NullableScores,
  ability: AbilityKey,
): number | null {
  const current = scores[ability];
  const avail = availableValues(scores, ability);

  if (current === null) {
    // Pick first available value (or null if somehow nothing available)
    return avail[0] ?? null;
  }

  // Find current position in STANDARD_ARRAY
  const currentIdx = STANDARD_ARRAY.indexOf(current as StandardArrayValue);

  if (currentIdx === -1 || currentIdx === STANDARD_ARRAY.length - 1) {
    // Value not in array (shouldn't happen) or at last position → wrap to null
    return null;
  }

  // Look for next available value strictly after current index
  for (let i = currentIdx + 1; i < STANDARD_ARRAY.length; i++) {
    const candidate = STANDARD_ARRAY[i]!;
    if (avail.includes(candidate)) {
      return candidate;
    }
  }

  // No available value found after current position → wrap to null
  return null;
}
