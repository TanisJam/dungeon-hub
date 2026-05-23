import { describe, it, expect } from 'vitest';
import { ALL_SKILLS } from '@dungeon-hub/domain/character/sheet';
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
