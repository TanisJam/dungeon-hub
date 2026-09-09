/**
 * Component tests for /mesa — the GM workspace hub (navigability-audit fix).
 *
 * Gate mirrors every other DM tool: effectiveView !== 'dm' → notFound()
 * (REQ-DMTOOLS-02, ADR-2). Mirrors the mock pattern from
 * app/herramientas/page.test.tsx / app/worlds/[id]/page.test.tsx.
 */
import type React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

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

const mockGetActiveWorld = vi.fn();
vi.mock('@/lib/active-world', () => ({
  getActiveWorld: (...args: unknown[]) => mockGetActiveWorld(...args),
}));

const mockGetViewPreference = vi.fn();
vi.mock('@/lib/role', () => ({
  getViewPreference: (...args: unknown[]) => mockGetViewPreference(...args),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => { throw new Error('REDIRECT'); }),
  notFound: vi.fn(() => { throw new Error('NOT_FOUND'); }),
}));

// Mock WorldSwitcherShell — it's an async Server Component that fetches
// worlds via lib/api at module scope; stubbing it avoids pulling in that
// import chain (and the NEXT_PUBLIC_SUPABASE_URL env var it needs) for a
// prop AppShell doesn't even render once mocked below.
vi.mock('@/app/_components/world-switcher-shell', () => ({
  WorldSwitcherShell: () => <div data-testid="world-switcher-shell" />,
}));

// Mock AppShell as passthrough — TabBar/DesktopSidebar/TopBar are exercised
// in their own component test files.
vi.mock('@/components/layout/app-shell', () => ({
  AppShell: ({ children, title, subtitle }: { children: React.ReactNode; title: string; subtitle?: string }) => (
    <div>
      <h1>{title}</h1>
      {subtitle && <p>{subtitle}</p>}
      {children}
    </div>
  ),
}));

import { notFound } from 'next/navigation';
import MesaPage from './page';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MesaPage — DM hub gate (REQ-DMTOOLS-02, ADR-2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('effectiveView=player (callerRole=player) → notFound()', async () => {
    mockGetActiveWorld.mockResolvedValue({ id: 'world-1', name: 'W', slug: 'w', callerRole: 'player' });
    mockGetViewPreference.mockResolvedValue(null);

    await expect(MesaPage()).rejects.toThrow('NOT_FOUND');
    expect(vi.mocked(notFound)).toHaveBeenCalled();
  });

  it('no active world (aw=null) → notFound()', async () => {
    mockGetActiveWorld.mockResolvedValue(null);
    mockGetViewPreference.mockResolvedValue(null);

    await expect(MesaPage()).rejects.toThrow('NOT_FOUND');
  });

  it('callerRole=gm but viewPref=player (GM previewing as player) → notFound()', async () => {
    mockGetActiveWorld.mockResolvedValue({ id: 'world-1', name: 'W', slug: 'w', callerRole: 'gm' });
    mockGetViewPreference.mockResolvedValue('player');

    await expect(MesaPage()).rejects.toThrow('NOT_FOUND');
  });

  it('callerRole=gm, viewPref=dm/absent → hub renders with all links', async () => {
    mockGetActiveWorld.mockResolvedValue({ id: 'world-1', name: 'W', slug: 'w', callerRole: 'gm' });
    mockGetViewPreference.mockResolvedValue(null);

    const element = await MesaPage();
    render(element as React.ReactElement);

    expect(vi.mocked(notFound)).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Mesa' })).toBeTruthy();

    const aprobaciones = screen.getByRole('link', { name: /aprobaciones/i });
    expect(aprobaciones.getAttribute('href')).toBe('/worlds/world-1');

    const encuentros = screen.getByRole('link', { name: /encuentros/i });
    expect(encuentros.getAttribute('href')).toBe('/encuentros');

    // Reused from HERRAMIENTAS_SUBNAV_ITEMS rather than duplicated.
    expect(screen.getByRole('link', { name: /facciones/i }).getAttribute('href')).toBe('/herramientas/facciones');
    expect(screen.getByRole('link', { name: /npcs/i }).getAttribute('href')).toBe('/herramientas/npcs');
    expect(screen.getByRole('link', { name: /quests/i }).getAttribute('href')).toBe('/herramientas/quests');
    expect(screen.getByRole('link', { name: /tienda/i }).getAttribute('href')).toBe('/herramientas/tienda');
    expect(screen.getByRole('link', { name: /contenido/i }).getAttribute('href')).toBe('/herramientas/contenido');
  });

  it('every link is a real tap target (min-h-[44px])', async () => {
    mockGetActiveWorld.mockResolvedValue({ id: 'world-1', name: 'W', slug: 'w', callerRole: 'gm' });
    mockGetViewPreference.mockResolvedValue('dm');

    const element = await MesaPage();
    render(element as React.ReactElement);

    const links = screen.getAllByRole('link');
    expect(links.length).toBeGreaterThanOrEqual(7);
    for (const link of links) {
      expect(link.className).toContain('min-h-[44px]');
    }
  });
});
