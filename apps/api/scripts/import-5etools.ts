/**
 * Importa la data de 5etools desde data/5etools/data/ a la DB.
 * Idempotente: hace upsert por (slug, source).
 *
 * Uso: pnpm import:5etools  [opcionalmente: --dataDir=/path/to/5etools/data]
 */

import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAll } from '@dungeon-hub/compendium-import';
import { db } from '../src/infra/db/client.js';
import {
  compendiumRaces,
  compendiumClasses,
  compendiumSubclasses,
  compendiumBackgrounds,
  compendiumSpells,
  compendiumItems,
  compendiumFeats,
  compendiumOptionalFeatures,
} from '../src/infra/db/schema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Resolve data dir: <repo>/data/5etools/data/
function resolveDataDir(): string {
  const arg = process.argv.find((a) => a.startsWith('--dataDir='));
  if (arg) return resolve(arg.slice('--dataDir='.length));
  // apps/api/scripts/import-5etools.ts → ../../../data/5etools/data
  return resolve(join(__dirname, '..', '..', '..', 'data', '5etools', 'data'));
}

function fmt(n: number): string {
  return n.toLocaleString('en-US');
}

async function main() {
  const dataDir = resolveDataDir();
  console.log(`📚 Leyendo data desde: ${dataDir}`);
  const t0 = Date.now();

  const result = await parseAll(dataDir);

  console.log(`\n📦 Parseado en ${((Date.now() - t0) / 1000).toFixed(1)}s:`);
  console.log(`   - races:        ${fmt(result.races.length)}`);
  console.log(`   - classes:      ${fmt(result.classes.length)}`);
  console.log(`   - subclasses:   ${fmt(result.subclasses.length)}`);
  console.log(`   - backgrounds:  ${fmt(result.backgrounds.length)}`);
  console.log(`   - spells:       ${fmt(result.spells.length)}`);
  console.log(`   - items:        ${fmt(result.items.length)}`);
  console.log(`   - feats:        ${fmt(result.feats.length)}`);
  console.log(`   - opt-features: ${fmt(result.optionalFeatures.length)}`);
  if (result.warnings.length > 0) {
    console.log(`\n⚠️  ${result.warnings.length} warnings:`);
    for (const w of result.warnings.slice(0, 10)) console.log(`   - ${w}`);
    if (result.warnings.length > 10) console.log(`   ... y ${result.warnings.length - 10} más`);
  }

  console.log(`\n💾 Upserting en DB...`);
  const tDb = Date.now();

  // Cada upsert se hace en chunks para no estresar el insert.
  // ON CONFLICT (slug, source) DO UPDATE → idempotente.
  await db.transaction(async (tx) => {
    // Limpiar lo viejo? No — preferimos upsert para preservar IDs estables.

    if (result.races.length > 0) {
      await tx
        .insert(compendiumRaces)
        .values(
          result.races.map((r) => ({
            slug: r.slug,
            source: r.source,
            name: r.name,
            data: r.data,
            reprintedAs: r.reprintedAs ?? undefined,
            isSubrace: r.isSubrace,
            parentSlug: r.parentSlug,
            parentSource: r.parentSource,
          })),
        )
        .onConflictDoUpdate({
          target: [compendiumRaces.slug, compendiumRaces.source],
          set: {
            name: sqlExcluded('name'),
            data: sqlExcluded('data'),
            reprintedAs: sqlExcluded('reprinted_as'),
            isSubrace: sqlExcluded('is_subrace'),
            parentSlug: sqlExcluded('parent_slug'),
            parentSource: sqlExcluded('parent_source'),
          },
        });
    }

    if (result.classes.length > 0) {
      await tx
        .insert(compendiumClasses)
        .values(
          result.classes.map((c) => ({
            slug: c.slug,
            source: c.source,
            name: c.name,
            data: c.data,
            reprintedAs: c.reprintedAs ?? undefined,
          })),
        )
        .onConflictDoUpdate({
          target: [compendiumClasses.slug, compendiumClasses.source],
          set: {
            name: sqlExcluded('name'),
            data: sqlExcluded('data'),
            reprintedAs: sqlExcluded('reprinted_as'),
          },
        });
    }

    if (result.subclasses.length > 0) {
      await tx
        .insert(compendiumSubclasses)
        .values(
          result.subclasses.map((s) => ({
            slug: s.slug,
            source: s.source,
            name: s.name,
            classSlug: s.classSlug,
            classSource: s.classSource,
            data: s.data,
            reprintedAs: s.reprintedAs ?? undefined,
          })),
        )
        .onConflictDoUpdate({
          target: [compendiumSubclasses.slug, compendiumSubclasses.source],
          set: {
            name: sqlExcluded('name'),
            classSlug: sqlExcluded('class_slug'),
            classSource: sqlExcluded('class_source'),
            data: sqlExcluded('data'),
            reprintedAs: sqlExcluded('reprinted_as'),
          },
        });
    }

    if (result.backgrounds.length > 0) {
      await tx
        .insert(compendiumBackgrounds)
        .values(
          result.backgrounds.map((b) => ({
            slug: b.slug,
            source: b.source,
            name: b.name,
            data: b.data,
            reprintedAs: b.reprintedAs ?? undefined,
          })),
        )
        .onConflictDoUpdate({
          target: [compendiumBackgrounds.slug, compendiumBackgrounds.source],
          set: {
            name: sqlExcluded('name'),
            data: sqlExcluded('data'),
            reprintedAs: sqlExcluded('reprinted_as'),
          },
        });
    }

    // Spells y items pueden ser grandes — chunkeo de a 1000.
    await chunkedInsert(tx, result.spells, 1000, async (chunk) => {
      await tx
        .insert(compendiumSpells)
        .values(
          chunk.map((s) => ({
            slug: s.slug,
            source: s.source,
            name: s.name,
            level: s.level,
            school: s.school,
            classes: s.classes,
            subclassGrants: s.subclassGrants,
            data: s.data,
            reprintedAs: s.reprintedAs ?? undefined,
          })),
        )
        .onConflictDoUpdate({
          target: [compendiumSpells.slug, compendiumSpells.source],
          set: {
            name: sqlExcluded('name'),
            level: sqlExcluded('level'),
            school: sqlExcluded('school'),
            classes: sqlExcluded('classes'),
            subclassGrants: sqlExcluded('subclass_grants'),
            data: sqlExcluded('data'),
            reprintedAs: sqlExcluded('reprinted_as'),
          },
        });
    });

    await chunkedInsert(tx, result.items, 1000, async (chunk) => {
      await tx
        .insert(compendiumItems)
        .values(
          chunk.map((it) => ({
            slug: it.slug,
            source: it.source,
            name: it.name,
            type: it.type,
            weight: it.weight,
            data: it.data,
            reprintedAs: it.reprintedAs ?? undefined,
          })),
        )
        .onConflictDoUpdate({
          target: [compendiumItems.slug, compendiumItems.source],
          set: {
            name: sqlExcluded('name'),
            type: sqlExcluded('type'),
            weight: sqlExcluded('weight'),
            data: sqlExcluded('data'),
            reprintedAs: sqlExcluded('reprinted_as'),
          },
        });
    });

    if (result.feats.length > 0) {
      await tx
        .insert(compendiumFeats)
        .values(
          result.feats.map((f) => ({
            slug: f.slug,
            source: f.source,
            name: f.name,
            prerequisites: f.prerequisites,
            data: f.data,
            reprintedAs: f.reprintedAs ?? undefined,
          })),
        )
        .onConflictDoUpdate({
          target: [compendiumFeats.slug, compendiumFeats.source],
          set: {
            name: sqlExcluded('name'),
            prerequisites: sqlExcluded('prerequisites'),
            data: sqlExcluded('data'),
            reprintedAs: sqlExcluded('reprinted_as'),
          },
        });
    }

    if (result.optionalFeatures.length > 0) {
      await tx
        .insert(compendiumOptionalFeatures)
        .values(
          result.optionalFeatures.map((f) => ({
            slug: f.slug,
            source: f.source,
            name: f.name,
            featureType: f.featureType,
            prerequisites: f.prerequisites,
            data: f.data,
            reprintedAs: f.reprintedAs ?? undefined,
          })),
        )
        .onConflictDoUpdate({
          target: [compendiumOptionalFeatures.slug, compendiumOptionalFeatures.source],
          set: {
            name: sqlExcluded('name'),
            featureType: sqlExcluded('feature_type'),
            prerequisites: sqlExcluded('prerequisites'),
            data: sqlExcluded('data'),
            reprintedAs: sqlExcluded('reprinted_as'),
          },
        });
    }
  });

  console.log(`✅ Upsert completo en ${((Date.now() - tDb) / 1000).toFixed(1)}s`);
  console.log(`\n🎉 Import terminado en ${((Date.now() - t0) / 1000).toFixed(1)}s total`);

  process.exit(0);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

import { sql } from 'drizzle-orm';

function sqlExcluded(col: string) {
  return sql.raw(`excluded.${col}`);
}

async function chunkedInsert<T>(
  _tx: unknown,
  items: T[],
  chunkSize: number,
  fn: (chunk: T[]) => Promise<void>,
): Promise<void> {
  for (let i = 0; i < items.length; i += chunkSize) {
    await fn(items.slice(i, i + chunkSize));
  }
}

main().catch((err) => {
  console.error('❌ Import falló:', err);
  process.exit(1);
});
