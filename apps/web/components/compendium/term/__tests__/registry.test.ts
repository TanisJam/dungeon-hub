import { describe, expect, it } from 'vitest';
import {
  SUPPORTED_KINDS,
  KIND_TO_PATH,
  parseRefKey,
  normalizeRefKey,
} from '../registry';

describe('SUPPORTED_KINDS', () => {
  it('contains the 11 v1 kinds', () => {
    const expected = [
      'spell', 'item', 'creature', 'condition', 'status',
      'feat', 'race', 'class', 'background', 'action', 'language',
    ];
    for (const kind of expected) {
      expect(SUPPORTED_KINDS.has(kind), `SUPPORTED_KINDS should contain '${kind}'`).toBe(true);
    }
  });

  it('has exactly 11 entries', () => {
    expect(SUPPORTED_KINDS.size).toBe(11);
  });

  it('does not include unsupported kinds like variantrule or subclassFeature', () => {
    expect(SUPPORTED_KINDS.has('variantrule')).toBe(false);
    expect(SUPPORTED_KINDS.has('subclassFeature')).toBe(false);
    expect(SUPPORTED_KINDS.has('classFeature')).toBe(false);
  });
});

describe('KIND_TO_PATH', () => {
  it('maps spell → spells (pluralizes correctly)', () => {
    expect(KIND_TO_PATH['spell']).toBe('spells');
  });

  it('maps creature → monsters (irregular mapping)', () => {
    expect(KIND_TO_PATH['creature']).toBe('monsters');
  });

  it('maps status → conditions (status stored as conditions)', () => {
    expect(KIND_TO_PATH['status']).toBe('conditions');
  });

  it('maps condition → conditions', () => {
    expect(KIND_TO_PATH['condition']).toBe('conditions');
  });

  it('maps item → items', () => {
    expect(KIND_TO_PATH['item']).toBe('items');
  });

  it('maps feat → feats', () => {
    expect(KIND_TO_PATH['feat']).toBe('feats');
  });

  it('maps race → races', () => {
    expect(KIND_TO_PATH['race']).toBe('races');
  });

  it('maps class → classes', () => {
    expect(KIND_TO_PATH['class']).toBe('classes');
  });

  it('maps background → backgrounds', () => {
    expect(KIND_TO_PATH['background']).toBe('backgrounds');
  });

  it('maps action → actions', () => {
    expect(KIND_TO_PATH['action']).toBe('actions');
  });

  it('maps language → languages', () => {
    expect(KIND_TO_PATH['language']).toBe('languages');
  });
});

describe('parseRefKey', () => {
  it('parses a full pipe-delimited ref from data-compendium-ref attribute', () => {
    const result = parseRefKey('spell|fireball|PHB');
    expect(result).toEqual({ kind: 'spell', slug: 'fireball', source: 'PHB' });
  });

  it('parses creature ref with custom source', () => {
    const result = parseRefKey('creature|goblin|MM');
    expect(result).toEqual({ kind: 'creature', slug: 'goblin', source: 'MM' });
  });

  it('handles refs without source (defaults to PHB)', () => {
    const result = parseRefKey('spell|fireball');
    expect(result).toEqual({ kind: 'spell', slug: 'fireball', source: 'PHB' });
  });

  it('returns null for a malformed ref (empty kind)', () => {
    const result = parseRefKey('|fireball|PHB');
    expect(result).toBeNull();
  });

  it('returns null for empty string', () => {
    const result = parseRefKey('');
    expect(result).toBeNull();
  });
});

describe('normalizeRefKey', () => {
  it('lowercases all parts of the refKey', () => {
    const result = normalizeRefKey('spell', 'Fireball', 'PHB');
    expect(result).toBe('spell:fireball:phb');
  });

  it('produces canonical colon-separated format', () => {
    const result = normalizeRefKey('creature', 'goblin', 'MM');
    expect(result).toBe('creature:goblin:mm');
  });

  it('lowercases mixed-case inputs', () => {
    const result = normalizeRefKey('SPELL', 'FIREBALL', 'PHB');
    expect(result).toBe('spell:fireball:phb');
  });

  it('includes source so same slug from different books is a different key', () => {
    const phbKey = normalizeRefKey('spell', 'fireball', 'PHB');
    const xphbKey = normalizeRefKey('spell', 'fireball', 'XPHB');
    expect(phbKey).not.toBe(xphbKey);
  });
});
