import type { AbilityScores } from '../stats/types.js';

type AsiDeltaInput = Partial<AbilityScores>;

/**
 * Validates an ASI delta against the PHB rule (PHB p.165):
 *   - Either +2 to one ability OR +1 to two distinct abilities.
 *   - Total points spent = 2.
 *   - Resulting score must not exceed 20.
 *
 * REQ-CLU-ASI-DELTA-CONSTRAINT
 */
export function validateAsiDelta(
  deltas: AsiDeltaInput,
  currentScores: AbilityScores,
):
  | { ok: true }
  | { ok: false; code: 'ASI_DELTA_INVALID'; reason: string } {
  const entries = Object.entries(deltas).filter(([, v]) => typeof v === 'number' && v !== 0);

  // Sum must be exactly 2
  const total = entries.reduce((sum, [, v]) => sum + (v as number), 0);
  if (total !== 2) {
    return {
      ok: false,
      code: 'ASI_DELTA_INVALID',
      reason: `Delta total must be 2 (got ${total})`,
    };
  }

  // Individual deltas must be +1 or +2 (no negatives, no values > 2)
  for (const [key, value] of entries) {
    const v = value as number;
    if (v !== 1 && v !== 2) {
      return {
        ok: false,
        code: 'ASI_DELTA_INVALID',
        reason: `Each delta must be 1 or 2 (got ${v} for ${key})`,
      };
    }
  }

  // Can only have 1 or 2 entries (no 3+ splits)
  if (entries.length > 2) {
    return {
      ok: false,
      code: 'ASI_DELTA_INVALID',
      reason: `At most 2 ability scores can be improved (got ${entries.length})`,
    };
  }

  // Resulting scores must not exceed 20
  for (const [key, value] of entries) {
    const current = currentScores[key as keyof AbilityScores] ?? 0;
    const result = current + (value as number);
    if (result > 20) {
      return {
        ok: false,
        code: 'ASI_DELTA_INVALID',
        reason: `Resulting score for ${key} (${result}) exceeds cap of 20`,
      };
    }
  }

  return { ok: true };
}
