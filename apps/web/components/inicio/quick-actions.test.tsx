/**
 * Unit tests for QuickActions component.
 *
 * T1: Exactly 3 <a> elements rendered within the grid (QUICK-01).
 * T2: Each link has correct href and label text (QUICK-02).
 * T3: Each tile renders an SVG icon element (QUICK-02).
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QuickActions } from './quick-actions';

describe('QuickActions', () => {
  it('T1: renders exactly 3 link elements', () => {
    render(<QuickActions />);
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(3);
  });

  it('T2: each link has the correct href and label text', () => {
    render(<QuickActions />);
    const personajesLink = screen.getByRole('link', { name: /Ficha activa/i });
    const compendiumLink = screen.getByRole('link', { name: /Buscar/i });
    const newCharLink = screen.getByRole('link', { name: /Crear PJ/i });

    expect(personajesLink.getAttribute('href')).toBe('/personajes');
    expect(compendiumLink.getAttribute('href')).toBe('/compendium');
    expect(newCharLink.getAttribute('href')).toBe('/characters/new');
  });

  it('T3: each tile renders an SVG icon element', () => {
    const { container } = render(<QuickActions />);
    const svgs = container.querySelectorAll('svg');
    expect(svgs.length).toBe(3);
  });
});
