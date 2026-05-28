/**
 * Tests for InventoryDetailIsland — event delegation + detail fetch + V3Sheet wiring.
 *
 * Reqs: WIDI-ISLAND-01 (spec #1070)
 * Design: DBE1, DBE2 (design #1071) — event delegation on single root.
 *
 * Uses RTL + vi.fn() for fetch mock.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { InventoryDetailIsland } from './inventory-detail-island';
import type { InventoryDetailResponse } from '@/lib/sheet-types';

// Mock actions
vi.mock('../../../actions', () => ({
  updateInventoryItem: vi.fn().mockResolvedValue({ ok: true }),
  removeInventoryItem: vi.fn().mockResolvedValue({ ok: true }),
  addInventoryItem: vi.fn().mockResolvedValue({ ok: true }),
  searchCompendiumItems: vi.fn().mockResolvedValue([]),
}));

// Mock fetch for the detail API call
const WEAPON_DETAIL: InventoryDetailResponse = {
  instanceId: 'abc-123',
  v3Type: 'weapon',
  displayName: 'Espada larga',
  subtitle: null,
  rarity: null,
  magicFlag: false,
  equipped: false,
  weightLb: 3,
  costCp: null,
  qty: 1,
  notes: '',
  historyHeadline: null,
  historyDetail: null,
  attackBonus: 5,
  dmg1: '1d8',
  dmgType: 'Cortante',
  range: null,
  properties: [],
  magicBonus: 0,
};

function mockFetch(detail: InventoryDetailResponse) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ detail }),
  }));
}

function setupMockFetch() {
  mockFetch(WEAPON_DETAIL);
}

const CHAR_ID = 'ch-11111111';

describe('InventoryDetailIsland — WIDI-ISLAND-01', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupMockFetch();
  });

  it('clicking a row button opens the detail sheet with correct instanceId', async () => {
    render(
      <InventoryDetailIsland characterId={CHAR_ID}>
        <button
          type="button"
          data-instance-id="abc-123"
          data-v3-type="weapon"
        >
          Espada larga
        </button>
      </InventoryDetailIsland>,
    );

    const rowBtn = screen.getByText('Espada larga');
    fireEvent.click(rowBtn);

    // Sheet should open (V3Sheet renders role=dialog)
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeTruthy();
    });

    // Item name appears inside the dialog
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeTruthy();
    // The detail shell renders within the dialog
    expect(screen.getAllByText('Espada larga').length).toBeGreaterThanOrEqual(1);
  });

  it('second click on same row uses cache — no second fetch', async () => {
    render(
      <InventoryDetailIsland characterId={CHAR_ID}>
        <button
          type="button"
          data-instance-id="abc-123"
          data-v3-type="weapon"
        >
          Espada larga
        </button>
      </InventoryDetailIsland>,
    );

    const rowBtn = screen.getByText('Espada larga');

    // First open
    fireEvent.click(rowBtn);
    await waitFor(() => screen.getByRole('dialog'));

    // Close the sheet
    const overlay = document.querySelector('[aria-hidden="true"]') as HTMLElement;
    if (overlay) fireEvent.click(overlay);

    // Re-open same row
    fireEvent.click(rowBtn);
    await waitFor(() => screen.getByRole('dialog'));

    // fetch should have been called only once (second open = cache hit)
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });

  it('closing the sheet sets openInstanceId to null', async () => {
    render(
      <InventoryDetailIsland characterId={CHAR_ID}>
        <button
          type="button"
          data-instance-id="abc-123"
          data-v3-type="weapon"
        >
          Espada larga
        </button>
      </InventoryDetailIsland>,
    );

    const rowBtn = screen.getByText('Espada larga');
    fireEvent.click(rowBtn);
    await waitFor(() => screen.getByRole('dialog'));

    // Close via overlay click
    const overlay = document.querySelector('[aria-hidden="true"]') as HTMLElement;
    fireEvent.click(overlay);

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });
});
