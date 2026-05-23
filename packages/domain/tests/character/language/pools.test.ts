import { describe, expect, it } from 'vitest';
import {
  STANDARD_LANGUAGES,
  EXOTIC_LANGUAGES,
  ALL_LANGUAGES_INCLUDING_EXOTIC,
  LANG_CHOOSE_KEYS,
} from '../../../src/character/language/pools.js';

describe('STANDARD_LANGUAGES', () => {
  it('contains the 8 standard PHB languages', () => {
    expect(STANDARD_LANGUAGES).toHaveLength(8);
    expect(STANDARD_LANGUAGES).toContain('common');
    expect(STANDARD_LANGUAGES).toContain('elvish');
    expect(STANDARD_LANGUAGES).toContain('dwarvish');
  });

  it('all slugs are lowercase', () => {
    for (const lang of STANDARD_LANGUAGES) {
      expect(lang).toBe(lang.toLowerCase());
    }
  });
});

describe('EXOTIC_LANGUAGES', () => {
  it('contains the 8 exotic PHB languages', () => {
    expect(EXOTIC_LANGUAGES).toHaveLength(8);
    expect(EXOTIC_LANGUAGES).toContain('draconic');
    expect(EXOTIC_LANGUAGES).toContain('abyssal');
  });

  it('all slugs are lowercase', () => {
    for (const lang of EXOTIC_LANGUAGES) {
      expect(lang).toBe(lang.toLowerCase());
    }
  });
});

describe('ALL_LANGUAGES_INCLUDING_EXOTIC', () => {
  it('is the union of STANDARD_LANGUAGES and EXOTIC_LANGUAGES', () => {
    expect(ALL_LANGUAGES_INCLUDING_EXOTIC).toHaveLength(
      STANDARD_LANGUAGES.length + EXOTIC_LANGUAGES.length,
    );
  });

  it('contains all standard languages', () => {
    for (const lang of STANDARD_LANGUAGES) {
      expect(ALL_LANGUAGES_INCLUDING_EXOTIC).toContain(lang);
    }
  });

  it('contains all exotic languages', () => {
    for (const lang of EXOTIC_LANGUAGES) {
      expect(ALL_LANGUAGES_INCLUDING_EXOTIC).toContain(lang);
    }
  });

  it('has exactly 16 entries (8 standard + 8 exotic)', () => {
    expect(ALL_LANGUAGES_INCLUDING_EXOTIC).toHaveLength(16);
  });
});

describe('LANG_CHOOSE_KEYS', () => {
  it('includes anyLanguage as a valid choose key', () => {
    expect(LANG_CHOOSE_KEYS).toContain('anyLanguage');
  });

  it('includes anyStandard as a valid choose key', () => {
    expect(LANG_CHOOSE_KEYS).toContain('anyStandard');
  });

  it('includes anyExotic as a valid choose key', () => {
    expect(LANG_CHOOSE_KEYS).toContain('anyExotic');
  });

  it('includes any as a valid choose key', () => {
    expect(LANG_CHOOSE_KEYS).toContain('any');
  });
});
