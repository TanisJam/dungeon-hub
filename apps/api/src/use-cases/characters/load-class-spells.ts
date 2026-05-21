import { sql, and } from 'drizzle-orm';
import type { RulesProfile } from '@dungeon-hub/domain/rules-profile';
import type { SpellLite } from '@dungeon-hub/domain/character/spellcasting';
import { db } from '../../infra/db/client.js';
import { compendiumSpells } from '../../infra/db/schema.js';
import { profileFilterConditions } from '../compendium/profile-filter.js';

/**
 * Carga TODOS los spells disponibles para una clase, ya filtrados por el Rules
 * Profile. Incluye cantrips (level 0).
 *
 * El validador usa este array como universo permitido para `cantrips`, `known`
 * y `prepared`. Lo entregamos en su forma lite (slug, source, level).
 */
export async function loadClassSpells(input: {
  classSlug: string;
  rulesProfile: RulesProfile;
}): Promise<SpellLite[]> {
  const profileFilter = profileFilterConditions({
    profile: input.rulesProfile,
    kind: 'spells',
    slugCol: compendiumSpells.slug,
    sourceCol: compendiumSpells.source,
  });
  if (!profileFilter) return [];

  const conds = and(
    profileFilter,
    sql`${input.classSlug} = ANY(${compendiumSpells.classes})`,
  )!;

  const rows = await db
    .select({
      slug: compendiumSpells.slug,
      source: compendiumSpells.source,
      level: compendiumSpells.level,
    })
    .from(compendiumSpells)
    .where(conds);

  return rows.map((r) => ({ slug: r.slug, source: r.source, level: r.level }));
}
