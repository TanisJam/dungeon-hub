/**
 * Tests for ListRow atom.
 *
 * T1: renders title text
 * T2: renders optional subtitle text
 * T3: title-only (no subtitle) — subtitle element absent
 * T4: passes className to root element
 * T5: trailing slot renders arbitrary ReactNode (e.g. a Pill)
 * T6: no trailing — trailing slot absent
 * T7: title truncation — root contains a truncate class on the title span
 * T8: subtitle truncation — subtitle span contains truncate when present
 * T9: root has py-2 (flat divider spacing)
 * T10: root has flex items-center justify-between gap-2
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ListRow } from './list-row';

describe('ListRow', () => {
  it('T1: renders title text', () => {
    render(<ListRow title="Varis Sombraluz" />);
    expect(screen.getByText('Varis Sombraluz')).toBeTruthy();
  });

  it('T2: renders optional subtitle text', () => {
    render(<ListRow title="Battle of the Keep" subtitle="hace 3 días" />);
    expect(screen.getByText('hace 3 días')).toBeTruthy();
  });

  it('T3: title-only — no subtitle element in DOM', () => {
    const { container } = render(<ListRow title="El correo perdido" />);
    // No second text node below title
    expect(container.querySelector('[data-subtitle]')).toBeNull();
  });

  it('T4: passes className to root element', () => {
    const { container } = render(<ListRow title="X" className="border-b border-line" />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('border-b');
    expect(root.className).toContain('border-line');
  });

  it('T5: trailing slot renders arbitrary ReactNode', () => {
    render(<ListRow title="Varis" trailing={<span data-testid="pill-slot">Vivo</span>} />);
    expect(screen.getByTestId('pill-slot')).toBeTruthy();
  });

  it('T6: no trailing — trailing slot absent', () => {
    render(<ListRow title="Varis" />);
    // No unexpected DOM nodes beyond title
    expect(screen.queryByTestId('pill-slot')).toBeNull();
  });

  it('T7: title has truncate class', () => {
    const { container } = render(<ListRow title="A very long NPC name that should truncate" />);
    const titleEl = container.querySelector('[data-title]') as HTMLElement;
    expect(titleEl.className).toContain('truncate');
  });

  it('T8: subtitle has truncate class when present', () => {
    const { container } = render(<ListRow title="Event" subtitle="A very long subtitle text here" />);
    const subtitleEl = container.querySelector('[data-subtitle]') as HTMLElement;
    expect(subtitleEl.className).toContain('truncate');
  });

  it('T9: root has py-2 class (flat divider spacing)', () => {
    const { container } = render(<ListRow title="X" />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('py-2');
  });

  it('T10: root has flex items-center justify-between gap-2', () => {
    const { container } = render(<ListRow title="X" />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('flex');
    expect(root.className).toContain('items-center');
    expect(root.className).toContain('justify-between');
    expect(root.className).toContain('gap-2');
  });
});
