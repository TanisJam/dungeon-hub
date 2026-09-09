
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type {
  ParsedClassEquipment,
  ParsedBackgroundEquipment,
  EquipmentSelections,
} from '@dungeon-hub/domain/character/starting-equipment';
import { EquipmentPicker } from './_picker';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('./actions', () => ({
  saveEquipmentSelections: vi.fn().mockResolvedValue({ error: null }),
  fetchCategoryItems: vi.fn().mockResolvedValue([
    { id: 'uuid-1', slug: 'longsword', source: 'PHB', name: 'Longsword', type: 'M', weight: '3', costCp: 1500 },
    { id: 'uuid-2', slug: 'shortsword', source: 'PHB', name: 'Shortsword', type: 'M', weight: '2', costCp: 1000 },
  ]),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  redirect: vi.fn(),
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

/**
 * A minimal Fighter-like parsed class with:
 * - 1 choice row (a: chain-mail, b: leather + longbow)
 * - 1 category ref in option-a (weaponMartial)
 * - 1 fixed item (dungeoneers-pack)
 * - goldAlternative "5d4 × 10"
 */
const PARSED_CLASS_WITH_CHOICE: ParsedClassEquipment = {
  fixedItems: [
    { slug: 'dungeoneers-pack', source: 'PHB', quantity: 1 },
  ],
  choiceRows: [
    {
      options: [
        {
          slot: 'a',
          refs: [
            { slug: 'chain-mail', source: 'PHB', quantity: 1 },
            { equipmentType: 'weaponMartial', quantity: 1 },
          ],
        },
        {
          slot: 'b',
          refs: [
            { slug: 'leather-armor', source: 'PHB', quantity: 1 },
          ],
        },
      ],
    },
  ],
  goldAlternative: { dice: '5d4 × 10' },
};

const PARSED_CLASS_NO_GOLD: ParsedClassEquipment = {
  fixedItems: [],
  choiceRows: [],
  goldAlternative: null,
};

const PARSED_BACKGROUND_EMPTY: ParsedBackgroundEquipment = {
  fixedItems: [],
  choiceRows: [],
  currency: 0,
  specialItems: [],
};

/**
 * Background with a fixed holy-symbol and 1500 cp (Acolyte-like).
 */
const PARSED_BACKGROUND_WITH_DATA: ParsedBackgroundEquipment = {
  fixedItems: [{ slug: 'holy-symbol', source: 'PHB', quantity: 1 }],
  choiceRows: [],
  currency: 1500,
  specialItems: ['a prayer book', '5 sticks of incense'],
};

// ─── Helper ───────────────────────────────────────────────────────────────────

function renderPicker({
  parsedClass = PARSED_CLASS_WITH_CHOICE,
  parsedBackground = PARSED_BACKGROUND_EMPTY,
  initialSelections = null,
}: {
  parsedClass?: ParsedClassEquipment;
  parsedBackground?: ParsedBackgroundEquipment;
  initialSelections?: EquipmentSelections | null;
} = {}) {
  return render(
    <EquipmentPicker
      characterId="char-123"
      worldId="world-abc"
      parsedClass={parsedClass}
      parsedBackground={parsedBackground}
      initialSelections={initialSelections}
    />,
  );
}

// ─── C.8a — Package-vs-gold toggle ───────────────────────────────────────────

describe('EquipmentPicker — package-vs-gold toggle (REQ-SEQUIP-09)', () => {
  it('shows "package" radio and "gold" radio when goldAlternative is present', () => {
    renderPicker();

    const packageRadio = screen.getByDisplayValue('package');
    const goldRadio = screen.getByDisplayValue('gold');
    expect(packageRadio).toBeTruthy();
    expect(goldRadio).toBeTruthy();
  });

  it('defaults to "package" path — package radio is checked initially', () => {
    renderPicker();
    const packageRadio = screen.getByDisplayValue('package') as HTMLInputElement;
    expect(packageRadio.checked).toBe(true);
  });

  it('switching to gold path hides choice rows section', () => {
    renderPicker();

    // Initially: class choice rows are visible (we have 1 row)
    // Find the radiogroup for the choice row
    expect(screen.getByRole('radiogroup', { name: 'Fila de elección 1' })).toBeTruthy();

    // Select gold path
    const goldRadio = screen.getByDisplayValue('gold');
    fireEvent.click(goldRadio);

    // Choice row should no longer be visible
    expect(screen.queryByRole('radiogroup', { name: 'Fila de elección 1' })).toBeNull();
  });

  it('switching to gold path shows the gold value field and roll button', () => {
    renderPicker();

    const goldRadio = screen.getByDisplayValue('gold');
    fireEvent.click(goldRadio);

    // Gold value input
    expect(screen.getByRole('spinbutton')).toBeTruthy(); // type="number"
    // Roll button
    expect(screen.getByRole('button', { name: /Tirar 5d4 × 10/i })).toBeTruthy();
  });

  it('does not show gold option when parsedClass.goldAlternative is null', () => {
    renderPicker({ parsedClass: PARSED_CLASS_NO_GOLD });
    expect(screen.queryByDisplayValue('gold')).toBeNull();
  });
});

// ─── C.8b — Roll button produces value in range ───────────────────────────────

describe('EquipmentPicker — roll button (REQ-SEQUIP-09)', () => {
  it('roll button sets goldValue field to a value in [50, 200] for "5d4 × 10"', () => {
    renderPicker();

    // Switch to gold path
    fireEvent.click(screen.getByDisplayValue('gold'));

    const input = screen.getByRole('spinbutton') as HTMLInputElement;

    // Click roll button several times — all results must be in [50, 200]
    const rollButton = screen.getByRole('button', { name: /Tirar/i });
    for (let i = 0; i < 10; i++) {
      fireEvent.click(rollButton);
      const val = parseInt(input.value, 10);
      expect(val).toBeGreaterThanOrEqual(50);
      expect(val).toBeLessThanOrEqual(200);
    }
  });
});

// ─── C.6 — Round-trip: selections re-hydrate on mount ────────────────────────

describe('EquipmentPicker — round-trip (REQ-SEQUIP-10)', () => {
  it('pre-selects "package" path when initialSelections.classPath=package', () => {
    const initialSelections: EquipmentSelections = {
      classPath: 'package',
      classRowChoices: { 0: 'a' },
      classCategoryPicks: {},
      backgroundRowChoices: {},
      backgroundCategoryPicks: {},
    };
    renderPicker({ initialSelections });

    const packageRadio = screen.getByDisplayValue('package') as HTMLInputElement;
    expect(packageRadio.checked).toBe(true);
  });

  it('pre-selects "gold" path when initialSelections.classPath=gold', () => {
    const initialSelections: EquipmentSelections = {
      classPath: 'gold',
      goldValue: 80,
      classRowChoices: {},
      classCategoryPicks: {},
      backgroundRowChoices: {},
      backgroundCategoryPicks: {},
    };
    renderPicker({ initialSelections });

    const goldRadio = screen.getByDisplayValue('gold') as HTMLInputElement;
    expect(goldRadio.checked).toBe(true);
  });

  it('pre-populates gold value field when initialSelections.goldValue is set', () => {
    const initialSelections: EquipmentSelections = {
      classPath: 'gold',
      goldValue: 80,
      classRowChoices: {},
      classCategoryPicks: {},
      backgroundRowChoices: {},
      backgroundCategoryPicks: {},
    };
    renderPicker({ initialSelections });

    const input = screen.getByRole('spinbutton') as HTMLInputElement;
    expect(input.value).toBe('80');
  });

  it('pre-selects row choice option when initialSelections.classRowChoices has row 0=a', () => {
    const initialSelections: EquipmentSelections = {
      classPath: 'package',
      classRowChoices: { 0: 'a' },
      classCategoryPicks: {},
      backgroundRowChoices: {},
      backgroundCategoryPicks: {},
    };
    renderPicker({ initialSelections });

    // Row 0, option-a radio should be checked
    const radioA = screen.getByDisplayValue('a') as HTMLInputElement;
    expect(radioA.checked).toBe(true);
  });

  it('pre-selects row choice option-b when initialSelections has row 0=b', () => {
    const initialSelections: EquipmentSelections = {
      classPath: 'package',
      classRowChoices: { 0: 'b' },
      classCategoryPicks: {},
      backgroundRowChoices: {},
      backgroundCategoryPicks: {},
    };
    renderPicker({ initialSelections });

    const radioB = screen.getByDisplayValue('b') as HTMLInputElement;
    expect(radioB.checked).toBe(true);
  });
});

// ─── C.8c — Category key format ───────────────────────────────────────────────

describe('EquipmentPicker — category pick key format (Batch B gotcha)', () => {
  it('category picker button appears when option-a (which has a categoryRef) is selected', () => {
    renderPicker({
      initialSelections: {
        classPath: 'package',
        classRowChoices: { 0: 'a' },
        classCategoryPicks: {},
        backgroundRowChoices: {},
        backgroundCategoryPicks: {},
      },
    });

    // Category picker trigger should be visible since option-a has a weaponMartial ref
    // and option-a is selected
    const pickerTrigger = screen.queryByRole('button', { name: /Elegir arma marcial/i });
    expect(pickerTrigger).toBeTruthy();
  });

  it('renders the category picker with testid "category-picker-row0-a-cat0" for first category ref in row 0 option-a', () => {
    renderPicker({
      initialSelections: {
        classPath: 'package',
        classRowChoices: { 0: 'a' },
        classCategoryPicks: {},
        backgroundRowChoices: {},
        backgroundCategoryPicks: {},
      },
    });

    // data-testid should be "category-picker-row0-a-cat0"
    const picker = document.querySelector('[data-testid="category-picker-row0-a-cat0"]');
    expect(picker).toBeTruthy();
  });
});

// ─── C.8d — Fixed items rendered read-only ────────────────────────────────────

describe('EquipmentPicker — fixed items (REQ-SEQUIP-09)', () => {
  it('renders fixed class items as read-only list (not interactive)', () => {
    renderPicker();

    // dungeoneers-pack should appear in the "Siempre recibís" section
    const fixedItem = screen.getByText('dungeoneers-pack');
    expect(fixedItem).toBeTruthy();
    // It should be an li, not a button
    expect(fixedItem.tagName.toLowerCase()).toBe('li');
  });

  it('renders background fixed items when parsedBackground has items', () => {
    renderPicker({ parsedBackground: PARSED_BACKGROUND_WITH_DATA });

    expect(screen.getByText('holy-symbol')).toBeTruthy();
  });

  it('renders background currency when parsedBackground.currency > 0', () => {
    renderPicker({ parsedBackground: PARSED_BACKGROUND_WITH_DATA });

    // "1500 pc" should appear
    expect(screen.getByText(/1500 pc/)).toBeTruthy();
  });

  it('renders background special items as read-only (Acolyte vestments pattern)', () => {
    renderPicker({ parsedBackground: PARSED_BACKGROUND_WITH_DATA });

    expect(screen.getByText('a prayer book')).toBeTruthy();
    expect(screen.getByText('5 sticks of incense')).toBeTruthy();
  });
});

// ─── Gold field validation ─────────────────────────────────────────────────────

describe('EquipmentPicker — gold field validation (REQ-SEQUIP-06)', () => {
  it('shows error when trying to continue on gold path with empty gold value', async () => {
    renderPicker();

    // Switch to gold path
    fireEvent.click(screen.getByDisplayValue('gold'));

    // Attempt to continue without entering gold
    const continueBtn = screen.getByRole('button', { name: /Siguiente/i });
    fireEvent.click(continueBtn);

    // Error should appear
    expect(screen.getByRole('alert')).toBeTruthy();
  });
});
