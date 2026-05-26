import {
  phbDefaultPools,
  type WorldRefData,
} from '@dungeon-hub/domain/world';
import { db } from '../../infra/db/client.js';
import { compendiumLanguages } from '../../infra/db/schema.js';
import { profileFilterConditions } from '../compendium/profile-filter.js';
import { loadWorldById } from '../campaigns/load-campaign.js';

/**
 * Resolves the world's reference-data pools (languages + subrace registries)
 * filtered by the world's `rulesProfile`.
 *
 * Languages are loaded from `compendium_languages` and partitioned by 5etools
 * `type` field. Subrace registries are PHB defaults today — encoding them as
 * per-race flags in the compendium is a future SDD (see proposal #805 § Out
 * of Scope).
 *
 * Returns `null` when the world does not exist.
 *
 * Closes REQ-DRD-LOADER from
 * sdd/domain-reference-data-runtime-source/spec (#806).
 */
export async function loadWorldRefData(worldId: string): Promise<WorldRefData | null> {
  const world = await loadWorldById(worldId);
  if (!world) return null;

  // Languages — filtered by the world's rulesProfile (sources + disabledEntities).
  const langFilter = profileFilterConditions({
    profile: world.rulesProfile,
    kind: 'languages',
    slugCol: compendiumLanguages.slug,
    sourceCol: compendiumLanguages.source,
  });

  const standard: string[] = [];
  const exotic: string[] = [];

  if (langFilter) {
    const rows = await db
      .select({ slug: compendiumLanguages.slug, type: compendiumLanguages.type })
      .from(compendiumLanguages)
      .where(langFilter);

    for (const row of rows) {
      if (row.type === 'standard') standard.push(row.slug);
      else if (row.type === 'exotic') exotic.push(row.slug);
      // 'secret' (e.g. Druidic, Thieves' Cant) is intentionally excluded — not
      // a player-pickable language for race/background blocks.
    }
  }

  // Subrace registries — PHB defaults for now. Future SDD `compendium-subrace-flags`
  // can encode `requiresSubrace` and `replacesParentAbility` per row.
  const defaults = phbDefaultPools();

  return {
    languagePool: { standard, exotic },
    subraceRequiredSet: defaults.subraceRequiredSet,
    subraceReplacingAbilitySet: defaults.subraceReplacingAbilitySet,
  };
}
