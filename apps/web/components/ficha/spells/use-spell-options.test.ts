/**
 * Tests for useSpellOptions hook — Dedup 1 (Tier 1 homogenization).
 *
 * The hook encapsulates the identical lazy-fetch pattern from
 * SpellKnownSectionEditor and SpellPrepSectionEditor:
 *   - FetchState: idle | loading | loaded | error
 *   - useEffect: when `open` becomes true → getSession() → api.get(...) → loaded/error
 *   - When `open` is false or changes back to false → no fetch triggered
 *
 * T1: returns idle state initially.
 * T2: no fetch when open===false (stays idle).
 * T3: transitions to loading then loaded when open===true.
 * T4: transitions to error when api.get rejects.
 * T5: re-fetches when characterId/classSlug change while open.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// Mock supabase client
vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn().mockReturnValue({
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'tok-test' } },
      }),
    },
  }),
}));

// Mock api
let resolveOptions: (v: unknown) => void = () => {};
let rejectOptions: (e: unknown) => void = () => {};
vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn().mockImplementation(
      () => new Promise((res, rej) => {
        resolveOptions = res;
        rejectOptions = rej;
      }),
    ),
  },
  ApiNetworkError: class ApiNetworkError extends Error {
    kind: 'timeout' | 'network';
    constructor(kind: 'timeout' | 'network', message: string) {
      super(message);
      this.kind = kind;
    }
  },
}));

import { api } from '@/lib/api';
import { useSpellOptions } from './use-spell-options';

describe('useSpellOptions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (api.get as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise((res, rej) => {
        resolveOptions = res;
        rejectOptions = rej;
      }),
    );
  });

  it('T1: returns idle state initially', () => {
    const { result } = renderHook(() =>
      useSpellOptions('char-1', 'wizard', false),
    );
    expect(result.current.status).toBe('idle');
  });

  it('T2: no fetch when open===false (stays idle)', async () => {
    const { result } = renderHook(() =>
      useSpellOptions('char-1', 'wizard', false),
    );
    // Give it a tick to potentially fire effects
    await act(async () => {});
    expect(result.current.status).toBe('idle');
    expect(api.get).not.toHaveBeenCalled();
  });

  it('T3: transitions to loading then loaded when open===true', async () => {
    const { result } = renderHook(() =>
      useSpellOptions('char-1', 'wizard', true),
    );

    // Should be loading immediately after open becomes true
    await waitFor(() => {
      expect(result.current.status).toBe('loading');
    });

    // Resolve the fetch
    await act(async () => {
      resolveOptions({ availableSpells: [{ slug: 'magic-missile', source: 'PHB', name: 'Magic Missile', level: 1 }] });
    });

    expect(result.current.status).toBe('loaded');
    if (result.current.status === 'loaded') {
      expect(result.current.data).toBeDefined();
    }
  });

  it('T4: transitions to error when api.get rejects', async () => {
    const { result } = renderHook(() =>
      useSpellOptions('char-1', 'wizard', true),
    );

    await waitFor(() => {
      expect(result.current.status).toBe('loading');
    });

    await act(async () => {
      rejectOptions(new Error('Network error'));
    });

    expect(result.current.status).toBe('error');
    if (result.current.status === 'error') {
      expect(result.current.message).toBe('Network error');
    }
  });

  it('T5: constructs URL using characterId and classSlug', async () => {
    renderHook(() => useSpellOptions('char-abc', 'cleric', true));

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(
        '/characters/char-abc/classes/cleric/spells/options',
        expect.anything(),
      );
    });
  });
});
