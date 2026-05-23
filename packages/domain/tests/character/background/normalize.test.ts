import { describe, expect, it } from 'vitest';
import { normalizeAppliedBackground } from '../../../src/character/background/normalize.js';

// ── A.16 TEST-RED: normalizeAppliedBackground ─────────────────────────────────

describe('normalizeAppliedBackground — legacy fixture (no customization)', () => {
  it('upgrades legacy save cleanly — returns AppliedBackground with customization: undefined', () => {
    const legacy = {
      slug: 'custom',
      source: 'PHB',
      skills: ['perception', 'stealth'],
      languages: ['elvish'],
      tools: [],
    };
    const result = normalizeAppliedBackground(legacy);
    expect(result.slug).toBe('custom');
    expect(result.source).toBe('PHB');
    expect(result.skills).toEqual(['perception', 'stealth']);
    expect(result.languages).toEqual(['elvish']);
    expect(result.tools).toEqual([]);
    expect(result.customization).toBeUndefined();
  });

  it('fills in missing arrays with empty arrays (legacy minimal save)', () => {
    const minimal = { slug: 'acolyte', source: 'PHB' };
    const result = normalizeAppliedBackground(minimal);
    expect(result.skills).toEqual([]);
    expect(result.languages).toEqual([]);
    expect(result.tools).toEqual([]);
    expect(result.customization).toBeUndefined();
  });
});

describe('normalizeAppliedBackground — current-shape passthrough (idempotent)', () => {
  it('passes through current-shape with customization unchanged', () => {
    const current = {
      slug: 'custom',
      source: 'PHB',
      skills: ['perception', 'stealth'],
      languages: [],
      tools: [],
      customization: {
        mixedPool: { shape: 'lang2', langs: ['elvish', 'dwarvish'], tools: [] },
        equipment: { kind: 'coin' },
        feature: { slug: 'acolyte-shelter-of-the-faithful' },
      },
    };
    const result = normalizeAppliedBackground(current);
    expect(result.customization?.mixedPool?.shape).toBe('lang2');
    expect(result.customization?.equipment?.kind).toBe('coin');
    expect(result.customization?.feature?.slug).toBe('acolyte-shelter-of-the-faithful');
  });

  it('is idempotent — calling twice produces same result', () => {
    const current = {
      slug: 'acolyte',
      source: 'PHB',
      skills: ['insight', 'religion'],
      languages: ['draconic'],
      tools: [],
    };
    const first = normalizeAppliedBackground(current);
    const second = normalizeAppliedBackground(first);
    expect(second).toEqual(first);
  });
});

describe('normalizeAppliedBackground — partial customization (mixedPool only)', () => {
  it('preserves mixedPool sub-key, leaves equipment and feature as undefined', () => {
    const partial = {
      slug: 'custom',
      source: 'PHB',
      skills: ['perception', 'stealth'],
      languages: [],
      tools: [],
      customization: {
        mixedPool: { shape: 'lang2', langs: ['elvish', 'dwarvish'], tools: [] },
      },
    };
    const result = normalizeAppliedBackground(partial);
    expect(result.customization?.mixedPool?.shape).toBe('lang2');
    expect(result.customization?.equipment).toBeUndefined();
    expect(result.customization?.feature).toBeUndefined();
  });
});

describe('normalizeAppliedBackground — missing slug/source throws', () => {
  it('throws when slug is missing', () => {
    expect(() =>
      normalizeAppliedBackground({ source: 'PHB', skills: [], languages: [], tools: [] }),
    ).toThrow();
  });

  it('throws when source is missing', () => {
    expect(() =>
      normalizeAppliedBackground({ slug: 'acolyte', skills: [], languages: [], tools: [] }),
    ).toThrow();
  });

  it('throws when slug is empty string', () => {
    expect(() =>
      normalizeAppliedBackground({ slug: '', source: 'PHB', skills: [], languages: [], tools: [] }),
    ).toThrow();
  });
});

describe('normalizeAppliedBackground — corrupt customization sub-tree stripped', () => {
  it('strips corrupt customization and returns customization: undefined', () => {
    const corrupt = {
      slug: 'custom',
      source: 'PHB',
      skills: ['perception', 'stealth'],
      languages: [],
      tools: [],
      customization: { mixedPool: { shape: 'invalid-shape', langs: 'notanarray', tools: [] } },
    };
    const result = normalizeAppliedBackground(corrupt);
    // Root fields are preserved
    expect(result.slug).toBe('custom');
    expect(result.skills).toEqual(['perception', 'stealth']);
    // Corrupt customization is stripped
    expect(result.customization).toBeUndefined();
  });

  it('does NOT throw on corrupt customization (self-healing)', () => {
    const corrupt = {
      slug: 'acolyte',
      source: 'PHB',
      skills: [],
      languages: [],
      tools: [],
      customization: 'this is not an object',
    };
    expect(() => normalizeAppliedBackground(corrupt)).not.toThrow();
    const result = normalizeAppliedBackground(corrupt);
    expect(result.customization).toBeUndefined();
  });
});
