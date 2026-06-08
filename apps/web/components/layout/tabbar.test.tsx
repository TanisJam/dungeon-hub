/**
 * TabBar — 5-tab world-scoped navigation tests (REQ-NAV-01, REQ-MERC-NAV-01).
 * Updated for mercado Wave 3: 4-tab → 5-tab (Inicio·Mapa·Biblioteca·Mercado·Bitácora).
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock next/link and next/navigation before importing the component
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

const mockUsePathname = vi.fn(() => '/inicio');
vi.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
}));

import { TabBar } from './tabbar';

describe('TabBar — 5-tab world nav (REQ-NAV-01, REQ-MERC-NAV-01)', () => {
  beforeEach(() => {
    mockUsePathname.mockReturnValue('/inicio');
  });

  it('(a) renders exactly 5 Link elements', () => {
    render(<TabBar />);
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(5);
  });

  it('(b) active tab determined by pathname — /inicio marks Inicio as active', () => {
    mockUsePathname.mockReturnValue('/inicio');
    const { container } = render(<TabBar />);
    const activeLink = container.querySelector('[aria-current="page"]');
    expect(activeLink).toBeTruthy();
    expect(activeLink?.getAttribute('href')).toBe('/inicio');
  });

  it('(b) active tab — /mapa marks Mapa as active', () => {
    mockUsePathname.mockReturnValue('/mapa');
    const { container } = render(<TabBar />);
    const activeLink = container.querySelector('[aria-current="page"]');
    expect(activeLink).toBeTruthy();
    expect(activeLink?.getAttribute('href')).toBe('/mapa');
  });

  it('(c) all 5 labels are present: Inicio, Mapa, Biblioteca, Mercado, Bitácora', () => {
    render(<TabBar />);
    const expectedLabels = ['Inicio', 'Mapa', 'Biblioteca', 'Mercado', 'Bitácora'];
    for (const label of expectedLabels) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it('no "Codex" label — renamed to Biblioteca (REQ-NAV-01)', () => {
    render(<TabBar />);
    expect(screen.queryByText('Codex')).toBeNull();
  });

  it('no "Mesa" label — removed from TabBar (REQ-NAV-02)', () => {
    render(<TabBar />);
    expect(screen.queryByText('Mesa')).toBeNull();
  });

  // SCENARIO RENAME-S1: Biblioteca tab renders with href /compendium
  it('RENAME-S1: renders Biblioteca tab link with href /compendium', () => {
    render(<TabBar />);
    const link = screen.getByRole('link', { name: /biblioteca/i });
    expect(link).toBeTruthy();
    expect(link.getAttribute('href')).toBe('/compendium');
  });

  // SCENARIO RENAME-S2: when pathname='/compendium', tab with href '/compendium' has aria-current="page"
  it('RENAME-S2: Biblioteca tab has aria-current="page" when pathname is /compendium', () => {
    mockUsePathname.mockReturnValue('/compendium');
    const { container } = render(<TabBar />);
    const activeLink = container.querySelector('[aria-current="page"]');
    expect(activeLink).toBeTruthy();
    expect(activeLink?.getAttribute('href')).toBe('/compendium');
    expect(activeLink?.textContent).toContain('Biblioteca');
  });

  // SCENARIO RENAME-S3: when pathname='/compendium/spells', Biblioteca tab is still active (startsWith)
  it('RENAME-S3: Biblioteca tab has aria-current="page" when pathname is /compendium/spells', () => {
    mockUsePathname.mockReturnValue('/compendium/spells');
    const { container } = render(<TabBar />);
    const activeLink = container.querySelector('[aria-current="page"]');
    expect(activeLink).toBeTruthy();
    expect(activeLink?.getAttribute('href')).toBe('/compendium');
  });

  // Bitácora tab uses /bitacora href (REQ-RENAME-01, REQ-RENAME-02 — barrido-final)
  it('Bitácora tab link with href /bitacora (REQ-RENAME-01)', () => {
    render(<TabBar />);
    const link = screen.getByRole('link', { name: /bitácora/i });
    expect(link).toBeTruthy();
    expect(link.getAttribute('href')).toBe('/bitacora');
    expect(screen.queryByText('Crónica')).toBeNull();
  });

  it('Bitácora tab has aria-current="page" when pathname is /bitacora (REQ-RENAME-02)', () => {
    mockUsePathname.mockReturnValue('/bitacora');
    const { container } = render(<TabBar />);
    const activeLink = container.querySelector('[aria-current="page"]');
    expect(activeLink).toBeTruthy();
    expect(activeLink?.getAttribute('href')).toBe('/bitacora');
    expect(activeLink?.textContent).toContain('Bitácora');
  });

  // REQ-MERC-NAV-01: Mercado tab renders with href /mercado
  it('REQ-MERC-NAV-01: renders Mercado tab link with href /mercado', () => {
    render(<TabBar />);
    const link = screen.getByRole('link', { name: /mercado/i });
    expect(link).toBeTruthy();
    expect(link.getAttribute('href')).toBe('/mercado');
  });

  // REQ-MERC-NAV-01: Mercado tab is active when pathname is /mercado
  it('REQ-MERC-NAV-01: Mercado tab has aria-current="page" when pathname is /mercado', () => {
    mockUsePathname.mockReturnValue('/mercado');
    const { container } = render(<TabBar />);
    const activeLink = container.querySelector('[aria-current="page"]');
    expect(activeLink).toBeTruthy();
    expect(activeLink?.getAttribute('href')).toBe('/mercado');
    expect(activeLink?.textContent).toContain('Mercado');
  });

  it('grid has grid-cols-5 class (Mercado tab added, ADR-2 — 75px/column @375px)', () => {
    const { container } = render(<TabBar />);
    const nav = container.querySelector('nav');
    expect(nav?.className).toContain('grid-cols-5');
    expect(nav?.className).not.toContain('grid-cols-4');
  });

  // Tab order: Inicio · Mapa · Biblioteca · Mercado · Bitácora (REQ-MERC-NAV-01, REQ-RENAME-02)
  it('tab order: Inicio · Mapa · Biblioteca · Mercado · Bitácora', () => {
    render(<TabBar />);
    const links = screen.getAllByRole('link');
    const hrefs = links.map((l) => l.getAttribute('href'));
    expect(hrefs).toEqual(['/inicio', '/mapa', '/compendium', '/mercado', '/bitacora']);
  });
});
