import { describe, expect, it } from 'vitest';
import { slugify } from '../slugify';

describe('slugify (compendium ref consistency)', () => {
  it('lowercases and hyphenates simple names', () => {
    expect(slugify('Half-Elf')).toBe('half-elf');
  });

  it("strips apostrophes (e.g. Mariner's Armor)", () => {
    expect(slugify("Mariner's Armor")).toBe('mariners-armor');
  });

  it('collapses parens and inner whitespace', () => {
    expect(slugify('Tortle (Race)')).toBe('tortle-race');
  });
});
