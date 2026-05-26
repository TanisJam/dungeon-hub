import { z } from 'zod';

/**
 * Lista de entidades deshabilitadas (a nivel campaña).
 * Cada entrada tiene formato "slug|SOURCE", ej: "aasimar|VGM".
 *
 * Esto permite granularidad fina: si MPMM y VGM están ambas habilitadas pero
 * solo querés el Aasimar de MPMM, ponés ["aasimar|VGM"] acá.
 */
const DisabledEntitiesSchema = z.object({
  races: z.array(z.string()).default([]),
  subraces: z.array(z.string()).default([]),
  classes: z.array(z.string()).default([]),
  subclasses: z.array(z.string()).default([]),
  backgrounds: z.array(z.string()).default([]),
  spells: z.array(z.string()).default([]),
  items: z.array(z.string()).default([]),
  feats: z.array(z.string()).default([]),
  optionalFeatures: z.array(z.string()).default([]),
  /**
   * Added by SDD `domain-reference-data-runtime-source` (#807). Existing stored
   * profiles default to [] via Zod schema parse — no DB migration required.
   */
  languages: z.array(z.string()).default([]),
});

const VariantRulesSchema = z.object({
  /** Multiclassing habilitado. PHB cap. 6 — opcional. */
  multiclassing: z.boolean(),

  /** Feats habilitados. PHB p.165 — opcionales (reemplazan ASI). */
  feats: z.boolean(),

  /** Variant Human (PHB p.31) y Custom Lineage (TCE p.8). Requiere feats=true. */
  variantHumanAndCustomLineage: z.boolean(),

  /** Encumbrance variant con 3 umbrales (PHB p.176). Si false, solo límite máximo. */
  encumbranceVariant: z.boolean(),

  /** Customizing Your Origin de Tasha's (TCE p.8). Mover ASIs raciales libremente. */
  tashasCustomOrigin: z.boolean(),

  /** Optional Class Features de Tasha's (TCE cap. 1). */
  tashasOptionalClassFeatures: z.boolean(),
});

const StatGenerationSchema = z.object({
  standardArray: z.boolean(),
  pointBuy: z.boolean(),
  roll: z.boolean(),
});

export const RulesProfileSchema = z.object({
  /**
   * Map de source code → habilitada/deshabilitada.
   * Sources faltantes se consideran DESHABILITADAS por default.
   */
  sources: z.record(z.string(), z.boolean()),

  /** Entidades específicas deshabilitadas (sobreescribe la habilitación por source). */
  disabledEntities: DisabledEntitiesSchema,

  variantRules: VariantRulesSchema,

  statGeneration: StatGenerationSchema,

  /** Método para calcular HP al subir nivel. */
  hpOnLevelUp: z.enum(['roll', 'average', 'player-choice']),
});

export type RulesProfile = z.infer<typeof RulesProfileSchema>;
export type DisabledEntities = z.infer<typeof DisabledEntitiesSchema>;
export type VariantRules = z.infer<typeof VariantRulesSchema>;
export type StatGeneration = z.infer<typeof StatGenerationSchema>;

/**
 * Devuelve la lista de source codes habilitados (los que tienen value: true).
 */
export function enabledSources(profile: RulesProfile): string[] {
  return Object.entries(profile.sources)
    .filter(([, v]) => v === true)
    .map(([k]) => k);
}
