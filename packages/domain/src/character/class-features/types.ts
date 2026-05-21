/**
 * Class Features — Tasha's Optional Class Features + features clásicos.
 *
 * Cubre: Fighting Styles, Eldritch Invocations, Battle Master Maneuvers,
 * Arcane Shots, Hunter's Prey, Pact Boons, Cleric/Druid domain options, etc.
 *
 * El catálogo vive en `compendium_optional_features`. La elegibilidad por
 * clase + nivel viene de `class.optionalfeatureProgression` y
 * `subclass.optionalfeatureProgression` (en el JSON del compendio).
 */

export interface FeatureProgressionBlock {
  /** Nombre humano del grupo (ej. "Fighting Style", "Maneuvers"). */
  name: string;
  /** Tags de feature que pueden llenar este grupo (FS:F, MV:B, EI, etc.). */
  featureType: string[];
  /**
   * Cuántos picks de este grupo se tienen TOTALES a cada nivel de clase.
   * Cumulativo: `{ "3": 3, "7": 5 }` significa 3 a L3, 5 a L7+.
   */
  progression: Record<string, number>;
}

/**
 * Subset de class compendium data necesario para resolver feature progressions.
 * El compendio almacena más cosas; acá solo lo relevante.
 */
export interface ClassFeatureSource {
  optionalfeatureProgression?: FeatureProgressionBlock[];
}

/**
 * Información de optional feature del compendio (subset relevante para el validador).
 */
export interface OptionalFeatureLite {
  slug: string;
  source: string;
  featureType: string[];
  prerequisites?: unknown | null;
}

export interface FeatureRef {
  slug: string;
  source: string;
}

/** Slot resuelto: cuántos picks de qué featureTypes a este nivel. */
export interface ResolvedSlot {
  name: string;
  featureType: string[];
  count: number;
}

/** Picks del usuario indexados por featureType (lo más natural para el frontend). */
export type FeaturePicks = Record<string, FeatureRef[]>;

export type FeaturesValidationIssue =
  | { code: 'FEATURE_NOT_FOUND'; feature: FeatureRef }
  | { code: 'FEATURE_DISABLED_BY_RULES_PROFILE'; feature: FeatureRef }
  | {
      code: 'FEATURE_WRONG_TYPE';
      feature: FeatureRef;
      claimedFeatureType: string;
      actualFeatureTypes: string[];
    }
  | {
      code: 'FEATURE_TYPE_NOT_ON_CLASS_AT_LEVEL';
      featureType: string;
      classSlug: string;
      classLevel: number;
    }
  | {
      code: 'FEATURE_COUNT_MISMATCH';
      featureType: string;
      expected: number;
      got: number;
    }
  | { code: 'FEATURE_DUPLICATE'; feature: FeatureRef; featureType: string };

export type FeaturesValidationResult =
  | { ok: true; applied: FeaturePicks }
  | { ok: false; issues: FeaturesValidationIssue[] };
