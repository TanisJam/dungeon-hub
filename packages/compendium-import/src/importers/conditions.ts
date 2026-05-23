import { join } from 'node:path';
import { readJson } from '../reader.js';
import { slugify, parseReprintedAs, isExcludedSource } from '../normalize.js';
import type { FiveeToolsCondition, NormalizedCondition } from '../types.js';

interface ConditionsFile {
  condition?: FiveeToolsCondition[];
  status?: FiveeToolsCondition[];
  disease?: FiveeToolsCondition[];
}

export async function importConditions(dataDir: string): Promise<NormalizedCondition[]> {
  const file = await readJson<ConditionsFile>(join(dataDir, 'conditionsdiseases.json'));
  const out: NormalizedCondition[] = [];

  for (const c of file.condition ?? []) {
    if (isExcludedSource(c.source)) continue;
    out.push({
      slug: slugify(c.name),
      source: c.source,
      name: c.name,
      data: c,
      reprintedAs: parseReprintedAs(c.reprintedAs),
      kind: 'condition',
    });
  }

  for (const s of file.status ?? []) {
    if (isExcludedSource(s.source)) continue;
    out.push({
      slug: slugify(s.name),
      source: s.source,
      name: s.name,
      data: s,
      reprintedAs: parseReprintedAs(s.reprintedAs),
      kind: 'status',
    });
  }

  return out;
}
