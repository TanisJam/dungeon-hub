import { describe, it, expect } from 'vitest';
import { slugify as slugifyForFilename } from '@dungeon-hub/compendium-import/slugify';

/**
 * Export-filename slug contract (REQ-EXP-SLUG-01/02/03).
 *
 * The API used to carry its own copy of this in routes/_slug.ts. That copy never
 * did the NFD accent-strip its own docstring described, so it disagreed with the
 * web download button — which has always used this shared implementation — on
 * every accented name. In a Spanish-language app that is most of them:
 * "José María" came out `jos-mar-a` on the server and `jose-maria` in the browser.
 *
 * SLUG-02 and SLUG-03 below previously asserted the server's behaviour while
 * their own titles described this one. The titles were right.
 */
describe('slugifyForFilename', () => {
  it('SLUG-01: normal name → lowercase hyphen-separated', () => {
    expect(slugifyForFilename('Aria Stormwind')).toBe('aria-stormwind');
  });

  it('SLUG-02: accents are decomposed and their combining marks removed', () => {
    expect(slugifyForFilename('Björn, the 2nd!')).toBe('bjorn-the-2nd');
  });

  it('SLUG-03: the letter survives the accent; apostrophes close up', () => {
    expect(slugifyForFilename("Héroïne d'Arc")).toBe('heroine-darc');
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

  it('SLUG-08: Spanish names round-trip readably — the reason this was aligned', () => {
    expect(slugifyForFilename('José María Muñoz')).toBe('jose-maria-munoz');
    expect(slugifyForFilename('Ñandú Águila')).toBe('nandu-aguila');
  });
});
