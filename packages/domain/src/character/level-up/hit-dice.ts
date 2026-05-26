import type { AppliedClass } from '../class/types.js';

/** Face of a hit die — PHB p.186. */
export type HitDieFace = 'd6' | 'd8' | 'd10' | 'd12';

const HIT_DIE_FACES: readonly HitDieFace[] = ['d6', 'd8', 'd10', 'd12'];

export type ChooseHitDiceRecoveryIssue =
  | {
      code: 'HIT_DICE_CHOICE_OVER_SPENT';
      face: HitDieFace;
      requested: number;
      available: number;
    }
  | {
      code: 'HIT_DICE_CHOICE_OVER_ALLOWANCE';
      requested: number;
      allowance: number;
    };

export type ChooseHitDiceRecoveryResult =
  | { ok: true; distribution: Partial<Record<HitDieFace, number>> }
  | { ok: false; issues: ChooseHitDiceRecoveryIssue[] };

/**
 * Validates a player's `hitDiceRecoveryChoice` against what they actually spent
 * and the long-rest allowance (`floor(level/2)` minimum 1 per PHB p.186).
 *
 * Returns the canonical distribution when valid; otherwise an `issues[]`
 * array the API layer maps to 400 VALIDATION_FAILED.
 *
 * - Empty choice → `{ ok: true, distribution: {} }`. Caller may fall back to a
 *   greedy heuristic (current REST-04 behavior preserves the existing route).
 * - Per-face: requested ≤ spent of that face, else `HIT_DICE_CHOICE_OVER_SPENT`.
 * - Total: sum of requested ≤ allowance, else `HIT_DICE_CHOICE_OVER_ALLOWANCE`.
 *
 * Origin: SDD `rest-closeout` (engram #825). Closes REST-04 of audit #738.
 */
export function chooseHitDiceRecovery(
  spent: Partial<Record<HitDieFace, number>>,
  allowance: number,
  choice: Partial<Record<HitDieFace, number>>,
): ChooseHitDiceRecoveryResult {
  const issues: ChooseHitDiceRecoveryIssue[] = [];
  let totalRequested = 0;

  for (const face of HIT_DIE_FACES) {
    const requested = choice[face] ?? 0;
    if (requested === 0) continue;
    totalRequested += requested;

    const available = spent[face] ?? 0;
    if (requested > available) {
      issues.push({
        code: 'HIT_DICE_CHOICE_OVER_SPENT',
        face,
        requested,
        available,
      });
    }
  }

  if (totalRequested > allowance) {
    issues.push({
      code: 'HIT_DICE_CHOICE_OVER_ALLOWANCE',
      requested: totalRequested,
      allowance,
    });
  }

  if (issues.length > 0) return { ok: false, issues };

  // Build canonical distribution (drop zero-counts, lock face order).
  const distribution: Partial<Record<HitDieFace, number>> = {};
  for (const face of HIT_DIE_FACES) {
    const n = choice[face] ?? 0;
    if (n > 0) distribution[face] = n;
  }
  return { ok: true, distribution };
}


/**
 * Totales de hit dice por hit die ({ d6: 3, d10: 2 }) sumando todas las clases.
 * Equivale a `sheet.hitDice`. Útil para resets de long rest.
 */
export function hitDiceTotalsByDie(classes: AppliedClass[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of classes) {
    out[c.hitDie] = (out[c.hitDie] ?? 0) + c.level;
  }
  return out;
}

/** Total de hit dice (suma de todas las clases por nivel). */
export function hitDiceTotalCount(classes: AppliedClass[]): number {
  return classes.reduce((acc, c) => acc + c.level, 0);
}

/**
 * Cantidad de hit dice recuperados al terminar un long rest = `floor(level/2)`,
 * mínimo 1 (PHB p.186). Esta cantidad la distribuye el player entre sus dies
 * disponibles.
 */
export function hitDiceRecoveredOnLongRest(totalLevel: number): number {
  if (totalLevel < 1) return 0;
  return Math.max(1, Math.floor(totalLevel / 2));
}
