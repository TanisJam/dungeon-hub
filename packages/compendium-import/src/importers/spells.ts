import { join } from 'node:path';
import { listFiles, readJson } from '../reader.js';
import { slugify, parseReprintedAs, isExcludedSource } from '../normalize.js';
import type { FiveeToolsSpell, NormalizedSpell } from '../types.js';

interface SpellsFile {
  spell?: FiveeToolsSpell[];
}

/**
 * Estructura de gendata-spell-source-lookup.json:
 * {
 *   "phb": {                       // source del spell, lowercase
 *     "fireball": {                // slug del spell
 *       "class":    { "PHB":  { "Wizard": true, "Sorcerer": true } },
 *       "subclass": { "PHB":  { "Cleric": { ... } }, "XPHB": { ... } }
 *     }
 *   }
 * }
 */
type SpellSourceLookup = Record<
  string, // source code lowercase
  Record<
    string, // slug
    {
      class?: Record<string, Record<string, true>>;
      subclass?: Record<string, Record<string, Record<string, unknown>>>;
    }
  >
>;

/**
 * Archivos que NO son data real de spells (índices, schemas, etc.).
 */
const SKIP_SPELL_FILES = new Set(['index.json', 'sources.json', 'foundry.json']);

/**
 * Devuelve la lista única de clases que pueden castear este spell.
 * Combina: clases que lo tienen en su lista directa + clases con subclases que lo dan.
 * Excluye entries que provienen de sources que descartamos (XPHB, UA*).
 */
function extractClasses(
  slug: string,
  source: string,
  lookup: SpellSourceLookup,
): string[] {
  const entry = lookup[source.toLowerCase()]?.[slug];
  if (!entry) return [];

  const classes = new Set<string>();

  // class.<classSource>.<ClassName>: true
  for (const [classSource, classMap] of Object.entries(entry.class ?? {})) {
    if (isExcludedSource(classSource)) continue;
    for (const className of Object.keys(classMap)) {
      classes.add(slugify(className));
    }
  }

  // subclass.<classSource>.<ClassName>.<subclassSource>.<SubclassName>: { ... }
  for (const [classSource, classMap] of Object.entries(entry.subclass ?? {})) {
    if (isExcludedSource(classSource)) continue;
    for (const className of Object.keys(classMap)) {
      classes.add(slugify(className));
    }
  }

  return Array.from(classes).sort();
}

export async function importSpells(dataDir: string): Promise<NormalizedSpell[]> {
  // Cargar el lookup una sola vez. El archivo de 5etools usa los NOMBRES de
  // spell como keys ("fire bolt") pero nosotros buscamos por slug ("fire-bolt"),
  // así que re-mapeamos al cargar.
  let lookup: SpellSourceLookup = {};
  try {
    const raw = await readJson<SpellSourceLookup>(
      join(dataDir, 'generated', 'gendata-spell-source-lookup.json'),
    );
    for (const [src, byName] of Object.entries(raw)) {
      const remapped: SpellSourceLookup[string] = {};
      for (const [name, entry] of Object.entries(byName)) {
        remapped[slugify(name)] = entry;
      }
      lookup[src] = remapped;
    }
  } catch {
    // Sin lookup, no podemos popular `classes[]`. No bloqueamos el import.
  }

  const files = (await listFiles(dataDir, 'spells', /^spells-.+\.json$|^index\.json$/))
    .filter((path) => !SKIP_SPELL_FILES.has(path.split('/').pop() ?? ''));

  const out: NormalizedSpell[] = [];

  for (const path of files) {
    const file = await readJson<SpellsFile>(path);
    for (const s of file.spell ?? []) {
      if (isExcludedSource(s.source)) continue;

      const slug = slugify(s.name);
      const classes = extractClasses(slug, s.source, lookup);

      out.push({
        slug,
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
