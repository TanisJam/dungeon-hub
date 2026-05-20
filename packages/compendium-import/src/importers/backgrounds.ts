import { join } from 'node:path';
import { readJson } from '../reader.js';
import { slugify, parseReprintedAs, isExcludedSource } from '../normalize.js';
import type { FiveeToolsBackground, NormalizedRecord } from '../types.js';

interface BackgroundsFile {
  background?: FiveeToolsBackground[];
}

export async function importBackgrounds(dataDir: string): Promise<NormalizedRecord[]> {
  const file = await readJson<BackgroundsFile>(join(dataDir, 'backgrounds.json'));
  const out: NormalizedRecord[] = [];

  for (const b of file.background ?? []) {
    if (isExcludedSource(b.source)) continue;
    out.push({
      slug: slugify(b.name),
      source: b.source,
      name: b.name,
      data: b,
      reprintedAs: parseReprintedAs(b.reprintedAs),
    });
  }

  return out;
}
