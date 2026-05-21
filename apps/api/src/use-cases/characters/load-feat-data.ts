import { and, eq } from 'drizzle-orm';
import type { FeatCompendiumData } from '@dungeon-hub/domain/character/feat';
import { db } from '../../infra/db/client.js';
import { compendiumFeats } from '../../infra/db/schema.js';

export async function loadFeatData(input: {
  slug: string;
  source: string;
}): Promise<FeatCompendiumData | null> {
  const rows = await db
    .select()
    .from(compendiumFeats)
    .where(
      and(eq(compendiumFeats.slug, input.slug), eq(compendiumFeats.source, input.source)),
    )
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  const data = row.data as Record<string, unknown>;
  return {
    slug: row.slug,
    source: row.source,
    name: row.name,
    prerequisite: data.prerequisite as FeatCompendiumData['prerequisite'],
    ability: data.ability as FeatCompendiumData['ability'],
  };
}
