/**
 * Tests for saveHp server action — HP edit affordance.
 *
 * T1: Happy path → api.put called with correct args; revalidatePath called; returns {ok:true}.
 * T2: API returns 403 HP_MAX_OWNER_FORBIDDEN → {ok:false, error:'forbidden'}.
 * T3: API returns 400 HP_CURRENT_NEGATIVE → {ok:false, error:'validation'}.
 * T4: No session → {ok:false, error:'auth'}.
 *
 * Spec: sdd/ficha-dm-affordances #995 — HPEditor Component
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock next/cache before importing the action
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

// Mock supabase server client
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

// Mock the api module
vi.mock('@/lib/api', () => ({
  api: {
    put: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    status: number;
    body: unknown;
    constructor(status: number, body: unknown, message: string) {
      super(message);
      this.status = status;
      this.body = body;
    }
  },
}));

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { api, ApiError } from '@/lib/api';
import { saveHp } from './save-hp-action';

const mockSession = { access_token: 'tok-abc' };

beforeEach(() => {
  vi.clearAllMocks();
  (createClient as ReturnType<typeof vi.fn>).mockResolvedValue({
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: mockSession } }),
    },
  });
});

describe('saveHp', () => {
  it('T1: happy path → api.put called; revalidatePath called; returns {ok:true}', async () => {
    (api.put as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const result = await saveHp({ characterId: 'char-1', current: 10, temp: 2 });

    expect(api.put).toHaveBeenCalledWith(
      '/characters/char-1/hp',
      { current: 10, temp: 2 },
      'tok-abc',
    );
    expect(revalidatePath).toHaveBeenCalledWith('/characters/char-1');
    expect(result).toEqual({ ok: true });
  });

  it('T2: API returns 403 HP_MAX_OWNER_FORBIDDEN → {ok:false, error:"forbidden"}', async () => {
    (api.put as ReturnType<typeof vi.fn>).mockRejectedValue(
      new ApiError(403, { issues: [{ code: 'HP_MAX_OWNER_FORBIDDEN' }] }, 'Forbidden'),
    );

    const result = await saveHp({ characterId: 'char-1', max: 25 });

    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: string }).error).toBe('forbidden');
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('T3: API returns 400 HP_CURRENT_NEGATIVE → {ok:false, error:"validation"}', async () => {
    (api.put as ReturnType<typeof vi.fn>).mockRejectedValue(
      new ApiError(400, { issues: [{ code: 'HP_CURRENT_NEGATIVE' }] }, 'Bad Request'),
    );

    const result = await saveHp({ characterId: 'char-1', current: -1 });

    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: string }).error).toBe('validation');
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('T4: no session → {ok:false, error:"auth"}', async () => {
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      },
    });

    const result = await saveHp({ characterId: 'char-1', current: 5 });

    expect(result).toEqual({ ok: false, error: 'auth', message: 'No autenticado.' });
    expect(api.put).not.toHaveBeenCalled();
  });
});
