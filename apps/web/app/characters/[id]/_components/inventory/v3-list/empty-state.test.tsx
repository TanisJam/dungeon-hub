
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EmptyState } from './empty-state.js';

describe('EmptyState — WIVLS-EMPTY-01', () => {
  it('8.9 renders filter-specific empty card text + ghost CTA for non-deferred types', () => {
    render(<EmptyState filter="weapon" />);
    // Should show "Sin armas" or similar per-filter copy
    expect(screen.getByText(/Sin armas/i)).toBeTruthy();
  });

  it('8.9 weapon empty state CTA is a real <button> (not a p[role=button]) — a11y lock', () => {
    render(<EmptyState filter="weapon" />);
    // Must be a real button element — strict getByRole should match exactly one
    const btn = screen.getByRole('button', { name: /Agregá tu primer arma/i });
    expect(btn.tagName).toBe('BUTTON');
  });

  it('8.9 weapon empty state CTA name is distinct from "+ Agregar ítem" picker name', () => {
    render(<EmptyState filter="weapon" />);
    // The CTA name must NOT be "Agregar ítem" — otherwise it duplicates the Picker button
    expect(screen.queryByRole('button', { name: /^\+ Agregar ítem$/i })).toBeNull();
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

  it('8.10 "Libros" empty state shows ghost CTA as a real button — DCE4', () => {
    render(<EmptyState filter="book" />);
    const btn = screen.getByRole('button', { name: /Agregá tu primer libro/i });
    expect(btn.tagName).toBe('BUTTON');
  });

  it('8.10 "Quest" empty state has no CTA — quest items are DM-assigned (house rule §1.2)', () => {
    render(<EmptyState filter="quest" />);
    // Quest items can only be added via v3TypeOverride — no generic CTA
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('a11y: "all" filter CTA name is distinct from picker — no two buttons named "Agregar ítem"', () => {
    render(<EmptyState filter="all" />);
    // CTA text is "Agregá tu primer ítem", NOT "Agregar ítem"
    const btn = screen.getByRole('button', { name: /Agregá tu primer ítem/i });
    expect(btn.tagName).toBe('BUTTON');
  });

  it('a11y: onAdd callback fires when CTA is clicked', () => {
    let called = false;
    render(<EmptyState filter="all" onAdd={() => { called = true; }} />);
    screen.getByRole('button', { name: /Agregá tu primer ítem/i }).click();
    expect(called).toBe(true);
  });
});
