import { describe, expect, it } from 'vitest';
import {
  ARTISANS_TOOLS,
  GAMING_SETS,
  MUSICAL_INSTRUMENTS,
  TOOL_CATEGORY_MAP,
  expandToolFrom,
  patchAnyToolCount,
} from '../../../src/character/tool/pools.js';

describe('Pool constants', () => {
  it('ARTISANS_TOOLS has exactly 17 slugs', () => {
    expect(ARTISANS_TOOLS).toHaveLength(17);
  });

  it('MUSICAL_INSTRUMENTS has exactly 10 slugs', () => {
    expect(MUSICAL_INSTRUMENTS).toHaveLength(10);
  });

  it('GAMING_SETS has exactly 4 slugs', () => {
    expect(GAMING_SETS).toHaveLength(4);
  });

  it('ARTISANS_TOOLS slugs are all lowercase', () => {
    for (const slug of ARTISANS_TOOLS) {
      expect(slug).toBe(slug.toLowerCase());
    }
  });

  it('MUSICAL_INSTRUMENTS slugs are all lowercase', () => {
    for (const slug of MUSICAL_INSTRUMENTS) {
      expect(slug).toBe(slug.toLowerCase());
    }
  });

  it('GAMING_SETS slugs are all lowercase', () => {
    for (const slug of GAMING_SETS) {
      expect(slug).toBe(slug.toLowerCase());
    }
  });
});

describe('TOOL_CATEGORY_MAP', () => {
  it('maps camelCase "anyArtisansTool" to ARTISANS_TOOLS', () => {
    expect(TOOL_CATEGORY_MAP['anyArtisansTool']).toBe(ARTISANS_TOOLS);
  });

  it('maps spaced "artisan\'s tools" to ARTISANS_TOOLS', () => {
    expect(TOOL_CATEGORY_MAP["artisan's tools"]).toBe(ARTISANS_TOOLS);
  });

  it('maps camelCase "anyMusicalInstrument" to MUSICAL_INSTRUMENTS', () => {
    expect(TOOL_CATEGORY_MAP['anyMusicalInstrument']).toBe(MUSICAL_INSTRUMENTS);
  });

  it('maps spaced "musical instrument" to MUSICAL_INSTRUMENTS', () => {
    expect(TOOL_CATEGORY_MAP['musical instrument']).toBe(MUSICAL_INSTRUMENTS);
  });

  it('maps camelCase "anyGamingSet" to GAMING_SETS', () => {
    expect(TOOL_CATEGORY_MAP['anyGamingSet']).toBe(GAMING_SETS);
  });

  it('maps spaced "gaming set" to GAMING_SETS', () => {
    expect(TOOL_CATEGORY_MAP['gaming set']).toBe(GAMING_SETS);
  });
});

describe('expandToolFrom', () => {
  it('camelCase "anyArtisansTool" expands to 17 slugs', () => {
    const result = expandToolFrom(['anyArtisansTool']);
    expect(result).toHaveLength(17);
    expect(result).toEqual([...ARTISANS_TOOLS]);
  });

  it('spaced "musical instrument" expands to 10 slugs', () => {
    const result = expandToolFrom(['musical instrument']);
    expect(result).toHaveLength(10);
    expect(result).toEqual([...MUSICAL_INSTRUMENTS]);
  });

  it('"gaming set" expands to 4 slugs', () => {
    const result = expandToolFrom(['gaming set']);
    expect(result).toHaveLength(4);
    expect(result).toEqual([...GAMING_SETS]);
  });

  it('literal slug "navigator\'s tools" passes through unchanged', () => {
    const result = expandToolFrom(["navigator's tools"]);
    expect(result).toEqual(["navigator's tools"]);
  });

  it('unknown label passes through as single-slug', () => {
    const result = expandToolFrom(['disguise kit']);
    expect(result).toEqual(['disguise kit']);
  });

  it('mixed array: "anyArtisansTool" + "navigator\'s tools" → 18 slugs', () => {
    const result = expandToolFrom(['anyArtisansTool', "navigator's tools"]);
    expect(result).toHaveLength(18);
    expect(result).toEqual([...ARTISANS_TOOLS, "navigator's tools"]);
  });

  it('mixed: "musical instrument" + "gaming set" → 14 slugs (Far Traveler pool)', () => {
    const result = expandToolFrom(['musical instrument', 'gaming set']);
    expect(result).toHaveLength(14);
    expect(result).toEqual([...MUSICAL_INSTRUMENTS, ...GAMING_SETS]);
  });

  it('mixed: "gaming set" + "musical instrument" + "thieves\' tools" → 15 slugs (Urban Bounty Hunter pool)', () => {
    const result = expandToolFrom(['gaming set', 'musical instrument', "thieves' tools"]);
    expect(result).toHaveLength(15);
    expect(result).toEqual([...GAMING_SETS, ...MUSICAL_INSTRUMENTS, "thieves' tools"]);
  });

  it('mixed: "anyArtisansTool" + "musical instrument" → 27 slugs (Uthgardt pool)', () => {
    const result = expandToolFrom(['anyArtisansTool', 'musical instrument']);
    expect(result).toHaveLength(27);
    expect(result).toEqual([...ARTISANS_TOOLS, ...MUSICAL_INSTRUMENTS]);
  });

  it('empty array → empty result', () => {
    expect(expandToolFrom([])).toEqual([]);
  });

  it('spaced "anyArtisansTool" camelCase and spaced "artisan\'s tools" expand to same pool', () => {
    const camel = expandToolFrom(['anyArtisansTool']);
    const spaced = expandToolFrom(["artisan's tools"]);
    expect(camel).toEqual(spaced);
  });

  it('"anyMusicalInstrument" camelCase expands same as spaced "musical instrument"', () => {
    const camel = expandToolFrom(['anyMusicalInstrument']);
    const spaced = expandToolFrom(['musical instrument']);
    expect(camel).toEqual(spaced);
  });
});

// ── A.3 TEST-RED: anyTool pool + {anyTool:1} → 2 data-bug patch ─────────────

describe('TOOL_CATEGORY_MAP — anyTool entry', () => {
  it('anyTool maps to artisans ∪ gaming ∪ musical (31 items)', () => {
    const pool = TOOL_CATEGORY_MAP['anyTool'];
    expect(pool).toBeDefined();
    expect(pool).toHaveLength(
      ARTISANS_TOOLS.length + GAMING_SETS.length + MUSICAL_INSTRUMENTS.length,
    );
    // 17 artisans + 4 gaming + 10 musical = 31
    expect(pool).toHaveLength(31);
  });

  it('anyTool pool contains all artisans tools', () => {
    const pool = TOOL_CATEGORY_MAP['anyTool'];
    expect(pool).toBeDefined();
    for (const t of ARTISANS_TOOLS) {
      expect(pool).toContain(t);
    }
  });

  it('anyTool pool contains all gaming sets', () => {
    const pool = TOOL_CATEGORY_MAP['anyTool'];
    expect(pool).toBeDefined();
    for (const t of GAMING_SETS) {
      expect(pool).toContain(t);
    }
  });

  it('anyTool pool contains all musical instruments', () => {
    const pool = TOOL_CATEGORY_MAP['anyTool'];
    expect(pool).toBeDefined();
    for (const t of MUSICAL_INSTRUMENTS) {
      expect(pool).toContain(t);
    }
  });
});

describe('patchAnyToolCount — {anyTool:1} data-bug enforcement', () => {
  it('returns 2 when input count is 1 (data-bug patch)', () => {
    expect(patchAnyToolCount(1)).toBe(2);
  });

  it('returns the count unchanged when it is already 2', () => {
    expect(patchAnyToolCount(2)).toBe(2);
  });

  it('returns the count unchanged when it is 3 or more', () => {
    expect(patchAnyToolCount(3)).toBe(3);
  });
});
