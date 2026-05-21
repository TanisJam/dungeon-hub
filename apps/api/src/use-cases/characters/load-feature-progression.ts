import { and, eq } from 'drizzle-orm';
import type { ClassFeatureSource } from '@dungeon-hub/domain/character/class-features';
import { db } from '../../infra/db/client.js';
import { compendiumClasses, compendiumSubclasses } from '../../infra/db/schema.js';

/**
 * Carga el `optionalfeatureProgression` (clase + subclase, si hay) en una
 * sola query por tabla. Devuelve null si la clase no existe.
 */
export async function loadFeatureProgression(input: {
  classSlug: string;
  classSource: string;
  subclassSlug?: string | null;
  subclassSource?: string | null;
}): Promise<{
  classData: ClassFeatureSource;
  subclassData: ClassFeatureSource | null;
} | null> {
  const classRows = await db
    .select({ data: compendiumClasses.data })
    .from(compendiumClasses)
    .where(
      and(
        eq(compendiumClasses.slug, input.classSlug),
        eq(compendiumClasses.source, input.classSource),
      ),
    )
    .limit(1);
  const classRow = classRows[0];
  if (!classRow) return null;

  const classData: ClassFeatureSource = {
    optionalfeatureProgression:
      (classRow.data as Record<string, unknown>).optionalfeatureProgression as ClassFeatureSource['optionalfeatureProgression'],
  };

  let subclassData: ClassFeatureSource | null = null;
  if (input.subclassSlug && input.subclassSource) {
    const subRows = await db
      .select({ data: compendiumSubclasses.data })
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
        optionalfeatureProgression:
          (subRow.data as Record<string, unknown>).optionalfeatureProgression as ClassFeatureSource['optionalfeatureProgression'],
      };
    }
  }

  return { classData, subclassData };
}
