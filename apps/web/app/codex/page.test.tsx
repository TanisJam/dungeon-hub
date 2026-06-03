/**
 * Component tests for the /codex page — role-dispatch and player grid.
 * codex-rehome REQ-TEST-02, REQ-DISPATCH-01, REQ-GRID-01, REQ-EMPTY-01.
 *
 * Scenarios covered:
 * - DM (effectiveView='dm') → redirect('/codex/facciones') triggered.
 * - Player + activeChar → 6 category card links render with correct hrefs.
 * - DM toggled to player (viewPref='player') + activeChar → 6 card links.
 * - Player + no activeChar (has chars) → V3Empty CTA → /personajes.
 * - Player + no activeChar (zero chars) → V3Empty CTA → /characters/new.
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
        getUser: vi.fn(() => Promise.resolve({ data: { user: { id: 'user-1' } } })),
        getSession: vi.fn(() =>
          Promise.resolve({ data: { session: { access_token: 'tok' } } }),
        ),
      },
    }),
  ),
}));

// Mock api module (used for roster check in no-active-char branch)
vi.mock('@/lib/api', () => ({
  api: { get: vi.fn() },
}));

// Mock next/navigation — redirect throws so we can catch it
// NOTE: factory cannot reference outer variables (vi.mock is hoisted).
// We access the redirect mock via vi.mocked after import.
vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => { throw new Error('REDIRECT'); }),
  notFound: vi.fn(() => { throw new Error('NOT_FOUND'); }),
}));

// Mock active-world
const mockGetActiveWorld = vi.fn();
vi.mock('@/lib/active-world', () => ({
  getActiveWorld: () => mockGetActiveWorld(),
}));

// Mock view preference
const mockGetViewPreference = vi.fn();
vi.mock('@/lib/role', () => ({
  getViewPreference: () => mockGetViewPreference(),
}));

// Mock active character
const mockGetActiveCharacter = vi.fn();
vi.mock('@/lib/active-character', () => ({
  getActiveCharacter: () => mockGetActiveCharacter(),
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

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

// Mock V3Empty to make assertions easier
vi.mock('@/components/ui', () => ({
  V3Empty: ({ title, cta }: { title: string; cta?: { label: string; href: string } }) => (
    <div>
      <p data-testid="empty-title">{title}</p>
      {cta && (
        <a href={cta.href} data-testid="empty-cta">
          {cta.label}
        </a>
      )}
    </div>
  ),
}));

import { api } from '@/lib/api';
import { redirect } from 'next/navigation';
import CodexPage from './page';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CodexPage — role-dispatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: player-world, no view preference set
    mockGetActiveWorld.mockResolvedValue({ id: 'world-1', name: 'Test World', slug: 'test', callerRole: 'player' });
    mockGetViewPreference.mockResolvedValue(null);
    mockGetActiveCharacter.mockResolvedValue({ id: 'char-1', worldId: 'world-1', name: 'Aranea' });
    vi.mocked(api.get).mockResolvedValue({ data: [] });
  });

  // Scenario: DM user at /codex → redirect to facciones (REQ-DISPATCH-01)
  it('DM (effectiveView=dm) triggers redirect to /codex/facciones', async () => {
    mockGetActiveWorld.mockResolvedValue({ id: 'world-1', callerRole: 'gm' });
    mockGetViewPreference.mockResolvedValue(null); // no player-toggle

    await expect(CodexPage()).rejects.toThrow('REDIRECT');
    expect(vi.mocked(redirect)).toHaveBeenCalledWith('/codex/facciones');
  });

  // Scenario: DM toggled to player → 6 cards (REQ-DISPATCH-01 scenario "DM toggled to player view")
  it('DM toggled to player (viewPref=player) + activeChar → 6 card links render', async () => {
    mockGetActiveWorld.mockResolvedValue({ id: 'world-1', callerRole: 'gm' });
    mockGetViewPreference.mockResolvedValue('player');
    mockGetActiveCharacter.mockResolvedValue({ id: 'char-1', worldId: 'world-1', name: 'Aranea' });

    const element = await CodexPage();
    render(element as React.ReactElement);

    // Should render grid, NOT redirect
    expect(vi.mocked(redirect)).not.toHaveBeenCalled();
    const links = screen.getAllByRole('link');
    expect(links.length).toBe(6);
  });

  // Scenario: Player + activeChar → 6 cards (REQ-GRID-01)
  it('Player + activeChar → 6 category card links with correct hrefs', async () => {
    const element = await CodexPage();
    render(element as React.ReactElement);

    const links = screen.getAllByRole('link') as HTMLAnchorElement[];
    expect(links.length).toBe(6);

    // getAttribute('href') returns the raw attribute value (no origin prefix in jsdom)
    const hrefs = links.map((l) => l.getAttribute('href'));
    expect(hrefs).toContain('/codex/monsters');
    expect(hrefs).toContain('/codex/items');
    expect(hrefs).toContain('/codex/spells');
    expect(hrefs).toContain('/codex/races');
    expect(hrefs).toContain('/codex/classes');
    expect(hrefs).toContain('/codex/backgrounds');
  });

  // Scenario: Player + no activeChar, has characters → V3Empty CTA → /personajes (REQ-EMPTY-01)
  it('Player + no activeChar + has chars → V3Empty CTA links to /personajes', async () => {
    mockGetActiveCharacter.mockResolvedValue(null);
    vi.mocked(api.get).mockResolvedValue({ data: [{ id: 'char-1' }] }); // has 1 char

    const element = await CodexPage();
    render(element as React.ReactElement);

    expect(screen.getByTestId('empty-title')).toBeTruthy();
    const cta = screen.getByTestId('empty-cta') as HTMLAnchorElement;
    expect(cta.href).toContain('/personajes');
  });

  // Scenario: Player + no activeChar, zero characters → V3Empty CTA → /characters/new (REQ-EMPTY-01)
  it('Player + no activeChar + zero chars → V3Empty CTA links to /characters/new', async () => {
    mockGetActiveCharacter.mockResolvedValue(null);
    vi.mocked(api.get).mockResolvedValue({ data: [] }); // zero chars

    const element = await CodexPage();
    render(element as React.ReactElement);

    expect(screen.getByTestId('empty-title')).toBeTruthy();
    const cta = screen.getByTestId('empty-cta') as HTMLAnchorElement;
    expect(cta.href).toContain('/characters/new');
  });
});
