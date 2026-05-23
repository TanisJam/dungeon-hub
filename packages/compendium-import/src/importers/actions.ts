import { join } from 'node:path';
import { readJson } from '../reader.js';
import { slugify, parseReprintedAs, isExcludedSource } from '../normalize.js';
import type { FiveeToolsAction, NormalizedAction } from '../types.js';

interface ActionsFile {
  action?: FiveeToolsAction[];
}

export async function importActions(dataDir: string): Promise<NormalizedAction[]> {
  const file = await readJson<ActionsFile>(join(dataDir, 'actions.json'));
  const out: NormalizedAction[] = [];

  for (const a of file.action ?? []) {
    if (isExcludedSource(a.source)) continue;
    out.push({
      slug: slugify(a.name),
      source: a.source,
      name: a.name,
      data: a,
      reprintedAs: parseReprintedAs(a.reprintedAs),
    });
  }

  return out;
}
