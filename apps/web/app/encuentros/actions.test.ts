/**
 * Tests for app/encuentros/actions.ts
 *
 * Mirrors the pattern of app/inicio/actions.test.ts:
 * - Zod uuid validation in front of api calls.
 * - 409 → VERSION_CONFLICT (encuentros-specific).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { api, ApiError } from '@/lib/api';
import { revalidatePath } from 'next/cache';

vi.mock('@/lib/api', () => ({
  api: { post: vi.fn() },
  ApiError: class ApiErrorMock extends Error {
    constructor(public status: number, public body: unknown, message: string) {
      super(message);
    }
  },
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

const VALID_UUID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

describe('advanceEncounterTurn', () => {
  beforeEach(() => vi.clearAllMocks());

  it('T1: posts to /encounters/:id/advance-turn with version + revalidatePath', async () => {
    vi.mocked(api.post).mockResolvedValue({ ok: true } as never);
    const { advanceEncounterTurn } = await import('./actions');
    const result = await advanceEncounterTurn(VALID_UUID, 1);
    expect(api.post).toHaveBeenCalledWith(
      `/encounters/${VALID_UUID}/advance-turn`,
      { version: 1 },
      't',
    );
    expect(revalidatePath).toHaveBeenCalledWith(`/encuentros/${VALID_UUID}`);
    expect(result).toEqual({ ok: true });
  });

  it('T2: invalid uuid → VALIDATION_FAILED, no api call', async () => {
    const { advanceEncounterTurn } = await import('./actions');
    const result = await advanceEncounterTurn('not-a-uuid', 1);
    expect(result).toEqual({ ok: false, code: 'VALIDATION_FAILED' });
    expect(api.post).not.toHaveBeenCalled();
  });

  it('T3: api 409 → VERSION_CONFLICT', async () => {
    vi.mocked(api.post).mockRejectedValue(new ApiError(409, null, 'conflict'));
    const { advanceEncounterTurn } = await import('./actions');
    const result = await advanceEncounterTurn(VALID_UUID, 1);
    expect(result).toEqual({ ok: false, code: 'VERSION_CONFLICT' });
  });
});
