/**
 * Tests for InventoryDetailShell — STRICT TDD (RED first).
 *
 * Reqs: WIDS-SHELL-01 (spec #1070)
 * Design: DBE1, DBE3, DBE4 (design #1071)
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InventoryDetailShell } from './inventory-detail-shell';
import type { InventoryDetailResponse } from '@/lib/sheet-types';

// Mock actions (pulls in Supabase which needs env vars)
vi.mock('../../../actions', () => ({
  updateInventoryItem: vi.fn().mockResolvedValue({ ok: true }),
  removeInventoryItem: vi.fn().mockResolvedValue({ ok: true }),
  addInventoryItem: vi.fn().mockResolvedValue({ ok: true }),
  searchCompendiumItems: vi.fn().mockResolvedValue([]),
}));
vi.mock('../equip-toggle', () => ({
  EquipToggle: () => null,
}));
vi.mock('../delete-button', () => ({
  DeleteButton: () => null,
}));

function makeWeaponDetail(overrides: Partial<InventoryDetailResponse> = {}): InventoryDetailResponse {
  return {
    instanceId: '11111111-1111-1111-1111-111111111111',
    v3Type: 'weapon',
    displayName: 'Espada larga',
    subtitle: 'M',
    rarity: null,
    magicFlag: false,
    equipped: false,
    weightLb: 3,
    costCp: 1500,
    qty: 1,
    notes: '',
    historyHeadline: null,
    historyDetail: null,
    attackBonus: 5,
    dmg1: '1d8',
    dmgType: 'Cortante',
    range: null,
    properties: ['versátil'],
    magicBonus: 0,
    ...overrides,
  } as InventoryDetailResponse;
}

describe('InventoryDetailShell — WIDS-SHELL-01', () => {
  it('renders the item display name in the hero region', () => {
    const detail = makeWeaponDetail({ displayName: 'Espada larga' });
    render(
      <InventoryDetailShell
        detail={detail}
        characterId="11111111-1111-1111-1111-111111111111"
        loading={false}
        error={null}
      />,
    );
    expect(screen.getByText('Espada larga')).toBeTruthy();
  });

  it('renders loading state when loading=true', () => {
    render(
      <InventoryDetailShell
        detail={null}
        characterId="11111111-1111-1111-1111-111111111111"
        loading={true}
        error={null}
      />,
    );
    expect(screen.getByText(/cargando/i)).toBeTruthy();
  });

  it('renders error state when error is set', () => {
    render(
      <InventoryDetailShell
        detail={null}
        characterId="11111111-1111-1111-1111-111111111111"
        loading={false}
        error="Error al cargar"
      />,
    );
    expect(screen.getByText(/error al cargar/i)).toBeTruthy();
  });
});
