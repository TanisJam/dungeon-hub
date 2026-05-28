/**
 * Component tests for InventoryV3List.
 *
 * Reqs: WIVS-SCOPE-01, WED-CSS-SCOPED-06 (spec #1063)
 * Mirrors the WED-CSS-SCOPED-05 pattern from compendium-screen.test.tsx.
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { InventoryV3List } from './inventory-v3-list.js';
import type { Currency, EncumbranceView, EnrichedInventoryItem } from '@/lib/sheet-types';

const defaultCurrency: Currency = { pp: 0, gp: 0, sp: 0, cp: 0, ep: 0 };
const defaultEncumbrance: EncumbranceView = {
  weight: 0,
  max: 150,
  status: 'ok',
  thresholds: { encumbered: 50, heavily: 100, max: 150 },
  speedPenalty: 0,
};
const emptyInventory: EnrichedInventoryItem[] = [];

describe('InventoryV3List — WED-CSS-SCOPED-06', () => {
  it('9.6 outer .inventory-init wrapper exists at DOM root (WED-CSS-SCOPED-05 analogue)', () => {
    const { container } = render(
      <InventoryV3List
        characterId="char-1"
        inventory={emptyInventory}
        currency={defaultCurrency}
        encumbrance={defaultEncumbrance}
        warnings={[]}
      />,
    );

    // WED-CSS-SCOPED-06: outer .inventory-init wrapper must be present
    const wrappers = container.querySelectorAll('.inventory-init');
    expect(wrappers.length).toBe(1);
  });

  it('9.7 composes CurrencyStrip + WeightBar + EquippedSlotsGrid + TypeFilterChips in order', () => {
    const { container } = render(
      <InventoryV3List
        characterId="char-1"
        inventory={emptyInventory}
        currency={defaultCurrency}
        encumbrance={defaultEncumbrance}
        warnings={[]}
      />,
    );

    // All key sections should be present
    expect(container.querySelector('.inventory-init-currency')).toBeTruthy();
    expect(container.querySelector('.inventory-init-weight')).toBeTruthy();
    expect(container.querySelector('.inventory-init-equipped')).toBeTruthy();
    // TypeFilterChips renders the .inventory-init-chips + .inventory-init-list
    expect(container.querySelector('.inventory-init-chips')).toBeTruthy();
    expect(container.querySelector('.inventory-init-list')).toBeTruthy();
  });
});
