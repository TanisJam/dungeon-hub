import { describe, it, expect } from 'vitest';
import { slugifyForFilename } from '../../src/http/routes/_slug.js';

describe('slugifyForFilename', () => {
  it('SLUG-01: normal name → lowercase hyphen-separated', () => {
    expect(slugifyForFilename('Aria Stormwind')).toBe('aria-stormwind');
  });

  it('SLUG-02: accented characters are stripped (NFD decompose + remove combining marks)', () => {
    // "Björn, the 2nd!" → strip accent on ö → bj-rn, collapse the comma+space → one hyphen
    expect(slugifyForFilename('Björn, the 2nd!')).toBe('bj-rn-the-2nd');
  });

  it('SLUG-03: accented chars treated as non-alphanumeric — collapse with surrounding symbols', () => {
    // Héroïne: H→h, é→-, r→r, o→o, ï→-, n→n, e→e (each accent collapses into surrounding run)
    // Trailing space+d+apostrophe+Arc → "-d-arc"
    expect(slugifyForFilename("Héroïne d'Arc")).toBe('h-ro-ne-d-arc');
  });

  it('SLUG-04: leading and trailing hyphens are trimmed', () => {
    expect(slugifyForFilename('!!Orcus!!')).toBe('orcus');
  });

  it('SLUG-05: blank string returns empty string (caller falls back to character-<id>)', () => {
    expect(slugifyForFilename('')).toBe('');
  });

  it('SLUG-06: all-symbol name returns empty string', () => {
    expect(slugifyForFilename('!!!')).toBe('');
  });

  it('SLUG-07: whitespace-only name returns empty string', () => {
    expect(slugifyForFilename('   ')).toBe('');
  });
});
