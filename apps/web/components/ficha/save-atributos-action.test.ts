/**
 * Tests for saveAtributos server action.
 *
 * T1: Happy path — api.put succeeds → revalidatePath called; returns {ok:true}.
 * T2: CHARACTER_LOCKED (409) → returns {ok:false, error:'locked'}.
 * T3: Unauthenticated → returns {ok:false, error:'auth'}.
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
import { saveAtributos } from './save-atributos-action';

const mockSession = { access_token: 'tok-123' };
const defaultScores = { str: 16, dex: 14, con: 12, int: 10, wis: 8, cha: 15 };

beforeEach(() => {
  vi.clearAllMocks();
  // Default: authenticated
  (createClient as ReturnType<typeof vi.fn>).mockResolvedValue({
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: mockSession } }),
    },
  });
});

describe('saveAtributos', () => {
  it('T1: happy path → api.put called; revalidatePath called; returns {ok:true}', async () => {
    (api.put as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const result = await saveAtributos('char-1', 'point-buy', defaultScores);

    expect(api.put).toHaveBeenCalledWith(
      '/characters/char-1/stats',
      { method: 'point-buy', scores: defaultScores },
      'tok-123',
    );
    expect(revalidatePath).toHaveBeenCalledWith('/characters/char-1');
    expect(result).toEqual({ ok: true });
  });

  it('T2: CHARACTER_LOCKED (409) → returns {ok:false, error:"locked"}', async () => {
    (api.put as ReturnType<typeof vi.fn>).mockRejectedValue(
      new ApiError(409, { error: 'CHARACTER_LOCKED' }, 'CHARACTER_LOCKED'),
    );

    const result = await saveAtributos('char-1', 'point-buy', defaultScores);

    expect(result).toEqual({ ok: false, error: 'locked' });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('T3: no session → returns {ok:false, error:"auth"}', async () => {
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      },
    });

    const result = await saveAtributos('char-1', 'point-buy', defaultScores);

    expect(result).toEqual({ ok: false, error: 'auth', message: 'No autenticado.' });
    expect(api.put).not.toHaveBeenCalled();
  });
});
