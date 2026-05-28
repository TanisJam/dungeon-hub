/**
 * Tests for parseFeatureRef — 5etools class feature string parser.
 *
 * REQ-CLU-FTR-PARSE-FEATURE-REFS: pure function, null on any malformed input.
 * REQ-CLU-XCUT-TDD: test-first.
 *
 * 5etools format: "FeatureName|Class|ClassSource|Level" or
 *                 "FeatureName|Class|ClassSource|Level|FeatureSource"
 * Strict parse — no trim, no coercion.
 */
import { describe, it, expect } from 'vitest';
import { parseFeatureRef } from '../../src/compendium/parse-feature-ref.js';

describe('parseFeatureRef — happy paths', () => {
  it('4-part ref: "Action Surge|Fighter|PHB|2" → parsed correctly', () => {
    const result = parseFeatureRef('Action Surge|Fighter|PHB|2');
    expect(result).toEqual({
      name: 'Action Surge',
      classSlug: 'Fighter',
      classSource: 'PHB',
      level: 2,
      featureSource: 'PHB',
    });
  });

  it('5-part ref: "X|Cleric|PHB|1|XGE" → featureSource from segment 4', () => {
    const result = parseFeatureRef('X|Cleric|PHB|1|XGE');
    expect(result).toEqual({
      name: 'X',
      classSlug: 'Cleric',
      classSource: 'PHB',
      level: 1,
      featureSource: 'XGE',
    });
  });

  it('level 1 → valid', () => {
    const result = parseFeatureRef('Spellcasting|Wizard|PHB|1');
    expect(result).not.toBeNull();
    expect(result?.level).toBe(1);
  });

  it('level 20 → valid', () => {
    const result = parseFeatureRef('Perfect Self|Monk|PHB|20');
    expect(result).not.toBeNull();
    expect(result?.level).toBe(20);
  });

  it('empty classSource (5etools quirk "Name|Class||Level") → valid, classSource=""', () => {
    // 5etools sometimes omits the source segment: "Fighting Style|Fighter||1"
    // We allow empty classSource (it is a real data pattern).
    const result = parseFeatureRef('Fighting Style|Fighter||1');
    expect(result).not.toBeNull();
    expect(result?.name).toBe('Fighting Style');
    expect(result?.classSource).toBe('');
    expect(result?.level).toBe(1);
  });
});

describe('parseFeatureRef — null on malformed input', () => {
  it('3-part: "Action Surge|Fighter|PHB" → null', () => {
    expect(parseFeatureRef('Action Surge|Fighter|PHB')).toBeNull();
  });

  it('non-numeric level: "X|Y|PHB|two" → null', () => {
    expect(parseFeatureRef('X|Y|PHB|two')).toBeNull();
  });

  it('level 0: "X|Y|PHB|0" → null', () => {
    expect(parseFeatureRef('X|Y|PHB|0')).toBeNull();
  });

  it('level 21: "X|Y|PHB|21" → null', () => {
    expect(parseFeatureRef('X|Y|PHB|21')).toBeNull();
  });

  it('empty string → null', () => {
    expect(parseFeatureRef('')).toBeNull();
  });

  it('STRICT whitespace: "  Action Surge  |Fighter|PHB|2 " → null (no trim)', () => {
    // Design decision Q1: strict parse, no trim. PHB refs in 5etools are clean.
    expect(parseFeatureRef('  Action Surge  |Fighter|PHB|2 ')).toBeNull();
  });

  it('empty name segment: "|Fighter|PHB|2" → null', () => {
    expect(parseFeatureRef('|Fighter|PHB|2')).toBeNull();
  });

  it('float level: "X|Y|PHB|2.5" → null', () => {
    expect(parseFeatureRef('X|Y|PHB|2.5')).toBeNull();
  });
});
