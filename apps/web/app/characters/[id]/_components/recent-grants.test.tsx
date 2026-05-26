/**
 * RecentGrants — component tests.
 *
 * REQ-CRG-WIDGET (sdd/inventory-d4-d6 spec #889):
 *   - with events: renders rows with human labels
 *   - empty state: "Sin grants recientes."
 *   - non-viewer (callerRole=null): renders null
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { act } from 'react';

// Mock the api module before importing the component
vi.mock('@/lib/api', () => ({
  ApiError: class ApiError extends Error {
    constructor(public status: number, public body: unknown, message: string) {
      super(message);
    }
  },
  api: {
    get: vi.fn(),
  },
}));

import { api } from '@/lib/api';
import { RecentGrants } from './recent-grants';

const PROPS = {
  characterId: 'char-1',
  accessToken: 'tok-test',
};

const ITEM_GRANT_EVENT = {
  id: 'ev-1',
  eventType: 'item_grant',
  occurredAt: new Date(Date.now() - 60_000).toISOString(), // 1 min ago
  actorUserId: 'dm-1',
  sessionId: 'sess-1',
  payload: { characterId: 'char-1', itemSlug: 'longsword', itemSource: 'PHB', quantity: 1 },
};

const GOLD_GRANT_EVENT = {
  id: 'ev-2',
  eventType: 'gold_grant',
  occurredAt: new Date(Date.now() - 3_600_000).toISOString(), // 1 hr ago
  actorUserId: 'dm-1',
  sessionId: 'sess-1',
  payload: { characterId: 'char-1', deltas: { gp: 50 }, before: {}, after: {} },
};

const XP_AWARD_EVENT = {
  id: 'ev-3',
  eventType: 'xp_award',
  occurredAt: new Date(Date.now() - 86_400_000).toISOString(), // 1 day ago
  actorUserId: 'dm-1',
  sessionId: 'sess-1',
  payload: { characterId: 'char-1', award: 100, before: 0, after: 100 },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('RecentGrants — visibility', () => {
  it('null callerRole → renders null (non-viewer gate)', async () => {
    // Server Components must be awaited before render in RTL (async fn returns JSX or null).
    const result = await RecentGrants({ ...PROPS, callerRole: null });
    // callerRole=null → component returns null (no DOM output).
    expect(result).toBeNull();
    // Guard: api.get should NOT be called (early return before fetch).
    expect(vi.mocked(api.get)).not.toHaveBeenCalled();
  });
});

describe('RecentGrants — with events', () => {
  it('player callerRole + 3 events → renders 3 rows with human labels', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({
      events: [ITEM_GRANT_EVENT, GOLD_GRANT_EVENT, XP_AWARD_EVENT],
    });

    await act(async () => {
      render(
        await RecentGrants({ ...PROPS, callerRole: 'player' }),
      );
    });

    // Each event type has a distinct label
    expect(screen.getByText(/Recibiste longsword del DM/)).toBeTruthy();
    expect(screen.getByText(/Recibiste 50 gp del DM/)).toBeTruthy();
    expect(screen.getByText(/Ganaste 100 XP/)).toBeTruthy();
  });

  it('gm callerRole + events → renders rows', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({
      events: [ITEM_GRANT_EVENT],
    });

    await act(async () => {
      render(
        await RecentGrants({ ...PROPS, callerRole: 'gm' }),
      );
    });

    expect(screen.getByText(/Recibiste longsword del DM/)).toBeTruthy();
  });
});

describe('RecentGrants — empty state', () => {
  it('owner with no events → shows "Sin grants recientes."', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ events: [] });

    await act(async () => {
      render(
        await RecentGrants({ ...PROPS, callerRole: 'player' }),
      );
    });

    expect(screen.getByText('Sin grants recientes.')).toBeTruthy();
  });
});
