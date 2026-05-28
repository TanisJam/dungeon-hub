/**
 * Unit tests for V3Empty component.
 *
 * T1: renders title prop as visible text.
 * T2: renders optional sub prop when provided; absent when omitted.
 * T3: renders an Icon element (glyph container present with aria-hidden svg).
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { V3Empty } from './empty';

describe('V3Empty', () => {
  it('T1: renders the title prop as visible text', () => {
    render(<V3Empty glyph="home" title="Próximamente" />);
    expect(screen.getByRole('heading', { name: 'Próximamente' })).toBeTruthy();
  });

  it('T2: renders sub when provided; absent when omitted', () => {
    const { rerender } = render(<V3Empty glyph="home" title="Próximamente" sub="Tu panel vivirá acá." />);
    expect(screen.getByText('Tu panel vivirá acá.')).toBeTruthy();

    rerender(<V3Empty glyph="home" title="Próximamente" />);
    expect(screen.queryByText('Tu panel vivirá acá.')).toBeNull();
  });

  it('T3: renders an Icon element (svg with aria-hidden)', () => {
    render(<V3Empty glyph="shield" title="Sin datos" />);
    // Icon renders an svg with aria-hidden="true"
    const svg = document.querySelector('svg[aria-hidden="true"]');
    expect(svg).toBeTruthy();
  });
});
