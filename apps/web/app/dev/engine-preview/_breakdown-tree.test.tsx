/**
 * _BreakdownTree — component tests (Strict TDD RED → GREEN)
 *
 * REQ-TREE-02: Component test covers value + all source labels.
 * Scenarios: "Component test — 2 sources + 1 nested child" (spec #1111).
 *
 * Note: afterEach(cleanup) is GLOBAL in vitest.setup.ts — do NOT re-add here.
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { BreakdownTree } from './_breakdown-tree';
import type { Source, EntityId } from '@dungeon-hub/domain';

// ── Fixture ───────────────────────────────────────────────────────────────────
// Mirrors the real engine output for: unarmored DEX-14 fighter + Cloak of Protection
// base=12 (PHB p.144), Cloak +1 (DMG 159) → value=13
const ORIGIN = { id: 'fixture-char' as unknown as EntityId, conditions: [] };

const breakdown: Source[] = [
  {
    label: 'base',
    amount: 12,
    type: 'untyped',
    origin: ORIGIN,
  },
  {
    label: 'Cloak of Protection',
    amount: 1,
    type: 'item',
    origin: ORIGIN,
    children: [
      {
        label: 'saving-throw bonus',
        amount: 1,
        type: 'item',
        origin: ORIGIN,
      },
    ],
  },
];

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('BreakdownTree — REQ-TREE-02', () => {
  it('renders the resolved value prominently', () => {
    render(<BreakdownTree stat="ac" value={13} breakdown={breakdown} />);
    expect(screen.getByText('13')).toBeTruthy();
  });

  it('renders the "base" source label', () => {
    render(<BreakdownTree stat="ac" value={13} breakdown={breakdown} />);
    expect(screen.getByText('base')).toBeTruthy();
  });

  it('renders the "Cloak of Protection" source label with signed +1 amount', () => {
    render(<BreakdownTree stat="ac" value={13} breakdown={breakdown} />);
    expect(screen.getByText('Cloak of Protection')).toBeTruthy();
    // Both the Cloak and its nested child have amount=1 → two "+1" spans, use getAllByText
    expect(screen.getAllByText('+1').length).toBeGreaterThanOrEqual(1);
  });

  it('renders nested child label "saving-throw bonus"', () => {
    render(<BreakdownTree stat="ac" value={13} breakdown={breakdown} />);
    expect(screen.getByText('saving-throw bonus')).toBeTruthy();
  });
});
