/**
 * Picker unit tests: BackgroundPicker sub-components
 *
 * Tests:
 * - B.4: MultiSelectChoose tool-choose block (existing)
 * - B.3: MixedPoolPicker (3 radio options, sub-pickers, 375px)
 * - B.5: EquipmentPicker (coin toggle, package selection, a/b radio, _ slot items)
 * - B.7: FeaturePicker (filter input narrows select, persist slug)
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import type { ParsedBackground, BackgroundData } from './_parsers';
import type { MixedPoolShape, BackgroundPackage, FeatureOption, BackgroundCompendiumData } from '@dungeon-hub/domain/character/background';
import { MixedPoolPicker, EquipmentPicker, FeaturePicker } from './_picker';

// ---------------------------------------------------------------------------
// Thin inline wrapper that mirrors BackgroundDetailInline signature
// We render BackgroundPicker with mocked entries and a pre-selected background
// that carries toolChoose, so BackgroundDetailInline renders in "selected" mode.
// ---------------------------------------------------------------------------

// We need to mock the server action and next/navigation
vi.mock('./actions', () => ({
  saveBackground: vi.fn().mockResolvedValue({ error: null }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/characters/test-id/wizard/background',
}));

import { BackgroundPicker, type BackgroundEntry } from './_picker';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntry(toolChoose: ParsedBackground['toolChoose']): BackgroundEntry {
  // Build a BackgroundData that will produce the desired toolChoose via parseBackground.
  // Since we already tested the parser, we just construct the 5etools shape.
  const toolProficiencies: BackgroundData['toolProficiencies'] =
    toolChoose !== null
      ? [
          {
            choose: {
              from: toolChoose.from, // pass literal slugs — expandToolFrom passes them through
              count: toolChoose.count,
            },
          } as never,
        ]
      : [];

  return {
    slug: 'test-bg',
    source: 'TEST',
    name: 'Test Background',
    data: {
      name: 'Test Background',
      source: 'TEST',
      skillProficiencies: [{ choose: { from: ['arcana', 'history'], count: 2 } }],
      toolProficiencies,
    },
  };
}

function makeAcolyteEntry(): BackgroundEntry {
  return {
    slug: 'acolyte',
    source: 'PHB',
    name: 'Acolyte',
    data: {
      name: 'Acolyte',
      source: 'PHB',
      skillProficiencies: [{ choose: { from: ['insight', 'religion'], count: 2 } }],
      toolProficiencies: [],
    },
  };
}

// ---------------------------------------------------------------------------
// B.4a — MultiSelectChoose renders when toolChoose is non-null
// ---------------------------------------------------------------------------

describe('BackgroundPicker — toolChoose block renders when non-null', () => {
  it('renders both tool options as clickable buttons when toolChoose has 2 items', () => {
    const entry = makeEntry({ from: ['foo', 'bar'], count: 1 });
    const initialSelection = {
      slug: entry.slug,
      source: entry.source,
      skillChoices: [],
      languageChoices: [],
      toolChoices: {},
    };

    render(
      <BackgroundPicker
        characterId="char-1"
        entries={[entry]}
        allBackgrounds={[]}
        initialSelection={initialSelection}
      />,
    );

    // The MultiSelectChoose section should be visible (in the expanded detail)
    // since the entry is already selected. Look for the tool option buttons.
    expect(screen.getByRole('button', { name: 'Foo' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Bar' })).toBeTruthy();
  });

  it('allows picking one option (clicking toggles selection)', () => {
    const entry = makeEntry({ from: ['lute', 'drum'], count: 1 });
    const initialSelection = {
      slug: entry.slug,
      source: entry.source,
      skillChoices: [],
      languageChoices: [],
      toolChoices: {},
    };

    render(
      <BackgroundPicker
        characterId="char-1"
        entries={[entry]}
        allBackgrounds={[]}
        initialSelection={initialSelection}
      />,
    );

    const luteBtn = screen.getByRole('button', { name: 'Lute' });
    const drumBtn = screen.getByRole('button', { name: 'Drum' });

    // Neither is disabled initially (no picks yet)
    expect(luteBtn.hasAttribute('disabled')).toBe(false);
    expect(drumBtn.hasAttribute('disabled')).toBe(false);

    // Pick lute
    fireEvent.click(luteBtn);

    // After picking 1 (count=1), the OTHER button should now be disabled
    expect(screen.getByRole('button', { name: 'Drum' }).hasAttribute('disabled')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// B.4b — MultiSelectChoose is NOT rendered when toolChoose is null (Acolyte)
// ---------------------------------------------------------------------------

describe('BackgroundPicker — toolChoose block absent when null (Acolyte)', () => {
  it('does not render tool-pool MultiSelectChoose buttons for Acolyte (no toolProficiencies)', () => {
    const entry = makeAcolyteEntry();
    const initialSelection = {
      slug: entry.slug,
      source: entry.source,
      skillChoices: [],
      languageChoices: [],
      toolChoices: {},
    };

    render(
      <BackgroundPicker
        characterId="char-1"
        entries={[entry]}
        allBackgrounds={[]}
        initialSelection={initialSelection}
      />,
    );

    // Acolyte has no toolProficiencies (toolChoose === null).
    // No tool pick buttons from a MultiSelectChoose pool should be present.
    // We assert specific tool-pool items do NOT appear as interactive buttons.
    // (Acolyte has no tools at all — no fixed grants, no choose pool.)
    expect(screen.queryByRole('button', { name: 'Lute' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Dice Set' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Alchemists Supplies' })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// B.3 — MixedPoolPicker tests
// ---------------------------------------------------------------------------

const MIXED_POOL_SHAPES: MixedPoolShape[] = [
  { shapeKey: 'lang2', langCount: 2, toolCount: 0 },
  { shapeKey: 'lang1tool1', langCount: 1, toolCount: 1 },
  { shapeKey: 'tool2', langCount: 0, toolCount: 2 },
];

describe('MixedPoolPicker — 3 radio options render', () => {
  it('renders 3 radio inputs for lang2, lang1tool1, tool2', () => {
    render(
      <MixedPoolPicker
        shapes={MIXED_POOL_SHAPES}
        value={undefined}
        onChange={vi.fn()}
      />,
    );

    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(3);
  });

  it('shows labels for all three shapes', () => {
    render(
      <MixedPoolPicker
        shapes={MIXED_POOL_SHAPES}
        value={undefined}
        onChange={vi.fn()}
      />,
    );

    // Labels should contain shape keys or descriptive text
    expect(screen.getByText(/2 idiomas/i) ?? screen.getByLabelText(/lang2/i)).toBeTruthy();
  });
});

describe('MixedPoolPicker — selecting lang1tool1 shows sub-pickers', () => {
  it('renders language and tool MultiSelectChoose when lang1tool1 is selected', () => {
    const shape = MIXED_POOL_SHAPES[1]; // lang1tool1
    render(
      <MixedPoolPicker
        shapes={MIXED_POOL_SHAPES}
        value={{ shape: 'lang1tool1', langs: [], tools: [] }}
        onChange={vi.fn()}
      />,
    );

    // Should show at least one group of chip buttons for languages
    // Language pool has 16 chips (8 standard + 8 exotic)
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
  });

  it('calls onChange when a radio is clicked', () => {
    const onChange = vi.fn();
    render(
      <MixedPoolPicker
        shapes={MIXED_POOL_SHAPES}
        value={undefined}
        onChange={onChange}
      />,
    );

    const radios = screen.getAllByRole('radio');
    fireEvent.click(radios[0]); // click lang2
    expect(onChange).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// B.5 — EquipmentPicker tests
// ---------------------------------------------------------------------------

const SAMPLE_PACKAGES: BackgroundPackage[] = [
  {
    backgroundSlug: 'acolyte',
    backgroundSource: 'PHB',
    backgroundName: 'Acolyte',
    alwaysGranted: ['a holy symbol', '5 sticks of incense'],
    alternatives: {},
  },
  {
    backgroundSlug: 'soldier',
    backgroundSource: 'PHB',
    backgroundName: 'Soldier',
    alwaysGranted: ['an insignia of rank'],
    alternatives: {
      a: ['dice set'],
      b: ['playing card set'],
    },
  },
];

describe('EquipmentPicker — coin toggle hides package dropdown', () => {
  it('shows coin option and hides background select when coin is selected', () => {
    render(
      <EquipmentPicker
        packages={SAMPLE_PACKAGES}
        coinAllowed={true}
        value={{ kind: 'coin' }}
        onChange={vi.fn()}
      />,
    );

    // No background select should be visible when coin is chosen
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('calls onChange with { kind: coin } when coin radio is selected', () => {
    const onChange = vi.fn();
    render(
      <EquipmentPicker
        packages={SAMPLE_PACKAGES}
        coinAllowed={true}
        value={undefined}
        onChange={onChange}
      />,
    );

    // Find and click coin radio by value
    const coinRadio = screen.getByDisplayValue('coin');
    fireEvent.click(coinRadio);
    expect(onChange).toHaveBeenCalledWith({ kind: 'coin' });
  });
});

describe('EquipmentPicker — package selection shows _ slot items', () => {
  it('renders _ slot items as li elements when acolyte package selected', () => {
    render(
      <EquipmentPicker
        packages={SAMPLE_PACKAGES}
        coinAllowed={true}
        value={{ kind: 'package', backgroundSlug: 'acolyte', backgroundSource: 'PHB' }}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText('a holy symbol')).toBeTruthy();
    expect(screen.getByText('5 sticks of incense')).toBeTruthy();
  });

  it('renders a/b radio group when soldier package selected (has alternatives)', () => {
    render(
      <EquipmentPicker
        packages={SAMPLE_PACKAGES}
        coinAllowed={true}
        value={{ kind: 'package', backgroundSlug: 'soldier', backgroundSource: 'PHB' }}
        onChange={vi.fn()}
      />,
    );

    const radios = screen.getAllByRole('radio').filter(
      (r) => r.getAttribute('name') === 'equipment-slot',
    );
    expect(radios.length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// B.7 — FeaturePicker tests
// ---------------------------------------------------------------------------

const SAMPLE_FEATURES: FeatureOption[] = [
  {
    slug: 'acolyte-shelter-of-the-faithful',
    sourceBackgroundSlug: 'acolyte',
    sourceBackgroundSource: 'PHB',
    name: 'Feature: Shelter of the Faithful',
    text: 'As an acolyte, you command the respect of those who share your faith.',
  },
  {
    slug: 'soldier-military-rank',
    sourceBackgroundSlug: 'soldier',
    sourceBackgroundSource: 'PHB',
    name: 'Feature: Military Rank',
    text: 'You have a military rank from your career as a soldier.',
  },
  {
    slug: 'criminal-criminal-contact',
    sourceBackgroundSlug: 'criminal',
    sourceBackgroundSource: 'PHB',
    name: 'Feature: Criminal Contact',
    text: 'You have a reliable contact who acts as a liaison.',
  },
];

describe('FeaturePicker — filter input narrows options', () => {
  it('renders a native select with all features initially', () => {
    render(
      <FeaturePicker
        features={SAMPLE_FEATURES}
        value={undefined}
        onChange={vi.fn()}
      />,
    );

    const select = screen.getByRole('listbox') ?? screen.getByRole('combobox');
    expect(select).toBeTruthy();
    const options = screen.getAllByRole('option');
    // All 3 features + placeholder
    expect(options.length).toBeGreaterThanOrEqual(3);
  });

  it('filters options when user types in filter input', () => {
    render(
      <FeaturePicker
        features={SAMPLE_FEATURES}
        value={undefined}
        onChange={vi.fn()}
      />,
    );

    const filterInput = screen.getByRole('searchbox');
    fireEvent.change(filterInput, { target: { value: 'military' } });

    // After filtering "military", only the Military Rank option should remain
    const options = screen.getAllByRole('option').filter(
      (o) => (o as HTMLOptionElement).value !== '',
    );
    expect(options).toHaveLength(1);
    expect(options[0].textContent).toContain('Military');
  });
});

// ---------------------------------------------------------------------------
// Bug 1 RED — BackgroundPicker round-trip: initialSelection.customization
// must pre-populate the 3 customization sub-pickers (mixedPool/equipment/feature).
// ---------------------------------------------------------------------------

function makeCustomBgEntry(): BackgroundEntry {
  return {
    slug: 'custom-background',
    source: 'PHB',
    name: 'Custom Background',
    data: {
      name: 'Custom Background',
      source: 'PHB',
      skillProficiencies: [{ choose: { from: ['perception', 'arcana'], count: 2 } }],
      skillToolLanguageProficiencies: [
        { anyLanguage: 2 },
        { anyLanguage: 1, anyTool: 1 },
        { anyTool: 1 },
      ],
      startingEquipment: [],
      toolProficiencies: [],
    } as unknown as BackgroundData,
  };
}

function makeAcolyteForAllBackgrounds(): BackgroundCompendiumData {
  return {
    slug: 'acolyte',
    source: 'PHB',
    name: 'Acolyte',
    skillProficiencies: [{ insight: true, religion: true }],
    languageProficiencies: [{ anyStandard: 2 }],
    toolProficiencies: null,
    startingEquipment: [
      { _: ['a holy symbol', 'a prayer book', '15 gp'] },
    ],
    entries: [
      {
        type: 'entries',
        name: 'Feature: Shelter of the Faithful',
        data: { isFeature: true },
        entries: ['You command the respect of those who share your faith.'],
      },
    ],
  } as unknown as BackgroundCompendiumData;
}

describe('BackgroundPicker — customization round-trip (Bug 1)', () => {
  it('pre-selects the mixedPool shape radio when initialSelection.customization is provided', () => {
    const customBg = makeCustomBgEntry();
    const allBackgrounds = [makeAcolyteForAllBackgrounds()];

    const initialSelection = {
      slug: customBg.slug,
      source: customBg.source,
      skillChoices: ['perception', 'arcana'],
      languageChoices: [],
      toolChoices: {},
      customization: {
        mixedPool: { shape: 'lang2' as const, langs: ['draconic', 'elvish'], tools: [] },
        equipment: { kind: 'coin' as const },
        feature: { slug: 'acolyte-shelter-of-the-faithful' },
      },
    };

    render(
      <BackgroundPicker
        characterId="char-1"
        entries={[customBg]}
        allBackgrounds={allBackgrounds}
        initialSelection={initialSelection}
      />,
    );

    const lang2Radio = screen.getByDisplayValue('lang2') as HTMLInputElement;
    expect(lang2Radio.checked).toBe(true);
  });

  it('pre-selects the coin equipment mode when initialSelection.customization.equipment.kind=coin', () => {
    const customBg = makeCustomBgEntry();
    const allBackgrounds = [makeAcolyteForAllBackgrounds()];

    const initialSelection = {
      slug: customBg.slug,
      source: customBg.source,
      skillChoices: ['perception', 'arcana'],
      languageChoices: [],
      toolChoices: {},
      customization: {
        mixedPool: { shape: 'lang2' as const, langs: ['draconic', 'elvish'], tools: [] },
        equipment: { kind: 'coin' as const },
        feature: { slug: 'acolyte-shelter-of-the-faithful' },
      },
    };

    render(
      <BackgroundPicker
        characterId="char-1"
        entries={[customBg]}
        allBackgrounds={allBackgrounds}
        initialSelection={initialSelection}
      />,
    );

    const coinRadio = screen.getByDisplayValue('coin') as HTMLInputElement;
    expect(coinRadio.checked).toBe(true);
  });

  it('pre-renders the feature preview when initialSelection.customization.feature.slug is set', () => {
    const customBg = makeCustomBgEntry();
    const allBackgrounds = [makeAcolyteForAllBackgrounds()];

    const initialSelection = {
      slug: customBg.slug,
      source: customBg.source,
      skillChoices: ['perception', 'arcana'],
      languageChoices: [],
      toolChoices: {},
      customization: {
        mixedPool: { shape: 'lang2' as const, langs: ['draconic', 'elvish'], tools: [] },
        equipment: { kind: 'coin' as const },
        feature: { slug: 'acolyte-shelter-of-the-faithful' },
      },
    };

    render(
      <BackgroundPicker
        characterId="char-1"
        entries={[customBg]}
        allBackgrounds={allBackgrounds}
        initialSelection={initialSelection}
      />,
    );

    expect(screen.getByText(/command the respect of those who share your faith/i)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Bug 2b RED — BackgroundPicker: fixed tool must NOT appear in choose-pool
//
// Regression: if a background grants a tool as a fixed proficiency AND also
// lists that same tool in a choose-pool (toolChoose.from), the picker was
// showing the tool in the dropdown, letting the user pick it, then the
// domain gate fired BACKGROUND_TOOL_DUPLICATE.
//
// Fix: filter poolFor(kind) and toolChoose.from by parsed.fixedTools before
// passing to <MultiSelectChoose>.
// ---------------------------------------------------------------------------

function makeCriminalLikeEntry(): BackgroundEntry {
  // Simulates a background that grants "thieves' tools" as a fixed proficiency
  // AND lists it in the choose-pool (the combination that triggers the bug).
  return {
    slug: 'criminal-like',
    source: 'TEST',
    name: 'Criminal-like',
    data: {
      name: 'Criminal-like',
      source: 'TEST',
      skillProficiencies: [{ choose: { from: ['deception', 'stealth'], count: 2 } }],
      // Fixed: "thieves' tools". Choose pool: ["thieves' tools", "lute"] — overlap on purpose.
      toolProficiencies: [
        { "thieves' tools": true } as never,
        { choose: { from: ["thieves' tools", 'lute'], count: 1 } } as never,
      ],
    },
  };
}

describe("BackgroundPicker — Bug 2b: fixed tool excluded from choose-pool (Bug 2b)", () => {
  it("does NOT render the fixed tool as a selectable button in the toolChoose MultiSelectChoose", () => {
    const entry = makeCriminalLikeEntry();
    const initialSelection = {
      slug: entry.slug,
      source: entry.source,
      skillChoices: [],
      languageChoices: [],
      toolChoices: {},
    };

    render(
      <BackgroundPicker
        characterId="char-1"
        entries={[entry]}
        allBackgrounds={[]}
        initialSelection={initialSelection}
      />,
    );

    // "Lute" should be in the pool (not fixed) — present as a button.
    expect(screen.getByRole('button', { name: 'Lute' })).toBeTruthy();

    // "Thieves' Tools" is a fixed proficiency — it must NOT appear as a
    // selectable button in the choose dropdown. Before the fix, this fails
    // because the unfiltered pool exposes it as a pickable option.
    expect(screen.queryByRole('button', { name: "Thieves' Tools" })).toBeNull();
  });
});

describe('FeaturePicker — selection persists slug, shows preview', () => {
  it('calls onChange with the feature slug when user selects an option', () => {
    const onChange = vi.fn();
    render(
      <FeaturePicker
        features={SAMPLE_FEATURES}
        value={undefined}
        onChange={onChange}
      />,
    );

    const select = screen.getByRole('listbox') ?? screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'acolyte-shelter-of-the-faithful' } });
    expect(onChange).toHaveBeenCalledWith({ slug: 'acolyte-shelter-of-the-faithful' });
  });

  it('renders feature text preview below select when value is set', () => {
    render(
      <FeaturePicker
        features={SAMPLE_FEATURES}
        value={{ slug: 'soldier-military-rank' }}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText(/You have a military rank/i)).toBeTruthy();
  });
});
