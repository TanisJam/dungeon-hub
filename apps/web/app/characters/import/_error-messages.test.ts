import { describe, it, expect, vi } from 'vitest';

// `@/lib/api` imports `@/lib/env`, which throws at import time if the
// NEXT_PUBLIC_* env vars aren't set (they aren't, under vitest) — stub it,
// same as lib/api.test.ts and lib/error-message.test.ts do.
vi.mock('@/lib/env', () => ({
  env: {
    SUPABASE_URL: 'http://localhost',
    SUPABASE_ANON_KEY: 'test-anon-key',
    API_URL: 'http://localhost:4000',
  },
}));

import { ApiError, ApiNetworkError } from '@/lib/api';
import type { CompendiumRef, ImportEnvelopeIssue } from '@dungeon-hub/domain/character/import';
import { describeEnvelopeIssues, describeUnresolvedRefs, describeImportError } from './_error-messages';

describe('describeEnvelopeIssues', () => {
  it('SCHEMA_VERSION_UNSUPPORTED: names expected/got and asks for a fresh export', () => {
    const issues: ImportEnvelopeIssue[] = [
      { code: 'SCHEMA_VERSION_UNSUPPORTED', expected: 1, got: 2 },
    ];
    const result = describeEnvelopeIssues(issues);
    expect(result.message).toContain('encontrada: 2');
    expect(result.message).toContain('esperada: 1');
    expect(result.details).toBeUndefined();
  });

  it('MALFORMED_ENVELOPE: lists every offending path', () => {
    const issues: ImportEnvelopeIssue[] = [
      { code: 'MALFORMED_ENVELOPE', path: 'character.name', message: 'Required' },
      { code: 'MALFORMED_ENVELOPE', path: 'character.xp', message: 'Expected number' },
    ];
    const result = describeEnvelopeIssues(issues);
    expect(result.details).toEqual([
      'character.name: Required',
      'character.xp: Expected number',
    ]);
  });
});

describe('describeUnresolvedRefs', () => {
  it('lists every unresolved reference with a Spanish kind label, slug, and source', () => {
    const refs: CompendiumRef[] = [
      { kind: 'race', slug: 'aasimar', source: 'MPMM' },
      { kind: 'spell', slug: 'fireball', source: 'PHB' },
      { kind: 'item', slug: 'bag-of-holding', source: 'DMG' },
    ];
    const result = describeUnresolvedRefs(refs);
    expect(result.details).toEqual([
      'Raza: aasimar (MPMM)',
      'Hechizo: fireball (PHB)',
      'Objeto: bag-of-holding (DMG)',
    ]);
  });
});

describe('describeImportError', () => {
  it('network timeout: uses the shared Spanish outage copy', () => {
    const err = new ApiNetworkError('timeout', 'Request timed out');
    const result = describeImportError(err);
    expect(result.message).toBe('El servidor tardó demasiado en responder. Probá de nuevo en unos segundos.');
  });

  it('network failure: uses the shared Spanish outage copy', () => {
    const err = new ApiNetworkError('network', 'Network error');
    const result = describeImportError(err);
    expect(result.message).toBe('No se pudo conectar con el servidor. Probá de nuevo en unos segundos.');
  });

  it('400 UNRESOLVED_REFS: delegates to describeUnresolvedRefs', () => {
    const issues: CompendiumRef[] = [{ kind: 'background', slug: 'sage', source: 'PHB' }];
    const err = new ApiError(400, { error: 'UNRESOLVED_REFS', issues }, 'API 400');
    const result = describeImportError(err);
    expect(result.details).toEqual(['Trasfondo: sage (PHB)']);
  });

  it('400 VALIDATION_FAILED: delegates to describeEnvelopeIssues', () => {
    const issues: ImportEnvelopeIssue[] = [
      { code: 'SCHEMA_VERSION_UNSUPPORTED', expected: 1, got: 3 },
    ];
    const err = new ApiError(400, { error: 'VALIDATION_FAILED', issues }, 'API 400');
    const result = describeImportError(err);
    expect(result.message).toContain('encontrada: 3');
  });

  it('403 NOT_WORLD_MEMBER: explains the membership requirement', () => {
    const err = new ApiError(403, { error: 'NOT_WORLD_MEMBER', worldId: 'w1' }, 'API 403');
    const result = describeImportError(err);
    expect(result.message).toBe('No sos miembro de ese mundo. Pedile al DM que te invite antes de importar.');
  });

  it('404 NOT_FOUND: explains the world no longer exists', () => {
    const err = new ApiError(404, { error: 'NOT_FOUND' }, 'API 404');
    const result = describeImportError(err);
    expect(result.message).toBe('Ese mundo ya no existe. Elegí otro e intentá de nuevo.');
  });

  it('unrecognized error: falls back to a generic Spanish message', () => {
    const result = describeImportError(new Error('boom'));
    expect(result.message).toBe('boom');
  });
});
