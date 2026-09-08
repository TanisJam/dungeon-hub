/**
 * Tests for validateImportEnvelope.
 *
 * REQ-IMPORT-ENV-01: accepts a well-formed schemaVersion:1 envelope and
 * extracts its compendium refs.
 * REQ-IMPORT-ENV-02: rejects any other schemaVersion with a dedicated
 * SCHEMA_VERSION_UNSUPPORTED issue (not a generic shape error).
 * REQ-IMPORT-ENV-03: rejects a structurally malformed envelope with
 * MALFORMED_ENVELOPE issues, one per offending path.
 */
import { describe, expect, it } from 'vitest';
import { validateImportEnvelope } from './validate.js';

function validEnvelope() {
  return {
    schemaVersion: 1,
    exportedAt: '2026-01-01T00:00:00.000Z',
    character: {
      id: '11111111-1111-1111-1111-111111111111',
      name: 'Aria',
      worldId: '22222222-2222-2222-2222-222222222222',
      status: 'active',
      xp: 300,
      data: {
        race: { slug: 'elf', source: 'PHB' },
        classes: [{ slug: 'wizard', source: 'PHB', level: 1, subclass: null }],
      },
      inventory: [{ instanceId: 'a', itemSlug: 'longsword', itemSource: 'PHB' }],
    },
  };
}

describe('validateImportEnvelope', () => {
  it('accepts a valid schemaVersion:1 envelope and extracts refs', () => {
    const result = validateImportEnvelope(validEnvelope());
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.envelope.character.name).toBe('Aria');
    expect(result.refs).toContainEqual({ kind: 'race', slug: 'elf', source: 'PHB' });
    expect(result.refs).toContainEqual({ kind: 'class', slug: 'wizard', source: 'PHB' });
    expect(result.refs).toContainEqual({ kind: 'item', slug: 'longsword', source: 'PHB' });
  });

  it('rejects wrong schemaVersion with SCHEMA_VERSION_UNSUPPORTED (expected/got)', () => {
    const envelope = { ...validEnvelope(), schemaVersion: 2 };
    const result = validateImportEnvelope(envelope);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.issues).toEqual([
      { code: 'SCHEMA_VERSION_UNSUPPORTED', expected: 1, got: 2 },
    ]);
  });

  it('rejects a malformed envelope (missing character) with MALFORMED_ENVELOPE issues', () => {
    const result = validateImportEnvelope({ schemaVersion: 1, exportedAt: 'x' });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.issues.length).toBeGreaterThan(0);
    for (const issue of result.issues) {
      expect(issue.code).toBe('MALFORMED_ENVELOPE');
    }
  });

  it('rejects a completely wrong shape (not an object) with MALFORMED_ENVELOPE', () => {
    const result = validateImportEnvelope('not-an-envelope');
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.issues[0]!.code).toBe('MALFORMED_ENVELOPE');
  });

  it('rejects when character.data is not an object', () => {
    const envelope = validEnvelope();
    (envelope.character as unknown as Record<string, unknown>)['data'] = 'nope';
    const result = validateImportEnvelope(envelope);
    expect(result.ok).toBe(false);
  });

  it('rejects when character.inventory is not an array', () => {
    const envelope = validEnvelope();
    (envelope.character as unknown as Record<string, unknown>)['inventory'] = {};
    const result = validateImportEnvelope(envelope);
    expect(result.ok).toBe(false);
  });
});
