/**
 * Self-consistency test for the design-tokens manifest.
 * Asserts structural invariants so silent drift from globals.css @theme
 * is caught before it ships to the tokens catalog page.
 */
import { describe, it, expect } from 'vitest';
import { COLORS } from './design-tokens';

describe('design-tokens manifest', () => {
  it('has no duplicate token names in COLORS', () => {
    const names = COLORS.map((t) => t.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  it('every non-displayOnly entry has a valid 7-char hex value', () => {
    const hexPattern = /^#[0-9a-fA-F]{6}$/;
    for (const token of COLORS) {
      if (!token.displayOnly) {
        expect(token.hex, `token "${token.name}" hex "${token.hex}" must be a valid 6-hex`).toMatch(
          hexPattern,
        );
      }
    }
  });

  it('COLORS length is at least 28 (23 existing + 5 missing tokens added by A1)', () => {
    expect(COLORS.length).toBeGreaterThanOrEqual(28);
  });
});
