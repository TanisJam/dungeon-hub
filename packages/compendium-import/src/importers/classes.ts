import { listFiles, readJson } from '../reader.js';
import { slugify, parseReprintedAs, isExcludedSource } from '../normalize.js';
import type {
  FiveeToolsClass,
  FiveeToolsSubclass,
  NormalizedRecord,
  NormalizedSubclass,
} from '../types.js';

interface ClassFile {
  class?: FiveeToolsClass[];
  subclass?: FiveeToolsSubclass[];
}

/**
 * Clases UA / placeholder que NO importamos.
 */
const SKIP_CLASS_FILES = new Set(['class-mystic.json', 'class-sidekick.json', 'class-generic.json']);

export async function importClassesAndSubclasses(
  dataDir: string,
  warnings: string[],
): Promise<{ classes: NormalizedRecord[]; subclasses: NormalizedSubclass[] }> {
  const files = (await listFiles(dataDir, 'class', /^class-.+\.json$/))
    .filter((path) => !SKIP_CLASS_FILES.has(path.split('/').pop() ?? ''));

  const classes: NormalizedRecord[] = [];
  const subclasses: NormalizedSubclass[] = [];

  for (const path of files) {
    const file = await readJson<ClassFile>(path);

    for (const c of file.class ?? []) {
      if (isExcludedSource(c.source)) continue;
      classes.push({
        slug: slugify(c.name),
        source: c.source,
        name: c.name,
        data: c,
        reprintedAs: parseReprintedAs(c.reprintedAs),
      });
    }

    for (const sc of file.subclass ?? []) {
      if (isExcludedSource(sc.source)) continue;
      if (!sc.className || !sc.classSource) {
        warnings.push(`Subclass "${sc.name}" (${sc.source}) sin className/classSource — skip`);
        continue;
      }
      // 5etools duplica cada subclass: una versión para la clase 2014 (classSource: PHB)
      // y otra para la 2024 (classSource: XPHB). Como excluimos las clases 2024,
      // también excluimos las subclasses que se "pegan" a esas clases.
      if (isExcludedSource(sc.classSource)) continue;
      // El slug usa shortName si existe (más limpio: "evoker") o el name completo
      const slugBase = sc.shortName ?? sc.name;
      subclasses.push({
        slug: `${slugify(sc.className)}--${slugify(slugBase)}`,
        source: sc.source,
        name: sc.name,
        data: sc,
        reprintedAs: parseReprintedAs(sc.reprintedAs),
        classSlug: slugify(sc.className),
        classSource: sc.classSource,
      });
    }
  }

  return { classes, subclasses };
}
