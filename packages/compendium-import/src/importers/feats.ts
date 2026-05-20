import { join } from 'node:path';
import { readJson } from '../reader.js';
import { slugify, parseReprintedAs, isExcludedSource } from '../normalize.js';
import type { FiveeToolsFeat, NormalizedFeat } from '../types.js';

interface FeatsFile {
  feat?: FiveeToolsFeat[];
}

export async function importFeats(dataDir: string): Promise<NormalizedFeat[]> {
  const file = await readJson<FeatsFile>(join(dataDir, 'feats.json'));
  const out: NormalizedFeat[] = [];

  for (const f of file.feat ?? []) {
    if (isExcludedSource(f.source)) continue;
    out.push({
      slug: slugify(f.name),
      source: f.source,
      name: f.name,
      data: f,
      reprintedAs: parseReprintedAs(f.reprintedAs),
      prerequisites: f.prerequisite ?? null,
    });
  }

  return out;
}
