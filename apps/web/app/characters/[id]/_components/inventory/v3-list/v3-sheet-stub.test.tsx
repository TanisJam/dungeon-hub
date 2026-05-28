/**
 * Component tests for V3SheetStub.
 *
 * Reqs: WIVLS-SHEET-STUB-01 (spec #1063)
 * Design ER10: stub renders legacy EquipToggle + DeleteButton so round-trip tests
 * stay green until Slice B ships real renderers.
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { V3SheetStub } from './v3-sheet-stub.js';

// Mock the actions that EquipToggle/DeleteButton call
vi.mock('../../../actions', () => ({
  updateInventoryItem: vi.fn().mockResolvedValue({ ok: true }),
  removeInventoryItem: vi.fn().mockResolvedValue({ ok: true }),
  addInventoryItem: vi.fn().mockResolvedValue({ ok: true }),
  searchCompendiumItems: vi.fn().mockResolvedValue([]),
}));

import { vi } from 'vitest';

describe('V3SheetStub — WIVLS-SHEET-STUB-01', () => {
  it('9.5 opens with body text "Próximamente" when open=true', () => {
    render(
      <V3SheetStub
        open={true}
        onClose={() => {}}
        characterId="char-1"
        instanceId="inst-1"
        currentState="carried"
        itemName="Longsword"
      />,
    );

    // Sheet body should show "Próximamente"
    expect(screen.getByText(/Próximamente/i)).toBeTruthy();
  });
});
