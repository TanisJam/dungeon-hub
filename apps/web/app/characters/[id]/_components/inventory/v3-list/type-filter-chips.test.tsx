/**
 * Component tests for TypeFilterChips.
 *
 * Reqs: WIVLS-CHIPS-01 (spec #1063), WID4-CHIPS-01 (spec #1077)
 * Design DA1: filter state owned by TypeFilterChips client island.
 * Design DA8: CSS-only scroll (no JS carousel).
 * Design DCE4 (Slice C): DEFERRED_TYPES = empty set → Libros + Quest chips are now ENABLED.
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TypeFilterChips } from './type-filter-chips.js';

describe('TypeFilterChips — WIVLS-CHIPS-01', () => {
  it('9.2 initial filter "all" — chips strip renders with no filter active (all rows visible)', () => {
    const { container } = render(
      <TypeFilterChips>
        <div data-itype="weapon" className="inventory-init-row">sword</div>
        <div data-itype="armor" className="inventory-init-row">armor</div>
      </TypeFilterChips>,
    );
    // The .inventory-init-list wrapper should have data-filter="all" initially
    const list = container.querySelector('.inventory-init-list');
    expect(list).toBeTruthy();
    expect(list!.getAttribute('data-filter')).toBe('all');
  });

  it('9.3 clicking "weapon" chip sets data-filter="weapon" on wrapper div', () => {
    const { container } = render(
      <TypeFilterChips>
        <div data-itype="weapon" className="inventory-init-row">sword</div>
      </TypeFilterChips>,
    );

    // Find the weapon chip (label "Armas")
    const weaponChip = screen.getByText('Armas');
    fireEvent.click(weaponChip);

    const list = container.querySelector('.inventory-init-list');
    expect(list!.getAttribute('data-filter')).toBe('weapon');
  });

  // 9.4 — FLIPPED in-place (DCE4 Slice C): Libros + Quest chips are now ENABLED (R5)
  it('9.4 "Libros" chip is enabled — DCE4 (DEFERRED_TYPES = empty, WID4-CHIPS-01)', () => {
    // DCE4: DEFERRED_TYPES is now an empty set — Libros chip should NOT be aria-disabled
    render(<TypeFilterChips><div /></TypeFilterChips>);
    const librosChip = screen.getByText('Libros');
    const btn = librosChip.closest('button') ?? librosChip;
    expect(btn.getAttribute('aria-disabled')).not.toBe('true');
  });

  it('9.4 "Quest" chip is enabled — DCE4 (DEFERRED_TYPES = empty, WID4-CHIPS-01)', () => {
    // DCE4: DEFERRED_TYPES is now an empty set — Quest chip should NOT be aria-disabled
    render(<TypeFilterChips><div /></TypeFilterChips>);
    const questChip = screen.getByText('Quest');
    const btn = questChip.closest('button') ?? questChip;
    expect(btn.getAttribute('aria-disabled')).not.toBe('true');
  });

  it('9.4 clicking "Libros" chip sets data-filter="book" (now functional — WID4-CHIPS-01)', () => {
    const { container } = render(<TypeFilterChips><div /></TypeFilterChips>);
    const list = container.querySelector('.inventory-init-list');

    const librosChip = screen.getByText('Libros');
    fireEvent.click(librosChip);

    // DCE4: Libros chip is now active → filter changes to 'book'
    expect(list!.getAttribute('data-filter')).toBe('book');
  });

  it('9.4 clicking "Quest" chip sets data-filter="quest" (now functional — WID4-CHIPS-01)', () => {
    const { container } = render(<TypeFilterChips><div /></TypeFilterChips>);
    const list = container.querySelector('.inventory-init-list');

    const questChip = screen.getByText('Quest');
    fireEvent.click(questChip);

    // DCE4: Quest chip is now active → filter changes to 'quest'
    expect(list!.getAttribute('data-filter')).toBe('quest');
  });
});
