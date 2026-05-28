/**
 * Component tests for InventoryRow.
 *
 * Reqs: WIVLS-ROWS-01 (spec #1063)
 * PHB p.149 — Weapons table (weapon type rendering).
 * DMG p.135 — Rarity (rarity glow CSS class).
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InventoryRow } from './inventory-row.js';
import type { EnrichedInventoryItem } from '@/lib/sheet-types';

function makeEnrichedItem(overrides: Partial<EnrichedInventoryItem> = {}): EnrichedInventoryItem {
  return {
    instanceId: '00000000-0000-0000-0000-000000000001',
    itemSlug: 'longsword',
    itemSource: 'PHB',
    displayName: 'Longsword',
    quantity: 1,
    equipped: false,
    equipHand: null,
    charges: null,
    v3Type: 'weapon',
    rarity: null,
    reqAttune: null,
    magicFlag: false,
    weight: 3,
    qty: 1,
    ...overrides,
  };
}

describe('InventoryRow — WIVLS-ROWS-01', () => {
  it('8.5 data-itype attribute matches v3Type prop', () => {
    const { container } = render(
      <InventoryRow item={makeEnrichedItem({ v3Type: 'weapon' })} characterId="char-1" />,
    );
    const row = container.querySelector('[data-itype="weapon"]');
    expect(row).toBeTruthy();
  });

  it('8.6 rarity-<class> CSS class applied per RarityClass (reuses existing tokens — WIVS-TOKENS-01)', () => {
    const { container } = render(
      <InventoryRow
        item={makeEnrichedItem({ rarity: 'rare', v3Type: 'magic' })}
        characterId="char-1"
      />,
    );
    // .rarity-rare class must be present on the row element (DMG p.135 — Rarity)
    const row = container.querySelector('.rarity-rare');
    expect(row).toBeTruthy();
  });

  it('8.7 .equipped-flag rendered when equipped=true', () => {
    const { container } = render(
      <InventoryRow item={makeEnrichedItem({ equipped: true })} characterId="char-1" />,
    );
    expect(container.querySelector('.equipped-flag')).toBeTruthy();
  });

  it('8.7 .equipped-flag NOT rendered when equipped=false', () => {
    const { container } = render(
      <InventoryRow item={makeEnrichedItem({ equipped: false })} characterId="char-1" />,
    );
    expect(container.querySelector('.equipped-flag')).toBeNull();
  });

  it('8.8 .sparkle rendered when magicFlag=true', () => {
    const { container } = render(
      <InventoryRow item={makeEnrichedItem({ magicFlag: true, v3Type: 'magic' })} characterId="char-1" />,
    );
    expect(container.querySelector('.sparkle')).toBeTruthy();
  });

  it('8.8 .sparkle NOT rendered when magicFlag=false', () => {
    const { container } = render(
      <InventoryRow item={makeEnrichedItem({ magicFlag: false })} characterId="char-1" />,
    );
    expect(container.querySelector('.sparkle')).toBeNull();
  });
});
