/**
 * Tests for extractCompendiumRefs.
 *
 * REQ-IMPORT-REFS-01: every compendium reference that a re-imported character
 * carries (race, subrace, class, subclass, background, spell, item) must be
 * extractable from the raw `character.data` / `character.inventory` blobs so
 * the importer can resolve them against the target database before persisting.
 */
import { describe, expect, it } from 'vitest';
import { extractCompendiumRefs } from './extract-refs.js';

describe('extractCompendiumRefs', () => {
  it('extracts race and subrace refs', () => {
    const data = {
      race: { slug: 'elf', source: 'PHB' },
      subrace: { slug: 'high-elf', source: 'PHB' },
    };
    const refs = extractCompendiumRefs(data, []);
    expect(refs).toContainEqual({ kind: 'race', slug: 'elf', source: 'PHB' });
    expect(refs).toContainEqual({ kind: 'subrace', slug: 'high-elf', source: 'PHB' });
  });

  it('extracts class and subclass refs from data.classes[]', () => {
    const data = {
      classes: [
        {
          slug: 'wizard',
          source: 'PHB',
          level: 3,
          subclass: { slug: 'evocation', source: 'PHB' },
        },
        { slug: 'fighter', source: 'PHB', level: 1, subclass: null },
      ],
    };
    const refs = extractCompendiumRefs(data, []);
    expect(refs).toContainEqual({ kind: 'class', slug: 'wizard', source: 'PHB' });
    expect(refs).toContainEqual({ kind: 'subclass', slug: 'evocation', source: 'PHB' });
    expect(refs).toContainEqual({ kind: 'class', slug: 'fighter', source: 'PHB' });
    // null subclass yields no subclass ref
    expect(refs.filter((r) => r.kind === 'subclass')).toHaveLength(1);
  });

  it('extracts background ref', () => {
    const data = { background: { slug: 'acolyte', source: 'PHB' } };
    const refs = extractCompendiumRefs(data, []);
    expect(refs).toContainEqual({ kind: 'background', slug: 'acolyte', source: 'PHB' });
  });

  it('extracts spell refs from data.spells[classSlug].{cantrips,known,prepared}', () => {
    const data = {
      spells: {
        wizard: {
          cantrips: [{ slug: 'fire-bolt', source: 'PHB' }],
          known: [{ slug: 'magic-missile', source: 'PHB' }],
          prepared: [{ slug: 'shield', source: 'PHB' }],
        },
      },
    };
    const refs = extractCompendiumRefs(data, []);
    expect(refs).toContainEqual({ kind: 'spell', slug: 'fire-bolt', source: 'PHB' });
    expect(refs).toContainEqual({ kind: 'spell', slug: 'magic-missile', source: 'PHB' });
    expect(refs).toContainEqual({ kind: 'spell', slug: 'shield', source: 'PHB' });
  });

  it('extracts item refs from inventory[].{itemSlug,itemSource}', () => {
    const inventory = [
      { instanceId: 'a', itemSlug: 'longsword', itemSource: 'PHB' },
      { instanceId: 'b', itemSlug: 'shield', itemSource: 'PHB' },
    ];
    const refs = extractCompendiumRefs({}, inventory);
    expect(refs).toContainEqual({ kind: 'item', slug: 'longsword', source: 'PHB' });
    expect(refs).toContainEqual({ kind: 'item', slug: 'shield', source: 'PHB' });
  });

  it('deduplicates identical refs (same kind+slug+source)', () => {
    const data = {
      classes: [
        { slug: 'wizard', source: 'PHB', level: 1, subclass: null },
        { slug: 'wizard', source: 'PHB', level: 1, subclass: null },
      ],
    };
    const refs = extractCompendiumRefs(data, []);
    expect(refs.filter((r) => r.kind === 'class' && r.slug === 'wizard')).toHaveLength(1);
  });

  it('ignores malformed/partial entries without throwing', () => {
    const data = {
      race: { slug: 'elf' }, // missing source
      classes: [null, { slug: '', source: 'PHB' }, 'not-an-object'],
      background: 'not-an-object',
      spells: { wizard: { cantrips: 'not-an-array' } },
    };
    expect(() => extractCompendiumRefs(data as never, [null, 42, {}] as never)).not.toThrow();
    const refs = extractCompendiumRefs(data as never, [null, 42, {}] as never);
    expect(refs).toEqual([]);
  });

  it('returns empty array for empty data and inventory', () => {
    expect(extractCompendiumRefs({}, [])).toEqual([]);
  });
});
