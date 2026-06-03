/**
 * Component test: CharacterCodexPage (grid) — /characters/:id/codex
 *
 * REQ-CCB-WEB-01: Monstruos card renders with label + "N de M descubiertos" copy.
 * Mocks the `api` helper so no real HTTP calls are made.
 *
 * Note: This is a Server Component rendered in the test environment.
 * We test the rendered output by mocking the api module and calling the component directly.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock Supabase client
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => Promise.resolve({
    auth: {
      getSession: vi.fn(() => Promise.resolve({
        data: { session: { access_token: 'test-token' } },
      })),
    },
  })),
}));

// Mock api module
vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(),
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

// Mock next/navigation
vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => { throw new Error('redirect'); }),
  notFound: vi.fn(() => { throw new Error('notFound'); }),
}));

// Mock AppShell as a passthrough
vi.mock('@/components/layout/app-shell', () => ({
  AppShell: ({ children, title }: { children: React.ReactNode; title: string }) => (
    <div>
      <h1>{title}</h1>
      {children}
    </div>
  ),
}));

// Mock next/link as passthrough
vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

import { api } from '@/lib/api';
import CharacterCodexPage from './page';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CharacterCodexPage (codex grid)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('REQ-CCB-WEB-01: Monstruos card renders with label and "N de M descubiertos" copy', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({
      monsters: { known: 5, total: 400 },
    });

    const element = await CharacterCodexPage({
      params: Promise.resolve({ id: 'char-abc' }),
    });
    render(element as React.ReactElement);

    // Card label visible
    expect(screen.getByText('Monstruos')).toBeTruthy();

    // Progress copy — "N de M descubiertos"
    expect(screen.getByText('5 de 400 descubiertos')).toBeTruthy();

    // Card is a link to /codex/monsters
    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toBe('/characters/char-abc/codex/monsters');
  });

  it('REQ-CCB-WEB-01: zero-known state shows "0 de M descubiertos"', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({
      monsters: { known: 0, total: 400 },
    });

    const element = await CharacterCodexPage({
      params: Promise.resolve({ id: 'char-xyz' }),
    });
    render(element as React.ReactElement);

    expect(screen.getByText('0 de 400 descubiertos')).toBeTruthy();

    // Card must still be tappable (link present)
    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toBe('/characters/char-xyz/codex/monsters');
  });
});
