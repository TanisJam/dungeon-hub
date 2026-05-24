import { join } from 'node:path';
import { readJson } from '../reader.js';
import { slugify, parseReprintedAs, isExcludedSource } from '../normalize.js';
import type { FiveeToolsBackground, NormalizedRecord } from '../types.js';

interface BackgroundsFile {
  background?: FiveeToolsBackground[];
}

/**
 * Detects the 5etools data bug where Custom Background's pure-tool
 * `skillToolLanguageProficiencies` alternative encodes `{ anyTool: 1 }`
 * instead of `{ anyTool: 2 }` per PHB p. 125 ("Choose two tools").
 *
 * Only flags PURE tool alts — the legitimate `{anyLanguage:1, anyTool:1}`
 * alt ("Choose one language and one tool") is NOT a bug.
 *
 * Domain enforces count=2 at runtime via `patchAnyToolCount`. This warning
 * surfaces the upstream issue so fixes can be tracked.
 */
function warnIfAnyToolCountBug(b: FiveeToolsBackground): void {
  const field = (b as unknown as Record<string, unknown>)['skillToolLanguageProficiencies'];
  if (!Array.isArray(field)) return;
  for (const alt of field) {
    if (!alt || typeof alt !== 'object') continue;
    const altObj = alt as Record<string, unknown>;
    const hasAnyLanguage = 'anyLanguage' in altObj;
    if (!hasAnyLanguage && altObj['anyTool'] === 1) {
      console.warn(
        `[compendium-import] WARNING: ${b.source}/${b.name} has skillToolLanguageProficiencies with anyTool:1 ` +
          `(expected 2 per PHB p.125, "Choose two tools" alt). Domain will patch to 2 at runtime. ` +
          `Check 5etools upstream: https://github.com/5etools-mirror-3/5etools-mirror-3.github.io`,
      );
    }
  }
}

export async function importBackgrounds(dataDir: string): Promise<NormalizedRecord[]> {
  const file = await readJson<BackgroundsFile>(join(dataDir, 'backgrounds.json'));
  const out: NormalizedRecord[] = [];

  for (const b of file.background ?? []) {
    if (isExcludedSource(b.source)) continue;
    warnIfAnyToolCountBug(b);
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
