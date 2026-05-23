import { and, eq } from 'drizzle-orm';
import type { BackgroundCompendiumData } from '@dungeon-hub/domain/character/background';
import { db } from '../../infra/db/client.js';
import { compendiumBackgrounds } from '../../infra/db/schema.js';

function rowToBackgroundCompendiumData(row: {
  slug: string;
  source: string;
  name: string;
  data: unknown;
}): BackgroundCompendiumData {
  const data = row.data as Record<string, unknown>;
  return {
    slug: row.slug,
    source: row.source,
    name: row.name,
    skillProficiencies: data.skillProficiencies as BackgroundCompendiumData['skillProficiencies'],
    languageProficiencies: data.languageProficiencies as BackgroundCompendiumData['languageProficiencies'],
    toolProficiencies: data.toolProficiencies as BackgroundCompendiumData['toolProficiencies'],
    skillToolLanguageProficiencies: data.skillToolLanguageProficiencies as BackgroundCompendiumData['skillToolLanguageProficiencies'],
    startingEquipment: data.startingEquipment as BackgroundCompendiumData['startingEquipment'],
    entries: data.entries as BackgroundCompendiumData['entries'],
  };
}

export async function loadBackgroundData(input: {
  slug: string;
  source: string;
}): Promise<BackgroundCompendiumData | null> {
  const rows = await db
    .select()
    .from(compendiumBackgrounds)
    .where(
      and(
        eq(compendiumBackgrounds.slug, input.slug),
        eq(compendiumBackgrounds.source, input.source),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row) return null;

  return rowToBackgroundCompendiumData(row);
}

/**
 * Loads all backgrounds from the compendium — used by Custom Background validation
 * to resolve feature slugs and equipment packages. (~57 rows, acceptable for every PUT).
 */
export async function loadAllBackgrounds(): Promise<BackgroundCompendiumData[]> {
  const rows = await db.select().from(compendiumBackgrounds);
  return rows.map(rowToBackgroundCompendiumData);
}
