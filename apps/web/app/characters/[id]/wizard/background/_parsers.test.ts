import { describe, it, expect } from 'vitest';
import { ALL_SKILLS } from '@dungeon-hub/domain/character/sheet';
import {
  ARTISANS_TOOLS,
  GAMING_SETS,
  MUSICAL_INSTRUMENTS,
} from '@dungeon-hub/domain/character/tool';
import { parseBackground, type BackgroundData } from './_parsers';

// ---------------------------------------------------------------------------
// B.1 — Parser: numeric-any skill branch
// ---------------------------------------------------------------------------

describe('parseBackground — numeric-any skill block', () => {
  it('returns skillChoose with full ALL_SKILLS pool and correct count for {any:2}', () => {
    const data: BackgroundData = {
      name: 'Custom Background',
      source: 'CUSTOM',
      skillProficiencies: [{ any: 2 } as never],
    };

    const result = parseBackground(data);

    expect(result.skillChoose).not.toBeNull();
    expect(result.skillChoose!.count).toBe(2);
    expect(result.skillChoose!.from).toHaveLength(18);
    expect(result.skillChoose!.from.sort()).toEqual([...ALL_SKILLS].sort());
    expect(result.fixedSkills).toHaveLength(0);
  });

  it('returns skillChoose with count 1 for {any:1}', () => {
    const data: BackgroundData = {
      name: 'Custom Background',
      source: 'CUSTOM',
      skillProficiencies: [{ any: 1 } as never],
    };

    const result = parseBackground(data);

    expect(result.skillChoose).not.toBeNull();
    expect(result.skillChoose!.count).toBe(1);
    expect(result.skillChoose!.from).toHaveLength(18);
  });

  it('accumulates numeric-any and choose blocks across multiple entries', () => {
    const data: BackgroundData = {
      name: 'Hybrid Background',
      source: 'TEST',
      skillProficiencies: [
        { any: 1 } as never,
        { choose: { from: ['arcana'], count: 1 } },
      ],
    };

    const result = parseBackground(data);

    expect(result.skillChoose).not.toBeNull();
    // count accumulates: 1 (any) + 1 (choose) = 2
    expect(result.skillChoose!.count).toBe(2);
    // pool: ALL_SKILLS union ['arcana'] — arcana already in ALL_SKILLS, so still 18
    expect(result.skillChoose!.from.length).toBeGreaterThanOrEqual(18);
    expect(result.skillChoose!.from).toContain('arcana');
  });
});

// ---------------------------------------------------------------------------
// B.1 — Parser: toolChoose field (choose branch in tool loop)
// ---------------------------------------------------------------------------

describe('parseBackground — toolChoose: anyArtisansTool category', () => {
  it('expands anyArtisansTool to 17 slugs with count 1 (Far Traveler-ish)', () => {
    const data: BackgroundData = {
      name: 'Test',
      source: 'TEST',
      toolProficiencies: [{ choose: { from: ['anyArtisansTool'], count: 1 } } as never],
    };
    const result = parseBackground(data);
    expect(result.toolChoose).not.toBeNull();
    expect(result.toolChoose!.from).toHaveLength(17);
    expect(result.toolChoose!.count).toBe(1);
    expect(result.toolChoose!.from).toEqual([...ARTISANS_TOOLS]);
  });
});

describe('parseBackground — toolChoose: musical instrument category', () => {
  it('expands "musical instrument" to 10 slugs', () => {
    const data: BackgroundData = {
      name: 'Test',
      source: 'TEST',
      toolProficiencies: [{ choose: { from: ['musical instrument'], count: 1 } } as never],
    };
    const result = parseBackground(data);
    expect(result.toolChoose).not.toBeNull();
    expect(result.toolChoose!.from).toHaveLength(10);
    expect(result.toolChoose!.from).toEqual([...MUSICAL_INSTRUMENTS]);
  });
});

describe("parseBackground — toolChoose: literal slug (navigator's tools)", () => {
  it("passes through literal slug navigator's tools as-is", () => {
    const data: BackgroundData = {
      name: 'Archaeologist',
      source: 'ToA',
      toolProficiencies: [{ choose: { from: ["navigator's tools"], count: 1 } } as never],
    };
    const result = parseBackground(data);
    expect(result.toolChoose).not.toBeNull();
    expect(result.toolChoose!.from).toEqual(["navigator's tools"]);
    expect(result.toolChoose!.count).toBe(1);
  });
});

describe('parseBackground — toolChoose: Far Traveler (musical instrument + gaming set)', () => {
  it('expands mixed categories to 14 slugs (10 instruments + 4 gaming sets), count 1', () => {
    const data: BackgroundData = {
      name: 'Far Traveler',
      source: 'SCAG',
      toolProficiencies: [
        { choose: { from: ['musical instrument', 'gaming set'], count: 1 } } as never,
      ],
    };
    const result = parseBackground(data);
    expect(result.toolChoose).not.toBeNull();
    expect(result.toolChoose!.from).toHaveLength(14);
    expect(result.toolChoose!.count).toBe(1);
    // Verify it contains both instrument and gaming set slugs
    expect(result.toolChoose!.from).toContain('lute');
    expect(result.toolChoose!.from).toContain('dice-set');
  });
});

describe('parseBackground — toolChoose: Urban Bounty Hunter (count: 2)', () => {
  it('parses count 2 correctly', () => {
    const data: BackgroundData = {
      name: 'Urban Bounty Hunter',
      source: 'SCAG',
      toolProficiencies: [
        {
          choose: {
            from: ['gaming set', 'musical instrument', "thieves' tools"],
            count: 2,
          },
        } as never,
      ],
    };
    const result = parseBackground(data);
    expect(result.toolChoose).not.toBeNull();
    expect(result.toolChoose!.count).toBe(2);
    // gaming set (4) + musical instrument (10) + literal (1) = 15
    expect(result.toolChoose!.from).toHaveLength(15);
    expect(result.toolChoose!.from).toContain("thieves' tools");
  });
});

describe('parseBackground — toolChoose: Variant Guild Merchant (anyArtisansTool + literal)', () => {
  it("expands anyArtisansTool (17) + navigator's tools (1) = 18 slugs", () => {
    const data: BackgroundData = {
      name: 'Guild Merchant',
      source: 'PHB',
      toolProficiencies: [
        { choose: { from: ['anyArtisansTool', "navigator's tools"], count: 1 } } as never,
      ],
    };
    const result = parseBackground(data);
    expect(result.toolChoose).not.toBeNull();
    expect(result.toolChoose!.from).toHaveLength(18);
    expect(result.toolChoose!.from).toContain("navigator's tools");
    expect(result.toolChoose!.from).toContain('alchemists-supplies');
  });
});

describe('parseBackground — toolChoose regression: Acolyte (no choose block)', () => {
  it('returns toolChoose null when no choose block exists', () => {
    const data: BackgroundData = {
      name: 'Acolyte',
      source: 'PHB',
      skillProficiencies: [{ insight: true, religion: true } as never],
      toolProficiencies: [],
    };
    const result = parseBackground(data);
    expect(result.toolChoose).toBeNull();
    // Regression: existing tool parsing still works
    expect(result.fixedTools).toHaveLength(0);
    expect(result.toolChooseCounts).toEqual({});
  });
});

describe('parseBackground — toolChoose regression: true-block tool (herbalism kit)', () => {
  it('parses true-block tool without creating toolChoose', () => {
    const data: BackgroundData = {
      name: 'Outlander',
      source: 'PHB',
      toolProficiencies: [{ "herbalism kit": true } as never],
    };
    const result = parseBackground(data);
    expect(result.toolChoose).toBeNull();
    expect(result.fixedTools).toContain("herbalism kit");
  });
});

// ---------------------------------------------------------------------------
// Regression: existing choose:{from,count} shape (Acolyte)
// ---------------------------------------------------------------------------

describe('parseBackground — regression: choose:{from,count} shape', () => {
  it('parses an explicit skill pool correctly (Acolyte pattern)', () => {
    const data: BackgroundData = {
      name: 'Acolyte',
      source: 'PHB',
      skillProficiencies: [{ choose: { from: ['insight', 'religion'], count: 2 } }],
    };

    const result = parseBackground(data);

    expect(result.skillChoose).not.toBeNull();
    expect(result.skillChoose!.from).toEqual(['insight', 'religion']);
    expect(result.skillChoose!.count).toBe(2);
    expect(result.fixedSkills).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Regression: existing boolean-skill shape (fixed grants)
// ---------------------------------------------------------------------------

describe('parseBackground — regression: boolean fixed-skill shape', () => {
  it('parses fixed boolean skills correctly and leaves skillChoose null', () => {
    const data: BackgroundData = {
      name: 'Soldier',
      source: 'PHB',
      skillProficiencies: [{ athletics: true, intimidation: true } as never],
    };

    const result = parseBackground(data);

    expect(result.skillChoose).toBeNull();
    expect(result.fixedSkills).toContain('athletics');
    expect(result.fixedSkills).toContain('intimidation');
    expect(result.fixedSkills).toHaveLength(2);
  });
});
