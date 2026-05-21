import type { StatGeneration } from '../../rules-profile/types.js';
import { POINT_BUY_BUDGET, POINT_BUY_COST, STANDARD_ARRAY } from './point-buy-cost.js';
import {
  ABILITY_KEYS,
  type AbilityScores,
  type StatGenerationMethod,
  type StatValidationIssue,
  type StatValidationResult,
} from './types.js';

/** Devuelve la lista de métodos habilitados según el Rules Profile. */
export function allowedMethods(allowed: StatGeneration): StatGenerationMethod[] {
  const out: StatGenerationMethod[] = [];
  if (allowed.standardArray) out.push('standard-array');
  if (allowed.pointBuy) out.push('point-buy');
  if (allowed.roll) out.push('roll');
  return out;
}

/**
 * Valida los baseStats (pre-racial) contra el método elegido y las reglas
 * permitidas por la campaña.
 *
 * - standard-array: el set debe ser exactamente {15, 14, 13, 12, 10, 8}.
 * - point-buy:      scores en [8, 15], costo total = 27 (PHB p.13).
 * - roll:           scores en [3, 18] (rango natural de 4d6-keep-3).
 */
export function validateStats(
  scores: AbilityScores,
  method: StatGenerationMethod,
  allowed: StatGeneration,
): StatValidationResult {
  const issues: StatValidationIssue[] = [];

  const methods = allowedMethods(allowed);
  if (!methods.includes(method)) {
    issues.push({ code: 'STAT_METHOD_NOT_ALLOWED', method, allowed: methods });
    return { ok: false, issues };
  }

  switch (method) {
    case 'standard-array': {
      const sorted = ABILITY_KEYS.map((k) => scores[k]).sort((a, b) => b - a);
      const matches =
        sorted.length === STANDARD_ARRAY.length &&
        sorted.every((v, i) => v === STANDARD_ARRAY[i]);
      if (!matches) {
        issues.push({
          code: 'STANDARD_ARRAY_MISMATCH',
          expected: [...STANDARD_ARRAY],
          got: sorted,
        });
      }
      break;
    }

    case 'point-buy': {
      let totalCost = 0;
      let anyOutOfRange = false;
      for (const key of ABILITY_KEYS) {
        const v = scores[key];
        if (v < 8 || v > 15) {
          issues.push({ code: 'POINT_BUY_SCORE_OUT_OF_RANGE', key, value: v, min: 8, max: 15 });
          anyOutOfRange = true;
        } else {
          totalCost += POINT_BUY_COST[v]!;
        }
      }
      if (!anyOutOfRange && totalCost !== POINT_BUY_BUDGET) {
        issues.push({
          code: 'POINT_BUY_INVALID_TOTAL',
          cost: totalCost,
          budget: POINT_BUY_BUDGET,
        });
      }
      break;
    }

    case 'roll': {
      for (const key of ABILITY_KEYS) {
        const v = scores[key];
        if (v < 3 || v > 18) {
          issues.push({ code: 'STAT_OUT_OF_RANGE', key, value: v, min: 3, max: 18 });
        }
      }
      break;
    }
  }

  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}
