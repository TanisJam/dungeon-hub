/**
 * DesktopSidebar — desktop-only sidebar navigation tests
 * (REQ-DSHELL-SIDEBAR-01, REQ-DSHELL-ACTIVE-01, REQ-DSHELL-VIS-01).
 * Mirrors TabBar's 7-destination world nav, but for the md+ desktop shell.
 */
import type React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

const mockUsePathname = vi.fn(() => '/inicio');
vi.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
}));

import { DesktopSidebar } from './desktop-sidebar';

describe('DesktopSidebar (REQ-DSHELL-SIDEBAR-01, REQ-DSHELL-ACTIVE-01, REQ-DSHELL-VIS-01)', () => {
  beforeEach(() => {
    mockUsePathname.mockReturnValue('/inicio');
  });

  // Tablero joins the desktop-only trailing group (REQ-DSHELL-SIDEBAR-01
  // navigability fix) — desktop has room for it; the mobile TabBar does not.
  it('(a) renders exactly 8 links in the correct href order', () => {
    render(<DesktopSidebar />);
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(8);
    expect(links.map((l) => l.getAttribute('href'))).toEqual([
      '/inicio',
      '/mapa',
      '/compendium',
      '/mercado',
      '/bitacora',
      '/tablero',
      '/personajes',
      '/campanas',
    ]);
  });

  it('(b) Biblioteca link has aria-current="page" when pathname is /compendium, others do not', () => {
    mockUsePathname.mockReturnValue('/compendium');
    render(<DesktopSidebar />);
    const biblioteca = screen.getByRole('link', { name: /biblioteca/i });
    expect(biblioteca.getAttribute('aria-current')).toBe('page');

    const others = screen.getAllByRole('link').filter((l) => l !== biblioteca);
    for (const link of others) {
      expect(link.getAttribute('aria-current')).toBeNull();
    }
  });

  it('(b) Biblioteca link stays active for /compendium/spells (startsWith)', () => {
    mockUsePathname.mockReturnValue('/compendium/spells');
    render(<DesktopSidebar />);
    const biblioteca = screen.getByRole('link', { name: /biblioteca/i });
    expect(biblioteca.getAttribute('aria-current')).toBe('page');
  });

  it('(c) root element is hidden on mobile and flex on md+', () => {
    const { container } = render(<DesktopSidebar />);
    const root = container.firstElementChild;
    expect(root?.className).toContain('hidden');
    expect(root?.className).toContain('md:flex');
  });

  it('(d) Tablero link is present with a plain destination (no callerRole needed)', () => {
    render(<DesktopSidebar />);
    const tablero = screen.getByRole('link', { name: /tablero/i });
    expect(tablero.getAttribute('href')).toBe('/tablero');
  });

  it('(e) no Mesa link when callerRole is absent/player (default-deny)', () => {
    render(<DesktopSidebar />);
    expect(screen.queryByRole('link', { name: /^mesa$/i })).toBeNull();
  });

  it('(f) Mesa link renders for callerRole="gm", placed after Bitácora and before Tablero', () => {
    render(<DesktopSidebar callerRole="gm" />);
    const links = screen.getAllByRole('link');
    const hrefs = links.map((l) => l.getAttribute('href'));
    expect(hrefs).toEqual([
      '/inicio',
      '/mapa',
      '/compendium',
      '/mercado',
      '/bitacora',
      '/mesa',
      '/tablero',
      '/personajes',
      '/campanas',
    ]);
  });
});
