/**
 * TabBar — Biblioteca W1 component tests (REQ-NAV-01, REQ-NAV-02)
 * Verifies the 4-tab world-scoped navigation layout after Mesa removal.
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

describe('TabBar — 4-tab world nav (REQ-NAV-01, REQ-NAV-02)', () => {
  beforeEach(() => {
    mockUsePathname.mockReturnValue('/inicio');
  });

  it('(a) renders exactly 4 Link elements', () => {
    render(<TabBar />);
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(4);
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

  it('(c) each label text is non-empty — new labels: Inicio, Mapa, Biblioteca, Bitácora', () => {
    render(<TabBar />);
    const expectedLabels = ['Inicio', 'Mapa', 'Biblioteca', 'Bitácora'];
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

  // Bitácora tab still uses /cronica href (route rename deferred)
  it('Bitácora tab link with href /cronica (route rename deferred)', () => {
    render(<TabBar />);
    const link = screen.getByRole('link', { name: /bitácora/i });
    expect(link).toBeTruthy();
    expect(link.getAttribute('href')).toBe('/cronica');
    expect(screen.queryByText('Crónica')).toBeNull();
  });

  it('RENAME-S2: Bitácora tab has aria-current="page" when pathname is /cronica', () => {
    mockUsePathname.mockReturnValue('/cronica');
    const { container } = render(<TabBar />);
    const activeLink = container.querySelector('[aria-current="page"]');
    expect(activeLink).toBeTruthy();
    expect(activeLink?.getAttribute('href')).toBe('/cronica');
    expect(activeLink?.textContent).toContain('Bitácora');
  });

  it('grid has grid-cols-4 class (Mesa removed, better 375px tap targets — ADR-1)', () => {
    const { container } = render(<TabBar />);
    const nav = container.querySelector('nav');
    expect(nav?.className).toContain('grid-cols-4');
    expect(nav?.className).not.toContain('grid-cols-5');
  });
});
