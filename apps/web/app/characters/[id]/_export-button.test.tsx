import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ExportButton } from './_export-button';
import type { CharacterExportEnvelope } from '@/lib/sheet-types';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGet = vi.fn();
vi.mock('@/lib/api', () => ({
  api: { get: (...args: unknown[]) => mockGet(...args) },
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

// Stub URL.createObjectURL / revokeObjectURL
const mockCreateObjectURL = vi.fn().mockReturnValue('blob:mock-url');
const mockRevokeObjectURL = vi.fn();
Object.defineProperty(global, 'URL', {
  value: {
    createObjectURL: mockCreateObjectURL,
    revokeObjectURL: mockRevokeObjectURL,
  },
  writable: true,
});

// Spy on HTMLAnchorElement.prototype.click
const anchorClickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockEnvelope: CharacterExportEnvelope = {
  schemaVersion: 1,
  exportedAt: '2026-06-05T13:00:00.000Z',
  character: {
    id: 'char-uuid-001',
    name: 'Aria Stormwind',
    worldId: 'world-uuid-001',
    status: 'active',
    xp: 3000,
    data: { hp: { current: 22, max: 22, temp: 0 } },
    inventory: [{ itemSlug: 'longsword', itemSource: 'PHB', quantity: 1 }],
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue({
    data: { session: { access_token: 'test-access-token' } },
  });
  mockGet.mockResolvedValue(mockEnvelope);
  mockCreateObjectURL.mockReturnValue('blob:mock-url');
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ExportButton', () => {
  it('SCEN-BTN-RENDER: renders "Exportar JSON" button at idle state', () => {
    render(<ExportButton characterId="char-uuid-001" characterName="Aria Stormwind" />);
    expect(screen.getByRole('button', { name: /Exportar JSON/ })).toBeTruthy();
  });

  it('SCEN-BTN-01/02: success — calls api.get with correct path + token, triggers anchor click, revokes URL', async () => {
    render(<ExportButton characterId="char-uuid-001" characterName="Aria Stormwind" />);
    const btn = screen.getByRole('button', { name: /Exportar JSON/ });
    fireEvent.click(btn);

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith(
        '/characters/char-uuid-001/export',
        'test-access-token',
      );
    });

    await waitFor(() => {
      expect(mockCreateObjectURL).toHaveBeenCalledOnce();
    });

    await waitFor(() => {
      expect(anchorClickSpy).toHaveBeenCalledOnce();
    });

    await waitFor(() => {
      expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    });

    // Button returns to idle after success
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Exportar JSON/ })).toBeTruthy();
    });
  });

  it('SCEN-BTN-02: double-tap guard — second click while loading is ignored', async () => {
    // Delay the api.get resolution to keep button in loading state
    let resolveGet!: (v: CharacterExportEnvelope) => void;
    mockGet.mockReturnValue(new Promise<CharacterExportEnvelope>((r) => { resolveGet = r; }));

    render(<ExportButton characterId="char-uuid-001" characterName="Aria Stormwind" />);
    const btn = screen.getByRole('button', { name: /Exportar JSON/ });

    fireEvent.click(btn);

    // Button should now show loading label and be disabled
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Exportando/ })).toBeTruthy();
    });
    expect(screen.getByRole('button').hasAttribute('disabled')).toBe(true);

    // Second click — should be blocked by disabled attribute
    fireEvent.click(screen.getByRole('button'));

    // Resolve the first request
    resolveGet(mockEnvelope);

    await waitFor(() => {
      // api.get must have been called exactly once despite two clicks
      expect(mockGet).toHaveBeenCalledOnce();
    });
  });

  it('SCEN-BTN-03/04/05: error — api.get rejects → error message shown, button re-enabled', async () => {
    const { ApiError } = await import('@/lib/api');
    mockGet.mockRejectedValue(
      new ApiError(500, { error: 'INTERNAL_SERVER_ERROR' }, 'API 500'),
    );

    render(<ExportButton characterId="char-uuid-001" characterName="Aria Stormwind" />);
    fireEvent.click(screen.getByRole('button', { name: /Exportar JSON/ }));

    await waitFor(() => {
      expect(screen.getByText('INTERNAL_SERVER_ERROR')).toBeTruthy();
    });

    // Button is re-enabled (not in loading state) after error
    const btn = screen.getByRole('button');
    expect(btn.hasAttribute('disabled')).toBe(false);
    expect(btn.textContent).toContain('Exportar JSON');
  });

  it('SCEN-BTN-05: 403 error body is surfaced to user', async () => {
    const { ApiError } = await import('@/lib/api');
    mockGet.mockRejectedValue(
      new ApiError(403, { error: 'FORBIDDEN' }, 'API 403'),
    );

    render(<ExportButton characterId="char-uuid-001" characterName="Aria Stormwind" />);
    fireEvent.click(screen.getByRole('button', { name: /Exportar JSON/ }));

    await waitFor(() => {
      expect(screen.getByText('FORBIDDEN')).toBeTruthy();
    });
  });
});
