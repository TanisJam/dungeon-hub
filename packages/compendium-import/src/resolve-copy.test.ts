/**
 * Unit tests for `resolveCopies` — 5etools `_copy` / `_copyProps` resolution.
 *
 * Uses small synthetic rows (not the real dataset — see
 * `resolve-copy.integration.test.ts` for assertions against the pinned
 * 5etools dataset) so each mode and edge case can be tested in isolation.
 */
import { describe, expect, it } from 'vitest';
import { resolveCopies } from './resolve-copy.js';

interface Row {
  name: string;
  source: string;
  entries?: unknown[];
  property?: string[];
  page?: number;
  reprintedAs?: string;
  hasFluffImages?: boolean;
  _copiedFrom?: string;
  _copy?: {
    name: string;
    source: string;
    _mod?: Record<string, unknown>;
    _preserve?: Record<string, boolean>;
  };
}

/** Runs `resolveCopies` and returns the row at `index` (asserted present — the array length is fixed by `rows`). */
function resolveAt(rows: Row[], warnings: string[], kind: string, index: number): Row {
  const out = resolveCopies(rows, warnings, kind);
  const row = out[index];
  if (!row) throw new Error(`resolveCopies returned no row at index ${index}`);
  return row;
}

describe('resolveCopies — appendArr', () => {
  it('appends items at the end of the target array', () => {
    const base: Row = {
      name: 'Base',
      source: 'PHB',
      entries: [{ name: 'First', type: 'entries', entries: ['a'] }],
    };
    const copy: Row = {
      name: 'Copy',
      source: 'XGE',
      _copy: {
        name: 'Base',
        source: 'PHB',
        _mod: { entries: { mode: 'appendArr', items: { name: 'Second', type: 'entries', entries: ['b'] } } },
      },
    };
    const warnings: string[] = [];
    const resolved = resolveAt([base, copy], warnings, 'test', 1);
    expect(warnings).toEqual([]);
    expect((resolved.entries as Array<{ name: string }>).map((e) => e.name)).toEqual(['First', 'Second']);
    expect(resolved._copy).toBeUndefined();
  });

  it('accepts an array of items', () => {
    const base: Row = { name: 'Base', source: 'PHB', entries: ['a'] };
    const copy: Row = {
      name: 'Copy',
      source: 'XGE',
      _copy: { name: 'Base', source: 'PHB', _mod: { entries: { mode: 'appendArr', items: ['b', 'c'] } } },
    };
    const resolved = resolveAt([base, copy], [], 'test', 1);
    expect(resolved.entries).toEqual(['a', 'b', 'c']);
  });
});

describe('resolveCopies — insertArr', () => {
  it('inserts at a positive index', () => {
    const base: Row = { name: 'Base', source: 'PHB', entries: ['a', 'b', 'c'] };
    const copy: Row = {
      name: 'Copy',
      source: 'XGE',
      _copy: { name: 'Base', source: 'PHB', _mod: { entries: { mode: 'insertArr', index: 1, items: 'x' } } },
    };
    const resolved = resolveAt([base, copy], [], 'test', 1);
    expect(resolved.entries).toEqual(['a', 'x', 'b', 'c']);
  });

  it('index -1 appends at the end', () => {
    const base: Row = { name: 'Base', source: 'PHB', entries: ['a', 'b'] };
    const copy: Row = {
      name: 'Copy',
      source: 'XGE',
      _copy: { name: 'Base', source: 'PHB', _mod: { entries: { mode: 'insertArr', index: -1, items: 'z' } } },
    };
    const resolved = resolveAt([base, copy], [], 'test', 1);
    expect(resolved.entries).toEqual(['a', 'b', 'z']);
  });

  it('index -2 inserts before the last element', () => {
    const base: Row = { name: 'Base', source: 'PHB', entries: ['a', 'b', 'c'] };
    const copy: Row = {
      name: 'Copy',
      source: 'XGE',
      _copy: { name: 'Base', source: 'PHB', _mod: { entries: { mode: 'insertArr', index: -2, items: 'y' } } },
    };
    const resolved = resolveAt([base, copy], [], 'test', 1);
    expect(resolved.entries).toEqual(['a', 'b', 'y', 'c']);
  });
});

describe('resolveCopies — appendIfNotExistsArr', () => {
  it('appends only items whose .name is not already present', () => {
    const base: Row = {
      name: 'Base',
      source: 'PHB',
      entries: [{ name: 'Kept', type: 'entries', entries: [] }],
    };
    const copy: Row = {
      name: 'Copy',
      source: 'XGE',
      _copy: {
        name: 'Base',
        source: 'PHB',
        _mod: {
          entries: {
            mode: 'appendIfNotExistsArr',
            items: [
              { name: 'Kept', type: 'entries', entries: ['duplicate — should not be added'] },
              { name: 'New', type: 'entries', entries: [] },
            ],
          },
        },
      },
    };
    const resolved = resolveAt([base, copy], [], 'test', 1);
    expect((resolved.entries as Array<{ name: string }>).map((e) => e.name)).toEqual(['Kept', 'New']);
  });

  it('dedups primitive items by value (e.g. item property codes)', () => {
    const base: Row = { name: 'Base', source: 'PHB', property: ['V', 'F'] };
    const copy: Row = {
      name: 'Copy',
      source: 'XGE',
      _copy: {
        name: 'Base',
        source: 'PHB',
        _mod: { property: { mode: 'appendIfNotExistsArr', items: ['F', 'A'] } },
      },
    };
    const resolved = resolveAt([base, copy], [], 'test', 1);
    expect(resolved.property).toEqual(['V', 'F', 'A']);
  });
});

describe('resolveCopies — replaceArr', () => {
  it('replaces by matching .name string', () => {
    const base: Row = {
      name: 'Base',
      source: 'PHB',
      entries: [{ name: 'Old Feature', type: 'entries', entries: ['old text'] }],
    };
    const copy: Row = {
      name: 'Copy',
      source: 'XGE',
      _copy: {
        name: 'Base',
        source: 'PHB',
        _mod: {
          entries: {
            mode: 'replaceArr',
            replace: 'Old Feature',
            items: { name: 'New Feature', type: 'entries', entries: ['new text'] },
          },
        },
      },
    };
    const warnings: string[] = [];
    const resolved = resolveAt([base, copy], warnings, 'test', 1);
    expect(resolved.entries).toEqual([{ name: 'New Feature', type: 'entries', entries: ['new text'] }]);
    expect(warnings).toEqual([]);
  });

  it('replaces by {index} object', () => {
    const base: Row = { name: 'Base', source: 'PHB', entries: ['a', 'b', 'c'] };
    const copy: Row = {
      name: 'Copy',
      source: 'XGE',
      _copy: { name: 'Base', source: 'PHB', _mod: { entries: { mode: 'replaceArr', replace: { index: 1 }, items: 'B2' } } },
    };
    const resolved = resolveAt([base, copy], [], 'test', 1);
    expect(resolved.entries).toEqual(['a', 'B2', 'c']);
  });

  it('warns and leaves the array unchanged when the target name is not found', () => {
    const base: Row = { name: 'Base', source: 'PHB', entries: [{ name: 'A', type: 'entries', entries: [] }] };
    const copy: Row = {
      name: 'Copy',
      source: 'XGE',
      _copy: {
        name: 'Base',
        source: 'PHB',
        _mod: { entries: { mode: 'replaceArr', replace: 'Missing', items: { name: 'B', type: 'entries', entries: [] } } },
      },
    };
    const warnings: string[] = [];
    const resolved = resolveAt([base, copy], warnings, 'test', 1);
    expect(resolved.entries).toEqual(base.entries);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/replaceArr target "Missing" not found/);
  });
});

describe('resolveCopies — replaceTxt', () => {
  it('replaces matching text throughout the target, honoring flags', () => {
    const base: Row = {
      name: 'Base',
      source: 'PHB',
      entries: [
        { name: 'Alignment', type: 'entries', entries: ['Goblins are typically neutral evil.'] },
        { type: 'entries', entries: ['goblins love mischief'] },
      ],
    };
    const copy: Row = {
      name: 'Copy',
      source: 'XGE',
      _copy: {
        name: 'Base',
        source: 'PHB',
        _mod: { entries: { mode: 'replaceTxt', replace: 'Goblins', with: 'Dankwood goblins', flags: 'i' } },
      },
    };
    const resolved = resolveAt([base, copy], [], 'test', 1);
    expect(resolved.entries).toEqual([
      { name: 'Alignment', type: 'entries', entries: ['Dankwood goblins are typically neutral evil.'] },
      { type: 'entries', entries: ['Dankwood goblins love mischief'] },
    ]);
  });

  it('applies multiple _mod operations for the same key in declaration order', () => {
    const base: Row = { name: 'Base', source: 'PHB', entries: [{ name: 'A', type: 'entries', entries: ['Goblin'] }] };
    const copy: Row = {
      name: 'Copy',
      source: 'XGE',
      _copy: {
        name: 'Base',
        source: 'PHB',
        _mod: {
          entries: [
            { mode: 'replaceTxt', replace: 'Goblin', with: 'Dankwood Goblin', flags: 'i' },
            { mode: 'appendArr', items: { name: 'B', type: 'entries', entries: [] } },
          ],
        },
      },
    };
    const resolved = resolveAt([base, copy], [], 'test', 1);
    const entries = resolved.entries as Array<{ name: string; entries: string[] }>;
    expect(entries.map((e) => e.name)).toEqual(['A', 'B']);
    expect(entries[0]?.entries).toEqual(['Dankwood Goblin']);
  });
});

describe('resolveCopies — _preserve', () => {
  it('restores a base prop that would otherwise be stripped', () => {
    const base: Row = { name: 'Base', source: 'PHB', page: 42, reprintedAs: 'Base2|PHB2' };
    const copy: Row = {
      name: 'Copy',
      source: 'XGE',
      _copy: { name: 'Base', source: 'PHB', _preserve: { reprintedAs: true } },
    };
    const resolved = resolveAt([base, copy], [], 'test', 1);
    // page is NOT preserved (not listed in _preserve) — stripped like any other base prop.
    expect(resolved.page).toBeUndefined();
    // reprintedAs IS preserved because _copy._preserve.reprintedAs is truthy.
    expect(resolved.reprintedAs).toBe('Base2|PHB2');
  });
});

describe('resolveCopies — pure inheritance (no _mod)', () => {
  it("inherits the base content unchanged aside from the copying row's own fields", () => {
    const base: Row = { name: 'Base', source: 'PHB', entries: [{ name: 'Feature', type: 'entries', entries: ['x'] }] };
    const copy: Row = { name: 'Copy', source: 'EGW', _copy: { name: 'Base', source: 'PHB' } };
    const resolved = resolveAt([base, copy], [], 'test', 1);
    expect(resolved.entries).toEqual(base.entries);
    expect(resolved.name).toBe('Copy');
    expect(resolved.source).toBe('EGW');
    expect(resolved._copiedFrom).toBe('Base|PHB');
  });
});

describe('resolveCopies — chained copies', () => {
  it('resolves a copy-of-a-copy recursively', () => {
    const base: Row = { name: 'A', source: 'PHB', entries: [{ name: 'Feat', type: 'entries', entries: ['base'] }] };
    const middle: Row = {
      name: 'B',
      source: 'PHB',
      _copy: {
        name: 'A',
        source: 'PHB',
        _mod: { entries: { mode: 'replaceArr', replace: 'Feat', items: { name: 'Feat', type: 'entries', entries: ['middle'] } } },
      },
    };
    const leaf: Row = { name: 'C', source: 'EGW', _copy: { name: 'B', source: 'PHB' } };
    const resolvedLeaf = resolveAt([base, middle, leaf], [], 'test', 2);
    expect(resolvedLeaf.entries).toEqual([{ name: 'Feat', type: 'entries', entries: ['middle'] }]);
    expect(resolvedLeaf._copiedFrom).toBe('B|PHB');
  });
});

describe('resolveCopies — missing base', () => {
  it('leaves the row untouched, pushes a warning, and does not throw', () => {
    const orphan: Row = { name: 'Orphan', source: 'LFL', _copy: { name: 'Ghost', source: 'XPHB' } };
    const warnings: string[] = [];
    let resolved: Row | undefined;
    expect(() => {
      resolved = resolveAt([orphan], warnings, 'test', 0);
    }).not.toThrow();
    expect(resolved).toBe(orphan);
    expect(resolved?._copy).toEqual({ name: 'Ghost', source: 'XPHB' });
    expect(warnings.some((w) => w.includes('Orphan') && w.includes('not found'))).toBe(true);
  });
});

describe('resolveCopies — cycle detection', () => {
  it('terminates without throwing and warns about the cycle', () => {
    const a: Row = { name: 'A', source: 'PHB', _copy: { name: 'B', source: 'PHB' } };
    const b: Row = { name: 'B', source: 'PHB', _copy: { name: 'A', source: 'PHB' } };
    const warnings: string[] = [];
    expect(() => resolveCopies([a, b], warnings, 'test')).not.toThrow();
    expect(warnings.some((w) => w.includes('cycle detected'))).toBe(true);
  });
});
