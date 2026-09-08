/**
 * Tests for lib/error-message.ts — Spanish outage copy for ApiNetworkError.
 *
 * `ApiNetworkError` is thrown by `lib/api.ts` when a request never gets an
 * HTTP response (home-lab tunnel hung or unreachable). Ordinary catch sites
 * across apps/web fall back to `err instanceof Error ? err.message : ...`,
 * which — for ApiNetworkError — surfaced the raw English message the
 * network layer throws internally. These helpers close that gap.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/env', () => ({
  env: {
    SUPABASE_URL: 'http://localhost',
    SUPABASE_ANON_KEY: 'test-anon-key',
    API_URL: 'http://localhost:4000',
  },
}));

import { ApiError, ApiNetworkError } from './api';
import { getErrorMessage, networkErrorMessage, networkErrorClause } from './error-message';

describe('networkErrorMessage', () => {
  it('returns the timeout message for kind "timeout"', () => {
    const err = new ApiNetworkError('timeout', 'Request to /x timed out after 10000ms');
    expect(networkErrorMessage(err)).toBe(
      'El servidor tardó demasiado en responder. Probá de nuevo en unos segundos.',
    );
  });

  it('returns the unreachable message for kind "network"', () => {
    const err = new ApiNetworkError('network', 'Network error requesting /x');
    expect(networkErrorMessage(err)).toBe(
      'No se pudo conectar con el servidor. Probá de nuevo en unos segundos.',
    );
  });

  it('returns undefined for an ApiError', () => {
    const err = new ApiError(404, { error: 'NOT_FOUND' }, 'API 404: not found');
    expect(networkErrorMessage(err)).toBeUndefined();
  });

  it('returns undefined for a plain Error', () => {
    expect(networkErrorMessage(new Error('boom'))).toBeUndefined();
  });

  it('returns undefined for a non-Error throw', () => {
    expect(networkErrorMessage('boom')).toBeUndefined();
  });
});

describe('getErrorMessage', () => {
  it('prefers the Spanish network message over Error#message for ApiNetworkError', () => {
    const err = new ApiNetworkError('timeout', 'Request to /x timed out after 10000ms');
    expect(getErrorMessage(err)).toBe(
      'El servidor tardó demasiado en responder. Probá de nuevo en unos segundos.',
    );
  });

  it('returns the Error message for a plain Error', () => {
    expect(getErrorMessage(new Error('Something broke'))).toBe('Something broke');
  });

  it('returns the default fallback for a non-Error throw', () => {
    expect(getErrorMessage('boom')).toBe('Error desconocido');
  });

  it('returns a custom fallback for a non-Error throw when provided', () => {
    expect(getErrorMessage('boom', 'Unknown error')).toBe('Unknown error');
  });

  it('does not special-case ApiError — callers keep branching on status/body themselves', () => {
    const err = new ApiError(500, { message: 'boom' }, 'API 500: boom');
    // ApiError extends Error, so its own #message is returned like any other Error.
    expect(getErrorMessage(err)).toBe('API 500: boom');
  });
});

describe('networkErrorClause()', () => {
  it('omits the trailing full stop and the retry tail, for mid-sentence slots', () => {
    expect(networkErrorClause(new ApiNetworkError('network', 'boom'))).toBe(
      'No se pudo conectar con el servidor',
    );
    expect(networkErrorClause(new ApiNetworkError('timeout', 'boom'))).toBe(
      'El servidor tardó demasiado en responder',
    );
  });

  it('returns undefined for anything that is not an ApiNetworkError', () => {
    expect(networkErrorClause(new Error('plain'))).toBeUndefined();
    expect(networkErrorClause('nope')).toBeUndefined();
  });
});
