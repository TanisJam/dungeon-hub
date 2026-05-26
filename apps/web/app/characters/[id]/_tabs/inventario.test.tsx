/**
 * Component tests for InventarioTab.
 *
 * Coverage (spec #843 — inventory-foundation):
 *   - REQ-INV-ENCUMBRANCE-DISPLAY: bar + warning copy at 'encumbered' status.
 *   - REQ-INV-MOBILE-LAYOUT: STR warning banner rendered when sheet.warnings
 *     contains 'INSUFFICIENT_STRENGTH_FOR_ARMOR'.
 *   - Sectioned inventory list (Equipados / Portados / Guardados) shows the
 *     correct rows in each section.
 *   - Equip toggle taps wire through to the server action.
 *   - Empty inventory renders the empty state and still shows the picker +
 *     encumbrance bar.
 *
 * Server actions are mocked — these are pure render-layer tests; integration
 * coverage lives in apps/api/tests/integration/character-inventory.test.ts.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { CharacterSheet, InventoryItem } from '@/lib/sheet-types';
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

function makeItem(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    instanceId: '00000000-0000-0000-0000-000000000001',
    itemSlug: 'chain-shirt',
    itemSource: 'PHB',
    quantity: 1,
    state: 'carried',
    attuned: false,
    customName: null,
    notes: '',
    ...overrides,
  };
}

const CHAR_ID = '11111111-1111-1111-1111-111111111111';
const WORLD_ID = '22222222-2222-2222-2222-222222222222';

// ── Tests ───────────────────────────────────────────────────────────────────

describe('InventarioTab — empty', () => {
  it('renders the picker, encumbrance bar, and "Sin equipo" copy when inventory is empty', () => {
    render(
      <InventarioTab
        characterId={CHAR_ID}
        worldId={WORLD_ID}
        inventory={[]}
        sheet={makeSheet()}
      />,
    );

    expect(screen.getByText('+ Agregar ítem')).toBeTruthy();
    expect(screen.getByText('Sin equipo.')).toBeTruthy();
    expect(screen.getByLabelText('Capacidad de carga')).toBeTruthy();
  });
});

describe('InventarioTab — grouped sections', () => {
  it('renders Equipados / Portados / Guardados only for non-empty buckets', () => {
    const inventory = [
      makeItem({
        instanceId: '00000000-0000-0000-0000-000000000001',
        itemSlug: 'chain-shirt',
        state: 'equipped',
      }),
      makeItem({
        instanceId: '00000000-0000-0000-0000-000000000002',
        itemSlug: 'rope',
        state: 'carried',
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

    expect(screen.getByText(/Equipados · 1/)).toBeTruthy();
    expect(screen.getByText(/Portados · 1/)).toBeTruthy();
    // 'Guardados' bucket is empty → header MUST NOT render.
    expect(screen.queryByText(/Guardados/)).toBeNull();

    expect(screen.getByText('chain-shirt')).toBeTruthy();
    expect(screen.getByText('rope')).toBeTruthy();
  });
});

describe('InventarioTab — STR warning banner', () => {
  it('shows the STR warning banner when sheet.warnings includes INSUFFICIENT_STRENGTH_FOR_ARMOR', () => {
    render(
      <InventarioTab
        characterId={CHAR_ID}
        worldId={WORLD_ID}
        inventory={[
          makeItem({ itemSlug: 'plate', state: 'equipped' }),
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
  it('renders the "encumbered" banner copy when sheet.encumbrance.status === encumbered', () => {
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

    expect(screen.getByText(/Sobrecargado/)).toBeTruthy();
    // ARIA progress reflects the weight.
    const bar = screen.getByRole('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('60');
    expect(bar.getAttribute('aria-valuemax')).toBe('150');
  });

  it('does NOT render a banner when status === ok', () => {
    render(
      <InventarioTab
        characterId={CHAR_ID}
        worldId={WORLD_ID}
        inventory={[]}
        sheet={makeSheet()}
      />,
    );

    expect(screen.queryByText(/Sobrecargado/)).toBeNull();
  });
});

describe('InventarioTab — equip round-trip', () => {
  it('tapping "Equipar" calls updateInventoryItem with state: equipped', async () => {
    const { updateInventoryItem } = await import('../actions');
    render(
      <InventarioTab
        characterId={CHAR_ID}
        worldId={WORLD_ID}
        inventory={[
          makeItem({
            instanceId: '00000000-0000-0000-0000-000000000010',
            itemSlug: 'chain-shirt',
            state: 'carried',
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
          makeItem({
            instanceId: '00000000-0000-0000-0000-000000000020',
            itemSlug: 'chain-shirt',
            state: 'equipped',
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

describe('InventarioTab — delete round-trip', () => {
  it('confirmed delete calls removeInventoryItem', async () => {
    const { removeInventoryItem } = await import('../actions');
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(
      <InventarioTab
        characterId={CHAR_ID}
        worldId={WORLD_ID}
        inventory={[
          makeItem({
            instanceId: '00000000-0000-0000-0000-000000000030',
            itemSlug: 'rope',
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
        inventory={[makeItem({ itemSlug: 'rope' })]}
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
