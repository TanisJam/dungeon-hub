/**
 * Tests for app/encuentros/[id]/actions.ts — route-local Server Actions.
 *
 * FIX 4 (WARNING): each action validates characterId but not encounterId.
 * These tests assert the UUID guard on encounterId for all 4 actions.
 *
 * FIX 5 (SUGGESTION): VERSION_CONFLICT on useResource/restoreResource does NOT
 * call router.refresh() (that happens in the client component, ResourcePanel).
 * The action just returns { ok: false, code: 'VERSION_CONFLICT' }.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { api, ApiError } from '@/lib/api';
import { revalidatePath } from 'next/cache';

vi.mock('@/lib/api', () => ({
  api: { post: vi.fn() },
  ApiError: class ApiErrorMock extends Error {
    constructor(
      public status: number,
      public body: unknown,
      message = 'ApiError',
    ) {
      super(message);
    }
  },
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'test-token' } },
      }),
    },
  }),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

// Re-export from the parent actions (the EncounterActionResult union)
vi.mock('@/app/encuentros/actions', () => ({}));

const VALID_CHAR_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const VALID_ENC_ID  = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const BAD_ENC_ID    = 'not-a-uuid';

describe('route-local [id]/actions — encounterId UUID validation (FIX 4)', () => {
  beforeEach(() => vi.clearAllMocks());

  // useResource
  it('useResource: invalid encounterId → VALIDATION_FAILED, no api call', async () => {
    const { useResource } = await import('./actions');
    const result = await useResource(VALID_CHAR_ID, BAD_ENC_ID, 'monk:ki-points');
    expect(result).toEqual({ ok: false, code: 'VALIDATION_FAILED', message: expect.any(String) });
    expect(api.post).not.toHaveBeenCalled();
  });

  it('useResource: valid ids → posts to API and revalidates', async () => {
    vi.mocked(api.post).mockResolvedValue(undefined);
    const { useResource } = await import('./actions');
    const result = await useResource(VALID_CHAR_ID, VALID_ENC_ID, 'monk:ki-points');
    expect(result).toEqual({ ok: true });
    expect(revalidatePath).toHaveBeenCalledWith(`/encuentros/${VALID_ENC_ID}`);
  });

  // restoreResource
  it('restoreResource: invalid encounterId → VALIDATION_FAILED, no api call', async () => {
    const { restoreResource } = await import('./actions');
    const result = await restoreResource(VALID_CHAR_ID, BAD_ENC_ID, 'monk:ki-points');
    expect(result).toEqual({ ok: false, code: 'VALIDATION_FAILED', message: expect.any(String) });
    expect(api.post).not.toHaveBeenCalled();
  });

  it('restoreResource: valid ids → posts to API and revalidates', async () => {
    vi.mocked(api.post).mockResolvedValue(undefined);
    const { restoreResource } = await import('./actions');
    const result = await restoreResource(VALID_CHAR_ID, VALID_ENC_ID, 'monk:ki-points');
    expect(result).toEqual({ ok: true });
    expect(revalidatePath).toHaveBeenCalledWith(`/encuentros/${VALID_ENC_ID}`);
  });

  // shortRest
  it('shortRest: invalid encounterId → VALIDATION_FAILED, no api call', async () => {
    const { shortRest } = await import('./actions');
    const result = await shortRest(VALID_CHAR_ID, BAD_ENC_ID);
    expect(result).toEqual({ ok: false, code: 'VALIDATION_FAILED', message: expect.any(String) });
    expect(api.post).not.toHaveBeenCalled();
  });

  it('shortRest: valid ids → posts to /rest/short and revalidates', async () => {
    vi.mocked(api.post).mockResolvedValue(undefined);
    const { shortRest } = await import('./actions');
    const result = await shortRest(VALID_CHAR_ID, VALID_ENC_ID);
    expect(result).toEqual({ ok: true });
    expect(revalidatePath).toHaveBeenCalledWith(`/encuentros/${VALID_ENC_ID}`);
  });

  // longRest
  it('longRest: invalid encounterId → VALIDATION_FAILED, no api call', async () => {
    const { longRest } = await import('./actions');
    const result = await longRest(VALID_CHAR_ID, BAD_ENC_ID);
    expect(result).toEqual({ ok: false, code: 'VALIDATION_FAILED', message: expect.any(String) });
    expect(api.post).not.toHaveBeenCalled();
  });

  it('longRest: valid ids → posts to /rest/long and revalidates', async () => {
    vi.mocked(api.post).mockResolvedValue(undefined);
    const { longRest } = await import('./actions');
    const result = await longRest(VALID_CHAR_ID, VALID_ENC_ID);
    expect(result).toEqual({ ok: true });
    expect(revalidatePath).toHaveBeenCalledWith(`/encuentros/${VALID_ENC_ID}`);
  });
});
