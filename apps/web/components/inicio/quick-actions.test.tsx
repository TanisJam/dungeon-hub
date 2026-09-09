
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QuickActions } from './quick-actions';

describe('QuickActions', () => {
  it('T1: renders exactly 4 link elements (added Mesa/Campañas)', () => {
    render(<QuickActions />);
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(4);
  });

  it('T2: each link has the correct href and label text', () => {
    render(<QuickActions />);
    const personajesLink = screen.getByRole('link', { name: /Ficha activa/i });
    const compendiumLink = screen.getByRole('link', { name: /Buscar/i });
    const newCharLink = screen.getByRole('link', { name: /Crear PJ/i });
    const campañasLink = screen.getByRole('link', { name: /Mesa|Campañas/i });

    expect(personajesLink.getAttribute('href')).toBe('/personajes');
    expect(compendiumLink.getAttribute('href')).toBe('/compendium');
    expect(newCharLink.getAttribute('href')).toBe('/characters/new');
    expect(campañasLink.getAttribute('href')).toBe('/campanas');
  });

  it('T3: each tile renders an SVG icon element', () => {
    const { container } = render(<QuickActions />);
    const svgs = container.querySelectorAll('svg');
    expect(svgs.length).toBe(4);
  });

  it('T4: /campanas link present (Mesa absorption — REQ-NAV-02)', () => {
    render(<QuickActions />);
    const campañasLink = screen.getByRole('link', { name: /Mesa|Campañas/i });
    expect(campañasLink.getAttribute('href')).toBe('/campanas');
  });
});
