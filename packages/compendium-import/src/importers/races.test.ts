/**
 * Tests for races importer — specifically the unnamed-subrace classifier.
 *
 * 5etools includes metadata-only subrace entries (no `name` field) for some PHB
 * races. The importer must drop pure-metadata stubs (Dragonborn/Half-Elf/Half-Orc/
 * Tiefling PHB) but lift mechanical content (Human PHB carries +1-to-all `ability`
 * in its unnamed subrace).
 */
import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { classifyUnnamedSubrace, importRaces } from './races.js';
import type { FiveeToolsSubrace } from '../types.js';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const DATA_DIR = join(REPO_ROOT, 'data/5etools/data');

describe('classifyUnnamedSubrace — unnamed subrace disposition', () => {
  it('returns "emit" when name is present (normal case)', () => {
    const s: FiveeToolsSubrace = {
      name: 'Hill',
      source: 'PHB',
      raceName: 'Dwarf',
      raceSource: 'PHB',
    };
    expect(classifyUnnamedSubrace(s)).toBe('emit');
  });

  it('returns "skip" for unnamed metadata-only stub (Half-Elf PHB shape)', () => {
    // Matches the actual races.json shape: srd/hasFluff metadata only, no mechanics.
    const s = {
      source: 'PHB',
      raceName: 'Half-Elf',
      raceSource: 'PHB',
      srd: true,
      hasFluff: true,
      hasFluffImages: true,
    } as unknown as FiveeToolsSubrace;
    expect(classifyUnnamedSubrace(s)).toBe('skip');
  });

  it('returns "skip" for unnamed Half-Orc PHB stub', () => {
    const s = {
      source: 'PHB',
      raceName: 'Half-Orc',
      raceSource: 'PHB',
      srd: true,
      hasFluff: true,
    } as unknown as FiveeToolsSubrace;
    expect(classifyUnnamedSubrace(s)).toBe('skip');
  });

  it('returns "skip" for unnamed Tiefling PHB stub', () => {
    const s = {
      source: 'PHB',
      raceName: 'Tiefling',
      raceSource: 'PHB',
      srd: true,
    } as unknown as FiveeToolsSubrace;
    expect(classifyUnnamedSubrace(s)).toBe('skip');
  });

  it('returns "skip" for unnamed Dragonborn PHB stub (10 ancestries come via expandDragonbornAncestries)', () => {
    const s = {
      source: 'PHB',
      raceName: 'Dragonborn',
      raceSource: 'PHB',
      srd: true,
      // _versions present but unused — expandDragonbornAncestries hardcodes from PHB p.34
      _versions: [],
    } as unknown as FiveeToolsSubrace;
    expect(classifyUnnamedSubrace(s)).toBe('skip');
  });

  it('returns "merge-ability" for unnamed Human PHB stub (ability lives on the subrace)', () => {
    // 5etools puts the base Human +1-to-all on an unnamed subrace; base race has no ability.
    const s = {
      source: 'PHB',
      raceName: 'Human',
      raceSource: 'PHB',
      ability: [{ str: 1, dex: 1, con: 1, int: 1, wis: 1, cha: 1 }],
    } as unknown as FiveeToolsSubrace;
    expect(classifyUnnamedSubrace(s)).toBe('merge-ability');
  });

  it('returns "skip" for unnamed subrace with empty ability array (defensive)', () => {
    const s = {
      source: 'PHB',
      raceName: 'Foo',
      raceSource: 'PHB',
      ability: [],
    } as unknown as FiveeToolsSubrace;
    expect(classifyUnnamedSubrace(s)).toBe('skip');
  });
});

// ---------------------------------------------------------------------------
// Integration: real races.json — verify the 5 unnamed-subrace stubs are
// handled correctly end-to-end. Reads the actual 5etools data file shipped
// with this repo.
// ---------------------------------------------------------------------------

describe('importRaces — real 5etools data integration', () => {
  it('emits zero rows with placeholder name "${raceName} Variant" (was the bug)', async () => {
    const warnings: string[] = [];
    const rows = await importRaces(DATA_DIR, warnings);
    const fakeVariants = rows.filter((r) => r.name.endsWith(' Variant'));
    expect(fakeVariants).toEqual([]);
  });

  it('Half-Elf PHB has zero unnamed-stub subrace rows', async () => {
    const warnings: string[] = [];
    const rows = await importRaces(DATA_DIR, warnings);
    const halfElfStubs = rows.filter(
      (r) => r.parentSlug === 'half-elf' && r.parentSource === 'PHB' && r.name === 'Half-Elf Variant',
    );
    expect(halfElfStubs).toEqual([]);
  });

  it('Half-Orc PHB has zero unnamed-stub subrace rows', async () => {
    const warnings: string[] = [];
    const rows = await importRaces(DATA_DIR, warnings);
    const halfOrcStubs = rows.filter(
      (r) => r.parentSlug === 'half-orc' && r.parentSource === 'PHB' && r.name === 'Half-Orc Variant',
    );
    expect(halfOrcStubs).toEqual([]);
  });

  it('Tiefling PHB has zero unnamed-stub subrace rows', async () => {
    const warnings: string[] = [];
    const rows = await importRaces(DATA_DIR, warnings);
    const tieflingStubs = rows.filter(
      (r) => r.parentSlug === 'tiefling' && r.parentSource === 'PHB' && r.name === 'Tiefling Variant',
    );
    expect(tieflingStubs).toEqual([]);
  });

  it('Human PHB base race row has its +1-to-all ability lifted from the unnamed subrace', async () => {
    const warnings: string[] = [];
    const rows = await importRaces(DATA_DIR, warnings);
    const humanBase = rows.find(
      (r) => !r.isSubrace && r.slug === 'human' && r.source === 'PHB',
    );
    expect(humanBase).toBeDefined();
    const ability = (humanBase!.data as Record<string, unknown>)['ability'];
    expect(ability).toEqual([{ str: 1, dex: 1, con: 1, int: 1, wis: 1, cha: 1 }]);
  });

  it('preserves SCAG Half-Elf variants (Aquatic/Drow/Wood/Moon-or-Sun Elf Descent)', async () => {
    // Decision: SCAG stays enabled in default rules profile. The stub-skip logic
    // must NOT affect named SCAG subraces.
    const warnings: string[] = [];
    const rows = await importRaces(DATA_DIR, warnings);
    const scagHalfElf = rows.filter(
      (r) =>
        r.parentSlug === 'half-elf' &&
        r.source === 'SCAG' &&
        r.name.startsWith('Variant;'),
    );
    expect(scagHalfElf.length).toBeGreaterThanOrEqual(4);
  });

  it('emits the canonical "Variant" Human subrace (Variant Human rules, PHB p.31)', async () => {
    // The named "Variant" Human subrace is distinct from the unnamed metadata stub.
    // It carries the +1×2 / feat / skill grant — must still be emitted.
    const warnings: string[] = [];
    const rows = await importRaces(DATA_DIR, warnings);
    const variantHuman = rows.find(
      (r) =>
        r.parentSlug === 'human' &&
        r.parentSource === 'PHB' &&
        r.name === 'Variant' &&
        r.source === 'PHB',
    );
    expect(variantHuman).toBeDefined();
  });
});
