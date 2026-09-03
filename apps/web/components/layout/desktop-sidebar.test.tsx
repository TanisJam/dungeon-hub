/**
 * DesktopSidebar — desktop-only sidebar navigation tests
 * (REQ-DSHELL-SIDEBAR-01, REQ-DSHELL-ACTIVE-01, REQ-DSHELL-VIS-01).
 * Mirrors TabBar's 7-destination world nav, but for the md+ desktop shell.
 */
import React from 'react';
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

  it('(a) renders exactly 7 links in the correct href order', () => {
    render(<DesktopSidebar />);
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(7);
    expect(links.map((l) => l.getAttribute('href'))).toEqual([
      '/inicio',
      '/mapa',
      '/compendium',
      '/mercado',
      '/bitacora',
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
});
