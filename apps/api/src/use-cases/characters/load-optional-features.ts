import { sql, and } from 'drizzle-orm';
import type { RulesProfile } from '@dungeon-hub/domain/rules-profile';
import type { OptionalFeatureLite } from '@dungeon-hub/domain/character/class-features';
import { db } from '../../infra/db/client.js';
import { compendiumOptionalFeatures } from '../../infra/db/schema.js';
import { profileFilterConditions } from '../compendium/profile-filter.js';

/**
 * Carga las optional features disponibles para la campaña, aplicando los
 * filtros del Rules Profile:
 *   - Source habilitada.
 *   - slug|source no deshabilitado.
 *   - Si source === 'TCE' y tashasOptionalClassFeatures = false → excluido.
 *
 * Opcionalmente filtra por featureType (ej. solo 'FS:F').
 */
export async function loadOptionalFeatures(input: {
  rulesProfile: RulesProfile;
  /** Filtra por al menos un featureType en este array. */
  featureTypes?: string[];
}): Promise<OptionalFeatureLite[]> {
  const baseFilter = profileFilterConditions({
    profile: input.rulesProfile,
    kind: 'optionalFeatures',
    slugCol: compendiumOptionalFeatures.slug,
    sourceCol: compendiumOptionalFeatures.source,
  });
  if (!baseFilter) return [];

  const conds = [baseFilter];

  if (!input.rulesProfile.variantRules.tashasOptionalClassFeatures) {
    conds.push(sql`${compendiumOptionalFeatures.source} != 'TCE'`);
  }

  if (input.featureTypes && input.featureTypes.length > 0) {
    const tagsLiteral = sql.join(
      input.featureTypes.map((t) => sql`${t}`),
      sql`, `,
    );
    conds.push(sql`${compendiumOptionalFeatures.featureType} && ARRAY[${tagsLiteral}]::text[]`);
  }

  const rows = await db
    .select({
      slug: compendiumOptionalFeatures.slug,
      source: compendiumOptionalFeatures.source,
      featureType: compendiumOptionalFeatures.featureType,
      prerequisites: compendiumOptionalFeatures.prerequisites,
    })
    .from(compendiumOptionalFeatures)
    .where(and(...conds)!);

  return rows.map((r) => ({
    slug: r.slug,
    source: r.source,
    featureType: r.featureType,
    prerequisites: r.prerequisites,
  }));
}
