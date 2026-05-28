/**
 * Tests for saveSpellKnown server action — DM spell known override.
 *
 * T1: Happy path → api.put called; revalidatePath called; returns {ok:true}.
 * T2: API returns 403 DM_ONLY → {ok:false, error:'forbidden'}.
 * T3: API returns 400 SPELL_NOT_IN_CLASS_LIST → {ok:false, error:'validation', offendingSlugs}.
 * T4: No session → {ok:false, error:'auth'}.
 *
 * Spec: sdd/ficha-dm-affordances #995 — SpellKnownEditor Component
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

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
import { saveSpellKnown } from './save-spell-known-action';

const mockSession = { access_token: 'tok-abc' };
const baseInput = {
  characterId: 'char-1',
  classSlug: 'cleric',
  known: [{ slug: 'bless', source: 'PHB' }, { slug: 'cure-wounds', source: 'PHB' }],
};

beforeEach(() => {
  vi.clearAllMocks();
  (createClient as ReturnType<typeof vi.fn>).mockResolvedValue({
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: mockSession } }),
    },
  });
});

describe('saveSpellKnown', () => {
  it('T1: happy path → api.put called; revalidatePath called; returns {ok:true}', async () => {
    (api.put as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const result = await saveSpellKnown(baseInput);

    expect(api.put).toHaveBeenCalledWith(
      '/characters/char-1/classes/cleric/known',
      { known: baseInput.known },
      'tok-abc',
    );
    expect(revalidatePath).toHaveBeenCalledWith('/characters/char-1');
    expect(result).toEqual({ ok: true });
  });

  it('T2: API returns 403 DM_ONLY → {ok:false, error:"forbidden"}', async () => {
    (api.put as ReturnType<typeof vi.fn>).mockRejectedValue(
      new ApiError(403, { issues: [{ code: 'DM_ONLY' }] }, 'Forbidden'),
    );

    const result = await saveSpellKnown(baseInput);

    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: string }).error).toBe('forbidden');
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('T3: API returns 400 SPELL_NOT_IN_CLASS_LIST → {ok:false, error:"validation", offendingSlugs}', async () => {
    (api.put as ReturnType<typeof vi.fn>).mockRejectedValue(
      new ApiError(
        400,
        { issues: [{ code: 'SPELL_NOT_IN_CLASS_LIST', slug: 'invented-spell' }] },
        'Bad Request',
      ),
    );

    const result = await saveSpellKnown({ ...baseInput, known: [{ slug: 'invented-spell' }] });

    expect(result.ok).toBe(false);
    const fail = result as { ok: false; error: string; offendingSlugs?: string[] };
    expect(fail.error).toBe('validation');
    expect(fail.offendingSlugs).toContain('invented-spell');
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('T4: no session → {ok:false, error:"auth"}', async () => {
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      },
    });

    const result = await saveSpellKnown(baseInput);

    expect(result).toEqual({ ok: false, error: 'auth', message: 'No autenticado.' });
    expect(api.put).not.toHaveBeenCalled();
  });
});
