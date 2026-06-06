import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ArchiveAffordance } from './_archive-affordance';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

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

const mockRefresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue({
    data: { session: { access_token: 'test-token' } },
  });
  mockPost.mockResolvedValue({});
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ArchiveAffordance', () => {
  it('WAA-RENDER-01: renders "Cerrar campaña" for GM on active campaign', () => {
    render(<ArchiveAffordance campaignId="camp-1" status="active" />);
    expect(screen.getByRole('button', { name: /Cerrar campaña/ })).toBeTruthy();
  });

  it('WAA-RENDER-02: renders "Reabrir campaña" for GM on archived campaign', () => {
    render(<ArchiveAffordance campaignId="camp-1" status="archived" />);
    expect(screen.getByRole('button', { name: /Reabrir campaña/ })).toBeTruthy();
  });

  it('WAA-ENDPOINT-03: clicking "Cerrar campaña" calls POST /campaigns/:id/archive', async () => {
    render(<ArchiveAffordance campaignId="camp-42" status="active" />);
    fireEvent.click(screen.getByRole('button', { name: /Cerrar campaña/ }));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith(
        '/campaigns/camp-42/archive',
        {},
        'test-token',
      );
    });
  });

  it('WAA-ENDPOINT-04: clicking "Reabrir campaña" calls POST /campaigns/:id/unarchive', async () => {
    render(<ArchiveAffordance campaignId="camp-42" status="archived" />);
    fireEvent.click(screen.getByRole('button', { name: /Reabrir campaña/ }));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith(
        '/campaigns/camp-42/unarchive',
        {},
        'test-token',
      );
    });
  });

  it('WAA-REFRESH-05: calls router.refresh() on success', async () => {
    render(<ArchiveAffordance campaignId="camp-1" status="active" />);
    fireEvent.click(screen.getByRole('button', { name: /Cerrar campaña/ }));

    await waitFor(() => {
      expect(mockRefresh).toHaveBeenCalledTimes(1);
    });
  });
});
