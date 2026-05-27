/**
 * Tests for app/inicio/actions.ts
 *
 * IPA-APPROVE-01: approveFichaFromInicio calls approve endpoint + revalidatePath('/inicio')
 * IPA-REJECT-02: rejectFichaFromInicio calls reject endpoint + revalidatePath('/inicio')
 * IPA-ZOD-INPUT-03: invalid id → VALIDATION_FAILED, API NOT called
 * IPA-RESULT-SHAPE-05: returns { ok: true } on success
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { api } from '@/lib/api';
import { revalidatePath } from 'next/cache';

vi.mock('@/lib/api', () => ({
  api: { post: vi.fn() },
  ApiError: class extends Error {},
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

describe('approveFichaFromInicio', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('T1: calls api.post with approve URL and token', async () => {
    const { approveFichaFromInicio } = await import('./actions');
    await approveFichaFromInicio(VALID_UUID);
    expect(api.post).toHaveBeenCalledWith(
      `/characters/${VALID_UUID}/approve`,
      {},
      't',
    );
  });

  it('T2: calls revalidatePath("/inicio")', async () => {
    const { approveFichaFromInicio } = await import('./actions');
    await approveFichaFromInicio(VALID_UUID);
    expect(revalidatePath).toHaveBeenCalledWith('/inicio');
  });

  it('T3: returns { ok: true } on success', async () => {
    const { approveFichaFromInicio } = await import('./actions');
    const result = await approveFichaFromInicio(VALID_UUID);
    expect(result).toEqual({ ok: true });
  });

  it('T4: invalid id → VALIDATION_FAILED without calling api.post', async () => {
    const { approveFichaFromInicio } = await import('./actions');
    const result = await approveFichaFromInicio('not-a-uuid');
    expect(result).toEqual({ ok: false, code: 'VALIDATION_FAILED' });
    expect(api.post).not.toHaveBeenCalled();
  });
});

describe('rejectFichaFromInicio', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('T5: calls api.post with reject URL and returns { ok: true }', async () => {
    const { rejectFichaFromInicio } = await import('./actions');
    const result = await rejectFichaFromInicio(VALID_UUID);
    expect(api.post).toHaveBeenCalledWith(
      `/characters/${VALID_UUID}/reject`,
      {},
      't',
    );
    expect(result).toEqual({ ok: true });
  });
});
