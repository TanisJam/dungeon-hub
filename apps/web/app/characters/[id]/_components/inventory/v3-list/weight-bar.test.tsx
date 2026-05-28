/**
 * Component tests for WeightBar.
 *
 * Reqs: WIVLS-WEIGHT-01 (spec #1063)
 * PHB p.176 — Lifting and Carrying: carry limit = STR × 15 lbs.
 * Design DA6: weight bar gradient uses existing --color-success → --color-accent tokens.
 *
 * RED FIRST: tests written before component exists.
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WeightBar } from './weight-bar.js';
import type { EncumbranceView } from '@/lib/sheet-types';

function makeEncumbrance(weight: number, max: number): EncumbranceView {
  return {
    weight,
    max,
    status: weight > max ? 'over' : weight > max * (2 / 3) ? 'heavily-encumbered' : weight > max / 3 ? 'encumbered' : 'ok',
    thresholds: { encumbered: Math.floor(max / 3), heavily: Math.floor((max * 2) / 3), max },
    speedPenalty: 0,
  };
}

describe('WeightBar — WIVLS-WEIGHT-01', () => {
  it('7.5 renders weight / max lb text (PHB p.176 — Lifting and Carrying)', () => {
    render(<WeightBar encumbrance={makeEncumbrance(40, 120)} />);
    // Must render current weight value
    expect(screen.getByText('40')).toBeTruthy();
    // Must render max (may be inside "/ 120 lb" span)
    expect(screen.getByText(/120/)).toBeTruthy();
  });

  it('7.6 fill element width matches round(weight/max*100)% (33% for 40/120)', () => {
    const { container } = render(<WeightBar encumbrance={makeEncumbrance(40, 120)} />);
    const fill = container.querySelector('.fill') as HTMLElement | null;
    expect(fill).toBeTruthy();
    // 40/120 = 0.333... → 33%
    expect(fill!.style.width).toBe('33%');
  });

  it('fill width is 100% at max capacity', () => {
    const { container } = render(<WeightBar encumbrance={makeEncumbrance(120, 120)} />);
    const fill = container.querySelector('.fill') as HTMLElement | null;
    expect(fill!.style.width).toBe('100%');
  });

  it('fill width is capped at 100% when over-encumbered', () => {
    const { container } = render(<WeightBar encumbrance={makeEncumbrance(150, 120)} />);
    const fill = container.querySelector('.fill') as HTMLElement | null;
    expect(fill!.style.width).toBe('100%');
  });
});
