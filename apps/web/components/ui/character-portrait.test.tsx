/**
 * Tests for CharacterPortrait atom.
 *
 * T1: renders the initial derived from name
 * T2: size='md' (default) — applies personajes-portrait CSS class (no hardcoded hex)
 * T3: size='sm' — applies pendientes-portrait CSS class
 * T4: empty/whitespace name → renders '?'
 * T5: passes additional className to the root element
 * T6: size='md' renders w-[72px] sizing class
 * T7: size='sm' does NOT have w-[72px] (uses pendientes-portrait fixed 48px)
 * T8: data-portrait-size attribute matches the size prop (for test targeting)
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CharacterPortrait } from './character-portrait';

describe('CharacterPortrait', () => {
  it('T1: renders initial derived from name', () => {
    render(<CharacterPortrait name="Brann" />);
    expect(screen.getByText('B')).toBeTruthy();
  });

  it('T1b: multi-word name — maxChars=1 gives first char only (default)', () => {
    render(<CharacterPortrait name="Arken Drûm" />);
    expect(screen.getByText('A')).toBeTruthy();
  });

  it('T1c: empty name → renders "?"', () => {
    render(<CharacterPortrait name="" />);
    expect(screen.getByText('?')).toBeTruthy();
  });

  it('T1d: whitespace name → renders "?"', () => {
    render(<CharacterPortrait name="   " />);
    expect(screen.getByText('?')).toBeTruthy();
  });

  it('T2: size="md" (default) applies personajes-portrait CSS class (token-based gradient)', () => {
    const { container } = render(<CharacterPortrait name="Brann" />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('personajes-portrait');
  });

  it('T2b: size="md" does NOT contain hardcoded hex colors', () => {
    const { container } = render(<CharacterPortrait name="Brann" size="md" />);
    const root = container.firstElementChild as HTMLElement;
    // No inline styles with hardcoded hex from active-character-card
    expect(root.style.background ?? '').not.toContain('#2E1A28');
    expect(root.style.background ?? '').not.toContain('#1A1726');
  });

  it('T3: size="sm" applies pendientes-portrait CSS class', () => {
    const { container } = render(<CharacterPortrait name="Lyra" size="sm" />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('pendientes-portrait');
  });

  it('T3b: size="sm" does NOT apply personajes-portrait CSS class', () => {
    const { container } = render(<CharacterPortrait name="Lyra" size="sm" />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).not.toContain('personajes-portrait');
  });

  it('T5: passes additional className to root element', () => {
    const { container } = render(
      <CharacterPortrait name="Brann" className="border-r border-line" />,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('border-r');
    expect(root.className).toContain('border-line');
  });

  it('T6: size="md" root has w-[72px] class', () => {
    const { container } = render(<CharacterPortrait name="Brann" size="md" />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('w-[72px]');
  });

  it('T7: size="sm" root does NOT have w-[72px] (uses pendientes-portrait fixed 48px via CSS)', () => {
    const { container } = render(<CharacterPortrait name="Lyra" size="sm" />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).not.toContain('w-[72px]');
  });

  it('T8: data-portrait-size attribute reflects the size prop', () => {
    const { container: c1 } = render(<CharacterPortrait name="X" size="md" />);
    expect((c1.firstElementChild as HTMLElement).dataset.portraitSize).toBe('md');

    const { container: c2 } = render(<CharacterPortrait name="X" size="sm" />);
    expect((c2.firstElementChild as HTMLElement).dataset.portraitSize).toBe('sm');
  });
});
