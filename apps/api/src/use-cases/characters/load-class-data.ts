import { and, eq } from 'drizzle-orm';
import type {
  ClassCompendiumData,
  SubclassCompendiumData,
} from '@dungeon-hub/domain/character/class';
import { db } from '../../infra/db/client.js';
import { compendiumClasses, compendiumSubclasses } from '../../infra/db/schema.js';

export async function loadClassAndSubclass(input: {
  classSlug: string;
  classSource: string;
  subclassSlug?: string | null;
  subclassSource?: string | null;
}): Promise<{
  classData: ClassCompendiumData | null;
  subclassData: SubclassCompendiumData | null;
}> {
  const classRows = await db
    .select()
    .from(compendiumClasses)
    .where(
      and(
        eq(compendiumClasses.slug, input.classSlug),
        eq(compendiumClasses.source, input.classSource),
      ),
    )
    .limit(1);
  const classRow = classRows[0];

  let classData: ClassCompendiumData | null = null;
  if (classRow) {
    const data = classRow.data as Record<string, unknown>;
    classData = {
      slug: classRow.slug,
      source: classRow.source,
      hd: data.hd as ClassCompendiumData['hd'],
      proficiency: (data.proficiency as ClassCompendiumData['proficiency']) ?? [],
      startingProficiencies:
        (data.startingProficiencies as ClassCompendiumData['startingProficiencies']) ?? {},
      subclassTitle: (data.subclassTitle as string | null | undefined) ?? null,
      classFeatures: (data.classFeatures as ClassCompendiumData['classFeatures']) ?? [],
    };
  }

  let subclassData: SubclassCompendiumData | null = null;
  if (input.subclassSlug && input.subclassSource) {
    const subRows = await db
      .select()
      .from(compendiumSubclasses)
      .where(
        and(
          eq(compendiumSubclasses.slug, input.subclassSlug),
          eq(compendiumSubclasses.source, input.subclassSource),
        ),
      )
      .limit(1);
    const subRow = subRows[0];
    if (subRow) {
      subclassData = {
        slug: subRow.slug,
        source: subRow.source,
        classSlug: subRow.classSlug,
        classSource: subRow.classSource,
        name: subRow.name,
      };
    }
  }

  return { classData, subclassData };
}
