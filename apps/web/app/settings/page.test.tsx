/**
 * Component tests for /settings — the real account screen
 * (navigability-audit fix: was an orphan that redirect('/dashboard')).
 *
 * Mirrors the mock pattern from app/dashboard tests: IdentityHeader and
 * DevModeToggle are reused as-is, so this test asserts they both render
 * with server-resolved data, not that they redirect anywhere.
 */
import type React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// `mockUser` is mutable so the unauthenticated test can flip it to null
// without fighting the real Supabase client's strict response typing via
// vi.mocked(createClient).mockResolvedValueOnce(...).
let mockUser: { id: string; user_metadata: Record<string, unknown> } | null = {
  id: 'user-1',
  user_metadata: {},
};

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() =>
    Promise.resolve({
      auth: {
        getUser: vi.fn(() => Promise.resolve({ data: { user: mockUser } })),
        getSession: vi.fn(() =>
          Promise.resolve({ data: { session: mockUser ? { access_token: 'tok' } : null } }),
        ),
      },
    }),
  ),
}));

const mockApiGet = vi.fn();
vi.mock('@/lib/api', () => ({
  api: { get: (...args: unknown[]) => mockApiGet(...args) },
  ApiError: class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => { throw new Error('REDIRECT'); }),
}));

vi.mock('@/components/layout/app-shell', () => ({
  AppShell: ({ children, title, subtitle }: { children: React.ReactNode; title: string; subtitle?: string }) => (
    <div>
      <h1>{title}</h1>
      {subtitle && <p>{subtitle}</p>}
      {children}
    </div>
  ),
}));

vi.mock('@/app/_components/sign-out-button', () => ({
  SignOutButton: () => <button type="button">Cerrar sesión</button>,
}));

vi.mock('@/components/codex/dev-mode-toggle', () => ({
  DevModeToggle: ({ currentValue }: { currentValue: boolean }) => (
    <div data-testid="dev-mode-toggle" data-current={String(currentValue)}>DevModeToggle</div>
  ),
}));

import SettingsPage from './page';

describe('SettingsPage — real account screen (navigability-audit fix)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { id: 'user-1', user_metadata: {} };
  });

  it('renders IdentityHeader (username, sign-out) and Preferencias (DevModeToggle)', async () => {
    mockApiGet.mockResolvedValue({
      id: 'user-1',
      username: 'Aria',
      role: 'player',
      discordId: null,
      discordUsername: null,
      devMode: true,
    });

    const element = await SettingsPage();
    render(element as React.ReactElement);

    expect(screen.getByRole('heading', { name: 'Ajustes' })).toBeTruthy();
    expect(screen.getByText('Aria')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeTruthy();
    expect(screen.getByText('Preferencias')).toBeTruthy();
    const toggle = screen.getByTestId('dev-mode-toggle');
    expect(toggle.dataset.current).toBe('true');
  });

  it('does NOT render characters or campaigns sections (those live at /personajes, /campanas)', async () => {
    mockApiGet.mockResolvedValue({
      id: 'user-1',
      username: 'Aria',
      role: 'player',
      discordId: null,
      discordUsername: null,
      devMode: false,
    });

    const element = await SettingsPage();
    render(element as React.ReactElement);

    expect(screen.queryByText(/tus personajes/i)).toBeNull();
    expect(screen.queryByText(/tus campañas/i)).toBeNull();
  });

  it('unauthenticated → redirects to /', async () => {
    mockUser = null;

    const { redirect } = await import('next/navigation');
    await expect(SettingsPage()).rejects.toThrow('REDIRECT');
    expect(vi.mocked(redirect)).toHaveBeenCalledWith('/');
  });
});
