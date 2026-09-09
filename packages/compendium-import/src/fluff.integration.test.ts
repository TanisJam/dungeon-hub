/**
 * Integration assertions for fluff attachment against the real pinned
 * 5etools dataset (`data/5etools/data/`), in the style of
 * `resolve-copy.integration.test.ts`.
 *
 * Skip-on-absent: the whole suite skips cleanly when the dataset is not on
 * disk (e.g. a fresh clone in CI without `data/5etools/data/`).
 */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { parseAll } from './index.js';
import type { ImportResult, NormalizedRecord } from './types.js';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const DATA_DIR = join(REPO_ROOT, 'data/5etools/data');

const DEFAULT_PROFILE_SOURCES = new Set([
  'PHB',
  'DMG',
  'XGE',
  'TCE',
  'MPMM',
  'MTF',
  'SCAG',
  'FTD',
  'VGM',
  'EGW',
]);

function hasFluff(record: NormalizedRecord): boolean {
  const data = record.data as { fluff?: unknown[] };
  return Array.isArray(data.fluff) && data.fluff.length > 0;
}

function countFluff(records: NormalizedRecord[]): { total: number; defaultProfile: number } {
  const withFluff = records.filter(hasFluff);
  return {
    total: withFluff.length,
    defaultProfile: withFluff.filter((r) => DEFAULT_PROFILE_SOURCES.has(r.source)).length,
  };
}

describe.skipIf(!existsSync(DATA_DIR))('fluff attachment — real 5etools data integration', () => {
  let result: ImportResult;

  beforeAll(async () => {
    result = await parseAll(DATA_DIR);
  }, 120_000);

  it('races: 184 rows gain data.fluff overall, 91 from the default-profile sources', () => {
    const { total, defaultProfile } = countFluff(result.races);
    expect(total).toBe(184);
    expect(defaultProfile).toBe(91);
  });

  it('backgrounds: at least 151 rows gain data.fluff overall, at least 38 from the default-profile sources', () => {
    const { total, defaultProfile } = countFluff(result.backgrounds);
    expect(total).toBeGreaterThanOrEqual(151);
    expect(defaultProfile).toBeGreaterThanOrEqual(38);
  });

  it('classes: 14 rows gain data.fluff overall, 13 from the default-profile sources', () => {
    const { total, defaultProfile } = countFluff(result.classes);
    expect(total).toBe(14);
    expect(defaultProfile).toBe(13);
  });

  it('Asmodeus[MTF] (Tiefling subrace) gets its fluff via the composed "raceName (name)" key', () => {
    const asmodeus = result.races.find((r) => r.name === 'Asmodeus' && r.source === 'MTF');
    expect(asmodeus).toBeDefined();
    const data = asmodeus!.data as { fluff?: unknown[] };
    expect(Array.isArray(data.fluff)).toBe(true);
    expect(data.fluff!.length).toBeGreaterThan(0);

    // Only recurses into `entries` (the 5etools prose container) — ignores
    // sibling keys like `type`/`name`, which are also strings but not lore.
    const flattenText = (value: unknown): string[] => {
      if (typeof value === 'string') return [value];
      if (Array.isArray(value)) return value.flatMap(flattenText);
      if (value && typeof value === 'object' && 'entries' in (value as Record<string, unknown>)) {
        return flattenText((value as Record<string, unknown>)['entries']);
      }
      return [];
    };
    const texts = flattenText(data.fluff);
    // prependArr puts the Asmodeus-specific paragraph ahead of the generic
    // tiefling lore inherited from the base row; both must survive.
    expect(texts[0]).toMatch(/^The tieflings connected to Nessus/);
    expect(texts.join(' ')).toMatch(/To be greeted with stares and whispers/);
  });

  // prependArr carries 68 of the 71 `_mod` operations in fluff-races.json, and it is
  // what puts the SUBRACE-specific lore in front of the inherited base-race text.
  // Treating it as an unknown no-op silently degraded every marquee subrace to the
  // generic parent blurb, so these rows are the regression guard for that.
  it.each([
    ['High', 'PHB', /^As a high elf, you have a keen mind/],
    ['Hill', 'PHB', /^As a hill dwarf, you have keen senses/],
    ['Drow', 'PHB', /^As a drow, you are infused with the magic of the Underdark/],
    ['Protector', 'VGM', /^Protector aasimar are charged by the powers of good/],
  ])('subrace %s[%s] leads with its own lore, not the base race blurb', (name, source, expected) => {
    const row = result.races.find((r) => r.name === name && r.source === source);
    expect(row).toBeDefined();
    const data = row!.data as { fluff?: unknown[] };
    expect(Array.isArray(data.fluff)).toBe(true);

    const flattenText = (value: unknown): string[] => {
      if (typeof value === 'string') return [value];
      if (Array.isArray(value)) return value.flatMap(flattenText);
      if (value && typeof value === 'object' && 'entries' in (value as Record<string, unknown>)) {
        return flattenText((value as Record<string, unknown>)['entries']);
      }
      return [];
    };
    expect(flattenText(data.fluff)[0]).toMatch(expected);
  });

  it('no fluff _copy directive uses a _mod mode the resolver does not implement', () => {
    const unknownMode = result.warnings.filter((w) => /unknown .*mode|unsupported .*mode/i.test(w));
    expect(unknownMode).toEqual([]);
  });

  it('fluff never lands in data.entries — races, backgrounds and classes with fluff still separate mechanics', () => {
    const allWithFluff = [...result.races, ...result.backgrounds, ...result.classes].filter(hasFluff);
    expect(allWithFluff.length).toBeGreaterThan(0);
    for (const record of allWithFluff) {
      const data = record.data as { entries?: unknown[]; fluff?: unknown[] };
      // entries (when present) must never contain the fluff array by reference or by value merge.
      expect(data.entries).not.toBe(data.fluff);
    }
  });

  it('items, feats and languages never gain data.fluff (excluded scope)', () => {
    const anyItemFluff = result.items.some(hasFluff);
    const anyFeatFluff = result.feats.some(hasFluff);
    const anyLanguageFluff = result.languages.some(hasFluff);
    expect(anyItemFluff).toBe(false);
    expect(anyFeatFluff).toBe(false);
    expect(anyLanguageFluff).toBe(false);
  });
});
