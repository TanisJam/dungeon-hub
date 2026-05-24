import { and, eq } from 'drizzle-orm';
import type {
  RaceCompendiumData,
  SubraceCompendiumData,
} from '@dungeon-hub/domain/character/race';
import type { RaceSheetData, BreathWeaponData, RaceInnateSpell } from '@dungeon-hub/domain/character/sheet';
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
    ? ({
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
        breathWeapon: (raceRow.data as { breathWeapon?: unknown }).breathWeapon as
          | RaceCompendiumData['breathWeapon']
          | undefined,
        darkvision: (raceRow.data as { darkvision?: unknown }).darkvision as
          | RaceCompendiumData['darkvision']
          | undefined,
        additionalSpellsNormalized: (raceRow.data as { additionalSpellsNormalized?: unknown }).additionalSpellsNormalized as
          | RaceCompendiumData['additionalSpellsNormalized']
          | undefined,
      } as RaceCompendiumData)
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
        breathWeapon: (subRow.data as { breathWeapon?: unknown }).breathWeapon as
          | SubraceCompendiumData['breathWeapon']
          | undefined,
        darkvision: (subRow.data as { darkvision?: unknown }).darkvision as
          | SubraceCompendiumData['darkvision']
          | undefined,
        additionalSpellsNormalized: (subRow.data as { additionalSpellsNormalized?: unknown }).additionalSpellsNormalized as
          | SubraceCompendiumData['additionalSpellsNormalized']
          | undefined,
      } as SubraceCompendiumData;
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
    speed: raceData['speed'] as RaceSheetData['speed'],
    size: raceData['size'] as RaceSheetData['size'],
    languageProficiencies: raceData['languageProficiencies'] as RaceSheetData['languageProficiencies'],
    // Race-level breathWeapon for symmetry (null in 100% of PHB cases today).
    breathWeapon: (raceData['breathWeapon'] as BreathWeaponData | null | undefined) ?? null,
    // REQ-4: project race-level darkvision. null when field absent OR explicitly null. PHB p.17.
    darkvision: (raceData['darkvision'] as number | null | undefined) ?? null,
    // Batch 5: project race-level weapon/armor profs. Subrace may override below (Decision #589).
    weaponProficiencies: (raceData['weaponProficiencies'] as RaceSheetData['weaponProficiencies']) ?? null,
    armorProficiencies: (raceData['armorProficiencies'] as RaceSheetData['armorProficiencies']) ?? null,
    // Batch 6: project race-level additionalSpellsNormalized. Subrace may override below (Decision #605 family).
    additionalSpellsNormalized: (raceData['additionalSpellsNormalized'] as RaceInnateSpell[] | null | undefined) ?? null,
  } as RaceSheetData;

  // Merge languageProficiencies and breathWeapon from subrace if it exists.
  // Subrace breathWeapon OVERRIDES race-level (per design D-5: only subraces carry it).
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
      const subLangs = subData['languageProficiencies'] as
        | RaceSheetData['languageProficiencies']
        | undefined;
      if (subLangs && subLangs.length > 0) {
        result = {
          ...result,
          languageProficiencies: [...(result.languageProficiencies ?? []), ...subLangs],
        };
      }
      // Project breathWeapon from subrace JSONB (PHB Dragonborn ancestries).
      const subBreath = subData['breathWeapon'] as BreathWeaponData | null | undefined;
      if (subBreath) {
        result = { ...result, breathWeapon: subBreath };
      }
      // REQ-4 + Decision #577: subrace darkvision OVERRIDES race when field is PRESENT (number or null).
      // Use `'darkvision' in subData` to distinguish "property absent" (inherit race) from
      // "property present with null" (explicit opt-out drops inherited darkvision). PHB p.24.
      if ('darkvision' in subData) {
        const subDV = subData['darkvision'];
        // Narrow: subDV is number or null per 5etools schema.
        // Defends against malformed JSONB — defaults to null instead of propagating garbage.
        result = {
          ...result,
          darkvision: typeof subDV === 'number' ? subDV : null,
        };
      }
      // Batch 5 + Decision #589: subrace weaponProficiencies OVERRIDES race when field is PRESENT.
      // `'weaponProficiencies' in subData` distinguishes "no field" (inherit race) from
      // "field present" (even if empty array → override, i.e. zero race-level weapons).
      // PHB: Drow replaces Elf weapon training; Mountain Dwarf adds armor (Dwarf race has none).
      if ('weaponProficiencies' in subData) {
        result = {
          ...result,
          weaponProficiencies: (subData['weaponProficiencies'] as RaceSheetData['weaponProficiencies']) ?? null,
        };
      }
      if ('armorProficiencies' in subData) {
        result = {
          ...result,
          armorProficiencies: (subData['armorProficiencies'] as RaceSheetData['armorProficiencies']) ?? null,
        };
      }
      // Batch 6 + Decision #605 family: subrace additionalSpellsNormalized OVERRIDES race
      // when field PRESENT (Drow REPLACES Elf's empty default; High Elf REPLACES Elf's empty).
      // `in` operator distinguishes "no field" (inherit) from "field present" (override, even null).
      if ('additionalSpellsNormalized' in subData) {
        result = {
          ...result,
          additionalSpellsNormalized: (subData['additionalSpellsNormalized'] as RaceInnateSpell[] | null | undefined) ?? null,
        };
      }
    }
  }

  return result;
}
