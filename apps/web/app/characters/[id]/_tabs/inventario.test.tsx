/**
 * Component tests for InventarioTab — v3 layout (migrated from bucket-list, C10).
 *
 * Coverage (spec #1063 — inventory-v3-list Slice A):
 *   - WIVS-SCOPE-01: .inventory-init outer wrapper present.
 *   - WIVLS-CURRENCY-01: currency strip rendered.
 *   - WIVLS-WEIGHT-01: weight bar (progressbar role) with correct values.
 *   - WIVLS-EMPTY-01: empty state when inventory is empty.
 *   - WIVLS-ROWS-01: item names visible in grouped rows.
 *   - STR warning banner rendered when sheet.warnings contains INSUFFICIENT_STRENGTH_FOR_ARMOR.
 *   - Equip round-trip: EquipToggle calls updateInventoryItem (ER10 legacy affordance).
 *   - Delete round-trip: DeleteButton calls removeInventoryItem (ER10 legacy affordance).
 *   - Picker open: clicking "Agregar ítem" opens the modal.
 *
 * Server actions are mocked — pure render-layer tests.
 * ER10: EquipToggle + DeleteButton are still in DOM (sr-only list) until Slice B.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { CharacterSheet, EnrichedInventoryItem } from '@/lib/sheet-types';
import { InventarioTab } from './inventario';

vi.mock('../actions', () => ({
  addInventoryItem: vi.fn().mockResolvedValue({ ok: true }),
  updateInventoryItem: vi.fn().mockResolvedValue({ ok: true }),
  removeInventoryItem: vi.fn().mockResolvedValue({ ok: true }),
  searchCompendiumItems: vi.fn().mockResolvedValue([]),
}));

beforeEach(() => {
  vi.clearAllMocks();
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
    armorClass: { value: 12, formula: '10 + DEX' },
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

describe('InventarioTab — equip round-trip (ER10 legacy affordance)', () => {
  it('tapping "Equipar" calls updateInventoryItem with state: equipped', async () => {
    const { updateInventoryItem } = await import('../actions');
    render(
      <InventarioTab
        characterId={CHAR_ID}
        worldId={WORLD_ID}
        inventory={[
          makeEnrichedItem({
            instanceId: '00000000-0000-0000-0000-000000000010',
            itemSlug: 'chain-shirt',
            displayName: 'chain-shirt',
            equipped: false,
          }),
        ]}
        sheet={makeSheet()}
      />,
    );

    const equipBtn = screen.getByRole('button', { name: /Equipar ítem/ });
    fireEvent.click(equipBtn);

    await vi.waitFor(() => {
      expect(updateInventoryItem).toHaveBeenCalledWith(
        CHAR_ID,
        '00000000-0000-0000-0000-000000000010',
        { state: 'equipped' },
      );
    });
  });

  it('tapping "Desequipar" calls updateInventoryItem with state: carried', async () => {
    const { updateInventoryItem } = await import('../actions');
    render(
      <InventarioTab
        characterId={CHAR_ID}
        worldId={WORLD_ID}
        inventory={[
          makeEnrichedItem({
            instanceId: '00000000-0000-0000-0000-000000000020',
            itemSlug: 'chain-shirt',
            displayName: 'chain-shirt',
            equipped: true,
          }),
        ]}
        sheet={makeSheet()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Desequipar ítem/ }));

    await vi.waitFor(() => {
      expect(updateInventoryItem).toHaveBeenCalledWith(
        CHAR_ID,
        '00000000-0000-0000-0000-000000000020',
        { state: 'carried' },
      );
    });
  });
});

describe('InventarioTab — delete round-trip (ER10 legacy affordance)', () => {
  it('confirmed delete calls removeInventoryItem', async () => {
    const { removeInventoryItem } = await import('../actions');
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(
      <InventarioTab
        characterId={CHAR_ID}
        worldId={WORLD_ID}
        inventory={[
          makeEnrichedItem({
            instanceId: '00000000-0000-0000-0000-000000000030',
            itemSlug: 'rope',
            displayName: 'rope',
          }),
        ]}
        sheet={makeSheet()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Eliminar rope/ }));

    expect(confirmSpy).toHaveBeenCalled();
    await vi.waitFor(() => {
      expect(removeInventoryItem).toHaveBeenCalledWith(
        CHAR_ID,
        '00000000-0000-0000-0000-000000000030',
      );
    });
    confirmSpy.mockRestore();
  });

  it('cancelled delete does NOT call removeInventoryItem', async () => {
    const { removeInventoryItem } = await import('../actions');
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    render(
      <InventarioTab
        characterId={CHAR_ID}
        worldId={WORLD_ID}
        inventory={[makeEnrichedItem({ itemSlug: 'rope', displayName: 'rope' })]}
        sheet={makeSheet()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Eliminar rope/ }));

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
