/**
 * Tests for app/campanas/[id]/sessions/actions.ts — error mapping contract.
 *
 * verify W1 (Slice B): handleApiError MUST serialize a domain validation error's
 * issues[] array so the calling components (join-sheet resolveErrorMessage,
 * complete-form resolveErrors) can JSON.parse it and map each code to a
 * human-readable message. Before the fix the user only saw "VALIDATION_FAILED".
 *
 * This test exercises the REAL handleApiError path (the component tests mock the
 * action return value directly, which bypassed the broken layer).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { api } from '@/lib/api';

// ApiError mock preserves status + body so `err instanceof ApiError` and the
// body.issues branch in handleApiError both work. Defined via vi.hoisted so the
// class exists when the (hoisted) vi.mock factory runs.
const { MockApiError } = vi.hoisted(() => {
  class MockApiError extends Error {
    status: number;
    body: unknown;
    constructor(status: number, body: unknown, message: string) {
      super(message);
      this.status = status;
      this.body = body;
    }
  }
  return { MockApiError };
});

// ApiNetworkError mock mirrors the real class shape (kind + message) so
// `err instanceof ApiNetworkError` in handleApiError resolves correctly —
// without this, the real import would be `undefined` under this mock and
// any non-ApiError rejection would crash the instanceof check instead of
// falling through to the generic-error branch.
const { MockApiNetworkError } = vi.hoisted(() => {
  class MockApiNetworkError extends Error {
    kind: 'timeout' | 'network';
    constructor(kind: 'timeout' | 'network', message: string) {
      super(message);
      this.kind = kind;
    }
  }
  return { MockApiNetworkError };
});

vi.mock('@/lib/api', () => ({
  api: { post: vi.fn() },
  ApiError: MockApiError,
  ApiNetworkError: MockApiNetworkError,
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 't' } },
      }),
    },
  }),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const SESSION_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const CHAR_ID = 'b1ffc011-1c0b-4ef8-bb6d-6bb9bd380b22';
const CAMPAIGN_ID = 'c2ffc022-2c0b-4ef8-bb6d-6bb9bd380c33';

describe('joinSession error mapping (verify W1)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('serializes the issues[] array so the component can map the code', async () => {
    vi.mocked(api.post).mockRejectedValueOnce(
      new MockApiError(
        400,
        { error: 'VALIDATION_FAILED', issues: [{ code: 'SESSION_FULL', maxPlayers: 3, current: 3 }] },
        'API 400',
      ),
    );

    const { joinSession } = await import('./actions');
    const result = await joinSession(SESSION_ID, CHAR_ID, CAMPAIGN_ID);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    // The error string must be the serialized issues array — NOT "VALIDATION_FAILED".
    const issues = JSON.parse(result.error) as Array<{ code: string }>;
    expect(issues[0]?.code).toBe('SESSION_FULL');
  });

  it('falls back to message/error string when there is no issues[] array', async () => {
    vi.mocked(api.post).mockRejectedValueOnce(
      new MockApiError(403, { error: 'FORBIDDEN' }, 'API 403'),
    );

    const { joinSession } = await import('./actions');
    const result = await joinSession(SESSION_ID, CHAR_ID, CAMPAIGN_ID);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error).toBe('FORBIDDEN');
  });

  it('maps a timeout ApiNetworkError to a Spanish, non-technical message', async () => {
    vi.mocked(api.post).mockRejectedValueOnce(
      new MockApiNetworkError('timeout', 'Request to /sessions/x/join timed out after 10000ms'),
    );

    const { joinSession } = await import('./actions');
    const result = await joinSession(SESSION_ID, CHAR_ID, CAMPAIGN_ID);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error).toBe(
      'El servidor tardó demasiado en responder. Probá de nuevo en unos segundos.',
    );
    expect(result.status).toBeUndefined();
  });

  it('maps a network ApiNetworkError to a Spanish, non-technical message', async () => {
    vi.mocked(api.post).mockRejectedValueOnce(
      new MockApiNetworkError('network', 'Network error requesting /sessions/x/join'),
    );

    const { joinSession } = await import('./actions');
    const result = await joinSession(SESSION_ID, CHAR_ID, CAMPAIGN_ID);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error).toBe(
      'No se pudo conectar con el servidor. Probá de nuevo en unos segundos.',
    );
  });
});
