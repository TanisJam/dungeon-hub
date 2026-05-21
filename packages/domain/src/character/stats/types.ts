export const ABILITY_KEYS = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
export type AbilityKey = (typeof ABILITY_KEYS)[number];

export type AbilityScores = Record<AbilityKey, number>;

export type StatGenerationMethod = 'standard-array' | 'point-buy' | 'roll';

/**
 * Cada issue tiene un código discriminante para que el frontend pueda mostrar
 * mensajes localizados y resaltar el campo problemático.
 */
export type StatValidationIssue =
  | {
      code: 'STAT_METHOD_NOT_ALLOWED';
      method: StatGenerationMethod;
      allowed: StatGenerationMethod[];
    }
  | {
      code: 'STANDARD_ARRAY_MISMATCH';
      /** Set esperado: [15, 14, 13, 12, 10, 8]. */
      expected: number[];
      /** Set recibido, ordenado descendente. */
      got: number[];
    }
  | {
      code: 'POINT_BUY_SCORE_OUT_OF_RANGE';
      key: AbilityKey;
      value: number;
      min: 8;
      max: 15;
    }
  | {
      code: 'POINT_BUY_INVALID_TOTAL';
      /** Costo total que sumaron los 6 scores. */
      cost: number;
      /** Budget oficial: 27. */
      budget: number;
    }
  | {
      code: 'STAT_OUT_OF_RANGE';
      key: AbilityKey;
      value: number;
      min: number;
      max: number;
    };

export type StatValidationResult =
  | { ok: true }
  | { ok: false; issues: StatValidationIssue[] };
