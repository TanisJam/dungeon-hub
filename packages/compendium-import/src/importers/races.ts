import { join } from 'node:path';
import { readJson } from '../reader.js';
import { slugify, parseReprintedAs, isExcludedSource } from '../normalize.js';
import type { FiveeToolsRace, FiveeToolsSubrace, NormalizedRace } from '../types.js';

interface RacesFile {
  race?: FiveeToolsRace[];
  subrace?: FiveeToolsSubrace[];
}

export async function importRaces(
  dataDir: string,
  warnings: string[],
): Promise<NormalizedRace[]> {
  const file = await readJson<RacesFile>(join(dataDir, 'races.json'));
  const out: NormalizedRace[] = [];

  for (const r of file.race ?? []) {
    if (isExcludedSource(r.source)) continue;
    out.push({
      slug: slugify(r.name),
      source: r.source,
      name: r.name,
      data: r,
      reprintedAs: parseReprintedAs(r.reprintedAs),
      isSubrace: false,
      parentSlug: null,
      parentSource: null,
    });
  }

  for (const s of file.subrace ?? []) {
    if (isExcludedSource(s.source)) continue;
    if (!s.raceName || !s.raceSource) {
      warnings.push(`Subrace "${s.name ?? '?'}" (${s.source}) sin raceName/raceSource — skip`);
      continue;
    }
    // Mismo issue que con subclasses: 5etools puede duplicar subraces — una atada
    // a la raza 2014 y otra a la 2024. Excluimos las que se atan a razas 2024.
    if (isExcludedSource(s.raceSource)) continue;
    // Subraces a veces no tienen `name` propio (variantes anónimas) — usamos parent + suffix
    const displayName = s.name ?? `${s.raceName} Variant`;
    out.push({
      slug: `${slugify(s.raceName)}--${slugify(displayName)}`,
      source: s.source,
      name: displayName,
      data: s,
      reprintedAs: parseReprintedAs(s.reprintedAs),
      isSubrace: true,
      parentSlug: slugify(s.raceName),
      parentSource: s.raceSource,
    });
  }

  return out;
}
