import { and, eq } from 'drizzle-orm';
import type {
  RaceCompendiumData,
  SubraceCompendiumData,
} from '@dungeon-hub/domain/character/race';
import type { RaceSheetData } from '@dungeon-hub/domain/character/sheet';
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
        languageProficiencies: (raceRow.data as { languageProficiencies?: unknown })
          .languageProficiencies as RaceCompendiumData['languageProficiencies'] | undefined,
        feats: (raceRow.data as { feats?: unknown }).feats as
          | RaceCompendiumData['feats']
          | undefined,
        skillProficiencies: (raceRow.data as { skillProficiencies?: unknown })
          .skillProficiencies as RaceCompendiumData['skillProficiencies'] | undefined,
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
        languageProficiencies: (subRow.data as { languageProficiencies?: unknown })
          .languageProficiencies as SubraceCompendiumData['languageProficiencies'] | undefined,
        feats: (subRow.data as { feats?: unknown }).feats as
          | SubraceCompendiumData['feats']
          | undefined,
        skillProficiencies: (subRow.data as { skillProficiencies?: unknown })
          .skillProficiencies as SubraceCompendiumData['skillProficiencies'] | undefined,
      };
    }
  }

  return { race, subrace };
}

/**
 * Variante para el sheet: trae `speed`, `size`, `languageProficiencies`
 * además del shape básico. Combina race + subrace (subrace puede agregar
 * idiomas, ej. High Elf da +1 lang).
 */
export async function loadRaceSheetData(input: {
  raceSlug: string;
  raceSource: string;
  subraceSlug?: string | null;
  subraceSource?: string | null;
}): Promise<RaceSheetData | null> {
  const rows = await db
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
  const raceRow = rows[0];
  if (!raceRow) return null;
  const raceData = raceRow.data as Record<string, unknown>;

  let result: RaceSheetData = {
    speed: raceData.speed as RaceSheetData['speed'],
    size: raceData.size as RaceSheetData['size'],
    languageProficiencies: raceData.languageProficiencies as RaceSheetData['languageProficiencies'],
  };

  // Mergeamos languageProficiencies de la subrace si existe
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
      const subData = subRow.data as Record<string, unknown>;
      const subLangs = subData.languageProficiencies as
        | RaceSheetData['languageProficiencies']
        | undefined;
      if (subLangs && subLangs.length > 0) {
        result = {
          ...result,
          languageProficiencies: [...(result.languageProficiencies ?? []), ...subLangs],
        };
      }
    }
  }

  return result;
}
