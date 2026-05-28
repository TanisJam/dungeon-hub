/**
 * Tests for FoodDetailBody — optimistic decrement (DB4).
 *
 * Reqs: WIFD-BODY-01 (spec #1070)
 * Design: DBE3, DB4 (design #1071) — 'use client' owns local servings state.
 *
 * PHB p.185 — Food & Water (1 lb per ration per day).
 * PHB p.153 — Rations.
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FoodDetailBody } from './food-detail-body';
import type { FoodDetailVariant } from '@/lib/sheet-types';

function makeFood(overrides: Partial<FoodDetailVariant> = {}): FoodDetailVariant {
  return {
    instanceId: 'abc-food',
    v3Type: 'food',
    displayName: 'Ración',
    subtitle: 'FD',
    rarity: null,
    magicFlag: false,
    equipped: false,
    weightLb: 2,
    costCp: 50,
    qty: 2,
    notes: '',
    historyHeadline: null,
    historyDetail: null,
    servings: 4,
    foodKind: 'Ración',
    consumeNote: 'Suficiente para un día de viaje.',
    ...overrides,
  };
}

describe('FoodDetailBody — WIFD-BODY-01', () => {
  it('renders Porciones / Cantidad / Tipo facts (PHB p.185)', () => {
    render(<FoodDetailBody detail={makeFood({ servings: 4, qty: 2, foodKind: 'Ración' })} />);
    expect(screen.getByText('Porciones')).toBeTruthy();
    expect(screen.getByText('4')).toBeTruthy();
    expect(screen.getByText('Cantidad')).toBeTruthy();
    expect(screen.getByText('×2')).toBeTruthy();
    expect(screen.getByText('Tipo')).toBeTruthy();
    expect(screen.getAllByText('Ración').length).toBeGreaterThanOrEqual(1);
  });

  it('clicking "Comer una porción" decrements servings locally (optimistic — DB4)', () => {
    render(<FoodDetailBody detail={makeFood({ servings: 4 })} />);
    const btn = screen.getByRole('button', { name: /próximamente/i });
    fireEvent.click(btn);
    // Counter should show 3 after decrement
    expect(screen.getByText('3')).toBeTruthy();
    // No server action called — it's a stub
  });

  it('renders consumeNote text', () => {
    render(
      <FoodDetailBody
        detail={makeFood({ consumeNote: 'Suficiente para un día de viaje.' })}
      />,
    );
    expect(screen.getByText('Suficiente para un día de viaje.')).toBeTruthy();
  });
});
