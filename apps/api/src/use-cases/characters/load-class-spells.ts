import { sql, and, or } from 'drizzle-orm';
import type { RulesProfile } from '@dungeon-hub/domain/rules-profile';
import type { SpellLite } from '@dungeon-hub/domain/character/spellcasting';
import { db } from '../../infra/db/client.js';
import { compendiumSpells } from '../../infra/db/schema.js';
import { profileFilterConditions } from '../compendium/profile-filter.js';

/**
 * Carga TODOS los spells disponibles para una clase, ya filtrados por el Rules
 * Profile. Incluye cantrips (level 0).
 *
 * El universo es la unión de:
 *   - Spell list base de la clase (`compendium_spells.classes` array).
 *   - Bonus spells otorgados por la subclase del personaje, si se pasa
 *     `subclassSlug` (matching `subclass_grants[].classSlug + subclassSlug`).
 *
 * Sin `subclassSlug`, solo devuelve la spell list base. Esto es correcto para
 * features como Wizard spellbook copy (Wizard base list es lo que importa) o
 * para validaciones genéricas de "este spell pertenece a esta clase".
 *
 * El validador usa este array como universo permitido para `cantrips`, `known`
 * y `prepared`. Lo entregamos en su forma lite (slug, source, level).
 */
export async function loadClassSpells(input: {
  classSlug: string;
  subclassSlug?: string;
  rulesProfile: RulesProfile;
}): Promise<SpellLite[]> {
  const profileFilter = profileFilterConditions({
    profile: input.rulesProfile,
    kind: 'spells',
    slugCol: compendiumSpells.slug,
    sourceCol: compendiumSpells.source,
  });
  if (!profileFilter) return [];

  const baseListCond = sql`${input.classSlug} = ANY(${compendiumSpells.classes})`;
  // `subclass_grants` shape: [{classSlug, classSource, subclassSlug, subclassSource, subclassName}]
  // Usamos jsonb @> con un partial match {classSlug, subclassSlug} para acertar al subclass del PJ.
  const subclassCond = input.subclassSlug
    ? sql`${compendiumSpells.subclassGrants} @> ${JSON.stringify([
        { classSlug: input.classSlug, subclassSlug: input.subclassSlug },
      ])}::jsonb`
    : undefined;

  const universeCond = subclassCond ? or(baseListCond, subclassCond)! : baseListCond;
  const conds = and(profileFilter, universeCond)!;

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
