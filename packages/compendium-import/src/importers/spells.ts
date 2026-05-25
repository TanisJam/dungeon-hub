import { join } from 'node:path';
import { listFiles, readJson } from '../reader.js';
import { slugify, parseReprintedAs, isExcludedSource } from '../normalize.js';
import { parseComponentsM, parseConcentration, parseRitual } from './spells-meta.js';
import type { FiveeToolsSpell, NormalizedSpell, SubclassGrant } from '../types.js';

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
 * Devuelve solo las clases BASE que tienen el spell en su lista canónica
 * (Appendix B del PHB / class spell list). NO incluye clases que lo obtienen
 * via subclase (eso es `extractSubclassGrants`).
 *
 * Por qué separar: "Fireball es spell de Cleric" es falso — Cleric base NO
 * tiene Fireball; solo Light/Arcana Domain lo otorgan como bonus. Mezclarlas
 * confunde a quien consulta el spell.
 */
function extractBaseClasses(
  slug: string,
  source: string,
  lookup: SpellSourceLookup,
): string[] {
  const entry = lookup[source.toLowerCase()]?.[slug];
  if (!entry) return [];

  const classes = new Set<string>();
  for (const [classSource, classMap] of Object.entries(entry.class ?? {})) {
    if (isExcludedSource(classSource)) continue;
    for (const className of Object.keys(classMap)) {
      classes.add(slugify(className));
    }
  }
  return Array.from(classes).sort();
}

/**
 * Devuelve las subclases que otorgan el spell como bonus/extra (typicamente
 * domain spells, oath spells, patron spells, etc.).
 *
 * Lookup file shape:
 *   subclass.<classSource>.<ClassName>.<subclassSource>.<SubclassName>: { ... }
 *
 * Excluimos entries de classSource O subclassSource excluidos (XPHB, UA*).
 */
function extractSubclassGrants(
  slug: string,
  source: string,
  lookup: SpellSourceLookup,
): SubclassGrant[] {
  const entry = lookup[source.toLowerCase()]?.[slug];
  if (!entry?.subclass) return [];

  const grants: SubclassGrant[] = [];
  for (const [classSource, classMap] of Object.entries(entry.subclass)) {
    if (isExcludedSource(classSource)) continue;
    for (const [className, subclassSourceMap] of Object.entries(classMap)) {
      for (const [subclassSource, subclassMap] of Object.entries(subclassSourceMap)) {
        if (isExcludedSource(subclassSource)) continue;
        for (const subclassName of Object.keys(subclassMap as Record<string, unknown>)) {
          grants.push({
            classSlug: slugify(className),
            classSource,
            subclassSlug: slugify(subclassName),
            subclassSource,
            subclassName,
          });
        }
      }
    }
  }
  // Dedup por (classSlug + subclassSlug + classSource + subclassSource).
  const seen = new Set<string>();
  return grants
    .filter((g) => {
      const k = `${g.classSlug}|${g.subclassSlug}|${g.classSource}|${g.subclassSource}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) =>
      a.classSlug === b.classSlug
        ? a.subclassSlug.localeCompare(b.subclassSlug)
        : a.classSlug.localeCompare(b.classSlug),
    );
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
      const classes = extractBaseClasses(slug, s.source, lookup);
      const subclassGrants = extractSubclassGrants(slug, s.source, lookup);
      const ritual = parseRitual(s.meta);
      const concentration = parseConcentration(s.duration);
      const { componentsM, componentsMCost } = parseComponentsM(s.components?.m);

      out.push({
        slug,
        source: s.source,
        name: s.name,
        data: s,
        reprintedAs: parseReprintedAs(s.reprintedAs),
        level: s.level,
        school: s.school,
        classes,
        subclassGrants,
        ritual,
        concentration,
        componentsM,
        componentsMCost,
      });
    }
  }

  return out;
}
