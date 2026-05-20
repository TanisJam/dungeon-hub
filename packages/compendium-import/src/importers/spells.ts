import { listFiles, readJson } from '../reader.js';
import { slugify, parseReprintedAs, isExcludedSource } from '../normalize.js';
import type { FiveeToolsSpell, NormalizedSpell } from '../types.js';

interface SpellsFile {
  spell?: FiveeToolsSpell[];
}

/**
 * Archivos que NO son data real de spells (índices, schemas, etc.).
 */
const SKIP_SPELL_FILES = new Set(['index.json', 'sources.json', 'foundry.json']);

export async function importSpells(dataDir: string): Promise<NormalizedSpell[]> {
  const files = (await listFiles(dataDir, 'spells', /^spells-.+\.json$|^index\.json$/))
    .filter((path) => !SKIP_SPELL_FILES.has(path.split('/').pop() ?? ''));

  const out: NormalizedSpell[] = [];

  for (const path of files) {
    const file = await readJson<SpellsFile>(path);
    for (const s of file.spell ?? []) {
      if (isExcludedSource(s.source)) continue;

      // Extraer las clases que pueden castear este spell (desde fromClassList)
      const classes =
        s.classes?.fromClassList?.map((c) => slugify(c.name)).filter((x, i, arr) => arr.indexOf(x) === i) ??
        [];

      out.push({
        slug: slugify(s.name),
        source: s.source,
        name: s.name,
        data: s,
        reprintedAs: parseReprintedAs(s.reprintedAs),
        level: s.level,
        school: s.school,
        classes,
      });
    }
  }

  return out;
}
