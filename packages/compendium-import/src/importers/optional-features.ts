import { join } from 'node:path';
import { readJson } from '../reader.js';
import { slugify, parseReprintedAs, isExcludedSource } from '../normalize.js';
import type {
  FiveeToolsOptionalFeature,
  NormalizedOptionalFeature,
} from '../types.js';

interface OptionalFeaturesFile {
  optionalfeature?: FiveeToolsOptionalFeature[];
}

/**
 * Importa entries de `optionalfeatures.json`: invocations, fighting styles,
 * maneuvers, arcane shots, hunter's prey, infusions, etc.
 *
 * Una entry puede tener varios `featureType[]` (ej. "Archery" está en
 * FS:F y FS:R), por eso los pasamos como array.
 */
export async function importOptionalFeatures(dataDir: string): Promise<NormalizedOptionalFeature[]> {
  const file = await readJson<OptionalFeaturesFile>(join(dataDir, 'optionalfeatures.json'));
  const out: NormalizedOptionalFeature[] = [];

  for (const f of file.optionalfeature ?? []) {
    if (isExcludedSource(f.source)) continue;
    out.push({
      slug: slugify(f.name),
      source: f.source,
      name: f.name,
      data: f,
      reprintedAs: parseReprintedAs(f.reprintedAs),
      featureType: Array.isArray(f.featureType) ? f.featureType : [],
      prerequisites: f.prerequisite ?? null,
    });
  }

  return out;
}
