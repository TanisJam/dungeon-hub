import { and, eq } from 'drizzle-orm';
import type {
  RaceCompendiumData,
  SubraceCompendiumData,
} from '@dungeon-hub/domain/character/race';
import { db } from '../../infra/db/client.js';
import { compendiumRaces } from '../../infra/db/schema.js';

/**
 * Carga race + subrace del compendio. La subrace vive en la misma tabla
 * (`compendium_races` con `is_subrace=true`).
 *
 * Convierte el shape de DB → shape esperado por el domain validator.
 */
export async function loadRaceAndSubrace(input: {
  raceSlug: string;
  raceSource: string;
  subraceSlug?: string | null;
  subraceSource?: string | null;
}): Promise<{
  race: RaceCompendiumData | null;
  subrace: SubraceCompendiumData | null;
}> {
  const raceRows = await db
    .select()
    .from(compendiumRaces)
    .where(
      and(
        eq(compendiumRaces.slug, input.raceSlug),
        eq(compendiumRaces.source, input.raceSource),
        eq(compendiumRaces.isSubrace, false),
      ),
    )
    .limit(1);
  const raceRow = raceRows[0];

  const race: RaceCompendiumData | null = raceRow
    ? {
        slug: raceRow.slug,
        source: raceRow.source,
        ability: (raceRow.data as { ability?: unknown }).ability as
          | RaceCompendiumData['ability']
          | undefined,
      }
    : null;

  let subrace: SubraceCompendiumData | null = null;
  if (input.subraceSlug && input.subraceSource) {
    const subRows = await db
      .select()
      .from(compendiumRaces)
      .where(
        and(
          eq(compendiumRaces.slug, input.subraceSlug),
          eq(compendiumRaces.source, input.subraceSource),
          eq(compendiumRaces.isSubrace, true),
        ),
      )
      .limit(1);
    const subRow = subRows[0];
    if (subRow) {
      subrace = {
        slug: subRow.slug,
        source: subRow.source,
        parentSlug: subRow.parentSlug ?? '',
        parentSource: subRow.parentSource ?? '',
        ability: (subRow.data as { ability?: unknown }).ability as
          | SubraceCompendiumData['ability']
          | undefined,
      };
    }
  }

  return { race, subrace };
}
