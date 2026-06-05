/**
 * TabBar — Slice 2 component tests (REQ-WIS-05)
 * Verifies the 5-tab world-scoped navigation layout.
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

describe('TabBar — 5-tab world nav (REQ-WIS-05)', () => {
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

  it('(b) active tab — /campanas marks Mesa as active', () => {
    mockUsePathname.mockReturnValue('/campanas');
    const { container } = render(<TabBar />);
    const activeLink = container.querySelector('[aria-current="page"]');
    expect(activeLink).toBeTruthy();
    expect(activeLink?.getAttribute('href')).toBe('/campanas');
  });

  it('(c) each label text is non-empty', () => {
    render(<TabBar />);
    const expectedLabels = ['Inicio', 'Mapa', 'Codex', 'Bitácora', 'Mesa'];
    for (const label of expectedLabels) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  // SCENARIO RENAME-S1: tabbar renders 'Bitácora' label with '/cronica' href
  it('RENAME-S1: renders Bitácora tab link with href /cronica', () => {
    render(<TabBar />);
    const link = screen.getByRole('link', { name: /bitácora/i });
    expect(link).toBeTruthy();
    expect(link.getAttribute('href')).toBe('/cronica');
    expect(screen.queryByText('Crónica')).toBeNull();
  });

  // SCENARIO RENAME-S2: when pathname='/cronica', tab with href '/cronica' has aria-current="page" and text 'Bitácora'
  it('RENAME-S2: Bitácora tab has aria-current="page" when pathname is /cronica', () => {
    mockUsePathname.mockReturnValue('/cronica');
    const { container } = render(<TabBar />);
    const activeLink = container.querySelector('[aria-current="page"]');
    expect(activeLink).toBeTruthy();
    expect(activeLink?.getAttribute('href')).toBe('/cronica');
    expect(activeLink?.textContent).toContain('Bitácora');
  });

  it('(c) Mesa tab href points to /campanas', () => {
    render(<TabBar />);
    const links = screen.getAllByRole('link');
    const mesaLink = links.find((l) => l.textContent?.includes('Mesa'));
    expect(mesaLink?.getAttribute('href')).toBe('/campanas');
  });

  it('grid has grid-cols-5 class', () => {
    const { container } = render(<TabBar />);
    const nav = container.querySelector('nav');
    expect(nav?.className).toContain('grid-cols-5');
  });
});
