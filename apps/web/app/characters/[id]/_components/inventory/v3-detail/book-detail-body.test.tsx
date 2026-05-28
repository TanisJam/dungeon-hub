/**
 * Tests for BookDetailBody — STRICT TDD (RED first).
 *
 * Reqs: WIBD-BODY-01 (spec #1077)
 * Design: DCE1 (RSC), DC3 (no persistence — pagesRead client-stubbed), DC6 (stub CTA)
 *
 * House rule (PHB p.114): "Leer durante descanso largo" is a house rule —
 * PHB only specifies spellbooks. Generic tome reading is not in PHB.
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BookDetailBody } from './book-detail-body';
import type { BookDetailVariant } from '@/lib/sheet-types';

function makeBook(overrides: Partial<BookDetailVariant> = {}): BookDetailVariant {
  return {
    instanceId: 'book-1',
    v3Type: 'book',
    displayName: 'El Grimorio del Vacío',
    subtitle: 'G',
    rarity: null,
    magicFlag: false,
    equipped: false,
    weightLb: 3,
    costCp: 500,
    qty: 1,
    notes: '',
    historyHeadline: null,
    historyDetail: null,
    passage: 'En el principio era el vacío...',
    pagesRead: 25,
    pages: 100,
    language: 'Común',
    knowledge: [],
    ...overrides,
  };
}

describe('BookDetailBody — WIBD-BODY-01', () => {
  it('renders bookpage card with passage text in .passage element', () => {
    render(
      <BookDetailBody detail={makeBook({ passage: 'En el principio era el vacío...' })} />,
    );
    // The passage text is rendered inside .passage element (script font via CSS)
    expect(screen.getByText('En el principio era el vacío...')).toBeTruthy();
    const passageEl = document.querySelector('.passage');
    expect(passageEl).toBeTruthy();
  });

  it('renders progress bar showing pagesRead / pages (DC3 — client-stubbed, no persistence)', () => {
    const { container } = render(
      <BookDetailBody detail={makeBook({ pagesRead: 25, pages: 100 })} />,
    );
    // Progress bar exists
    const bar = container.querySelector('.bar');
    expect(bar).toBeTruthy();
    // Progress fill shows correct percentage (25%)
    const fill = container.querySelector('.fill');
    expect(fill).toBeTruthy();
    expect(fill!.getAttribute('aria-valuenow')).toBe('25');
    expect(fill!.getAttribute('aria-valuemax')).toBe('100');
  });

  it('does NOT render Conocimiento section when knowledge array is empty', () => {
    render(<BookDetailBody detail={makeBook({ knowledge: [] })} />);
    expect(screen.queryByText(/conocimiento desbloqueado/i)).toBeNull();
  });

  it('"Leer" CTA is disabled (DC6 + DC3 — no decrement; house rule PHB p.114)', () => {
    render(<BookDetailBody detail={makeBook()} />);
    // The Leer button should be disabled
    const btn = screen.getByRole('button', { name: /leer/i });
    expect(btn.hasAttribute('disabled')).toBe(true);
  });
});
