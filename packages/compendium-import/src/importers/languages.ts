import { join } from 'node:path';
import { readJson } from '../reader.js';
import { slugify, parseReprintedAs, isExcludedSource } from '../normalize.js';
import type { FiveeToolsLanguage, NormalizedLanguage } from '../types.js';

interface LanguagesFile {
  language?: FiveeToolsLanguage[];
  languageScript?: unknown[];
}

export async function importLanguages(dataDir: string): Promise<NormalizedLanguage[]> {
  const file = await readJson<LanguagesFile>(join(dataDir, 'languages.json'));
  const out: NormalizedLanguage[] = [];

  for (const l of file.language ?? []) {
    if (isExcludedSource(l.source)) continue;
    out.push({
      slug: slugify(l.name),
      source: l.source,
      name: l.name,
      data: l,
      reprintedAs: parseReprintedAs(l.reprintedAs),
      type: l.type ?? null,
      script: l.script ?? null,
    });
  }

  return out;
}
