/**
 * Tests for app/encuentros/[id]/actions.ts — route-local Server Actions.
 *
 * FIX 4 (WARNING): each action validates characterId but not encounterId.
 * These tests assert the UUID guard on encounterId for all 4 actions.
 *
 * FIX 5 (SUGGESTION): VERSION_CONFLICT on useResource/restoreResource does NOT
 * call router.refresh() (that happens in the client component, ResourcePanel).
 * The action just returns { ok: false, code: 'VERSION_CONFLICT' }.
 *
 * REQ-WCR-WEB-ACT-01: activateRage and deactivateRage Server Actions.
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

// createClient mock — kept as a stable resolved value; individual tests that need
// to override session use vi.mocked(...).mockResolvedValueOnce(...)
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
const VALID_COMBATANT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

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
    // Body MUST be an object ({}), not undefined — ShortRestBody is z.object() and
    // rejects undefined ("expected object, received undefined" 400). Regression guard.
    expect(api.post).toHaveBeenCalledWith(
      `/characters/${VALID_CHAR_ID}/rest/short`,
      {},
      expect.any(String),
    );
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
    expect(api.post).toHaveBeenCalledWith(
      `/characters/${VALID_CHAR_ID}/rest/long`,
      {},
      expect.any(String),
    );
    expect(revalidatePath).toHaveBeenCalledWith(`/encuentros/${VALID_ENC_ID}`);
  });
});

// ── activateRage / deactivateRage — REQ-WCR-WEB-ACT-01 ───────────────────────

describe('activateRage — REQ-WCR-WEB-ACT-01', () => {
  beforeEach(() => vi.clearAllMocks());

  it('invalid combatantId → VALIDATION_FAILED, no api call', async () => {
    const { activateRage } = await import('./actions');
    const result = await activateRage(VALID_ENC_ID, 'not-a-uuid', 1);
    expect(result).toEqual({ ok: false, code: 'VALIDATION_FAILED', message: expect.any(String) });
    expect(api.post).not.toHaveBeenCalled();
  });

  it('invalid encounterId → VALIDATION_FAILED, no api call', async () => {
    const { activateRage } = await import('./actions');
    const result = await activateRage(BAD_ENC_ID, VALID_COMBATANT_ID, 1);
    expect(result).toEqual({ ok: false, code: 'VALIDATION_FAILED', message: expect.any(String) });
    expect(api.post).not.toHaveBeenCalled();
  });

  it('200 → ok:true, revalidatePath called', async () => {
    vi.mocked(api.post).mockResolvedValue(undefined);
    const { activateRage } = await import('./actions');
    const result = await activateRage(VALID_ENC_ID, VALID_COMBATANT_ID, 5);
    expect(result).toEqual({ ok: true });
    expect(revalidatePath).toHaveBeenCalledWith(`/encuentros/${VALID_ENC_ID}`);
    expect(api.post).toHaveBeenCalledWith(
      `/encounters/${VALID_ENC_ID}/actions/activate-rage`,
      { ragerId: VALID_COMBATANT_ID, version: 5 },
      'test-token',
    );
  });

  it('403 → FORBIDDEN', async () => {
    vi.mocked(api.post).mockRejectedValueOnce(
      new ApiError(403, { error: 'FORBIDDEN' }, 'FORBIDDEN'),
    );
    const { activateRage } = await import('./actions');
    const result = await activateRage(VALID_ENC_ID, VALID_COMBATANT_ID, 1);
    expect(result).toEqual({ ok: false, code: 'FORBIDDEN' });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('409 VERSION_CONFLICT → VERSION_CONFLICT', async () => {
    vi.mocked(api.post).mockRejectedValueOnce(
      new ApiError(409, { error: 'VERSION_CONFLICT' }, 'VERSION_CONFLICT'),
    );
    const { activateRage } = await import('./actions');
    const result = await activateRage(VALID_ENC_ID, VALID_COMBATANT_ID, 1);
    expect(result).toEqual({ ok: false, code: 'VERSION_CONFLICT' });
  });

  it('400 rule error (NOT_YOUR_TURN) → API_ERROR with message', async () => {
    vi.mocked(api.post).mockRejectedValueOnce(
      new ApiError(400, { error: 'NOT_YOUR_TURN' }, 'NOT_YOUR_TURN'),
    );
    const { activateRage } = await import('./actions');
    const result = await activateRage(VALID_ENC_ID, VALID_COMBATANT_ID, 1);
    expect(result).toEqual({ ok: false, code: 'API_ERROR', message: expect.anything() });
  });
});

describe('deactivateRage — REQ-WCR-WEB-ACT-01', () => {
  beforeEach(() => vi.clearAllMocks());

  it('invalid combatantId → VALIDATION_FAILED, no api call', async () => {
    const { deactivateRage } = await import('./actions');
    const result = await deactivateRage(VALID_ENC_ID, 'not-a-uuid', 1);
    expect(result).toEqual({ ok: false, code: 'VALIDATION_FAILED', message: expect.any(String) });
    expect(api.post).not.toHaveBeenCalled();
  });

  it('invalid encounterId → VALIDATION_FAILED, no api call', async () => {
    const { deactivateRage } = await import('./actions');
    const result = await deactivateRage(BAD_ENC_ID, VALID_COMBATANT_ID, 1);
    expect(result).toEqual({ ok: false, code: 'VALIDATION_FAILED', message: expect.any(String) });
    expect(api.post).not.toHaveBeenCalled();
  });

  it('200 → ok:true, revalidatePath called', async () => {
    vi.mocked(api.post).mockResolvedValue(undefined);
    const { deactivateRage } = await import('./actions');
    const result = await deactivateRage(VALID_ENC_ID, VALID_COMBATANT_ID, 5);
    expect(result).toEqual({ ok: true });
    expect(revalidatePath).toHaveBeenCalledWith(`/encuentros/${VALID_ENC_ID}`);
    expect(api.post).toHaveBeenCalledWith(
      `/encounters/${VALID_ENC_ID}/actions/deactivate-rage`,
      { ragerId: VALID_COMBATANT_ID, version: 5 },
      'test-token',
    );
  });

  it('403 → FORBIDDEN', async () => {
    vi.mocked(api.post).mockRejectedValueOnce(
      new ApiError(403, { error: 'FORBIDDEN' }, 'FORBIDDEN'),
    );
    const { deactivateRage } = await import('./actions');
    const result = await deactivateRage(VALID_ENC_ID, VALID_COMBATANT_ID, 1);
    expect(result).toEqual({ ok: false, code: 'FORBIDDEN' });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('409 VERSION_CONFLICT → VERSION_CONFLICT', async () => {
    vi.mocked(api.post).mockRejectedValueOnce(
      new ApiError(409, { error: 'VERSION_CONFLICT' }, 'VERSION_CONFLICT'),
    );
    const { deactivateRage } = await import('./actions');
    const result = await deactivateRage(VALID_ENC_ID, VALID_COMBATANT_ID, 1);
    expect(result).toEqual({ ok: false, code: 'VERSION_CONFLICT' });
  });

  it('400 rule error → API_ERROR with message', async () => {
    vi.mocked(api.post).mockRejectedValueOnce(
      new ApiError(400, { error: 'BONUS_ACTION_ALREADY_USED' }, 'BONUS_ACTION_ALREADY_USED'),
    );
    const { deactivateRage } = await import('./actions');
    const result = await deactivateRage(VALID_ENC_ID, VALID_COMBATANT_ID, 1);
    expect(result).toEqual({ ok: false, code: 'API_ERROR', message: expect.anything() });
  });
});
