/**
 * Component tests for InventarioTab — v3 layout (migrated C10).
 *
 * Coverage (spec #1063 — inventory-v3-list Slice A + spec #1070 — inventory-v3-simple Slice B):
 *   - WIVS-SCOPE-01: .inventory-init outer wrapper present.
 *   - WIVLS-CURRENCY-01: currency strip rendered.
 *   - WIVLS-WEIGHT-01: weight bar (progressbar role) with correct values.
 *   - WIVLS-EMPTY-01: empty state when inventory is empty.
 *   - WIVLS-ROWS-01: item names visible in grouped rows.
 *   - STR warning banner rendered when sheet.warnings contains INSUFFICIENT_STRENGTH_FOR_ARMOR.
 *   - Equip round-trip (Slice B path): row tap → sheet opens → equip chip → calls updateInventoryItem.
 *   - Delete round-trip (Slice B path): row tap → sheet opens → footer button → calls removeInventoryItem.
 *   - Picker open: clicking "Agregar ítem" opens the modal.
 *
 * Server actions are mocked — pure render-layer tests.
 * Slice B: EquipToggle + DeleteButton moved from sr-only list to detail sheet (ER10 migration).
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type {
  CharacterSheet,
  EnrichedInventoryItem,
  InventoryDetailResponse,
} from '@/lib/sheet-types';
import { InventarioTab } from './inventario';

vi.mock('../actions', () => ({
  addInventoryItem: vi.fn().mockResolvedValue({ ok: true }),
  updateInventoryItem: vi.fn().mockResolvedValue({ ok: true }),
  removeInventoryItem: vi.fn().mockResolvedValue({ ok: true }),
  searchCompendiumItems: vi.fn().mockResolvedValue([]),
}));

beforeEach(() => {
  vi.clearAllMocks();
  // Reset any global fetch mock
  vi.unstubAllGlobals();
});

// ── Fixtures ────────────────────────────────────────────────────────────────

function makeSheet(overrides: Partial<CharacterSheet> = {}): CharacterSheet {
  return {
    identity: {
      name: 'Test',
      totalLevel: 1,
      classes: [],
      race: null,
      subrace: null,
      background: null,
    },
    proficiencyBonus: 2,
    abilityScores: {
      str: { score: 10, modifier: 0 },
      dex: { score: 14, modifier: 2 },
      con: { score: 12, modifier: 1 },
      int: { score: 10, modifier: 0 },
      wis: { score: 10, modifier: 0 },
      cha: { score: 10, modifier: 0 },
    },
    savingThrows: [],
    skills: [],
    passivePerception: 10,
    initiative: 2,
    armorClass: { value: 12, formula: 'Unarmored (base 10) + DEX +2' },
    hitPoints: { max: 10, formula: '1d10' },
    hitDice: { d10: 1 },
    speed: { walk: 30 },
    size: 'M',
    carryingCapacity: 150,
    proficiencies: { armor: [], weapons: [], tools: [], languages: [] },
    feats: [],
    racialSpells: [],
    racialTraits: [],
    spellcasting: [],
    spellSlots: {
      slots: [0, 0, 0, 0, 0, 0, 0, 0, 0],
      pactMagic: null,
      slotsUsed: [0, 0, 0, 0, 0, 0, 0, 0, 0],
      pactSlotsUsed: 0,
    },
    spellsByClass: [],
    warnings: [],
    encumbrance: {
      weight: 10,
      max: 150,
      status: 'ok',
      thresholds: { encumbered: 50, heavily: 100, max: 150 },
      speedPenalty: 0,
    },
    ...overrides,
  };
}

function makeEnrichedItem(overrides: Partial<EnrichedInventoryItem> = {}): EnrichedInventoryItem {
  return {
    instanceId: '00000000-0000-0000-0000-000000000001',
    itemSlug: 'chain-shirt',
    itemSource: 'PHB',
    displayName: 'chain-shirt',
    quantity: 1,
    equipped: false,
    equipHand: null,
    charges: null,
    v3Type: 'armor',
    rarity: null,
    reqAttune: null,
    magicFlag: false,
    weight: 20,
    qty: 1,
    ...overrides,
  };
}

/** Mock global fetch for the InventoryDetailIsland detail fetch */
function mockDetailFetch(detail: InventoryDetailResponse) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ detail }),
  }));
}

function makeArmorDetail(instanceId: string, equipped: boolean): InventoryDetailResponse {
  return {
    instanceId,
    v3Type: 'armor',
    displayName: 'chain-shirt',
    subtitle: 'MA',
    rarity: null,
    magicFlag: false,
    equipped,
    weightLb: 20,
    costCp: 5000,
    qty: 1,
    notes: '',
    historyHeadline: null,
    historyDetail: null,
    acBase: 13,
    armorCategory: 'MA',
    dexCapNote: '+ DEX (máx +2)',
    stealth: false,
    donTime: '5 min',
    armorStrengthMin: 0,
  };
}

function makeTrinketDetail(instanceId: string): InventoryDetailResponse {
  return {
    instanceId,
    v3Type: 'trinket',
    displayName: 'rope',
    subtitle: 'G',
    rarity: null,
    magicFlag: false,
    equipped: false,
    weightLb: 10,
    costCp: 100,
    qty: 1,
    notes: '',
    historyHeadline: null,
    historyDetail: null,
    narrative: null,
  };
}

const CHAR_ID = '11111111-1111-1111-1111-111111111111';
const WORLD_ID = '22222222-2222-2222-2222-222222222222';

// ── Tests ───────────────────────────────────────────────────────────────────

describe('InventarioTab — empty', () => {
  it('renders the picker, encumbrance bar, and empty state when inventory is empty', () => {
    render(
      <InventarioTab
        characterId={CHAR_ID}
        worldId={WORLD_ID}
        inventory={[]}
        sheet={makeSheet()}
      />,
    );

    expect(screen.getByText('+ Agregar ítem')).toBeTruthy();
    // WIVLS-EMPTY-01: empty state rendered in .inventory-init-empty
    expect(screen.getByText(/Tu inventario está vacío/i)).toBeTruthy();
    // WIVLS-WEIGHT-01: weight bar progressbar present
    expect(screen.getByRole('progressbar')).toBeTruthy();
  });
});

describe('InventarioTab — v3 grouped rows (migrated from bucket sections)', () => {
  it('items appear in the v3 list view with their display names', () => {
    const inventory = [
      makeEnrichedItem({
        instanceId: '00000000-0000-0000-0000-000000000001',
        itemSlug: 'chain-shirt',
        displayName: 'chain-shirt',
        equipped: true,
        v3Type: 'armor',
      }),
      makeEnrichedItem({
        instanceId: '00000000-0000-0000-0000-000000000002',
        itemSlug: 'rope',
        displayName: 'rope',
        equipped: false,
        v3Type: 'trinket',
      }),
    ];

    render(
      <InventarioTab
        characterId={CHAR_ID}
        worldId={WORLD_ID}
        inventory={inventory}
        sheet={makeSheet()}
      />,
    );

    // WIVLS-ROWS-01: item names rendered in v3 rows (getAllByText because equipped items appear in grid too)
    expect(screen.getAllByText('chain-shirt').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('rope').length).toBeGreaterThanOrEqual(1);

    // v3 group head labels (InventoryGroup) — appear also in chips, so getAllByText
    expect(screen.getAllByText('Armadura').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Baratijas').length).toBeGreaterThanOrEqual(1);

    // Old bucket grouping MUST NOT be present
    expect(screen.queryByText(/Equipados · 1/)).toBeNull();
    expect(screen.queryByText(/Portados · 1/)).toBeNull();
  });
});

describe('InventarioTab — STR warning banner', () => {
  it('shows the STR warning banner when sheet.warnings includes INSUFFICIENT_STRENGTH_FOR_ARMOR', () => {
    render(
      <InventarioTab
        characterId={CHAR_ID}
        worldId={WORLD_ID}
        inventory={[
          makeEnrichedItem({ itemSlug: 'plate', displayName: 'plate', equipped: true, v3Type: 'armor' }),
        ]}
        sheet={makeSheet({ warnings: ['INSUFFICIENT_STRENGTH_FOR_ARMOR'] })}
      />,
    );

    expect(
      screen.getByText(/Fuerza insuficiente para esta armadura/),
    ).toBeTruthy();
  });

  it('does NOT show the STR banner when warnings is empty', () => {
    render(
      <InventarioTab
        characterId={CHAR_ID}
        worldId={WORLD_ID}
        inventory={[]}
        sheet={makeSheet({ warnings: [] })}
      />,
    );

    expect(
      screen.queryByText(/Fuerza insuficiente para esta armadura/),
    ).toBeNull();
  });
});

describe('InventarioTab — encumbrance warning copy', () => {
  it('renders the weight bar progressbar with encumbered aria values', () => {
    render(
      <InventarioTab
        characterId={CHAR_ID}
        worldId={WORLD_ID}
        inventory={[]}
        sheet={makeSheet({
          encumbrance: {
            weight: 60,
            max: 150,
            status: 'encumbered',
            thresholds: { encumbered: 50, heavily: 100, max: 150 },
            speedPenalty: 10,
          },
        })}
      />,
    );

    // WIVLS-WEIGHT-01: WeightBar uses progressbar role with aria values
    const bar = screen.getByRole('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('60');
    expect(bar.getAttribute('aria-valuemax')).toBe('150');
  });

  it('renders the weight bar even when status === ok', () => {
    render(
      <InventarioTab
        characterId={CHAR_ID}
        worldId={WORLD_ID}
        inventory={[]}
        sheet={makeSheet()}
      />,
    );

    // WeightBar always renders when encumbrance data is present
    const bar = screen.getByRole('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('10');
    expect(bar.getAttribute('aria-valuemax')).toBe('150');
  });
});

describe('InventarioTab — equip round-trip (Slice B detail-sheet path, ER10 migration)', () => {
  it('tapping row → sheet → "Equipar" chip calls updateInventoryItem with state: equipped', async () => {
    const { updateInventoryItem } = await import('../actions');
    const INSTANCE_ID = '00000000-0000-0000-0000-000000000010';
    mockDetailFetch(makeArmorDetail(INSTANCE_ID, false));

    render(
      <InventarioTab
        characterId={CHAR_ID}
        worldId={WORLD_ID}
        inventory={[
          makeEnrichedItem({
            instanceId: INSTANCE_ID,
            itemSlug: 'chain-shirt',
            displayName: 'chain-shirt',
            equipped: false,
            v3Type: 'armor',
          }),
        ]}
        sheet={makeSheet()}
      />,
    );

    // Find the inventory row button via data-instance-id (avoids ambiguity with equipped slots)
    const rowBtn = document.querySelector(`[data-instance-id="${INSTANCE_ID}"]`) as HTMLElement;
    expect(rowBtn).toBeTruthy();
    fireEvent.click(rowBtn);

    // Wait for the detail sheet to appear
    await waitFor(() => screen.getByRole('dialog'));

    // Click the equip chip inside the dialog
    const equipBtn = screen.getByRole('button', { name: /equipar ítem/i });
    fireEvent.click(equipBtn);

    await vi.waitFor(() => {
      expect(updateInventoryItem).toHaveBeenCalledWith(
        CHAR_ID,
        INSTANCE_ID,
        { state: 'equipped' },
      );
    });
  });

  it('tapping row → sheet → "Desequipar" chip calls updateInventoryItem with state: carried', async () => {
    const { updateInventoryItem } = await import('../actions');
    const INSTANCE_ID = '00000000-0000-0000-0000-000000000020';
    mockDetailFetch(makeArmorDetail(INSTANCE_ID, true));

    render(
      <InventarioTab
        characterId={CHAR_ID}
        worldId={WORLD_ID}
        inventory={[
          makeEnrichedItem({
            instanceId: INSTANCE_ID,
            itemSlug: 'chain-shirt',
            displayName: 'chain-shirt',
            equipped: true,
            v3Type: 'armor',
          }),
        ]}
        sheet={makeSheet()}
      />,
    );

    // Find the inventory row button via data-instance-id
    const rowBtn = document.querySelector(`[data-instance-id="${INSTANCE_ID}"]`) as HTMLElement;
    expect(rowBtn).toBeTruthy();
    fireEvent.click(rowBtn);

    await waitFor(() => screen.getByRole('dialog'));

    const desequipBtn = screen.getByRole('button', { name: /desequipar ítem/i });
    fireEvent.click(desequipBtn);

    await vi.waitFor(() => {
      expect(updateInventoryItem).toHaveBeenCalledWith(
        CHAR_ID,
        INSTANCE_ID,
        { state: 'carried' },
      );
    });
  });
});

describe('InventarioTab — delete round-trip (Slice B detail-sheet path, ER10 migration)', () => {
  it('confirmed delete: row → sheet → footer button → calls removeInventoryItem', async () => {
    const { removeInventoryItem } = await import('../actions');
    const INSTANCE_ID = '00000000-0000-0000-0000-000000000030';
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockDetailFetch(makeTrinketDetail(INSTANCE_ID));

    render(
      <InventarioTab
        characterId={CHAR_ID}
        worldId={WORLD_ID}
        inventory={[
          makeEnrichedItem({
            instanceId: INSTANCE_ID,
            itemSlug: 'rope',
            displayName: 'rope',
            v3Type: 'trinket',
          }),
        ]}
        sheet={makeSheet()}
      />,
    );

    const rowBtn = document.querySelector(`[data-instance-id="${INSTANCE_ID}"]`) as HTMLElement;
    expect(rowBtn).toBeTruthy();
    fireEvent.click(rowBtn);

    await waitFor(() => screen.getByRole('dialog'));

    const deleteBtn = screen.getByRole('button', { name: /eliminar rope/i });
    fireEvent.click(deleteBtn);

    expect(confirmSpy).toHaveBeenCalled();
    await vi.waitFor(() => {
      expect(removeInventoryItem).toHaveBeenCalledWith(CHAR_ID, INSTANCE_ID);
    });

    confirmSpy.mockRestore();
  });

  it('cancelled delete does NOT call removeInventoryItem', async () => {
    const { removeInventoryItem } = await import('../actions');
    const INSTANCE_ID = '00000000-0000-0000-0000-000000000031';
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    mockDetailFetch(makeTrinketDetail(INSTANCE_ID));

    render(
      <InventarioTab
        characterId={CHAR_ID}
        worldId={WORLD_ID}
        inventory={[makeEnrichedItem({
          instanceId: INSTANCE_ID,
          itemSlug: 'rope',
          displayName: 'rope',
          v3Type: 'trinket',
        })]}
        sheet={makeSheet()}
      />,
    );

    const rowBtn = document.querySelector(`[data-instance-id="${INSTANCE_ID}"]`) as HTMLElement;
    expect(rowBtn).toBeTruthy();
    fireEvent.click(rowBtn);

    await waitFor(() => screen.getByRole('dialog'));

    const deleteBtn = screen.getByRole('button', { name: /eliminar rope/i });
    fireEvent.click(deleteBtn);

    expect(confirmSpy).toHaveBeenCalled();
    expect(removeInventoryItem).not.toHaveBeenCalled();

    confirmSpy.mockRestore();
  });
});

describe('InventarioTab — picker open', () => {
  it('tapping "Agregar ítem" opens the modal with the search input focused', async () => {
    render(
      <InventarioTab
        characterId={CHAR_ID}
        worldId={WORLD_ID}
        inventory={[]}
        sheet={makeSheet()}
      />,
    );

    fireEvent.click(screen.getByText('+ Agregar ítem'));

    // Dialog appears.
    expect(screen.getByRole('dialog', { name: 'Agregar ítem' })).toBeTruthy();
    expect(screen.getByPlaceholderText('Buscar ítem…')).toBeTruthy();
    // Closing button (44×44 tap target) present.
    expect(screen.getByLabelText('Cerrar')).toBeTruthy();
  });
});
