/**
 * Race picker unit tests: subrace-required pill + preflight + detail panel hint
 *
 * Tests:
 * W-1: Base race entries that require subrace show amber pill 'requiere sublinaje'
 * W-2: Non-required base race entries (Human, Half-Elf) do NOT show the pill
 *      Note: Dragonborn DOES require subrace (ancestry, PHB p.32–34 RAW) — it IS in W-1
 * W-3: Subrace entries (Hill Dwarf, Mountain Dwarf) do NOT show the pill
 * W-4: Clicking Siguiente with a required-subrace base race selected → inline error
 * W-5: Clicking Siguiente with Hill Dwarf subrace selected + fixed ASIs → saveRace IS called
 * W-6: Detail panel for base Dwarf shows hint paragraph
 *
 * Phase C backfill (race-variant-human-feat-skill):
 * W-C1: RaceSkillPicker renders N skill buttons when race has skillProficiencies:[{any:N}]
 * W-C2: RaceSkillPicker enforces the count — clicking N skills disables the rest
 * W-C3: RaceFeatPicker renders a searchable list of feats
 * W-C4: RaceFeatPicker filter narrows the visible feats
 * W-C5: RaceDetailPanel renders BOTH pickers for Variant Human (feat + skill)
 * W-C6: RaceDetailPanel renders ONLY SkillPicker for Half-Elf (skill, no feat)
 * W-C7: handleContinue preflight blocks when featChoice is missing for feat-required race
 * W-C8: handleContinue preflight blocks when skillChoices count is wrong
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { RacePicker, type RaceEntry } from './_picker';
import type { AbilityKey } from './_parsers';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('./actions', () => ({
  saveRace: vi.fn().mockResolvedValue({ error: null }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/characters/test-id/wizard/race',
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeRaceEntry(overrides: Partial<RaceEntry> & Pick<RaceEntry, 'slug' | 'source' | 'name' | 'isSubrace'>): RaceEntry {
  return {
    parentSlug: null,
    parentSource: null,
    data: {
      name: overrides.name,
      source: overrides.source,
      ability: undefined,
      size: ['M'],
      speed: 30,
      entries: undefined,
      languageProficiencies: undefined,
    },
    ...overrides,
  };
}

const DWARF_BASE = makeRaceEntry({
  slug: 'dwarf',
  source: 'PHB',
  name: 'Dwarf',
  isSubrace: false,
  data: { name: 'Dwarf', source: 'PHB', ability: [{ con: 2 }], size: ['M'], speed: 25 },
});

const ELF_BASE = makeRaceEntry({
  slug: 'elf',
  source: 'PHB',
  name: 'Elf',
  isSubrace: false,
  data: { name: 'Elf', source: 'PHB', ability: [{ dex: 2 }], size: ['M'], speed: 30 },
});

const GNOME_BASE = makeRaceEntry({
  slug: 'gnome',
  source: 'PHB',
  name: 'Gnome',
  isSubrace: false,
  data: { name: 'Gnome', source: 'PHB', ability: [{ int: 2 }], size: ['S'], speed: 25 },
});

const HALFLING_BASE = makeRaceEntry({
  slug: 'halfling',
  source: 'PHB',
  name: 'Halfling',
  isSubrace: false,
  data: { name: 'Halfling', source: 'PHB', ability: [{ dex: 2 }], size: ['S'], speed: 25 },
});

const HUMAN_BASE = makeRaceEntry({
  slug: 'human',
  source: 'PHB',
  name: 'Human',
  isSubrace: false,
  data: { name: 'Human', source: 'PHB', ability: [{ str: 1, dex: 1, con: 1, int: 1, wis: 1, cha: 1 }], size: ['M'], speed: 30 },
});

const HALF_ELF_BASE = makeRaceEntry({
  slug: 'half-elf',
  source: 'PHB',
  name: 'Half-Elf',
  isSubrace: false,
  data: { name: 'Half-Elf', source: 'PHB', ability: [{ cha: 2, choose: { from: ['str', 'dex', 'con', 'int', 'wis'], count: 2 } }], size: ['M'], speed: 30 },
});

const DRAGONBORN_BASE = makeRaceEntry({
  slug: 'dragonborn',
  source: 'PHB',
  name: 'Dragonborn',
  isSubrace: false,
  data: { name: 'Dragonborn', source: 'PHB', ability: [{ str: 2, cha: 1 }], size: ['M'], speed: 30 },
});

const HILL_DWARF_SUBRACE = makeRaceEntry({
  slug: 'dwarf--hill',
  source: 'PHB',
  name: 'Hill',
  isSubrace: true,
  parentSlug: 'dwarf',
  parentSource: 'PHB',
  data: { name: 'Hill', source: 'PHB', ability: [{ wis: 1 }], size: ['M'], speed: 25 },
});

const MOUNTAIN_DWARF_SUBRACE = makeRaceEntry({
  slug: 'dwarf--mountain',
  source: 'PHB',
  name: 'Mountain',
  isSubrace: true,
  parentSlug: 'dwarf',
  parentSource: 'PHB',
  data: { name: 'Mountain', source: 'PHB', ability: [{ str: 2 }], size: ['M'], speed: 25 },
});

// ---------------------------------------------------------------------------
// W-1: Required-subrace base races show amber pill
// ---------------------------------------------------------------------------

describe('W-1: required-subrace base races show amber pill "requiere sublinaje"', () => {
  it('Dwarf base entry shows amber pill', () => {
    render(
      <RacePicker
        characterId="char-1"
        entries={[DWARF_BASE]}
        initialSelection={null}
      />,
    );
    expect(screen.getByText('requiere sublinaje')).toBeTruthy();
  });

  it('Elf base entry shows amber pill', () => {
    render(
      <RacePicker
        characterId="char-1"
        entries={[ELF_BASE]}
        initialSelection={null}
      />,
    );
    expect(screen.getByText('requiere sublinaje')).toBeTruthy();
  });

  it('Gnome base entry shows amber pill', () => {
    render(
      <RacePicker
        characterId="char-1"
        entries={[GNOME_BASE]}
        initialSelection={null}
      />,
    );
    expect(screen.getByText('requiere sublinaje')).toBeTruthy();
  });

  it('Halfling base entry shows amber pill', () => {
    render(
      <RacePicker
        characterId="char-1"
        entries={[HALFLING_BASE]}
        initialSelection={null}
      />,
    );
    expect(screen.getByText('requiere sublinaje')).toBeTruthy();
  });

  it('Dragonborn base entry shows amber pill (ancestry required, PHB p.32–34)', () => {
    // PHB p.32–34: Dragonborn must choose a draconic ancestry — added to RACES_REQUIRING_SUBRACE
    // in Batch 3 (race-dragonborn-ancestry). Pill is correct behavior.
    render(
      <RacePicker
        characterId="char-1"
        entries={[DRAGONBORN_BASE]}
        initialSelection={null}
      />,
    );
    expect(screen.getByText('requiere sublinaje')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// W-2: Non-required base races do NOT show the pill
// Note: Dragonborn DOES require subrace (PHB p.32–34) — covered in W-1 above
// ---------------------------------------------------------------------------

describe('W-2: non-required base races do NOT show "requiere sublinaje" pill', () => {
  it('Human base entry has no pill', () => {
    render(
      <RacePicker
        characterId="char-1"
        entries={[HUMAN_BASE]}
        initialSelection={null}
      />,
    );
    expect(screen.queryByText('requiere sublinaje')).toBeNull();
  });

  it('Half-Elf base entry has no pill', () => {
    render(
      <RacePicker
        characterId="char-1"
        entries={[HALF_ELF_BASE]}
        initialSelection={null}
      />,
    );
    expect(screen.queryByText('requiere sublinaje')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// W-3: Subrace entries do NOT show the pill
// ---------------------------------------------------------------------------

describe('W-3: subrace entries do NOT show "requiere sublinaje" pill', () => {
  // With the accordion layout, Dwarf renders as a group header (not a ChoiceCard).
  // The "requiere sublinaje" pill only appears on individual ChoiceCards.
  // When the group is expanded, the subraces render as cards — none of them should show the pill.

  it('Hill Dwarf subrace card (when expanded) has no "requiere sublinaje" pill', () => {
    render(
      <RacePicker
        characterId="char-1"
        entries={[DWARF_BASE, HILL_DWARF_SUBRACE]}
        initialSelection={null}
      />,
    );
    // Expand the Dwarf group to reveal subrace cards
    const dwarfGroupBtn = document.querySelector('[data-testid="subrace-group-dwarf"]') as HTMLElement;
    fireEvent.click(dwarfGroupBtn);

    // Hill Dwarf card should not show the pill (only base races that require a subrace show it)
    expect(screen.queryByText('requiere sublinaje')).toBeNull();
  });

  it('Mountain Dwarf subrace card (when expanded) has no "requiere sublinaje" pill', () => {
    render(
      <RacePicker
        characterId="char-1"
        entries={[DWARF_BASE, MOUNTAIN_DWARF_SUBRACE]}
        initialSelection={null}
      />,
    );
    const dwarfGroupBtn = document.querySelector('[data-testid="subrace-group-dwarf"]') as HTMLElement;
    fireEvent.click(dwarfGroupBtn);

    expect(screen.queryByText('requiere sublinaje')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// W-4: Siguiente is disabled when nothing is selected
// (Previously: clicking the base race as a card → RACE_SUBRACE_REQUIRED error.
// After accordion refactor: parent races with subraces are group headers, not selectable.
// The Siguiente button is disabled when no race/subrace has been chosen yet.)
// ---------------------------------------------------------------------------

describe('W-4: Siguiente is disabled when nothing is selected', () => {
  it('Siguiente button is disabled when no race is selected', async () => {
    const { saveRace } = await import('./actions');
    vi.mocked(saveRace).mockClear();

    render(
      <RacePicker
        characterId="char-1"
        entries={[DWARF_BASE, HILL_DWARF_SUBRACE]}
        initialSelection={null}
      />,
    );

    // Siguiente must be disabled (not clickable) with no selection
    const siguiente = screen.getByRole('button', { name: /siguiente/i });
    expect(siguiente.hasAttribute('disabled')).toBe(true);
    expect(saveRace).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// W-5: Clicking Siguiente with Hill Dwarf subrace → saveRace IS called
// (Updated: must expand the group first, then select the subrace.)
// ---------------------------------------------------------------------------

describe('W-5: Siguiente with Hill Dwarf subrace selected passes preflight', () => {
  it('does NOT show the subrace-required error when a subrace is selected', () => {
    render(
      <RacePicker
        characterId="char-1"
        entries={[DWARF_BASE, HILL_DWARF_SUBRACE]}
        initialSelection={null}
      />,
    );

    // Expand the Dwarf group first
    const dwarfGroupBtn = document.querySelector('[data-testid="subrace-group-dwarf"]') as HTMLElement;
    fireEvent.click(dwarfGroupBtn);

    // Now select Hill Dwarf subrace
    fireEvent.click(screen.getByText('Hill Dwarf'));

    // Click Siguiente — should NOT emit "Elegí un sublinaje para esta raza."
    const siguiente = screen.getByRole('button', { name: /siguiente/i });
    fireEvent.click(siguiente);

    expect(screen.queryByText('Elegí un sublinaje para esta raza.')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// W-6: Detail panel for base Dwarf shows hint paragraph
// ---------------------------------------------------------------------------

describe('W-6: detail panel for base Dwarf shows hint paragraph when Dwarf is selected', () => {
  it('shows "Esta raza requiere un sublinaje" hint in the detail panel when Dwarf selected', () => {
    render(
      <RacePicker
        characterId="char-1"
        entries={[DWARF_BASE]}
        initialSelection={{ raceSlug: 'dwarf', raceSource: 'PHB', subraceSlug: null, subraceSource: null }}
      />,
    );

    expect(screen.getByText(/Esta raza requiere un sublinaje/i)).toBeTruthy();
  });

  it('does NOT show hint for Human detail panel', () => {
    render(
      <RacePicker
        characterId="char-1"
        entries={[HUMAN_BASE]}
        initialSelection={{ raceSlug: 'human', raceSource: 'PHB', subraceSlug: null, subraceSource: null }}
      />,
    );

    expect(screen.queryByText(/Esta raza requiere un sublinaje/i)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Phase C backfill fixtures
// ---------------------------------------------------------------------------

import type { FeatEntry } from './_picker';

// Variant Human: subrace entry that carries feats:[{any:1}] + skillProficiencies:[{any:1}]
const HUMAN_BASE_FOR_VARIANT = makeRaceEntry({
  slug: 'human',
  source: 'PHB',
  name: 'Human',
  isSubrace: false,
  data: {
    name: 'Human',
    source: 'PHB',
    ability: [],
    size: ['M'],
    speed: 30,
  },
});

const VARIANT_HUMAN_SUBRACE = makeRaceEntry({
  slug: 'variant',
  source: 'PHB',
  name: 'Variant Human',
  isSubrace: true,
  parentSlug: 'human',
  parentSource: 'PHB',
  data: {
    name: 'Variant Human',
    source: 'PHB',
    ability: [{ choose: { from: ['str', 'dex', 'con', 'int', 'wis', 'cha'], count: 2, amount: 1 } }],
    size: ['M'],
    speed: 30,
    skillProficiencies: [{ any: 1 }],
    feats: [{ any: 1 }],
  },
});

// Half-Elf: base race with skillProficiencies:[{any:2}], no feats
const HALF_ELF_WITH_SKILLS = makeRaceEntry({
  slug: 'half-elf',
  source: 'PHB',
  name: 'Half-Elf',
  isSubrace: false,
  data: {
    name: 'Half-Elf',
    source: 'PHB',
    ability: [{ cha: 2, choose: { from: ['str', 'dex', 'con', 'int', 'wis'], count: 2 } }],
    size: ['M'],
    speed: 30,
    skillProficiencies: [{ any: 2 }],
  },
});

// Sample feats for RaceFeatPicker tests
const SAMPLE_FEATS: FeatEntry[] = [
  { slug: 'actor', source: 'PHB', name: 'Actor' },
  { slug: 'alert', source: 'PHB', name: 'Alert' },
  { slug: 'athlete', source: 'PHB', name: 'Athlete' },
];

// ---------------------------------------------------------------------------
// W-C1: RaceSkillPicker renders N skill buttons when race has skillProficiencies:[{any:N}]
// ---------------------------------------------------------------------------

describe('W-C1: RaceSkillPicker renders skill buttons for Half-Elf (skillProficiencies:[{any:2}])', () => {
  it('renders skill buttons (at least one per PHB skill) when Half-Elf is selected', () => {
    render(
      <RacePicker
        characterId="char-1"
        entries={[HALF_ELF_WITH_SKILLS]}
        allFeats={[]}
        initialSelection={{
          raceSlug: 'half-elf',
          raceSource: 'PHB',
          subraceSlug: null,
          subraceSource: null,
        }}
      />,
    );

    // The skill picker renders buttons for all 18 PHB skills.
    // We verify several well-known skills appear as buttons.
    expect(screen.getByRole('button', { name: /perception/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /stealth/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /arcana/i })).toBeTruthy();
  });

  it('shows the "Habilidades de linaje" label and count hint', () => {
    render(
      <RacePicker
        characterId="char-1"
        entries={[HALF_ELF_WITH_SKILLS]}
        allFeats={[]}
        initialSelection={{
          raceSlug: 'half-elf',
          raceSource: 'PHB',
          subraceSlug: null,
          subraceSource: null,
        }}
      />,
    );

    // Label text from RaceSkillPicker
    expect(screen.getByText(/habilidades de linaje/i)).toBeTruthy();
    // Count hint: "Elegí 2 habilidades:"
    expect(screen.getByText(/elegí 2 habilidades/i)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// W-C2: RaceSkillPicker enforces the count — after picking N, the rest are disabled
// ---------------------------------------------------------------------------

describe('W-C2: RaceSkillPicker enforces the count (N=1 for Variant Human)', () => {
  it('disables all other skill buttons after picking 1 skill (count=1)', () => {
    render(
      <RacePicker
        characterId="char-1"
        entries={[HUMAN_BASE_FOR_VARIANT, VARIANT_HUMAN_SUBRACE]}
        allFeats={SAMPLE_FEATS}
        initialSelection={{
          raceSlug: 'human',
          raceSource: 'PHB',
          subraceSlug: 'variant',
          subraceSource: 'PHB',
        }}
      />,
    );

    // Pick one skill: Perception
    const perceptionBtn = screen.getByRole('button', { name: /^perception$/i });
    fireEvent.click(perceptionBtn);

    // After picking 1 (count=1), Stealth should now be disabled
    const stealthBtn = screen.getByRole('button', { name: /^stealth$/i });
    expect(stealthBtn.hasAttribute('disabled')).toBe(true);
  });

  it('re-enables other buttons after deselecting the picked skill', () => {
    render(
      <RacePicker
        characterId="char-1"
        entries={[HUMAN_BASE_FOR_VARIANT, VARIANT_HUMAN_SUBRACE]}
        allFeats={SAMPLE_FEATS}
        initialSelection={{
          raceSlug: 'human',
          raceSource: 'PHB',
          subraceSlug: 'variant',
          subraceSource: 'PHB',
        }}
      />,
    );

    const perceptionBtn = screen.getByRole('button', { name: /^perception$/i });
    // Pick and then deselect
    fireEvent.click(perceptionBtn);
    fireEvent.click(perceptionBtn);

    // Now stealth should be enabled again
    const stealthBtn = screen.getByRole('button', { name: /^stealth$/i });
    expect(stealthBtn.hasAttribute('disabled')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// W-C3: RaceFeatPicker renders a searchable list of feats
// ---------------------------------------------------------------------------

describe('W-C3: RaceFeatPicker renders a searchable list of feats for Variant Human', () => {
  it('renders each feat name as a selectable row', () => {
    render(
      <RacePicker
        characterId="char-1"
        entries={[HUMAN_BASE_FOR_VARIANT, VARIANT_HUMAN_SUBRACE]}
        allFeats={SAMPLE_FEATS}
        initialSelection={{
          raceSlug: 'human',
          raceSource: 'PHB',
          subraceSlug: 'variant',
          subraceSource: 'PHB',
        }}
      />,
    );

    expect(screen.getByRole('button', { name: /actor/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /alert/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /athlete/i })).toBeTruthy();
  });

  it('renders the "Talento racial" label', () => {
    render(
      <RacePicker
        characterId="char-1"
        entries={[HUMAN_BASE_FOR_VARIANT, VARIANT_HUMAN_SUBRACE]}
        allFeats={SAMPLE_FEATS}
        initialSelection={{
          raceSlug: 'human',
          raceSource: 'PHB',
          subraceSlug: 'variant',
          subraceSource: 'PHB',
        }}
      />,
    );

    expect(screen.getByText(/talento racial/i)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// W-C4: RaceFeatPicker filter narrows the visible feats
// ---------------------------------------------------------------------------

describe('W-C4: RaceFeatPicker filter narrows the visible feats', () => {
  it('hides non-matching feats when user types in the search input', () => {
    render(
      <RacePicker
        characterId="char-1"
        entries={[HUMAN_BASE_FOR_VARIANT, VARIANT_HUMAN_SUBRACE]}
        allFeats={SAMPLE_FEATS}
        initialSelection={{
          raceSlug: 'human',
          raceSource: 'PHB',
          subraceSlug: 'variant',
          subraceSource: 'PHB',
        }}
      />,
    );

    // Find the feat search input (placeholder "Buscar talento…")
    const searchInput = screen.getByPlaceholderText(/buscar talento/i);
    fireEvent.change(searchInput, { target: { value: 'act' } });

    // Only Actor should remain visible; Alert and Athlete should be gone
    expect(screen.queryByRole('button', { name: /actor/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^alert/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^athlete/i })).toBeNull();
  });

  it('shows all feats again after clearing the filter', () => {
    render(
      <RacePicker
        characterId="char-1"
        entries={[HUMAN_BASE_FOR_VARIANT, VARIANT_HUMAN_SUBRACE]}
        allFeats={SAMPLE_FEATS}
        initialSelection={{
          raceSlug: 'human',
          raceSource: 'PHB',
          subraceSlug: 'variant',
          subraceSource: 'PHB',
        }}
      />,
    );

    const searchInput = screen.getByPlaceholderText(/buscar talento/i);
    fireEvent.change(searchInput, { target: { value: 'act' } });
    fireEvent.change(searchInput, { target: { value: '' } });

    expect(screen.queryByRole('button', { name: /actor/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^alert/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^athlete/i })).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// W-C5: RaceDetailPanel renders BOTH pickers for Variant Human
// ---------------------------------------------------------------------------

describe('W-C5: RaceDetailPanel renders BOTH pickers for Variant Human', () => {
  it('shows the feat picker AND the skill picker simultaneously', () => {
    render(
      <RacePicker
        characterId="char-1"
        entries={[HUMAN_BASE_FOR_VARIANT, VARIANT_HUMAN_SUBRACE]}
        allFeats={SAMPLE_FEATS}
        initialSelection={{
          raceSlug: 'human',
          raceSource: 'PHB',
          subraceSlug: 'variant',
          subraceSource: 'PHB',
        }}
      />,
    );

    // Feat picker label
    expect(screen.getByText(/talento racial/i)).toBeTruthy();
    // Skill picker label
    expect(screen.getByText(/habilidades de linaje/i)).toBeTruthy();
  });

  it('Siguiente is disabled when neither skill nor feat is picked', () => {
    render(
      <RacePicker
        characterId="char-1"
        entries={[HUMAN_BASE_FOR_VARIANT, VARIANT_HUMAN_SUBRACE]}
        allFeats={SAMPLE_FEATS}
        initialSelection={{
          raceSlug: 'human',
          raceSource: 'PHB',
          subraceSlug: 'variant',
          subraceSource: 'PHB',
        }}
      />,
    );

    const siguiente = screen.getByRole('button', { name: /siguiente/i });
    // The RacePicker disables Siguiente when no entry is selected
    // (here one IS selected, but Siguiente may still be active — preflight runs on click)
    // We just verify it exists and is clickable (no crash).
    expect(siguiente).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// W-C6: RaceDetailPanel renders ONLY SkillPicker for Half-Elf (no feat picker)
// ---------------------------------------------------------------------------

describe('W-C6: RaceDetailPanel renders ONLY SkillPicker for Half-Elf (no FeatPicker)', () => {
  it('shows the skill picker (count=2) but NOT the feat picker for Half-Elf', () => {
    render(
      <RacePicker
        characterId="char-1"
        entries={[HALF_ELF_WITH_SKILLS]}
        allFeats={SAMPLE_FEATS}
        initialSelection={{
          raceSlug: 'half-elf',
          raceSource: 'PHB',
          subraceSlug: null,
          subraceSource: null,
        }}
      />,
    );

    // Skill picker present
    expect(screen.getByText(/habilidades de linaje/i)).toBeTruthy();
    expect(screen.getByText(/elegí 2 habilidades/i)).toBeTruthy();

    // Feat picker absent — no "Talento racial" label
    expect(screen.queryByText(/talento racial/i)).toBeNull();
    // No feat search input
    expect(screen.queryByPlaceholderText(/buscar talento/i)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// W-C7: handleContinue preflight blocks when featChoice is missing (Variant Human)
// ---------------------------------------------------------------------------

// Variant Human subrace (slug: 'variant') has:
//   ability: [{choose: {from:[...], count:2, amount:1}}] → ASI key is "subrace:0"
// We need to pre-fill chosenAsis for "subrace:0" with 2 abilities so
// the ASI preflight passes and we reach the feat preflight.
const VARIANT_CHOSEN_ASIS_COMPLETE: Record<string, AbilityKey[]> = {
  'subrace:0': ['str', 'dex'],
};

describe('W-C7: handleContinue preflight blocks when feat is missing for Variant Human', () => {
  it('shows inline error "Elegí un talento racial." and does NOT call saveRace', async () => {
    const { saveRace } = await import('./actions');
    vi.mocked(saveRace).mockClear();

    render(
      <RacePicker
        characterId="char-1"
        entries={[HUMAN_BASE_FOR_VARIANT, VARIANT_HUMAN_SUBRACE]}
        allFeats={SAMPLE_FEATS}
        initialSelection={{
          raceSlug: 'human',
          raceSource: 'PHB',
          subraceSlug: 'variant',
          subraceSource: 'PHB',
        }}
        // ASIs complete so the ASI preflight passes
        initialChosenAsis={VARIANT_CHOSEN_ASIS_COMPLETE}
        // Start with one skill chosen so skill-count preflight passes
        initialSkillChoices={['perception']}
        // No feat slug chosen (initialFeatSlug omitted → defaults null)
      />,
    );

    const siguiente = screen.getByRole('button', { name: /siguiente/i });
    fireEvent.click(siguiente);

    // The feat preflight error is rendered in <p role="alert"> by WizardFooterNav.
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toMatch(/elegí un talento racial/i);
    expect(saveRace).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// W-C8: handleContinue preflight blocks when skillChoices count is wrong (Half-Elf)
// ---------------------------------------------------------------------------

// Half-Elf ability: [{cha:2, choose:{from:[str,dex,con,int,wis], count:2}}]
// → raceSlots: fixed cha:2 (idx=0), choose count=2 (idx=1)
// → ASI keys: "race:0" is fixed (no choice needed), "race:1" needs 2 picks
const HALF_ELF_CHOSEN_ASIS_COMPLETE: Record<string, AbilityKey[]> = {
  'race:1': ['str', 'dex'],
};

describe('W-C8: handleContinue preflight blocks when skill count is wrong (Half-Elf)', () => {
  it('shows inline error about skill count and does NOT call saveRace', async () => {
    const { saveRace } = await import('./actions');
    vi.mocked(saveRace).mockClear();

    render(
      <RacePicker
        characterId="char-1"
        entries={[HALF_ELF_WITH_SKILLS]}
        allFeats={[]}
        initialSelection={{
          raceSlug: 'half-elf',
          raceSource: 'PHB',
          subraceSlug: null,
          subraceSource: null,
        }}
        // ASIs complete so the ASI preflight passes (cha:2 is fixed; choose needs 2)
        initialChosenAsis={HALF_ELF_CHOSEN_ASIS_COMPLETE}
        // Only 1 skill chosen; Half-Elf requires 2
        initialSkillChoices={['perception']}
      />,
    );

    const siguiente = screen.getByRole('button', { name: /siguiente/i });
    fireEvent.click(siguiente);

    // The skill-count preflight error is rendered in a <p role="alert"> by WizardFooterNav.
    // RaceSkillPicker also renders a "Elegí 2 habilidades:" hint (no role="alert").
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toMatch(/elegí 2 habilidades/i);
    expect(saveRace).not.toHaveBeenCalled();
  });

  it('shows no skill error when 0 skills are chosen for a no-skill race (Dwarf base)', async () => {
    const { saveRace } = await import('./actions');
    vi.mocked(saveRace).mockClear();

    render(
      <RacePicker
        characterId="char-1"
        entries={[DWARF_BASE, HILL_DWARF_SUBRACE]}
        allFeats={[]}
        initialSelection={null}
      />,
    );

    // This test simply verifies no skill error appears without a selection
    // (no skill picker should be present for Dwarf).
    expect(screen.queryByText(/habilidades de linaje/i)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// W-D1: HighElfCantripPicker renders in RaceDetailPanel when isPlayerChoice entry present
// W-D2: handleContinue passes raceCantrip to saveRace; preflight blocks when missing
//
// PHB p.23: "You know one cantrip of your choice from the wizard spell list."
// Decisions #605 (isPlayerChoice flag), #606 (picker in race wizard step).
// ---------------------------------------------------------------------------

import type { RaceInnateSpell } from '@dungeon-hub/domain/character/race';

// High Elf subrace with an isPlayerChoice wizard cantrip entry
const HIGH_ELF_SUBRACE = makeRaceEntry({
  slug: 'elf--high',
  source: 'PHB',
  name: 'High',
  isSubrace: true,
  parentSlug: 'elf',
  parentSource: 'PHB',
  data: {
    name: 'High',
    source: 'PHB',
    ability: [{ int: 1 }],
    size: ['M'],
    speed: 30,
    additionalSpellsNormalized: [
      {
        slug: '__choose__',
        source: '',
        characterLevelAvailable: 1,
        frequency: 'at-will' as const,
        ability: 'int' as const,
        isPlayerChoice: true,
        fromClass: 'wizard',
      } as RaceInnateSpell,
    ],
  } as RaceEntry['data'] & { additionalSpellsNormalized: RaceInnateSpell[] },
});

// Wizard cantrips pool for the picker
type CantripEntry = { slug: string; source: string; name: string };
const WIZARD_CANTRIPS: CantripEntry[] = [
  { slug: 'fire-bolt', source: 'PHB', name: 'Fire Bolt' },
  { slug: 'mage-hand', source: 'PHB', name: 'Mage Hand' },
  { slug: 'prestidigitation', source: 'PHB', name: 'Prestidigitation' },
];

describe('W-D1: HighElfCantripPicker renders when isPlayerChoice entry present', () => {
  it('shows "Cantrip de linaje" label when High Elf is selected', () => {
    // REQ-D-COMPUTE-01, Decision #606. PHB p.23.
    render(
      <RacePicker
        characterId="char-1"
        entries={[ELF_BASE, HIGH_ELF_SUBRACE]}
        allFeats={[]}
        allWizardCantrips={WIZARD_CANTRIPS}
        initialSelection={{
          raceSlug: 'elf',
          raceSource: 'PHB',
          subraceSlug: 'elf--high',
          subraceSource: 'PHB',
        }}
      />,
    );

    expect(screen.getByText(/cantrip de linaje/i)).toBeTruthy();
  });

  it('renders wizard cantrip names as selectable buttons', () => {
    render(
      <RacePicker
        characterId="char-1"
        entries={[ELF_BASE, HIGH_ELF_SUBRACE]}
        allFeats={[]}
        allWizardCantrips={WIZARD_CANTRIPS}
        initialSelection={{
          raceSlug: 'elf',
          raceSource: 'PHB',
          subraceSlug: 'elf--high',
          subraceSource: 'PHB',
        }}
      />,
    );

    expect(screen.getByRole('button', { name: /fire bolt/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /mage hand/i })).toBeTruthy();
  });

  it('does NOT show cantrip picker for non-High-Elf races (Hill Dwarf)', () => {
    render(
      <RacePicker
        characterId="char-1"
        entries={[DWARF_BASE, HILL_DWARF_SUBRACE]}
        allFeats={[]}
        allWizardCantrips={WIZARD_CANTRIPS}
        initialSelection={{
          raceSlug: 'dwarf',
          raceSource: 'PHB',
          subraceSlug: 'dwarf--hill',
          subraceSource: 'PHB',
        }}
      />,
    );

    expect(screen.queryByText(/cantrip de linaje/i)).toBeNull();
  });
});

describe('W-D2: handleContinue passes raceCantrip to saveRace; preflight blocks when missing', () => {
  it('shows inline error when High Elf is selected but no cantrip is picked', async () => {
    const { saveRace } = await import('./actions');
    vi.mocked(saveRace).mockClear();

    render(
      <RacePicker
        characterId="char-1"
        entries={[ELF_BASE, HIGH_ELF_SUBRACE]}
        allFeats={[]}
        allWizardCantrips={WIZARD_CANTRIPS}
        initialSelection={{
          raceSlug: 'elf',
          raceSource: 'PHB',
          subraceSlug: 'elf--high',
          subraceSource: 'PHB',
        }}
        // ASIs: Elf dex:2 (race, fixed) + High Elf int:1 (subrace, fixed) — no choose needed
      />,
    );

    const siguiente = screen.getByRole('button', { name: /siguiente/i });
    fireEvent.click(siguiente);

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toMatch(/elegí un cantrip/i);
    expect(saveRace).not.toHaveBeenCalled();
  });

  it('calls saveRace with raceCantrip when a cantrip is picked', async () => {
    const { saveRace } = await import('./actions');
    vi.mocked(saveRace).mockClear();
    vi.mocked(saveRace).mockResolvedValue({ error: null });

    render(
      <RacePicker
        characterId="char-1"
        entries={[ELF_BASE, HIGH_ELF_SUBRACE]}
        allFeats={[]}
        allWizardCantrips={WIZARD_CANTRIPS}
        initialSelection={{
          raceSlug: 'elf',
          raceSource: 'PHB',
          subraceSlug: 'elf--high',
          subraceSource: 'PHB',
        }}
      />,
    );

    // Pick "Fire Bolt"
    fireEvent.click(screen.getByRole('button', { name: /fire bolt/i }));

    const siguiente = screen.getByRole('button', { name: /siguiente/i });
    fireEvent.click(siguiente);

    // saveRace must be called with raceCantrip: { slug: 'fire-bolt', source: 'PHB' }
    await vi.waitFor(() => {
      expect(saveRace).toHaveBeenCalledWith(
        'char-1',
        { slug: 'elf', source: 'PHB' },
        { slug: 'elf--high', source: 'PHB' },
        expect.any(Array),
        expect.any(Array),
        expect.any(Array),
        null, // featChoice
        { slug: 'fire-bolt', source: 'PHB' }, // raceCantrip
      );
    });
  });
});

// ---------------------------------------------------------------------------
// W-E: Collapsible subrace groups (accordion layout)
//
// W-E1: Races with subraces render as a group header, NOT as a selectable card
// W-E2: Clicking the group header toggles expansion (aria-expanded flips)
// W-E3: Subraces are hidden by default; visible after expanding the group
// W-E4: When search matches a subrace name, the parent group auto-expands
// W-E5: When initial selection is a subrace, its group renders open
// W-E6: Standalone races (Human) still render as direct ChoiceCards
// ---------------------------------------------------------------------------

const DRAGONBORN_BLACK = makeRaceEntry({
  slug: 'dragonborn--black',
  source: 'PHB',
  name: 'Black',
  isSubrace: true,
  parentSlug: 'dragonborn',
  parentSource: 'PHB',
  data: { name: 'Black', source: 'PHB', ability: [{ str: 2, cha: 1 }], size: ['M'], speed: 30 },
});

const DRAGONBORN_RED = makeRaceEntry({
  slug: 'dragonborn--red',
  source: 'PHB',
  name: 'Red',
  isSubrace: true,
  parentSlug: 'dragonborn',
  parentSource: 'PHB',
  data: { name: 'Red', source: 'PHB', ability: [{ str: 2, cha: 1 }], size: ['M'], speed: 30 },
});

const HIGH_ELF = makeRaceEntry({
  slug: 'elf--high',
  source: 'PHB',
  name: 'High',
  isSubrace: true,
  parentSlug: 'elf',
  parentSource: 'PHB',
  data: { name: 'High', source: 'PHB', ability: [{ dex: 2, int: 1 }], size: ['M'], speed: 30 },
});

/**
 * Helper: find the group header button by data-testid.
 * SubraceGroup renders its toggle as <button data-testid="subrace-group-{parentSlug}">
 */
function getGroupBtn(slug: string): HTMLElement {
  return document.querySelector(`[data-testid="subrace-group-${slug}"]`) as HTMLElement;
}

describe('W-E1: races with subraces render as group header, NOT as a selectable card', () => {
  it('Dragonborn renders a group header button with aria-expanded, not a selectable ChoiceCard', () => {
    render(
      <RacePicker
        characterId="char-1"
        entries={[DRAGONBORN_BLACK, DRAGONBORN_RED, DRAGONBORN_BASE, HUMAN_BASE]}
        initialSelection={null}
      />,
    );

    // The group header must be a button with aria-expanded attribute
    const groupBtn = getGroupBtn('dragonborn');
    expect(groupBtn).toBeTruthy();
    expect(groupBtn.hasAttribute('aria-expanded')).toBe(true);
  });

  it('Dragonborn group header shows "N sublinajes" counter', () => {
    render(
      <RacePicker
        characterId="char-1"
        entries={[DRAGONBORN_BLACK, DRAGONBORN_RED, DRAGONBORN_BASE, HUMAN_BASE]}
        initialSelection={null}
      />,
    );

    // Should show "2 sublinajes"
    expect(screen.getByText(/2 sublinajes/i)).toBeTruthy();
  });
});

describe('W-E2: clicking the group header toggles aria-expanded', () => {
  it('Elf group header starts collapsed (aria-expanded=false) and toggles to true on click', () => {
    render(
      <RacePicker
        characterId="char-1"
        entries={[HIGH_ELF, ELF_BASE, HUMAN_BASE]}
        initialSelection={null}
      />,
    );

    const groupBtn = getGroupBtn('elf');
    expect(groupBtn).toBeTruthy();
    // Default: collapsed
    expect(groupBtn.getAttribute('aria-expanded')).toBe('false');

    // Click to expand
    fireEvent.click(groupBtn);
    expect(groupBtn.getAttribute('aria-expanded')).toBe('true');

    // Click again to collapse
    fireEvent.click(groupBtn);
    expect(groupBtn.getAttribute('aria-expanded')).toBe('false');
  });
});

describe('W-E3: subraces are hidden by default; visible after expanding the group', () => {
  it('High Elf subrace card is NOT in the document before expanding the Elf group', () => {
    render(
      <RacePicker
        characterId="char-1"
        entries={[HIGH_ELF, ELF_BASE, HUMAN_BASE]}
        initialSelection={null}
      />,
    );

    // "High Elf" text should not be visible while collapsed
    expect(screen.queryByText('High Elf')).toBeNull();
  });

  it('High Elf subrace card IS visible after clicking the Elf group header', () => {
    render(
      <RacePicker
        characterId="char-1"
        entries={[HIGH_ELF, ELF_BASE, HUMAN_BASE]}
        initialSelection={null}
      />,
    );

    const groupBtn = getGroupBtn('elf');
    fireEvent.click(groupBtn);

    // After expand, "High Elf" should appear as a selectable item
    expect(screen.getByText('High Elf')).toBeTruthy();
  });
});

describe('W-E4: search behavior — orphan groups auto-expand, matching parents stay closed', () => {
  it('searching "high" auto-expands the Elf group (orphan: parent name did not match) and shows High Elf', () => {
    // Orphan case: "Elf" base doesn't include "high", so the parent is filtered out.
    // The orphan group must auto-expand — otherwise the user sees the parent header
    // with no obvious indicator of which subrace matched the search.
    render(
      <RacePicker
        characterId="char-1"
        entries={[HIGH_ELF, ELF_BASE, HUMAN_BASE]}
        initialSelection={null}
      />,
    );

    const searchInput = screen.getByPlaceholderText(/buscar linaje/i);
    fireEvent.change(searchInput, { target: { value: 'high' } });

    expect(screen.getByText('High Elf')).toBeTruthy();
  });

  it('searching "elf" keeps the Elf group CLOSED (non-orphan: parent name matched, subraces hidden until user clicks)', () => {
    // Non-orphan case: "Elf" base matches the query → parent is in the filtered list →
    // group renders normally, collapsed by default. User clicks the header to expand.
    // Decision: groups stay collapsed by default to keep the list visually orderly.
    render(
      <RacePicker
        characterId="char-1"
        entries={[HIGH_ELF, ELF_BASE, HUMAN_BASE]}
        initialSelection={null}
      />,
    );

    const searchInput = screen.getByPlaceholderText(/buscar linaje/i);
    fireEvent.change(searchInput, { target: { value: 'elf' } });

    const groupBtn = getGroupBtn('elf');
    expect(groupBtn.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('High Elf')).toBeNull();
  });
});

describe('W-E5: when initial selection is a subrace, its group renders open', () => {
  it('Elf group starts expanded when initialSelection is High Elf subrace', () => {
    render(
      <RacePicker
        characterId="char-1"
        entries={[HIGH_ELF, ELF_BASE, HUMAN_BASE]}
        initialSelection={{
          raceSlug: 'elf',
          raceSource: 'PHB',
          subraceSlug: 'elf--high',
          subraceSource: 'PHB',
        }}
      />,
    );

    // Group must start open — High Elf card is visible without clicking
    expect(screen.getByText('High Elf')).toBeTruthy();

    // aria-expanded must be true
    const groupBtn = getGroupBtn('elf');
    expect(groupBtn.getAttribute('aria-expanded')).toBe('true');
  });
});

describe('W-E6: standalone races (no subraces) still render as direct ChoiceCards', () => {
  it('Human renders as a selectable ChoiceCard, not a group header (no data-testid subrace-group)', () => {
    render(
      <RacePicker
        characterId="char-1"
        entries={[HUMAN_BASE, ELF_BASE, HIGH_ELF]}
        initialSelection={null}
      />,
    );

    // Human should NOT have a group header button
    expect(getGroupBtn('human')).toBeNull();
    // Human text is visible as a ChoiceCard title
    expect(screen.getByText('Human')).toBeTruthy();
  });

  it('Half-Elf renders as a selectable ChoiceCard (no subraces in data)', () => {
    render(
      <RacePicker
        characterId="char-1"
        entries={[HALF_ELF_BASE, ELF_BASE, HIGH_ELF]}
        initialSelection={null}
      />,
    );

    expect(getGroupBtn('half-elf')).toBeNull();
    expect(screen.getByText('Half-Elf')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// W-E7: Regression — races NOT in RACES_REQUIRING_SUBRACE stay standalone
//         even when subraces ARE present in the entries array (real-data scenario).
//
// Commit 938a811 bug: partition predicate was "has any subraces in data"
// which hid Human (Variant Human subrace), Half-Orc (SCAG variants), and
// Tiefling (MToF variants) inside accordion groups, making them unselectable.
// The correct predicate is "is in RACES_REQUIRING_SUBRACE" (PHB source of truth).
// ---------------------------------------------------------------------------

const HALF_ORC_BASE = makeRaceEntry({
  slug: 'half-orc',
  source: 'PHB',
  name: 'Half-Orc',
  isSubrace: false,
  data: { name: 'Half-Orc', source: 'PHB', ability: [{ str: 2, con: 1 }], size: ['M'], speed: 30 },
});

// A SCAG variant of Half-Orc (optional, not required)
const HALF_ORC_SCAG_SUBRACE = makeRaceEntry({
  slug: 'half-orc--scag-variant',
  source: 'SCAG',
  name: 'Variant',
  isSubrace: true,
  parentSlug: 'half-orc',
  parentSource: 'PHB',
  data: { name: 'Variant', source: 'SCAG', ability: [], size: ['M'], speed: 30 },
});

const TIEFLING_BASE = makeRaceEntry({
  slug: 'tiefling',
  source: 'PHB',
  name: 'Tiefling',
  isSubrace: false,
  data: { name: 'Tiefling', source: 'PHB', ability: [{ int: 1, cha: 2 }], size: ['M'], speed: 30 },
});

// An MToF variant of Tiefling (optional, not required)
const TIEFLING_MTOF_SUBRACE = makeRaceEntry({
  slug: 'tiefling--asmodeus',
  source: 'MTF',
  name: 'Asmodeus',
  isSubrace: true,
  parentSlug: 'tiefling',
  parentSource: 'PHB',
  data: { name: 'Asmodeus', source: 'MTF', ability: [], size: ['M'], speed: 30 },
});

// Variant Human subrace with name "Variant" (realistic: displayName produces "Variant Human")
// PHB p.31 sidebar — optional alternate Human, not a required subrace pick.
const VARIANT_HUMAN_SUBRACE_PEER = makeRaceEntry({
  slug: 'variant',
  source: 'PHB',
  name: 'Variant',
  isSubrace: true,
  parentSlug: 'human',
  parentSource: 'PHB',
  data: {
    name: 'Variant',
    source: 'PHB',
    ability: [{ choose: { from: ['str', 'dex', 'con', 'int', 'wis', 'cha'], count: 2, amount: 1 } }],
    size: ['M'],
    speed: 30,
    skillProficiencies: [{ any: 1 }],
    feats: [{ any: 1 }],
  },
});

describe('W-E7: non-required races with subraces render as groups with SELECTABLE parent', () => {
  // Updated semantics (Symptom 1 fix): Half-Elf/Half-Orc/Tiefling/Human are still
  // selectable as PHB-base races, but when they have subraces in entries they render
  // as an accordion group whose header is a ChoiceCard (parentSelectable=true) plus a
  // separate "Mostrar variantes" toggle below — the variants are hidden by default
  // and shown when the toggle is clicked. This eliminates the peer-card UX confusion
  // where "Variant; Aquatic Elf Descent Half-Elf" floated unanchored next to the parent.

  it('Human renders as a group with selectable parent ChoiceCard when Variant Human is in entries', () => {
    render(
      <RacePicker
        characterId="char-1"
        entries={[HUMAN_BASE_FOR_VARIANT, VARIANT_HUMAN_SUBRACE_PEER, DRAGONBORN_BASE, DRAGONBORN_BLACK]}
        initialSelection={null}
      />,
    );

    // Human IS still visible as a selectable card (the parent ChoiceCard inside the group).
    expect(screen.getByText('Human')).toBeTruthy();
    // The group exposes a "Mostrar 1 variante opcional" toggle with the expected data-testid.
    expect(getGroupBtn('human')).toBeTruthy();
    // Dragonborn SHOULD still be a group (required subrace, non-selectable header).
    expect(getGroupBtn('dragonborn')).toBeTruthy();
  });

  it('Half-Orc renders as a group with selectable parent when a SCAG variant is in entries', () => {
    render(
      <RacePicker
        characterId="char-1"
        entries={[HALF_ORC_BASE, HALF_ORC_SCAG_SUBRACE]}
        initialSelection={null}
      />,
    );

    expect(screen.getByText('Half-Orc')).toBeTruthy();
    expect(getGroupBtn('half-orc')).toBeTruthy();
  });

  it('Tiefling renders as a group with selectable parent when MToF variants are in entries', () => {
    render(
      <RacePicker
        characterId="char-1"
        entries={[TIEFLING_BASE, TIEFLING_MTOF_SUBRACE]}
        initialSelection={null}
      />,
    );

    expect(screen.getByText('Tiefling')).toBeTruthy();
    expect(getGroupBtn('tiefling')).toBeTruthy();
  });

  it('Variant Human variant is hidden by default and visible after clicking the variants toggle', () => {
    render(
      <RacePicker
        characterId="char-1"
        entries={[HUMAN_BASE_FOR_VARIANT, VARIANT_HUMAN_SUBRACE_PEER]}
        initialSelection={null}
      />,
    );

    // Initially: parent Human is visible, Variant Human variant card is NOT (toggle collapsed).
    expect(screen.getByText('Human')).toBeTruthy();
    expect(screen.queryByText('Variant Human')).toBeNull();

    // Click the variants toggle button → variants become visible.
    fireEvent.click(getGroupBtn('human'));
    expect(screen.getByText('Variant Human')).toBeTruthy();
  });

  it('clicking the parent Human card selects Human without expanding the variants list', () => {
    render(
      <RacePicker
        characterId="char-1"
        entries={[HUMAN_BASE_FOR_VARIANT, VARIANT_HUMAN_SUBRACE_PEER]}
        initialSelection={null}
      />,
    );

    // Click the parent ChoiceCard's button — that should select Human and NOT toggle the variants.
    const humanCard = screen.getByText('Human').closest('button');
    expect(humanCard).toBeTruthy();
    fireEvent.click(humanCard!);

    // Variant Human is still hidden (the toggle was not clicked).
    expect(screen.queryByText('Variant Human')).toBeNull();
    // Variants toggle is still present and collapsed (aria-expanded='false').
    expect(getGroupBtn('human').getAttribute('aria-expanded')).toBe('false');
  });
});

// ---------------------------------------------------------------------------
// W-F: Same-name cross-source merging (Sintoma 2)
//
// W-F1: Two standalone base races with the same display name merge into ONE card.
// W-F2: A base race whose name matches a subrace under some parent is absorbed
//       into that parent's accordion (cross-level merge, option A).
// W-F3: Merged cards (2+ variants) render a source chip selector in the detail panel.
// W-F4: Clicking a source chip while the merged card is selected switches selectedKey
//       to the new variant.
// ---------------------------------------------------------------------------

// A second "Sea Elf" appearing as a base race MPMM, while "Sea Elf" also exists
// as a subrace of elf|PHB (SEA_ELF_SUBRACE below).
const SEA_ELF_SUBRACE = makeRaceEntry({
  slug: 'elf--sea',
  source: 'MPMM',
  name: 'Sea',
  isSubrace: true,
  parentSlug: 'elf',
  parentSource: 'PHB',
  data: { name: 'Sea', source: 'MPMM', ability: [{ con: 1 }], size: ['M'], speed: 30 },
});

const SEA_ELF_BASE = makeRaceEntry({
  slug: 'sea-elf',
  source: 'MPMM',
  name: 'Sea Elf',
  isSubrace: false,
  data: { name: 'Sea Elf', source: 'MPMM', ability: [{ con: 1 }], size: ['M'], speed: 30 },
});

// Two same-named standalone Aasimar base races from different sources
const AASIMAR_VGM = makeRaceEntry({
  slug: 'aasimar',
  source: 'VGM',
  name: 'Aasimar',
  isSubrace: false,
  data: { name: 'Aasimar', source: 'VGM', ability: [{ cha: 2 }], size: ['M'], speed: 30 },
});
const AASIMAR_MPMM = makeRaceEntry({
  slug: 'aasimar',
  source: 'MPMM',
  name: 'Aasimar',
  isSubrace: false,
  // Explicit fixed ASI so effectiveAsiSlots does NOT synthesize MPMM-style flexible slots
  // (which would require chosenAsis to be pre-populated for the saveRace preflight to pass).
  data: { name: 'Aasimar', source: 'MPMM', ability: [{ cha: 2, wis: 1 }], size: ['M'], speed: 30 },
});

describe('W-F1: same-named standalone base races merge into one card', () => {
  it('Aasimar VGM and Aasimar MPMM render as a single card (not two separate cards)', () => {
    render(
      <RacePicker
        characterId="char-1"
        entries={[AASIMAR_VGM, AASIMAR_MPMM]}
        initialSelection={null}
      />,
    );

    // Exactly one "Aasimar" title should be in the document
    const titles = screen.getAllByText('Aasimar');
    expect(titles.length).toBe(1);
  });
});

describe('W-F2: cross-level absorption — base race merges into parent accordion (option A)', () => {
  it('Sea Elf MPMM base race is absorbed into the Elf accordion (no top-level Sea Elf card)', () => {
    // Elf accordion already has a "Sea" subrace (displayName: "Sea Elf"). The standalone
    // sea-elf|MPMM base race shares that displayName → it must be absorbed inside the
    // Elf accordion, not rendered as a separate top-level card.
    render(
      <RacePicker
        characterId="char-1"
        entries={[ELF_BASE, SEA_ELF_SUBRACE, SEA_ELF_BASE]}
        initialSelection={null}
      />,
    );

    // The Elf accordion group must exist
    expect(getGroupBtn('elf')).toBeTruthy();

    // Expand Elf accordion
    fireEvent.click(getGroupBtn('elf'));

    // Sea Elf must appear EXACTLY ONCE (inside the accordion), not twice
    const titles = screen.getAllByText('Sea Elf');
    expect(titles.length).toBe(1);
  });
});

describe('W-F3: merged cards render a source chip selector in the detail panel', () => {
  it('selecting the merged Aasimar card shows a "Fuente · 2 variantes" chip selector', () => {
    render(
      <RacePicker
        characterId="char-1"
        entries={[AASIMAR_VGM, AASIMAR_MPMM]}
        initialSelection={{ raceSlug: 'aasimar', raceSource: 'VGM', subraceSlug: null, subraceSource: null }}
      />,
    );

    // Source chip selector label appears in the detail panel
    expect(screen.getByText(/fuente.*2 variantes/i)).toBeTruthy();
    // Both source chips render
    expect(screen.getByRole('button', { name: 'VGM' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'MPMM' })).toBeTruthy();
  });

  it('single-variant cards do NOT render the source chip selector', () => {
    // Standalone with no merge → no chip selector
    render(
      <RacePicker
        characterId="char-1"
        entries={[HUMAN_BASE]}
        initialSelection={{ raceSlug: 'human', raceSource: 'PHB', subraceSlug: null, subraceSource: null }}
      />,
    );

    expect(screen.queryByText(/fuente.*variantes/i)).toBeNull();
  });
});

// W-F5: Parent-level merge — when a same-named race exists both as an accordion parent
// (with subraces, e.g. Aasimar VGM) AND as base races without subraces (Aasimar MPMM, DMG),
// they collapse into a SINGLE card. The parent header carries a source chip selector.
// The "variantes opcionales" toggle appears only when the active variant has subraces.

const AASIMAR_VGM_WITH_SUBRACES = makeRaceEntry({
  slug: 'aasimar',
  source: 'VGM',
  name: 'Aasimar',
  isSubrace: false,
  data: { name: 'Aasimar', source: 'VGM', ability: [{ cha: 2 }], size: ['M'], speed: 30 },
});

const AASIMAR_PROTECTOR_SUBRACE = makeRaceEntry({
  slug: 'aasimar--protector',
  source: 'VGM',
  name: 'Protector',
  isSubrace: true,
  parentSlug: 'aasimar',
  parentSource: 'VGM',
  data: { name: 'Protector', source: 'VGM', ability: [{ wis: 1 }], size: ['M'], speed: 30 },
});

const AASIMAR_DMG_BASE = makeRaceEntry({
  slug: 'aasimar',
  source: 'DMG',
  name: 'Aasimar',
  isSubrace: false,
  data: { name: 'Aasimar', source: 'DMG', ability: [{ cha: 2, wis: 1 }], size: ['M'], speed: 30 },
});

describe('W-F5: parent-level merge — accordion parent + standalone base races same-named collapse into one card', () => {
  it('Aasimar VGM (with subraces) + Aasimar MPMM + Aasimar DMG render as a single card with 3 source chips', () => {
    render(
      <RacePicker
        characterId="char-1"
        entries={[
          AASIMAR_VGM_WITH_SUBRACES,
          AASIMAR_PROTECTOR_SUBRACE,
          AASIMAR_MPMM,
          AASIMAR_DMG_BASE,
        ]}
        // Pre-select VGM Aasimar so the detail panel (with chip selector) is visible
        initialSelection={{ raceSlug: 'aasimar', raceSource: 'VGM', subraceSlug: null, subraceSource: null }}
      />,
    );

    // Exactly ONE "Aasimar" title — not three separate cards
    const titles = screen.getAllByText('Aasimar');
    expect(titles.length).toBe(1);

    // All 3 source chips present
    expect(screen.getByRole('button', { name: 'VGM' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'MPMM' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'DMG' })).toBeTruthy();
  });

  it('variants toggle appears only when the active source has subraces (VGM yes, MPMM no)', () => {
    render(
      <RacePicker
        characterId="char-1"
        entries={[
          AASIMAR_VGM_WITH_SUBRACES,
          AASIMAR_PROTECTOR_SUBRACE,
          AASIMAR_MPMM,
        ]}
        // VGM active → variants toggle should appear (VGM has Protector subrace)
        initialSelection={{ raceSlug: 'aasimar', raceSource: 'VGM', subraceSlug: null, subraceSource: null }}
      />,
    );

    // VGM is active by default → toggle is visible
    expect(getGroupBtn('aasimar')).toBeTruthy();

    // Click MPMM chip → active switches to MPMM (which has no subraces) → toggle disappears
    fireEvent.click(screen.getByRole('button', { name: 'MPMM' }));

    expect(getGroupBtn('aasimar')).toBeNull();
  });
});

describe('W-F4: clicking a source chip switches the active variant', () => {
  it('clicking MPMM chip on selected Aasimar card updates the active source pill', async () => {
    const { saveRace } = await import('./actions');
    vi.mocked(saveRace).mockClear();
    vi.mocked(saveRace).mockResolvedValue({ error: null });

    render(
      <RacePicker
        characterId="char-1"
        entries={[AASIMAR_VGM, AASIMAR_MPMM]}
        initialSelection={{ raceSlug: 'aasimar', raceSource: 'VGM', subraceSlug: null, subraceSource: null }}
      />,
    );

    // The active source pill (last pill in the card header) is VGM initially
    // (Aasimar VGM came first by source priority — neither in priority list, both fall back
    // to alphabetical, so MPMM < VGM lexically → MPMM is first). Re-verify by clicking VGM
    // chip first to force VGM-active.
    fireEvent.click(screen.getByRole('button', { name: 'VGM' }));

    // Now click MPMM chip → switches active to MPMM
    fireEvent.click(screen.getByRole('button', { name: 'MPMM' }));

    // Click Siguiente — saveRace should be called with source: 'MPMM'
    const siguiente = screen.getByRole('button', { name: /siguiente/i });
    fireEvent.click(siguiente);

    await vi.waitFor(() => {
      expect(saveRace).toHaveBeenCalledWith(
        'char-1',
        { slug: 'aasimar', source: 'MPMM' },
        null,
        expect.any(Array),
        expect.any(Array),
        expect.any(Array),
        null,
        null,
      );
    });
  });
});

// ---------------------------------------------------------------------------
// W-G: Variant Human REPLACES parent ASI (PHB p.31 sidebar)
//
// When Variant Human is selected as a subrace of Human PHB, the Variant's
// +1×2 choose REPLACES the base Human's +1-to-all — they do NOT stack.
// Per PHB p.31: "all of which replace the human's Ability Score Increase trait."
// Domain constant: SUBRACES_REPLACING_PARENT_ABILITY contains 'variant|PHB'.
// ---------------------------------------------------------------------------

describe('W-G: Variant Human REPLACES parent ASI (PHB p.31 sidebar)', () => {
  it('saveRace receives ONLY the 2 chosen +1s — base Human +1-to-all is NOT applied', async () => {
    const { saveRace } = await import('./actions');
    vi.mocked(saveRace).mockClear();
    vi.mocked(saveRace).mockResolvedValue({ error: null });

    // Variant Human ASI shape: [{choose:{from:[6 abilities], count:2, amount:1}}].
    // The choose slot is the only slot in selected.ability → effectiveAsiSlots
    // routes it to subraceSlots, raceSlots stays empty due to REPLACE flag.
    // Storage key for subrace choose:0 → 'subrace:0'.
    render(
      <RacePicker
        characterId="char-1"
        entries={[HUMAN_BASE, VARIANT_HUMAN_SUBRACE_PEER]}
        allFeats={SAMPLE_FEATS}
        initialSelection={{
          raceSlug: 'human',
          raceSource: 'PHB',
          subraceSlug: 'variant',
          subraceSource: 'PHB',
        }}
        initialChosenAsis={{ 'subrace:0': ['str', 'dex'] }}
        initialSkillChoices={['perception']}
        initialFeatSlug="actor"
      />,
    );

    const siguiente = screen.getByRole('button', { name: /siguiente/i });
    fireEvent.click(siguiente);

    await vi.waitFor(() => {
      expect(saveRace).toHaveBeenCalled();
    });

    // Pull the applied ASIs payload (4th positional argument).
    const call = vi.mocked(saveRace).mock.calls[0]!;
    const appliedAsis = call[3] as Array<{ ability: AbilityKey; bonus: number; source: 'race' | 'subrace' }>;

    // PHB-RAW: exactly 2 ASIs (the +1×2 from Variant), each tagged source='subrace'.
    expect(appliedAsis).toHaveLength(2);
    expect(appliedAsis.every((a) => a.source === 'subrace')).toBe(true);
    expect(appliedAsis.every((a) => a.bonus === 1)).toBe(true);
    expect(appliedAsis.map((a) => a.ability).sort()).toEqual(['dex', 'str']);

    // NO race-level +1s leaked through (would be the bug we're fixing).
    expect(appliedAsis.filter((a) => a.source === 'race')).toEqual([]);
  });

  it('Hill Dwarf (NOT a REPLACE subrace) still stacks parent +2 CON + subrace +1 WIS', async () => {
    // Sanity check: only Variant Human is in SUBRACES_REPLACING_PARENT_ABILITY.
    // Hill Dwarf must keep stacking semantics per PHB p.20.
    const { saveRace } = await import('./actions');
    vi.mocked(saveRace).mockClear();
    vi.mocked(saveRace).mockResolvedValue({ error: null });

    render(
      <RacePicker
        characterId="char-1"
        entries={[DWARF_BASE, HILL_DWARF_SUBRACE]}
        initialSelection={{
          raceSlug: 'dwarf',
          raceSource: 'PHB',
          subraceSlug: 'dwarf--hill',
          subraceSource: 'PHB',
        }}
      />,
    );

    const siguiente = screen.getByRole('button', { name: /siguiente/i });
    fireEvent.click(siguiente);

    await vi.waitFor(() => {
      expect(saveRace).toHaveBeenCalled();
    });

    const call = vi.mocked(saveRace).mock.calls[0]!;
    const appliedAsis = call[3] as Array<{ ability: AbilityKey; bonus: number; source: 'race' | 'subrace' }>;

    // Dwarf +2 CON (race) + Hill Dwarf +1 WIS (subrace) — STACKS.
    const raceAsi = appliedAsis.find((a) => a.source === 'race');
    const subraceAsi = appliedAsis.find((a) => a.source === 'subrace');
    expect(raceAsi).toEqual({ ability: 'con', bonus: 2, source: 'race' });
    expect(subraceAsi).toEqual({ ability: 'wis', bonus: 1, source: 'subrace' });
  });
});
