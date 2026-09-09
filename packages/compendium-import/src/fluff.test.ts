/**
 * Unit tests for the fluff matcher — `buildFluffMap` / `findFluffMatch` /
 * `attachFluff`. Uses small synthetic rows (not the real dataset — see
 * `fluff.integration.test.ts` for assertions against the pinned 5etools
 * dataset), in the style of `resolve-copy.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { attachFluff, buildFluffMap, findFluffMatch, type FluffRow } from './fluff.js';
import type { NormalizedRecord } from './types.js';

function record(name: string, source: string, data: Record<string, unknown> = {}): NormalizedRecord {
  return {
    slug: name.toLowerCase(),
    source,
    name,
    reprintedAs: null,
    data: { name, source, ...data },
  };
}

describe('findFluffMatch — direct key', () => {
  it('matches a base record by trimmed, lower-cased name|source', () => {
    const fluffMap = buildFluffMap(
      [{ name: 'Dwarf', source: 'PHB', entries: ['Dwarves are stout.'] }],
      [],
      'race fluff',
    );
    const match = findFluffMatch(record('Dwarf', 'PHB'), fluffMap);
    expect(match).toEqual(['Dwarves are stout.']);
  });

  it('is case- and whitespace-insensitive on both sides', () => {
    const fluffMap = buildFluffMap(
      [{ name: '  Dwarf  ', source: ' phb ', entries: ['text'] }],
      [],
      'race fluff',
    );
    const match = findFluffMatch(record('DWARF', 'PHB'), fluffMap);
    expect(match).toEqual(['text']);
  });
});

describe('findFluffMatch — composed subrace key', () => {
  it('falls back to "<raceName> (<name>)" when the direct key misses', () => {
    const fluffMap = buildFluffMap(
      [{ name: 'Tiefling (Asmodeus)', source: 'MTF', entries: ['To be greeted with stares...'] }],
      [],
      'race fluff',
    );
    const subrace = record('Asmodeus', 'MTF', { raceName: 'Tiefling' });
    const match = findFluffMatch(subrace, fluffMap);
    expect(match).toEqual(['To be greeted with stares...']);
  });

  it('tries the direct key first and only falls back when it misses', () => {
    const fluffMap = buildFluffMap(
      [
        { name: 'Asmodeus', source: 'MTF', entries: ['direct hit'] },
        { name: 'Tiefling (Asmodeus)', source: 'MTF', entries: ['composed hit'] },
      ],
      [],
      'race fluff',
    );
    const subrace = record('Asmodeus', 'MTF', { raceName: 'Tiefling' });
    const match = findFluffMatch(subrace, fluffMap);
    expect(match).toEqual(['direct hit']);
  });

  it('does not attempt a composed key for a record with no raceName (base race)', () => {
    const fluffMap = buildFluffMap(
      [{ name: 'Tiefling (Asmodeus)', source: 'MTF', entries: ['text'] }],
      [],
      'race fluff',
    );
    const baseRace = record('Asmodeus', 'MTF');
    expect(findFluffMatch(baseRace, fluffMap)).toBeUndefined();
  });
});

describe('findFluffMatch — no match', () => {
  it('returns undefined when neither the direct nor composed key is present', () => {
    const fluffMap = buildFluffMap([{ name: 'Elf', source: 'PHB', entries: ['text'] }], [], 'race fluff');
    expect(findFluffMatch(record('Dwarf', 'PHB'), fluffMap)).toBeUndefined();
  });
});

describe('buildFluffMap — images-only records', () => {
  it('excludes a record whose entries are missing (images-only fluff)', () => {
    const rows: FluffRow[] = [{ name: 'Ring of Jumping', source: 'DMG', images: ['https://cdn/img.png'] }];
    const fluffMap = buildFluffMap(rows, [], 'item fluff');
    expect(fluffMap.size).toBe(0);
  });

  it('excludes a record whose entries array is empty', () => {
    const rows: FluffRow[] = [{ name: 'Ring of Jumping', source: 'DMG', entries: [], images: ['x'] }];
    const fluffMap = buildFluffMap(rows, [], 'item fluff');
    expect(fluffMap.size).toBe(0);
  });
});

describe('attachFluff — no match yields no fluff key', () => {
  it('leaves data untouched when there is no match', () => {
    const fluffMap = buildFluffMap([{ name: 'Elf', source: 'PHB', entries: ['text'] }], [], 'race fluff');
    const rec = record('Dwarf', 'PHB');
    attachFluff([rec], fluffMap);
    expect(rec.data).not.toHaveProperty('fluff');
  });

  it('attaches data.fluff (never merged into entries) on a match', () => {
    const fluffMap = buildFluffMap([{ name: 'Dwarf', source: 'PHB', entries: ['lore'] }], [], 'race fluff');
    const rec = record('Dwarf', 'PHB', { entries: [{ name: 'Darkvision' }] });
    attachFluff([rec], fluffMap);
    const data = rec.data as Record<string, unknown>;
    expect(data['fluff']).toEqual(['lore']);
    expect(data['entries']).toEqual([{ name: 'Darkvision' }]);
  });
});

describe('buildFluffMap — _copy-based fluff record resolving', () => {
  it('resolves a fluff row whose text comes entirely from its _copy base', () => {
    const rows: FluffRow[] = [
      { name: 'Goblin', source: 'MPMM', entries: ['Goblins are small and cunning.'] },
      { name: 'Boggart', source: 'LFL', _copy: { name: 'Goblin', source: 'MPMM' } },
    ];
    const warnings: string[] = [];
    const fluffMap = buildFluffMap(rows, warnings, 'race fluff');
    expect(warnings).toEqual([]);
    expect(fluffMap.get('boggart|lfl')).toEqual(['Goblins are small and cunning.']);
  });

  it('warns (does not throw) and produces no entry when the _copy base is missing', () => {
    const rows: FluffRow[] = [{ name: 'Orphan', source: 'LFL', _copy: { name: 'Ghost', source: 'XPHB' } }];
    const warnings: string[] = [];
    expect(() => buildFluffMap(rows, warnings, 'race fluff')).not.toThrow();
    expect(warnings.some((w) => w.includes('Orphan') && w.includes('not found'))).toBe(true);
    expect(buildFluffMap(rows, [], 'race fluff').size).toBe(0);
  });
});
