import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CreatePersonajeCTA } from './create-personaje-cta';

describe('CreatePersonajeCTA', () => {
  it('renders a link to /characters/new', () => {
    render(<CreatePersonajeCTA />);
    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toBe('/characters/new');
  });

  it('link contains text "Crear personaje · 6 pasos"', () => {
    render(<CreatePersonajeCTA />);
    expect(screen.getByText('Crear personaje · 6 pasos')).toBeTruthy();
  });

  it('renders a plus SVG icon', () => {
    render(<CreatePersonajeCTA />);
    const link = screen.getByRole('link');
    const svg = link.querySelector('svg');
    expect(svg).toBeTruthy();
  });
});
