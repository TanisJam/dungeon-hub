/**
 * Tests for ConsumableDetailBody — optimistic decrement (DB4).
 *
 * Reqs: WICD-BODY-01 (spec #1070)
 * Design: DBE3, DB4 (design #1071) — 'use client' owns local counter state.
 *
 * PHB p.153 — Adventuring Gear (potions, action to drink).
 * DMG p.139-140 — Charges.
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConsumableDetailBody } from './consumable-detail-body';
import type { ConsumableDetailVariant } from '@/lib/sheet-types';

function makeConsumable(overrides: Partial<ConsumableDetailVariant> = {}): ConsumableDetailVariant {
  return {
    instanceId: 'abc-cons',
    v3Type: 'consumable',
    displayName: 'Poción de curación',
    subtitle: 'P',
    rarity: null,
    magicFlag: false,
    equipped: false,
    weightLb: 0.5,
    costCp: 5000,
    qty: 3,
    notes: '',
    historyHeadline: null,
    historyDetail: null,
    charges: null,
    chargesMax: null,
    entriesSummary: 'Curas 2d4+2 puntos de golpe.',
    actionCost: '1 acción',
    ...overrides,
  };
}

describe('ConsumableDetailBody — WICD-BODY-01', () => {
  it('renders counter with current qty and "restantes" label', () => {
    render(<ConsumableDetailBody detail={makeConsumable({ qty: 3 })} />);
    // Counter shows big qty number and label
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('restantes')).toBeTruthy();
  });

  it('clicking "Usar" decrements the counter locally (optimistic — DB4)', () => {
    render(<ConsumableDetailBody detail={makeConsumable({ qty: 3 })} />);
    const btn = screen.getByRole('button', { name: /próximamente/i });
    fireEvent.click(btn);
    // Counter should show 2 after decrement
    expect(screen.getByText('2')).toBeTruthy();
    // No server action called — it's a stub
  });

  it('renders (stub) badge via data-stub="true" attribute on the CTA', () => {
    const { container } = render(<ConsumableDetailBody detail={makeConsumable()} />);
    const ctaBtn = container.querySelector('[data-stub="true"]');
    expect(ctaBtn).toBeTruthy();
  });
});
