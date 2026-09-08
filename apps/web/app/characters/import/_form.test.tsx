/**
 * Unit tests for ImportCharacterForm.
 *
 * Covers (per task spec): a malformed file rejected client-side, the
 * UNRESOLVED_REFS error rendering every reference, and the success path.
 * A couple of extra scenarios (world auto-select, submit gating) mirror the
 * sibling ../new/_form.test.tsx conventions.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ImportCharacterForm } from './_form';
import type { CharacterImportEnvelope } from '@dungeon-hub/domain/character/import';

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
  ApiNetworkError: class ApiNetworkError extends Error {
    kind: string;
    constructor(kind: string, message: string) {
      super(message);
      this.kind = kind;
    }
  },
}));

const mockGetSession = vi.fn();
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getSession: mockGetSession },
  }),
}));

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const worlds = [
  { id: 'w1', name: 'Faerûn', slug: 'faerun' },
  { id: 'w2', name: 'Eberron', slug: 'eberron' },
];

const validEnvelope: CharacterImportEnvelope = {
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

function makeFile(contents: string, name = 'aria.json'): File {
  return new File([contents], name, { type: 'application/json' });
}

// FileReader resolves asynchronously (a jsdom-simulated I/O tick, not just a
// microtask), so every caller must wait for an assertion that only becomes
// true once `handleFileChange` has finished processing the file.
async function selectFile(input: HTMLElement, file: File, until: () => void) {
  fireEvent.change(input, { target: { files: [file] } });
  await waitFor(until);
}

function submitEnabled() {
  expect(screen.getByRole('button', { name: /importar personaje/i }).hasAttribute('disabled')).toBe(false);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue({
    data: { session: { access_token: 'test-access-token' } },
  });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('world selection', () => {
  it('renders a select with one option per world when there are several', () => {
    render(<ImportCharacterForm worlds={worlds} />);
    expect(screen.getByRole('option', { name: 'Faerûn' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Eberron' })).toBeTruthy();
  });

  it('auto-selects the only world and shows the hint when there is exactly one', () => {
    render(<ImportCharacterForm worlds={[worlds[0]!]} />);
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.getByText(/seleccionado automáticamente/i)).toBeTruthy();
  });
});

describe('client-side file validation', () => {
  it('rejects a file that is not valid JSON without calling the API', async () => {
    render(<ImportCharacterForm worlds={[worlds[0]!]} />);
    const input = screen.getByLabelText(/archivo exportado/i);

    await selectFile(input, makeFile('not json at all'), () => {
      expect(screen.getByText('El archivo no es un JSON válido.')).toBeTruthy();
    });

    expect(mockPost).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /importar personaje/i }).hasAttribute('disabled')).toBe(true);
  });

  it('rejects JSON missing schemaVersion without calling the API', async () => {
    render(<ImportCharacterForm worlds={[worlds[0]!]} />);
    const input = screen.getByLabelText(/archivo exportado/i);

    await selectFile(input, makeFile(JSON.stringify({ foo: 'bar' })), () => {
      expect(screen.getByText(/no tiene el formato de una ficha exportada/i)).toBeTruthy();
    });

    expect(mockPost).not.toHaveBeenCalled();
  });

  it('accepts a valid envelope and enables the submit button', async () => {
    render(<ImportCharacterForm worlds={[worlds[0]!]} />);
    const input = screen.getByLabelText(/archivo exportado/i);

    await selectFile(input, makeFile(JSON.stringify(validEnvelope)), submitEnabled);
  });
});

describe('UNRESOLVED_REFS', () => {
  it('lists every unresolved reference', async () => {
    const { ApiError } = await import('@/lib/api');
    mockPost.mockRejectedValue(
      new ApiError(
        400,
        {
          error: 'UNRESOLVED_REFS',
          issues: [
            { kind: 'race', slug: 'aasimar', source: 'MPMM' },
            { kind: 'spell', slug: 'fireball', source: 'PHB' },
          ],
        },
        'API 400',
      ),
    );

    render(<ImportCharacterForm worlds={[worlds[0]!]} />);
    const input = screen.getByLabelText(/archivo exportado/i);
    await selectFile(input, makeFile(JSON.stringify(validEnvelope)), submitEnabled);

    fireEvent.click(screen.getByRole('button', { name: /importar personaje/i }));

    await waitFor(() => {
      expect(screen.getByText('Raza: aasimar (MPMM)')).toBeTruthy();
      expect(screen.getByText('Hechizo: fireball (PHB)')).toBeTruthy();
    });
  });
});

describe('success path', () => {
  it('shows the draft/approval notice and navigates on "Ver personaje"', async () => {
    mockPost.mockResolvedValue({ id: 'new-char-id' });

    render(<ImportCharacterForm worlds={[worlds[0]!]} />);
    const input = screen.getByLabelText(/archivo exportado/i);
    await selectFile(input, makeFile(JSON.stringify(validEnvelope)), submitEnabled);

    fireEvent.click(screen.getByRole('button', { name: /importar personaje/i }));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith(
        '/characters/import',
        { worldId: 'w1', envelope: validEnvelope },
        'test-access-token',
      );
    });

    await waitFor(() => {
      expect(screen.getByText(/se importó como borrador/i)).toBeTruthy();
      expect(screen.getByText(/aprobación de tu dm/i)).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: /ver personaje/i }));
    expect(mockPush).toHaveBeenCalledWith('/characters/new-char-id');
  });
});
