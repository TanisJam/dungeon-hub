/**
 * Component tests for CurrencyStrip.
 *
 * Reqs: WIVLS-CURRENCY-01 (spec #1063)
 * PHB p.143 — Money: pp / gp / ep / sp / cp denomination table.
 * Design DA5: per-metal tints are inline hex in JSX, NOT new CSS tokens.
 *
 * RED FIRST: tests written before component exists.
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CurrencyStrip } from './currency-strip.js';
import type { Currency } from '@/lib/sheet-types';

const defaultCurrency: Currency = { pp: 2, gp: 15, sp: 0, cp: 43, ep: 1 };

describe('CurrencyStrip — WIVLS-CURRENCY-01', () => {
  it('7.2 renders 4 coin columns in pp→gp→sp→cp order (PHB p.143 — Money table)', () => {
    const { container } = render(<CurrencyStrip currency={defaultCurrency} />);
    // Must render exactly 4 coin cells (no EP column)
    const coins = container.querySelectorAll('.coin');
    expect(coins.length).toBe(4);

    // Check order: pp first, then gp, sp, cp
    const labels = Array.from(coins).map((c) => c.querySelector('.k')?.textContent);
    expect(labels).toEqual(['pp', 'gp', 'sp', 'cp']);
  });

  it('7.3 renders raw currency values from the currency prop', () => {
    render(<CurrencyStrip currency={defaultCurrency} />);
    expect(screen.getByText('2')).toBeTruthy();   // pp
    expect(screen.getByText('15')).toBeTruthy();  // gp
    expect(screen.getByText('0')).toBeTruthy();   // sp
    expect(screen.getByText('43')).toBeTruthy();  // cp
  });

  it('7.4 does NOT render EP (Electrum) anywhere in the strip (PHB p.143 — EP de-emphasized in v3)', () => {
    render(<CurrencyStrip currency={defaultCurrency} />);
    // EP value of 1 must NOT be in the document (only 4 cols: pp/gp/sp/cp)
    expect(screen.queryByText('ep')).toBeNull();
    expect(screen.queryByText('EP')).toBeNull();
    // The ep: 1 value appears only in the hidden ep column which shouldn't render
  });
});
