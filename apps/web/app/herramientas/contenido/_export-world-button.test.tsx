import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ExportWorldButton } from './_export-world-button';
import type { WorldExportEnvelope } from '@/lib/world-export-types';

// ---------------------------------------------------------------------------
// Mocks — mirrors apps/web/app/characters/[id]/_export-button.test.tsx
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
  // getErrorMessage (lib/error-message.ts) checks `instanceof ApiNetworkError`
  // unconditionally — the mock must export it even though these tests never
  // construct one, or that instanceof check throws on an undefined export.
  ApiNetworkError: class ApiNetworkError extends Error {},
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

const mockEnvelope: WorldExportEnvelope = {
  schemaVersion: 1,
  exportedAt: '2026-06-05T13:00:00.000Z',
  world: {
    name: 'Faerûn Casero',
    rulesProfile: {},
    npcs: [],
    factions: [],
    quests: [],
    hexes: [],
    pois: [],
    journal: [],
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

describe('ExportWorldButton', () => {
  it('renders "Exportar mundo (JSON)" button at idle state', () => {
    render(<ExportWorldButton worldId="world-uuid-001" />);
    expect(screen.getByRole('button', { name: /Exportar mundo \(JSON\)/ })).toBeTruthy();
  });

  it('success — calls api.get with correct path + token, triggers anchor click, revokes URL', async () => {
    render(<ExportWorldButton worldId="world-uuid-001" />);
    const btn = screen.getByRole('button', { name: /Exportar mundo \(JSON\)/ });
    fireEvent.click(btn);

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith('/worlds/world-uuid-001/export', 'test-access-token');
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
      expect(screen.getByRole('button', { name: /Exportar mundo \(JSON\)/ })).toBeTruthy();
    });
  });

  it('double-tap guard — second click while loading is ignored', async () => {
    let resolveGet!: (v: WorldExportEnvelope) => void;
    mockGet.mockReturnValue(new Promise<WorldExportEnvelope>((r) => { resolveGet = r; }));

    render(<ExportWorldButton worldId="world-uuid-001" />);
    const btn = screen.getByRole('button', { name: /Exportar mundo \(JSON\)/ });

    fireEvent.click(btn);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Exportando/ })).toBeTruthy();
    });
    expect(screen.getByRole('button').hasAttribute('disabled')).toBe(true);

    // Second click — should be blocked by disabled attribute
    fireEvent.click(screen.getByRole('button'));

    resolveGet(mockEnvelope);

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledOnce();
    });
  });

  it('error — api.get rejects → Spanish error message shown, button re-enabled', async () => {
    const { ApiError } = await import('@/lib/api');
    mockGet.mockRejectedValue(new ApiError(403, { error: 'FORBIDDEN' }, 'API 403'));

    render(<ExportWorldButton worldId="world-uuid-001" />);
    fireEvent.click(screen.getByRole('button', { name: /Exportar mundo \(JSON\)/ }));

    await waitFor(() => {
      expect(screen.getByText('FORBIDDEN')).toBeTruthy();
    });

    const btn = screen.getByRole('button');
    expect(btn.hasAttribute('disabled')).toBe(false);
    expect(btn.textContent).toContain('Exportar mundo (JSON)');
  });

  it('error — no session (non-ApiError) shows an inline alert instead of blanking the page', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });

    render(<ExportWorldButton worldId="world-uuid-001" />);
    fireEvent.click(screen.getByRole('button', { name: /Exportar mundo \(JSON\)/ }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy();
    });
    // Page never blanks — the button and its error message stay mounted.
    expect(screen.getByRole('button', { name: /Exportar mundo \(JSON\)/ })).toBeTruthy();
  });
});
