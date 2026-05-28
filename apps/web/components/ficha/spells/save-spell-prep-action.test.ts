/**
 * Tests for saveSpellPrepForClass server action — SPELL-PREP-07.
 *
 * T1: Happy path → api.put called with correct body; revalidatePath called; returns {ok:true}.
 * T2: API returns 409 OVER_LIMIT → returns {ok:false, error:'over_limit'}.
 * T3: api.put throws (network) → returns {ok:false, error:'unknown'}.
 * T4: No session → returns {ok:false, error:'auth'}.
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
import { saveSpellPrepForClass } from './save-spell-prep-action';

const mockSession = { access_token: 'tok-abc' };

const baseInput = {
  characterId: 'char-1',
  classSlug: 'cleric',
  cantrips: [{ slug: 'sacred-flame', source: 'PHB' }],
  known: [],
  prepared: [{ slug: 'bless', source: 'PHB' }],
};

beforeEach(() => {
  vi.clearAllMocks();
  // Default: authenticated
  (createClient as ReturnType<typeof vi.fn>).mockResolvedValue({
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: mockSession } }),
    },
  });
});

describe('saveSpellPrepForClass', () => {
  it('T1: happy path → api.put called with correct body; revalidatePath called; returns {ok:true}', async () => {
    (api.put as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const result = await saveSpellPrepForClass(baseInput);

    expect(api.put).toHaveBeenCalledWith(
      '/characters/char-1/classes/cleric/spells',
      {
        cantrips: baseInput.cantrips,
        known: baseInput.known,
        prepared: baseInput.prepared,
      },
      'tok-abc',
    );
    expect(revalidatePath).toHaveBeenCalledWith('/characters/char-1');
    expect(result).toEqual({ ok: true });
  });

  it('T2: API returns 409 OVER_LIMIT → returns {ok:false, error:"over_limit"}', async () => {
    (api.put as ReturnType<typeof vi.fn>).mockRejectedValue(
      new ApiError(409, { error: 'OVER_LIMIT' }, 'OVER_LIMIT'),
    );

    const result = await saveSpellPrepForClass(baseInput);

    expect(result).toEqual({ ok: false, error: 'over_limit' });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('T3: api.put throws network error → returns {ok:false, error:"unknown"}', async () => {
    (api.put as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Network error'),
    );

    const result = await saveSpellPrepForClass(baseInput);

    expect(result).toEqual({ ok: false, error: 'unknown', message: 'Network error' });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('T4: no session → returns {ok:false, error:"auth"}', async () => {
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      },
    });

    const result = await saveSpellPrepForClass(baseInput);

    expect(result).toEqual({ ok: false, error: 'auth', message: 'No autenticado.' });
    expect(api.put).not.toHaveBeenCalled();
  });
});
