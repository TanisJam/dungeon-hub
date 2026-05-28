/**
 * Component tests for EmptyState.
 *
 * Reqs: WIVLS-EMPTY-01 (spec #1063)
 * Design DA9: Libros/Quest chips show "Próximamente" instead of "Sin items" (D4 deferral).
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EmptyState } from './empty-state.js';

describe('EmptyState — WIVLS-EMPTY-01', () => {
  it('8.9 renders filter-specific empty card text + ghost CTA for non-deferred types', () => {
    render(<EmptyState filter="weapon" />);
    // Should show "Sin armas" or similar per-filter copy
    expect(screen.getByText(/Sin armas/i)).toBeTruthy();
  });

  it('8.9 weapon empty state has a ghost CTA for adding items', () => {
    render(<EmptyState filter="weapon" />);
    // Ghost CTA for non-deferred types (DA9 — Libros/Quest show Próximamente instead)
    expect(screen.getByText(/Agregar/i)).toBeTruthy();
  });

  it('8.10 "Libros" filter renders "Próximamente" — D4 deferred (DA9)', () => {
    // D4: Book v3TypeOverride deferred to Slice C. "Libros" chip shows Próximamente.
    render(<EmptyState filter="book" />);
    expect(screen.getByText(/Próximamente/i)).toBeTruthy();
  });

  it('8.10 "Quest" filter renders "Próximamente" — D4 deferred (DA9)', () => {
    // D4: Quest v3TypeOverride deferred to Slice C. "Quest" chip shows Próximamente.
    render(<EmptyState filter="quest" />);
    expect(screen.getByText(/Próximamente/i)).toBeTruthy();
  });
});
