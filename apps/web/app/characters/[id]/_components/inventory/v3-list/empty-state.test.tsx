/**
 * Component tests for EmptyState.
 *
 * Reqs: WIVLS-EMPTY-01 (spec #1063), WID4-CHIPS-01 (spec #1077)
 * Design: DA9 (Slice A deferred); DCE4 (Slice C: book + quest now enabled with real copy).
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
    expect(screen.getByText(/Agregar/i)).toBeTruthy();
  });

  // 8.10 — FLIPPED in-place (DCE4 Slice C): book + quest show real copy, not "Próximamente"
  it('8.10 "Libros" filter renders "Sin libros en el inventario" — DCE4 enabled (WID4-CHIPS-01)', () => {
    // DCE4: book filter is now active — real copy replaces "Próximamente"
    render(<EmptyState filter="book" />);
    expect(screen.getByText(/Sin libros/i)).toBeTruthy();
  });

  it('8.10 "Quest" filter renders "Sin objetos de quest activos" — DCE4 enabled (WID4-CHIPS-01)', () => {
    // DCE4: quest filter is now active — real copy replaces "Próximamente"
    render(<EmptyState filter="quest" />);
    expect(screen.getByText(/Sin objetos de quest/i)).toBeTruthy();
  });

  it('8.10 "Libros" empty state shows ghost CTA "Agregar libro" — DCE4', () => {
    render(<EmptyState filter="book" />);
    expect(screen.getByText(/Agregar libro/i)).toBeTruthy();
  });

  it('8.10 "Quest" empty state has no CTA — quest items are DM-assigned (house rule §1.2)', () => {
    render(<EmptyState filter="quest" />);
    // Quest items can only be added via v3TypeOverride — no generic CTA
    expect(screen.queryByText(/Agregar/i)).toBeNull();
  });
});
