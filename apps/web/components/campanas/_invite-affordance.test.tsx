import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { InviteAffordance } from './_invite-affordance';
import { CampanaDetailView } from './campana-detail-view';
import type { CampaignDetail } from './types';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Stub SessionList so CampanaDetailView tests don't pull in supabase/server
vi.mock('@/components/campanas/sessions/session-list', () => ({
  SessionList: () => <div data-testid="session-list" />,
}));

const mockPost = vi.fn();
vi.mock('@/lib/api', () => ({
  api: { post: (...args: unknown[]) => mockPost(...args) },
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

const mockGetSession = vi.fn();
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getSession: mockGetSession },
  }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const baseDetail: CampaignDetail = {
  id: 'camp-1',
  name: 'Tres Lunas',
  gmUserId: 'gm-1',
  worldId: 'w-1',
  createdAt: '2026-01-01T00:00:00Z',
  memberRole: 'gm',
  callerRole: 'gm',
  playersCount: 3,
  sessionsCount: 7,
  nextSession: null,
  pendingFichas: 0,
  members: [
    { userId: 'u-gm', username: 'mau', role: 'gm', joinedAt: '2026-01-01T00:00:00Z' },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue({
    data: { session: { access_token: 'test-token' } },
  });
  // Default: no navigator.share
  Object.defineProperty(global.navigator, 'share', {
    value: undefined,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(global.navigator, 'clipboard', {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    writable: true,
    configurable: true,
  });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('InviteAffordance', () => {
  it('WIA-RENDER-01: renders "Invitar jugador" button', () => {
    render(<InviteAffordance campaignId="camp-1" />);
    expect(screen.getByRole('button', { name: /Invitar jugador/ })).toBeTruthy();
  });

  it('WIA-SHARE-02: calls api.post then navigator.share when share is available', async () => {
    const mockShare = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(global.navigator, 'share', {
      value: mockShare,
      writable: true,
      configurable: true,
    });
    mockPost.mockResolvedValue({
      url: 'https://app.local/invite/abc123',
      expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
    });

    render(<InviteAffordance campaignId="camp-1" />);
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith(
        '/campaigns/camp-1/invite',
        {},
        'test-token',
      );
      expect(mockShare).toHaveBeenCalledWith({ url: 'https://app.local/invite/abc123' });
    });
    // W2 fix: expiry confirmation must render on the share path too (REQ-WEB-GM-AFFORD-01)
    await waitFor(() => {
      expect(screen.getByText(/Enlace compartido · vence el/)).toBeTruthy();
    });
  });

  it('WIA-CLIPBOARD-03: calls navigator.clipboard.writeText when share API is unavailable', async () => {
    mockPost.mockResolvedValue({
      url: 'https://app.local/invite/def456',
      expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
    });

    render(<InviteAffordance campaignId="camp-1" />);
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        'https://app.local/invite/def456',
      );
    });
    // Copied confirmation message appears
    await waitFor(() => {
      expect(screen.getByText(/Enlace copiado/)).toBeTruthy();
    });
  });

  it('WIA-GM-VISIBILITY-04: affordance renders in CampanaDetailView when callerRole=gm', () => {
    render(<CampanaDetailView detail={{ ...baseDetail, callerRole: 'gm' }} sessions={[]} callerUserId="u-gm" worldId="w-1" callerCharacters={[]} />);
    expect(screen.getByRole('button', { name: /Invitar jugador/ })).toBeTruthy();
  });

  it('WIA-PLAYER-HIDDEN-05: affordance NOT rendered in CampanaDetailView when callerRole=player', () => {
    render(<CampanaDetailView detail={{ ...baseDetail, callerRole: 'player' }} sessions={[]} callerUserId="u-p1" worldId="w-1" callerCharacters={[]} />);
    expect(screen.queryByRole('button', { name: /Invitar jugador/ })).toBeNull();
  });
});
