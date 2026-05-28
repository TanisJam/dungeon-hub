/**
 * Component tests for TypeFilterChips.
 *
 * Reqs: WIVLS-CHIPS-01 (spec #1063)
 * Design DA1: filter state owned by TypeFilterChips client island.
 * Design DA8: CSS-only scroll (no JS carousel).
 * Design DA9: Libros + Quest chips are disabled (D4 deferral).
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

  it('9.4 "Libros" chip has aria-disabled="true" — D4 deferred (DA9)', () => {
    render(<TypeFilterChips><div /></TypeFilterChips>);
    const librosChip = screen.getByText('Libros');
    expect(librosChip.closest('[aria-disabled="true"]') ?? librosChip.getAttribute('aria-disabled')).toBeTruthy();
  });

  it('9.4 "Quest" chip has aria-disabled="true" — D4 deferred (DA9)', () => {
    render(<TypeFilterChips><div /></TypeFilterChips>);
    const questChip = screen.getByText('Quest');
    // DA9: Quest chip is disabled — clicking is a no-op
    expect(questChip.closest('[aria-disabled="true"]') ?? questChip.getAttribute('aria-disabled')).toBeTruthy();
  });

  it('9.4 clicking "Libros" chip is a no-op (does not change filter)', () => {
    const { container } = render(<TypeFilterChips><div /></TypeFilterChips>);
    const list = container.querySelector('.inventory-init-list');

    const librosChip = screen.getByText('Libros');
    fireEvent.click(librosChip);

    // Filter should remain 'all' since Libros is disabled
    expect(list!.getAttribute('data-filter')).toBe('all');
  });
});
