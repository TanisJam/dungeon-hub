/**
 * Tests for InventoryDetailShell — STRICT TDD (RED first).
 *
 * Reqs: WIDS-SHELL-01 (spec #1070), WIMD-BODY-01 WIBD-BODY-01 WITD-BODY-01 WIQD-BODY-01 (spec #1077)
 * Design: DBE1, DBE3, DBE4 (design #1071), DCE2 (exhaustive switch — Slice C)
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InventoryDetailShell } from './inventory-detail-shell';
import type {
  InventoryDetailResponse,
  MagicDetailVariant,
  BookDetailVariant,
  TrinketDetailVariant,
  QuestDetailVariant,
} from '@/lib/sheet-types';

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

const CHAR_ID = '11111111-1111-1111-1111-111111111111';

describe('InventoryDetailShell — WIDS-SHELL-01', () => {
  it('renders the item display name in the hero region', () => {
    const detail = makeWeaponDetail({ displayName: 'Espada larga' });
    render(
      <InventoryDetailShell
        detail={detail}
        characterId={CHAR_ID}
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
        characterId={CHAR_ID}
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
        characterId={CHAR_ID}
        loading={false}
        error="Error al cargar"
      />,
    );
    expect(screen.getByText(/error al cargar/i)).toBeTruthy();
  });
});

// ── Slice C: routing tests for 4 new variant bodies (T9) ──────────────────────

function makeMagicDetail(overrides: Partial<MagicDetailVariant> = {}): InventoryDetailResponse {
  return {
    instanceId: 'magic-99',
    v3Type: 'magic',
    displayName: 'Ring of Protection',
    subtitle: 'RG',
    rarity: 'rare',
    magicFlag: true,
    equipped: false,
    weightLb: 0,
    costCp: null,
    qty: 1,
    notes: '',
    historyHeadline: null,
    historyDetail: null,
    attuneRequired: true,
    attuned: false,
    restAttuneNote: 'Requiere sintonización durante un descanso corto',
    powerName: null,
    powerDesc: '+1 AC',
    charges: null,
    chargesMax: null,
    ...overrides,
  } as MagicDetailVariant;
}

function makeBookDetail(overrides: Partial<BookDetailVariant> = {}): InventoryDetailResponse {
  return {
    instanceId: 'book-99',
    v3Type: 'book',
    displayName: 'Grimorio del Vacío',
    subtitle: 'G',
    rarity: null,
    magicFlag: false,
    equipped: false,
    weightLb: 3,
    costCp: null,
    qty: 1,
    notes: '',
    historyHeadline: null,
    historyDetail: null,
    passage: '…',
    pagesRead: 0,
    pages: 100,
    language: 'Común',
    knowledge: [],
    ...overrides,
  } as BookDetailVariant;
}

function makeTrinketDetail(overrides: Partial<TrinketDetailVariant> = {}): InventoryDetailResponse {
  return {
    instanceId: 'trinket-99',
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
  } as TrinketDetailVariant;
}

function makeQuestDetail(overrides: Partial<QuestDetailVariant> = {}): InventoryDetailResponse {
  return {
    instanceId: 'quest-99',
    v3Type: 'quest',
    displayName: 'Medallón del Traidor',
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
    questName: 'El Sello Roto',
    stage: 'Etapa 1',
    visibleTo: 'el grupo',
    ...overrides,
  } as QuestDetailVariant;
}

describe('InventoryDetailShell — Slice C routing (T9)', () => {
  it('routes v3Type==="magic" to MagicDetailBody (renders "Activar poder" stub)', () => {
    render(
      <InventoryDetailShell
        detail={makeMagicDetail()}
        characterId={CHAR_ID}
        loading={false}
        error={null}
      />,
    );
    // MagicDetailBody renders a disabled "Activar poder" button
    expect(screen.getByRole('button', { name: /activar poder/i })).toBeTruthy();
  });

  it('routes v3Type==="book" to BookDetailBody (renders "Leer" stub)', () => {
    render(
      <InventoryDetailShell
        detail={makeBookDetail()}
        characterId={CHAR_ID}
        loading={false}
        error={null}
      />,
    );
    // BookDetailBody renders a disabled "Leer" button
    expect(screen.getByRole('button', { name: /leer/i })).toBeTruthy();
  });

  it('routes v3Type==="trinket" to TrinketDetailBody (renders "Sin reglas mecánicas")', () => {
    render(
      <InventoryDetailShell
        detail={makeTrinketDetail()}
        characterId={CHAR_ID}
        loading={false}
        error={null}
      />,
    );
    // TrinketDetailBody renders fallback narrative when narrative is null
    expect(screen.getByText(/existe para tu narración/i)).toBeTruthy();
  });

  it('routes v3Type==="quest" to QuestDetailBody (renders ⚿ queststamp)', () => {
    const { container } = render(
      <InventoryDetailShell
        detail={makeQuestDetail()}
        characterId={CHAR_ID}
        loading={false}
        error={null}
      />,
    );
    // QuestDetailBody renders the queststamp card
    expect(container.querySelector('.inventory-init-detail-queststamp')).toBeTruthy();
  });
});
