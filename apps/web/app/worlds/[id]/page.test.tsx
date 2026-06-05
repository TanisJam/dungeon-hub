/**
 * Tests for /worlds/[id] — DM panel callerRole gate.
 * REQ-DPPMC-WORLDS-05 (Slice C): non-GM → redirect('/inicio'); GM → panel renders.
 *
 * Mirrors the mock pattern from app/codex/page.test.tsx.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock Supabase client — authenticated by default
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() =>
    Promise.resolve({
      auth: {
        getSession: vi.fn(() =>
          Promise.resolve({ data: { session: { access_token: 'tok' } } }),
        ),
      },
    }),
  ),
}));

// Mock api module
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

// Mock next/navigation — redirect throws so we can catch it
vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => { throw new Error('REDIRECT'); }),
  notFound: vi.fn(() => { throw new Error('NOT_FOUND'); }),
}));

// Mock AppShell as passthrough
vi.mock('@/components/layout/app-shell', () => ({
  AppShell: ({ children, title }: { children: React.ReactNode; title: string }) => (
    <div>
      <h1>{title}</h1>
      {children}
    </div>
  ),
}));

// Mock StatusTabs
vi.mock('./_components/status-tabs', () => ({
  StatusTabs: () => <div data-testid="status-tabs">StatusTabs</div>,
}));

// Mock CharacterRow
vi.mock('./_components/character-row', () => ({
  CharacterRow: ({ character }: { character: { id: string; name: string } }) => (
    <div data-testid="character-row">{character.name}</div>
  ),
}));

// Mock Card
vi.mock('@/components/ui', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { redirect } from 'next/navigation';
import WorldLandingPage from './page';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeParams(id = 'world-1') {
  return Promise.resolve({ id });
}

function makeSearchParams(status?: string) {
  return Promise.resolve({ status });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WorldLandingPage — callerRole gate (REQ-DPPMC-WORLDS-05)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // REQ-DPPMC-WORLDS-05 scenario: non-GM → redirect('/inicio')
  it('callerRole=player → redirects to /inicio', async () => {
    mockApiGet.mockImplementation((path: string) => {
      if (path.includes('/worlds/world-1') && !path.includes('/characters')) {
        return Promise.resolve({ id: 'world-1', name: 'Test World', slug: 'test', ownerUserId: 'u1', callerRole: 'player' });
      }
      return Promise.resolve({ characters: [] });
    });

    await expect(
      WorldLandingPage({ params: makeParams(), searchParams: makeSearchParams() }),
    ).rejects.toThrow('REDIRECT');
    expect(vi.mocked(redirect)).toHaveBeenCalledWith('/inicio');
  });

  // REQ-DPPMC-WORLDS-05 scenario: callerRole=null → redirect('/inicio')
  it('callerRole=null → redirects to /inicio', async () => {
    mockApiGet.mockImplementation((path: string) => {
      if (path.includes('/worlds/world-1') && !path.includes('/characters')) {
        return Promise.resolve({ id: 'world-1', name: 'Test World', slug: 'test', ownerUserId: 'u1', callerRole: null });
      }
      return Promise.resolve({ characters: [] });
    });

    await expect(
      WorldLandingPage({ params: makeParams(), searchParams: makeSearchParams() }),
    ).rejects.toThrow('REDIRECT');
    expect(vi.mocked(redirect)).toHaveBeenCalledWith('/inicio');
  });

  // REQ-DPPMC-WORLDS-05 scenario: GM → panel renders with StatusTabs
  it('callerRole=gm → DM panel renders (StatusTabs visible, no redirect)', async () => {
    mockApiGet.mockImplementation((path: string) => {
      if (path.includes('/worlds/world-1') && !path.includes('/characters')) {
        return Promise.resolve({ id: 'world-1', name: 'Test World', slug: 'test', ownerUserId: 'u1', callerRole: 'gm' });
      }
      return Promise.resolve({ characters: [] });
    });

    const element = await WorldLandingPage({ params: makeParams(), searchParams: makeSearchParams() });
    render(element as React.ReactElement);

    expect(vi.mocked(redirect)).not.toHaveBeenCalled();
    expect(screen.getByTestId('status-tabs')).toBeTruthy();
  });
});
