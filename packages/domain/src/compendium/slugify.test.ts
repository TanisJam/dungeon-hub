/**
 * Tests for slugify() and parseItemRef() in domain/compendium/slugify.ts
 *
 * Strict TDD — tests written BEFORE production code.
 *
 * Covers:
 * - Basic kebab-case conversion
 * - Quantity-in-name gotcha: "arrows (20)" → "arrows-20"  (REQ-SEQUIP-00, ADR-2)
 * - Pipe-format item refs: "chain mail|phb" → slug "chain-mail", source "PHB"
 * - displayName stripping: slug comes from `item` ref, not the display override
 * - Accent and apostrophe normalisation (inherited from the compendium-import
 *   formula — must be consistent so slug equality holds between importer rows
 *   and domain-generated slugs)
 */
import { describe, expect, it } from 'vitest';
import { parseItemRef, slugify } from './slugify.js';

describe('slugify', () => {
  it('lowercases and hyphenates a simple name', () => {
    // "longsword" → no change, already lowercase
    expect(slugify('longsword')).toBe('longsword');
  });

  it('collapses spaces into hyphens', () => {
    // "chain mail" → "chain-mail"
    expect(slugify('chain mail')).toBe('chain-mail');
  });

  it('strips parenthesised quantities — the "arrows (20)" gotcha', () => {
    // PHB p.150 — 5etools encodes "arrows (20)" as the item name.
    // The importer resolves this to slug "arrows-20"; domain must match.
    expect(slugify('arrows (20)')).toBe('arrows-20');
  });

  it('strips parenthesised quantities — crossbow bolts', () => {
    // Companion to the arrows case — "crossbow bolts (20)" → "crossbow-bolts-20"
    expect(slugify('crossbow bolts (20)')).toBe('crossbow-bolts-20');
  });

  it('removes apostrophes', () => {
    // "dungeoneer's pack" → "dungeoneers-pack"
    expect(slugify("dungeoneer's pack")).toBe('dungeoneers-pack');
  });

  it('strips diacritics/accents', () => {
    // Safety-net for non-ASCII item names — normalise before slugging
    expect(slugify('épée')).toBe('epee');
  });

  it('trims leading and trailing hyphens', () => {
    expect(slugify('  explorer pack  ')).toBe('explorer-pack');
  });
});

describe('parseItemRef', () => {
  it('parses a pipe-separated "name|source" string', () => {
    // 5etools format: "chain mail|phb" — source is uppercase-normalised
    const result = parseItemRef('chain mail|phb');
    expect(result.slug).toBe('chain-mail');
    expect(result.source).toBe('PHB');
  });

  it('uppercases the source segment', () => {
    // Source segment can come in any case; always normalise to uppercase
    expect(parseItemRef('longsword|PHB').source).toBe('PHB');
    expect(parseItemRef('shortbow|phb').source).toBe('PHB');
  });

  it('slugifies the name segment', () => {
    // The "arrows (20)" gotcha must survive through parseItemRef
    const result = parseItemRef('arrows (20)|phb');
    expect(result.slug).toBe('arrows-20');
    expect(result.source).toBe('PHB');
  });

  it('handles a plain name with no source segment', () => {
    // Some 5etools refs omit the source; default source is empty string
    const result = parseItemRef('spellbook');
    expect(result.slug).toBe('spellbook');
    expect(result.source).toBe('');
  });

  it('uses only the name segment for the slug when source is present', () => {
    // "holy symbol|phb" → slug "holy-symbol" (not "holy-symbol-phb")
    const result = parseItemRef('holy symbol|phb');
    expect(result.slug).toBe('holy-symbol');
    expect(result.source).toBe('PHB');
  });
});
