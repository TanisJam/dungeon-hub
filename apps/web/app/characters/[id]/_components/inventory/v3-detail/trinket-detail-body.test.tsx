/**
 * Tests for TrinketDetailBody — STRICT TDD (RED first).
 *
 * Reqs: WITD-BODY-01 (spec #1077)
 * Design: DCE1 (RSC), DC6 (stub CTAs — no onClick)
 *
 * PHB p.161: Trinkets table — no mechanical effect. Exists for narrative only.
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TrinketDetailBody } from './trinket-detail-body';
import type { TrinketDetailVariant } from '@/lib/sheet-types';

function makeTrinket(overrides: Partial<TrinketDetailVariant> = {}): TrinketDetailVariant {
  return {
    instanceId: 'trinket-1',
    v3Type: 'trinket',
    displayName: 'Botón de hueso',
    subtitle: 'G',
    rarity: null,
    magicFlag: false,
    equipped: false,
    weightLb: 0,
    costCp: null,
    qty: 1,
    notes: '',
    historyHeadline: null,
    historyDetail: null,
    narrative: null,
    ...overrides,
  };
}

describe('TrinketDetailBody — WITD-BODY-01', () => {
  it('renders fallback flavor text when narrative is null (PHB p.161)', () => {
    // Given: a trinket with no entriesSummary → narrative is null
    render(<TrinketDetailBody detail={makeTrinket({ narrative: null })} />);
    // Then: fallback copy is shown — PHB p.161: trinkets have no mechanical effect
    expect(screen.getByText(/existe para tu narración/i)).toBeTruthy();
  });

  it('renders custom narrative text from entriesSummary when present', () => {
    render(
      <TrinketDetailBody
        detail={makeTrinket({ narrative: 'Una moneda de un reino desaparecido.' })}
      />,
    );
    expect(screen.getByText('Una moneda de un reino desaparecido.')).toBeTruthy();
    // Fallback should NOT appear when custom narrative is present
    expect(screen.queryByText(/existe para tu narración/i)).toBeNull();
  });

  it('renders three disabled ghost CTA buttons (DC6 stub pattern)', () => {
    render(<TrinketDetailBody detail={makeTrinket()} />);
    const btns = screen.getAllByRole('button');
    // Three stubs: Regalar, Anotar memoria, Mostrar al grupo
    expect(btns.length).toBeGreaterThanOrEqual(3);
    btns.forEach((btn) => {
      expect(btn.hasAttribute('disabled')).toBe(true);
    });
  });
});
