import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ImportPersonajeCTA } from './import-personaje-cta';

describe('ImportPersonajeCTA', () => {
  it('renders a link to /characters/import', () => {
    render(<ImportPersonajeCTA />);
    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toBe('/characters/import');
  });

  it('link contains text "Importar desde archivo"', () => {
    render(<ImportPersonajeCTA />);
    expect(screen.getByText('Importar desde archivo')).toBeTruthy();
  });

  it('renders an SVG icon', () => {
    render(<ImportPersonajeCTA />);
    const link = screen.getByRole('link');
    const svg = link.querySelector('svg');
    expect(svg).toBeTruthy();
  });
});
