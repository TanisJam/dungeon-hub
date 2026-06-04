/**
 * characterInitials(name, opts?) — shared helper for character portrait initials.
 *
 * Rules:
 * - Empty string / whitespace-only → '?'
 * - Single word → first char (maxChars=1, default) or first 2 chars (maxChars=2), uppercased
 * - Multiple words → first char of word[0] (maxChars=1) or first char of word[0]+word[1] (maxChars=2), uppercased
 * - Already-uppercase names stay uppercase; lowercase names are uppercased
 */
import { describe, it, expect } from 'vitest';
import { characterInitials } from './character-initials';

describe('characterInitials', () => {
  // ── Fallback ───────────────────────────────────────────────────────────────

  it('returns "?" for empty string', () => {
    expect(characterInitials('')).toBe('?');
  });

  it('returns "?" for whitespace-only string', () => {
    expect(characterInitials('   ')).toBe('?');
  });

  it('returns "?" for tab-only string', () => {
    expect(characterInitials('\t\n')).toBe('?');
  });

  // ── Single word, maxChars=1 (default) ─────────────────────────────────────

  it('single word → first char uppercase (maxChars=1 default)', () => {
    expect(characterInitials('brann')).toBe('B');
  });

  it('single word already uppercase → first char (maxChars=1)', () => {
    expect(characterInitials('Lyra')).toBe('L');
  });

  it('single word with leading spaces → first char (maxChars=1)', () => {
    expect(characterInitials('  Mírelle')).toBe('M');
  });

  // ── Multiple words, maxChars=1 (default) ──────────────────────────────────

  it('two-word name → first char of first word (maxChars=1)', () => {
    expect(characterInitials('Brann Cuervosombrío')).toBe('B');
  });

  it('three-word name → first char of first word (maxChars=1)', () => {
    expect(characterInitials('Arken von Drûm')).toBe('A');
  });

  // ── Single word, maxChars=2 ────────────────────────────────────────────────

  it('single word → first 2 chars uppercase (maxChars=2)', () => {
    expect(characterInitials('brann', { maxChars: 2 })).toBe('BR');
  });

  it('single word 1-char → returns that char (maxChars=2)', () => {
    expect(characterInitials('X', { maxChars: 2 })).toBe('X');
  });

  it('single word with mixed case → uppercased (maxChars=2)', () => {
    expect(characterInitials('lyra', { maxChars: 2 })).toBe('LY');
  });

  // ── Multiple words, maxChars=2 ────────────────────────────────────────────

  it('two-word name → first chars of both words uppercase (maxChars=2)', () => {
    expect(characterInitials('Brann Cuervosombrío', { maxChars: 2 })).toBe('BC');
  });

  it('lowercase two-word name → first chars uppercased (maxChars=2)', () => {
    expect(characterInitials('arken drûm', { maxChars: 2 })).toBe('AD');
  });

  it('three-word name → first chars of first TWO words (maxChars=2)', () => {
    expect(characterInitials('Arken von Drûm', { maxChars: 2 })).toBe('AV');
  });

  // ── Casing edge cases ─────────────────────────────────────────────────────

  it('all-caps name → returned uppercase (no change)', () => {
    expect(characterInitials('BRANN')).toBe('B');
  });

  it('mixed-case multi-word → uppercase result', () => {
    expect(characterInitials('brann cuervosombrío', { maxChars: 2 })).toBe('BC');
  });
});
