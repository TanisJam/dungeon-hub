/**
 * Tests for collectClassFeaturesAtLevel.
 *
 * REQ-CLU-FTR-PARSE-FEATURE-REFS: collects feature entries for a given level from classData.
 * REQ-CLU-FTR-POPULATE-MUTATIONS: output shape matches LevelUpMutations.featuresUnlocked.
 * REQ-CLU-XCUT-TDD: test-first.
 *
 * PHB 2014 references verified per CLAUDE.md §1.1 (PHB wins).
 */
import { describe, it, expect } from 'vitest';
import { collectClassFeaturesAtLevel } from '../../../src/character/class/features.js';
import type { ClassCompendiumData } from '../../../src/character/class/types.js';

function makeClassData(
  slug: string,
  classFeatures: Array<string | { classFeature: string }>,
): ClassCompendiumData {
  return {
    slug,
    source: 'PHB',
    hd: { number: 1, faces: 10 },
    proficiency: [],
    startingProficiencies: {},
    classFeatures,
  };
}

// ── Fighter (PHB p.72) ────────────────────────────────────────────────────────

describe('collectClassFeaturesAtLevel — Fighter', () => {
  const fighterData = makeClassData('fighter', [
    'Second Wind|Fighter|PHB|1',
    'Action Surge|Fighter|PHB|2',
    'Martial Archetype|Fighter|PHB|3',
    // Fighter L4 gets ASI (PHB p.72 table)
    'Ability Score Improvement|Fighter|PHB|4',
    'Extra Attack|Fighter|PHB|5',
  ]);

  it('L2: returns Action Surge', () => {
    // PHB p.72: Fighter L2 feature = Action Surge
    const results = collectClassFeaturesAtLevel(fighterData, 2);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      featureName: 'Action Surge',
      featureSlug: 'action-surge',
      classSlug: 'fighter',
      level: 2,
    });
  });

  it('L4: returns Ability Score Improvement (ASI emits as feature — Q2 locked YES)', () => {
    // PHB p.72: Fighter L4 = Ability Score Improvement. ASI is a player-facing choice,
    // so it emits in featuresUnlocked (design decision Q2).
    const results = collectClassFeaturesAtLevel(fighterData, 4);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      featureName: 'Ability Score Improvement',
      featureSlug: 'ability-score-improvement',
      classSlug: 'fighter',
      level: 4,
    });
  });

  it('L1: returns Second Wind', () => {
    const results = collectClassFeaturesAtLevel(fighterData, 1);
    expect(results).toHaveLength(1);
    expect(results[0]?.featureName).toBe('Second Wind');
  });
});

// ── Cleric (PHB p.58) ─────────────────────────────────────────────────────────

describe('collectClassFeaturesAtLevel — Cleric', () => {
  const clericData = makeClassData('cleric', [
    'Spellcasting|Cleric|PHB|1',
    'Divine Domain|Cleric|PHB|1',
    'Channel Divinity|Cleric|PHB|2',
  ]);

  it('L1: returns both Spellcasting and Divine Domain (PHB p.58)', () => {
    // PHB p.58: Cleric L1 gets Spellcasting AND Divine Domain simultaneously
    const results = collectClassFeaturesAtLevel(clericData, 1);
    expect(results).toHaveLength(2);
    const names = results.map((r) => r.featureName);
    expect(names).toContain('Spellcasting');
    expect(names).toContain('Divine Domain');
  });

  it('L2: returns Channel Divinity only', () => {
    const results = collectClassFeaturesAtLevel(clericData, 2);
    expect(results).toHaveLength(1);
    expect(results[0]?.featureName).toBe('Channel Divinity');
  });
});

// ── Object-form classFeature entries ─────────────────────────────────────────

describe('collectClassFeaturesAtLevel — object-form entries', () => {
  it('handles { classFeature: "..." } object entries correctly', () => {
    const classData = makeClassData('fighter', [
      { classFeature: 'Action Surge|Fighter|PHB|2' },
      'Extra Attack|Fighter|PHB|5',
    ]);
    const results = collectClassFeaturesAtLevel(classData, 2);
    expect(results).toHaveLength(1);
    expect(results[0]?.featureName).toBe('Action Surge');
  });

  it('mixed: object entry + string entry at same level', () => {
    const classData = makeClassData('cleric', [
      { classFeature: 'Spellcasting|Cleric|PHB|1' },
      'Divine Domain|Cleric|PHB|1',
    ]);
    const results = collectClassFeaturesAtLevel(classData, 1);
    expect(results).toHaveLength(2);
  });
});

// ── Defensive: malformed entries ─────────────────────────────────────────────

describe('collectClassFeaturesAtLevel — defensive parsing', () => {
  it('skips malformed entry, returns valid entries', () => {
    const classData = makeClassData('fighter', [
      'Broken Entry',                        // malformed — only 1 segment
      'Action Surge|Fighter|PHB|2',
    ]);
    const results = collectClassFeaturesAtLevel(classData, 2);
    expect(results).toHaveLength(1);
    expect(results[0]?.featureName).toBe('Action Surge');
  });

  it('level with no features returns []', () => {
    const classData = makeClassData('fighter', [
      'Action Surge|Fighter|PHB|2',
    ]);
    const results = collectClassFeaturesAtLevel(classData, 3);
    expect(results).toHaveLength(0);
  });

  it('empty classFeatures returns []', () => {
    const classData = makeClassData('fighter', []);
    const results = collectClassFeaturesAtLevel(classData, 1);
    expect(results).toHaveLength(0);
  });

  it('object entry with missing classFeature key returns []', () => {
    const classData: ClassCompendiumData = {
      slug: 'fighter',
      source: 'PHB',
      hd: { number: 1, faces: 10 },
      proficiency: [],
      startingProficiencies: {},
      classFeatures: [{ classFeature: '' } as { classFeature: string }],
    };
    const results = collectClassFeaturesAtLevel(classData, 1);
    expect(results).toHaveLength(0);
  });
});

// ── Slug generation ───────────────────────────────────────────────────────────

describe('collectClassFeaturesAtLevel — slug generation', () => {
  it('converts "Ability Score Improvement" to "ability-score-improvement"', () => {
    const classData = makeClassData('fighter', [
      'Ability Score Improvement|Fighter|PHB|4',
    ]);
    const results = collectClassFeaturesAtLevel(classData, 4);
    expect(results[0]?.featureSlug).toBe('ability-score-improvement');
  });

  it('converts "Second Wind" to "second-wind"', () => {
    const classData = makeClassData('fighter', [
      'Second Wind|Fighter|PHB|1',
    ]);
    const results = collectClassFeaturesAtLevel(classData, 1);
    expect(results[0]?.featureSlug).toBe('second-wind');
  });

  it('classSlug is lowercased', () => {
    const classData = makeClassData('fighter', [
      'Action Surge|Fighter|PHB|2',
    ]);
    const results = collectClassFeaturesAtLevel(classData, 2);
    // classSlug comes from parseFeatureRef.classSlug, which is the raw ref segment lowercased
    expect(results[0]?.classSlug).toBe('fighter');
  });
});
