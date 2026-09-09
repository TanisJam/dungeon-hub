/**
 * Integration assertions for `_copy` resolution against the real pinned
 * 5etools dataset (`data/5etools/data/`), in the style of
 * `seed-pack.smoke.test.ts`.
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

// The 7 bases that are permanently unresolvable because they live in
// sources stripped by `isExcludedSource` (XPHB/XDMG/XMM/XPsiHB/UA*).
const UNRESOLVABLE_ROWS: Array<{ name: string; source: string; baseName: string; baseSource: string }> = [
  { name: 'Elf', source: 'LFL', baseName: 'Elf', baseSource: 'XPHB' },
  { name: 'Kithkin', source: 'LFL', baseName: 'Halfling', baseSource: 'XPHB' },
  { name: 'Cloak of Billowing', source: 'WttHC', baseName: 'Cloak of Billowing', baseSource: 'XDMG' },
  {
    name: 'Crusading Wand of Celestial Prowess',
    source: 'AU',
    baseName: '+1 Wand of the War Mage',
    baseSource: 'XDMG',
  },
  { name: 'Dread Helm', source: 'WttHC', baseName: 'Dread Helm', baseSource: 'XDMG' },
  { name: 'Prosthetic Limb', source: 'FRHoF', baseName: 'Prosthetic Limb', baseSource: 'XDMG' },
  {
    name: 'Vigilant Rod of the Honed Mind',
    source: 'AU',
    baseName: '+1 Rod of the Pact Keeper',
    baseSource: 'XDMG',
  },
];

const BACKGROUND_SOURCES_WITH_ZERO_UNRESOLVED = [
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
];

describe.skipIf(!existsSync(DATA_DIR))('_copy resolution — real 5etools data integration', () => {
  let result: ImportResult;

  beforeAll(async () => {
    result = await parseAll(DATA_DIR);
  }, 120_000);

  it('Variant Criminal (Spy)[PHB] resolves and gains "Feature: Spy Contact"', () => {
    const spy = result.backgrounds.find(
      (b) => b.name === 'Variant Criminal (Spy)' && b.source === 'PHB',
    );
    expect(spy).toBeDefined();
    const data = spy!.data as { entries?: unknown[]; _copy?: unknown };
    expect(data._copy).toBeUndefined();
    const entryNames = (data.entries ?? [])
      .filter((e): e is { name: string } => typeof e === 'object' && e !== null && 'name' in e)
      .map((e) => e.name);
    expect(entryNames).toContain('Feature: Spy Contact');
  });

  it('Augen Trust (Spy)[EGW] chains through Variant Criminal (Spy)[PHB] and also gains the feature', () => {
    // Chained copy: Augen Trust (Spy)[EGW] --_copy--> Variant Criminal (Spy)[PHB]
    // --_copy--> Criminal[PHB]. Resolution must be recursive.
    const augen = result.backgrounds.find((b) => b.name === 'Augen Trust (Spy)' && b.source === 'EGW');
    expect(augen).toBeDefined();
    const data = augen!.data as { entries?: unknown[]; _copy?: unknown };
    expect(data._copy).toBeUndefined();
    const entryNames = (data.entries ?? [])
      .filter((e): e is { name: string } => typeof e === 'object' && e !== null && 'name' in e)
      .map((e) => e.name);
    expect(entryNames).toContain('Feature: Spy Contact');
  });

  it('zero background rows from the core sources still carry an unresolved _copy with empty entries', () => {
    const bySource = (source: string): NormalizedRecord[] =>
      result.backgrounds.filter((b) => b.source === source);

    const stillBroken = BACKGROUND_SOURCES_WITH_ZERO_UNRESOLVED.flatMap((source) =>
      bySource(source).filter((b) => {
        const data = b.data as { _copy?: unknown; entries?: unknown[] };
        return data._copy !== undefined && (data.entries ?? []).length === 0;
      }),
    );

    expect(stillBroken).toEqual([]);
  });

  it('the 7 permanently unresolvable rows still exist, are untouched, and produced warnings', () => {
    for (const row of UNRESOLVABLE_ROWS) {
      const all: NormalizedRecord[] = [
        ...result.races,
        ...result.items,
      ];
      const found = all.find((r) => r.name === row.name && r.source === row.source);
      expect(found, `expected to find ${row.name}|${row.source}`).toBeDefined();

      const data = found!.data as { _copy?: { name?: string; source?: string }; entries?: unknown[] };
      expect(data._copy, `${row.name}|${row.source} should still carry _copy`).toBeDefined();
      expect(data._copy!.name).toBe(row.baseName);
      expect(data._copy!.source).toBe(row.baseSource);

      const hasWarning = result.warnings.some(
        (w) => w.includes(row.name) && w.includes(row.source),
      );
      expect(hasWarning, `expected a warning mentioning ${row.name}|${row.source}`).toBe(true);
    }
  });
});
