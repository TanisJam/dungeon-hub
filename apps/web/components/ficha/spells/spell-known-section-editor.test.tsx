/**
 * Tests for SpellKnownSectionEditor — amber wand pencil + lazy fetch + V3Sheet.
 *
 * T1: Renders amber wand pencil button.
 * T2: Click opens V3Sheet + shows loading state.
 * T3: After loading resolves, SpellKnownEditor mounts.
 *
 * Spec: sdd/ficha-dm-affordances #995 — SpellKnownEditor Component
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

// Mock createPortal for V3Sheet
vi.mock('react-dom', async () => {
  const actual = await vi.importActual<typeof import('react-dom')>('react-dom');
  return {
    ...actual,
    createPortal: (node: React.ReactNode) => node,
  };
});

// Mock SpellKnownEditor to track mount
vi.mock('./spell-known-editor', () => ({
  SpellKnownEditor: () => <div data-testid="spell-known-editor">Editor loaded</div>,
}));

// Mock supabase client
vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn().mockReturnValue({
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'tok-client' } },
      }),
    },
  }),
}));

// Mock api — slow fetch to test loading state
let resolveOptions: (v: unknown) => void = () => {};
vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn().mockImplementation(
      () => new Promise((res) => { resolveOptions = res; }),
    ),
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

import { api } from '@/lib/api';
import { SpellKnownSectionEditor } from './spell-known-section-editor';

const baseProps = {
  characterId: 'char-1',
  classSlug: 'wizard',
  currentKnown: [{ slug: 'magic-missile', source: 'PHB' }],
};

describe('SpellKnownSectionEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (api.get as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise((res) => { resolveOptions = res; }),
    );
  });

  it('T1: renders amber wand pencil button', () => {
    render(<SpellKnownSectionEditor {...baseProps} />);
    const btn = screen.getByRole('button', { name: /asignar hechizos conocidos/i });
    expect(btn).toBeTruthy();
  });

  it('T2: click opens V3Sheet + shows loading state', async () => {
    render(<SpellKnownSectionEditor {...baseProps} />);

    expect(screen.queryByRole('dialog')).toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /asignar hechizos conocidos/i }));
    });

    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText(/cargando/i)).toBeTruthy();
  });

  it('T3: after loading resolves, SpellKnownEditor mounts', async () => {
    render(<SpellKnownSectionEditor {...baseProps} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /asignar hechizos conocidos/i }));
    });

    // Resolve the fetch
    await act(async () => {
      resolveOptions({
        availableSpells: [
          { slug: 'magic-missile', source: 'PHB', name: 'Magic Missile', level: 1 },
        ],
      });
    });

    expect(screen.getByTestId('spell-known-editor')).toBeTruthy();
  });
});
