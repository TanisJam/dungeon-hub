import { assertDataDir } from './reader.js';
import { importRaces } from './importers/races.js';
import { importClassesAndSubclasses } from './importers/classes.js';
import { importBackgrounds } from './importers/backgrounds.js';
import { importSpells } from './importers/spells.js';
import { importItems } from './importers/items.js';
import { importFeats } from './importers/feats.js';
import { importOptionalFeatures } from './importers/optional-features.js';
import { importMonsters } from './importers/monsters.js';
import { importConditions } from './importers/conditions.js';
import { importLanguages } from './importers/languages.js';
import { importActions } from './importers/actions.js';
import type { ImportResult } from './types.js';

export * from './types.js';
export { slugify, parseReprintedAs, isExcludedSource } from './normalize.js';

/**
 * Dedup defensivo: si hay dos registros con la misma (slug, source), conserva
 * el primero y emite warning. Evita errores de "duplicate key" en la DB.
 */
function dedup<T extends { slug: string; source: string; name: string }>(
  records: T[],
  kind: string,
  warnings: string[],
): T[] {
  const seen = new Map<string, T>();
  for (const r of records) {
    const key = `${r.slug}|${r.source}`;
    if (seen.has(key)) {
      warnings.push(`Dup ${kind}: "${r.name}" (${r.source}) duplicado, se conserva el primero`);
      continue;
    }
    seen.set(key, r);
  }
  return Array.from(seen.values());
}

/**
 * Parsea toda la data del directorio `data/5etools/data/` y devuelve registros
 * normalizados listos para upsert en la DB.
 *
 * NO escribe en la DB — eso lo hace el consumidor (apps/api/scripts/import-5etools.ts).
 *
 * @param dataDir ruta absoluta a `<repo>/data/5etools/data/`
 */
export async function parseAll(dataDir: string): Promise<ImportResult> {
  assertDataDir(dataDir);
  const warnings: string[] = [];

  const [
    races,
    classesResult,
    backgrounds,
    spells,
    items,
    feats,
    optionalFeatures,
    monsters,
    conditions,
    languages,
    actions,
  ] = await Promise.all([
    importRaces(dataDir, warnings),
    importClassesAndSubclasses(dataDir, warnings),
    importBackgrounds(dataDir),
    importSpells(dataDir),
    importItems(dataDir),
    importFeats(dataDir),
    importOptionalFeatures(dataDir),
    importMonsters(dataDir, warnings),
    importConditions(dataDir),
    importLanguages(dataDir),
    importActions(dataDir),
  ]);

  return {
    races: dedup(races, 'race', warnings),
    classes: dedup(classesResult.classes, 'class', warnings),
    subclasses: dedup(classesResult.subclasses, 'subclass', warnings),
    backgrounds: dedup(backgrounds, 'background', warnings),
    spells: dedup(spells, 'spell', warnings),
    items: dedup(items, 'item', warnings),
    feats: dedup(feats, 'feat', warnings),
    optionalFeatures: dedup(optionalFeatures, 'optional-feature', warnings),
    monsters: dedup(monsters, 'monster', warnings),
    conditions: dedup(conditions, 'condition', warnings),
    languages: dedup(languages, 'language', warnings),
    actions: dedup(actions, 'action', warnings),
    warnings,
  };
}
