/**
 * Tests for SheetHero — ficha-* class assertions.
 *
 * T1: hero container has class ficha-hero-bg.
 * T2: portrait ring container has class ficha-portrait-ring.
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SheetHero } from './sheet-hero';

const defaultProps = {
  name: 'Brann',
  level: 5,
  xpCurrent: 6500,
  xpNextThreshold: 14000,
};

describe('SheetHero', () => {
  it('T1: hero container has class ficha-hero-bg', () => {
    const { container } = render(<SheetHero {...defaultProps} />);
    const heroDiv = container.firstElementChild as HTMLElement;
    expect(heroDiv.className).toContain('ficha-hero-bg');
  });

  it('T2: portrait ring container has class ficha-portrait-ring', () => {
    const { container } = render(<SheetHero {...defaultProps} />);
    const portrait = container.querySelector('.ficha-portrait-ring');
    expect(portrait).toBeTruthy();
  });
});
