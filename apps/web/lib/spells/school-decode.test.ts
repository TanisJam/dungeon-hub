/**
 * Tests for spell school decoder.
 *
 * REQ-SP02-WEB-SCHOOL-DECODE (spec #680):
 * The web layer MUST map all 8 single-char school codes to full names.
 *
 * CRITICAL: E → Enchantment (NOT En), V → Evocation (NOT Ev).
 * Actual 5etools codes for all imported sources are single-char (spec #680 §5).
 *
 * PHB Chapter 10: Eight schools of magic:
 * Abjuration, Conjuration, Divination, Enchantment, Evocation,
 * Illusion, Necromancy, Transmutation.
 */
import { describe, expect, it } from 'vitest';
import { decodeSchool, SCHOOL_NAMES } from './school-decode';

describe('SCHOOL_NAMES', () => {
  it('has exactly 8 entries', () => {
    expect(Object.keys(SCHOOL_NAMES)).toHaveLength(8);
  });

  it('covers all 8 PHB schools with single-char codes', () => {
    expect(Object.keys(SCHOOL_NAMES).sort()).toEqual(['A', 'C', 'D', 'E', 'I', 'N', 'T', 'V']);
  });
});

describe('decodeSchool', () => {
  it('A → Abjuration', () => {
    expect(decodeSchool('A')).toBe('Abjuration');
  });

  it('C → Conjuration', () => {
    expect(decodeSchool('C')).toBe('Conjuration');
  });

  it('D → Divination', () => {
    expect(decodeSchool('D')).toBe('Divination');
  });

  it('E → Enchantment (NOT titleCase, NOT En)', () => {
    expect(decodeSchool('E')).toBe('Enchantment');
  });

  it('I → Illusion', () => {
    expect(decodeSchool('I')).toBe('Illusion');
  });

  it('N → Necromancy', () => {
    expect(decodeSchool('N')).toBe('Necromancy');
  });

  it('T → Transmutation', () => {
    expect(decodeSchool('T')).toBe('Transmutation');
  });

  it('V → Evocation (NOT titleCase, NOT Ev)', () => {
    expect(decodeSchool('V')).toBe('Evocation');
  });

  it('unknown code → returns raw code as fallback', () => {
    expect(decodeSchool('X')).toBe('X');
  });

  it('empty string → returns empty string', () => {
    expect(decodeSchool('')).toBe('');
  });
});
