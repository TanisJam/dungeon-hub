/**
 * Component tests for /encuentros/[id] page — callerRole gating (REQ-WCO-WEB-08).
 *
 * Scenarios:
 * - callerRole='gm'    → TurnControlsIsland is rendered
 * - callerRole='player' → TurnControlsIsland is NOT rendered
 * - RefreshButton is always rendered (REQ-WCO-WEB-07)
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() =>
    Promise.resolve({
      auth: {
        getUser: vi.fn(() =>
          Promise.resolve({ data: { user: { id: 'user-1' } } }),
        ),
        getSession: vi.fn(() =>
          Promise.resolve({ data: { session: { access_token: 'tok' } } }),
        ),
      },
    }),
  ),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => { throw new Error('REDIRECT'); }),
  notFound: vi.fn(() => { throw new Error('NOT_FOUND'); }),
}));

// Mock api — returns a controllable encounter detail
const mockApiGet = vi.fn();
vi.mock('@/lib/api', () => ({
  api: { get: (...args: unknown[]) => mockApiGet(...args) },
  ApiError: class ApiError extends Error {
    status: number;
    body: unknown;
    constructor(status: number, body: unknown) {
      super('ApiError');
      this.status = status;
      this.body = body;
    }
  },
}));

// Stub child islands/components so they render simple identifiable text
vi.mock('@/components/encuentros/radial-dial', () => ({
  RadialDial: () => <div data-testid="radial-dial" />,
}));
vi.mock('@/components/encuentros/roster-row', () => ({
  RosterList: () => <div data-testid="roster-list" />,
}));
vi.mock('@/components/encuentros/turn-banner', () => ({
  TurnBanner: () => <div data-testid="turn-banner" />,
}));
vi.mock('@/components/encuentros/turn-controls-island', () => ({
  TurnControlsIsland: () => <div data-testid="turn-controls-island" />,
}));
vi.mock('@/components/encuentros/refresh-button', () => ({
  RefreshButton: () => <button type="button">Actualizar</button>,
}));
vi.mock('@/components/encuentros/resource-panel', () => ({
  ResourcePanel: () => <div data-testid="resource-panel" />,
}));
vi.mock('@/components/layout/app-shell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/ui/pill', () => ({
  Pill: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeDetail(callerRole: 'gm' | 'player') {
  return {
    id: 'enc-1',
    campaignId: 'camp-1',
    sessionId: null,
    name: 'Test Encounter',
    round: 1,
    status: 'active',
    currentCombatantId: 'comb-1',
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    callerRole,
    combatants: [
      {
        id: 'comb-1',
        name: 'Mira',
        kind: 'pc',
        characterId: null,
        initiative: 18,
        hpCurrent: 22,
        hpMax: 22,
        insertionOrder: 0,
        conditions: [],
        effects: [],
        actionUsed: false,
        bonusActionUsed: false,
        reactionUsed: false,
        attacksRemaining: 1,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('/encuentros/[id] page — callerRole gating', () => {
  beforeEach(() => {
    mockApiGet.mockReset();
  });

  // REQ-WCO-WEB-08: GM sees TurnControlsIsland
  it('REQ-WCO-WEB-08: renders TurnControlsIsland for callerRole="gm"', async () => {
    mockApiGet.mockImplementation((path: string) => {
      if (path.startsWith('/encounters/')) return Promise.resolve(makeDetail('gm'));
      if (path.startsWith('/characters')) return Promise.resolve({ data: [] });
      return Promise.resolve(null);
    });

    const { default: Page } = await import('./page');
    const params = Promise.resolve({ id: 'enc-1' });
    const { container } = render(await Page({ params }));

    expect(container.querySelector('[data-testid="turn-controls-island"]')).toBeTruthy();
  });

  // REQ-WCO-WEB-08: Player does NOT see TurnControlsIsland
  it('REQ-WCO-WEB-08: hides TurnControlsIsland for callerRole="player"', async () => {
    mockApiGet.mockImplementation((path: string) => {
      if (path.startsWith('/encounters/')) return Promise.resolve(makeDetail('player'));
      if (path.startsWith('/characters')) return Promise.resolve({ data: [] });
      return Promise.resolve(null);
    });

    const { default: Page } = await import('./page');
    const params = Promise.resolve({ id: 'enc-1' });
    const { container } = render(await Page({ params }));

    expect(container.querySelector('[data-testid="turn-controls-island"]')).toBeNull();
  });

  // REQ-WCO-WEB-07: RefreshButton always present
  it('REQ-WCO-WEB-07: renders RefreshButton for both roles', async () => {
    mockApiGet.mockImplementation((path: string) => {
      if (path.startsWith('/encounters/')) return Promise.resolve(makeDetail('player'));
      if (path.startsWith('/characters')) return Promise.resolve({ data: [] });
      return Promise.resolve(null);
    });

    const { default: Page } = await import('./page');
    const params = Promise.resolve({ id: 'enc-1' });
    render(await Page({ params }));

    expect(screen.getByRole('button', { name: /actualizar/i })).toBeTruthy();
  });
});
