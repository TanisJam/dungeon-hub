
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EquippedSlotsGrid } from './equipped-slots-grid.js';
import type { EnrichedInventoryItem } from '@/lib/sheet-types';

function makeWeapon(overrides: Partial<EnrichedInventoryItem> = {}): EnrichedInventoryItem {
  return {
    instanceId: '00000000-0000-0000-0000-000000000001',
    itemSlug: 'longsword',
    itemSource: 'PHB',
    displayName: 'Longsword',
    quantity: 1,
    equipped: true,
    equipHand: 'main',
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

const _NO_ITEMS: EnrichedInventoryItem[] = [];

describe('EquippedSlotsGrid — WIVLS-EQUIPPED-01', () => {
  it('8.2 equipped weapon with equipHand="main" fills the Princ. slot', () => {
    const weapon = makeWeapon({ equipped: true, equipHand: 'main', displayName: 'Longsword' });
    render(<EquippedSlotsGrid items={[weapon]} />);

    // The Princ. slot should show the item name
    expect(screen.getByText('Longsword')).toBeTruthy();
    // Princ. role label must be present
    expect(screen.getAllByText(/Princ\./i).length).toBeGreaterThan(0);
  });

  it('8.3 Acces. slot ALWAYS renders aria-disabled="true" dashed empty (D1 — accessory slot unmodeled)', () => {
    // D1: even if the character has an equipped magic accessory, Acces. is always dashed.
    // DA10: aria-disabled="true" on the slot button.
    render(<EquippedSlotsGrid items={[makeWeapon()]} />);

    // Find the Acces. slot
    const accesEl = screen.getByLabelText(/Acces\./i);
    expect(accesEl.getAttribute('aria-disabled')).toBe('true');
  });

  it('8.4 long item name is 2-line clamped (WIVLS-EQUIPPED-01 — nm class applied)', () => {
    const longName = 'Espada Larga del Dragón Antiguo';
    const weapon = makeWeapon({ displayName: longName });
    const { container } = render(<EquippedSlotsGrid items={[weapon]} />);

    // .nm class must be present (CSS applies -webkit-line-clamp: 2)
    const nmEl = container.querySelector('.nm');
    expect(nmEl).toBeTruthy();
  });
});
