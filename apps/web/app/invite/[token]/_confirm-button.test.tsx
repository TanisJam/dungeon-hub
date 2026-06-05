import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ConfirmInviteButton } from './_confirm-button';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
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
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue({
    data: { session: { access_token: 'test-token' } },
  });
});

describe('ConfirmInviteButton', () => {
  it('WCIB-RENDER-01: renders "Unirme a la campaña" button', () => {
    render(<ConfirmInviteButton token="abc123" />);
    expect(screen.getByRole('button', { name: /Unirme a la campaña/ })).toBeTruthy();
  });

  it('WCIB-SUCCESS-02: calls api.post and router.push to campaign URL on success', async () => {
    mockPost.mockResolvedValue({ campaignId: 'camp-42' });

    render(<ConfirmInviteButton token="tok-xyz" />);
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/invites/confirm', { token: 'tok-xyz' }, 'test-token');
      expect(mockPush).toHaveBeenCalledWith('/campanas/camp-42');
    });
  });

  it('WCIB-LOADING-03: shows "Uniéndote…" while request is in flight', async () => {
    let resolve: (v: { campaignId: string }) => void;
    mockPost.mockReturnValue(new Promise<{ campaignId: string }>((r) => { resolve = r; }));

    render(<ConfirmInviteButton token="tok-abc" />);
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Uniéndote/ })).toBeTruthy();
    });

    resolve!({ campaignId: 'c1' });
  });

  it('WCIB-ERROR-04: shows inline error message on API failure', async () => {
    // Import ApiError inline for the check (it's a class in the mock)
    const { ApiError } = await import('@/lib/api');
    mockPost.mockRejectedValue(
      new ApiError(410, { error: 'EXPIRED' }, 'API 410: EXPIRED'),
    );

    render(<ConfirmInviteButton token="tok-expired" />);
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(screen.getByText(/EXPIRED/)).toBeTruthy();
    });
    // Button is re-enabled and restore original text
    expect(screen.getByRole('button', { name: /Unirme a la campaña/ })).toBeTruthy();
  });
});
