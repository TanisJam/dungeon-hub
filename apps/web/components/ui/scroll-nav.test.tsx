/**
 * Tests for ScrollNav — horizontal-scroll container primitive (C4 — scroll-pill-nav).
 *
 * REQ-C4-01: renders children inside the container
 * REQ-C4-02: root element has overflow-x-auto class
 * REQ-C4-03: root element has flex class
 * REQ-C4-04: scrollbar is hidden via [scrollbar-width:none] and [&::-webkit-scrollbar]:hidden
 * REQ-C4-05: default gap is gap-1.5
 * REQ-C4-06: gap prop overrides the default
 * REQ-C4-07: className prop is merged onto root element
 * REQ-C4-08: renders as <nav> when as="nav" + aria-label forwarded
 * REQ-C4-09: renders as <div> by default (no as prop)
 * REQ-C4-10: data-scroll-nav attribute on root for test selection
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ScrollNav } from './scroll-nav';

describe('ScrollNav', () => {
  it('REQ-C4-01: renders children', () => {
    render(
      <ScrollNav>
        <span data-testid="child">item</span>
      </ScrollNav>,
    );
    expect(screen.getByTestId('child')).toBeTruthy();
  });

  it('REQ-C4-02: root element has overflow-x-auto class', () => {
    const { container } = render(<ScrollNav><span>x</span></ScrollNav>);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('overflow-x-auto');
  });

  it('REQ-C4-03: root element has flex class', () => {
    const { container } = render(<ScrollNav><span>x</span></ScrollNav>);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('flex');
  });

  it('REQ-C4-04: scrollbar hidden classes are applied', () => {
    const { container } = render(<ScrollNav><span>x</span></ScrollNav>);
    const root = container.firstElementChild as HTMLElement;
    // [scrollbar-width:none] produces a class that includes scrollbar-width
    expect(root.className).toContain('[scrollbar-width:none]');
    // [&::-webkit-scrollbar]:hidden produces a class that includes webkit-scrollbar
    expect(root.className).toContain('[&::-webkit-scrollbar]:hidden');
  });

  it('REQ-C4-05: default gap is gap-1.5', () => {
    const { container } = render(<ScrollNav><span>x</span></ScrollNav>);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('gap-1.5');
  });

  it('REQ-C4-06: gap prop overrides default', () => {
    const { container } = render(<ScrollNav gap="gap-2"><span>x</span></ScrollNav>);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('gap-2');
    expect(root.className).not.toContain('gap-1.5');
  });

  it('REQ-C4-07: className prop is merged onto root', () => {
    const { container } = render(<ScrollNav className="py-1 pb-0.5"><span>x</span></ScrollNav>);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('py-1');
    expect(root.className).toContain('pb-0.5');
  });

  it('REQ-C4-08: renders as <nav> with aria-label when specified', () => {
    render(
      <ScrollNav as="nav" aria-label="Pestañas de ficha">
        <span>tab</span>
      </ScrollNav>,
    );
    const nav = screen.getByRole('navigation', { name: 'Pestañas de ficha' });
    expect(nav).toBeTruthy();
    expect(nav.tagName.toLowerCase()).toBe('nav');
  });

  it('REQ-C4-09: renders as <div> by default', () => {
    const { container } = render(<ScrollNav><span>x</span></ScrollNav>);
    const root = container.firstElementChild as HTMLElement;
    expect(root.tagName.toLowerCase()).toBe('div');
  });

  it('REQ-C4-10: root has data-scroll-nav attribute', () => {
    const { container } = render(<ScrollNav><span>x</span></ScrollNav>);
    const root = container.firstElementChild as HTMLElement;
    expect(root.hasAttribute('data-scroll-nav')).toBe(true);
  });
});
