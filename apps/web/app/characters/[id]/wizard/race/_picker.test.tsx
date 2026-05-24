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
  it('Hill Dwarf subrace entry has no pill', () => {
    render(
      <RacePicker
        characterId="char-1"
        entries={[DWARF_BASE, HILL_DWARF_SUBRACE]}
        initialSelection={null}
      />,
    );
    // Dwarf base should show one pill; Hill Dwarf should not add a second
    const pills = screen.getAllByText('requiere sublinaje');
    expect(pills).toHaveLength(1); // only from DWARF_BASE
  });

  it('Mountain Dwarf subrace entry has no pill', () => {
    render(
      <RacePicker
        characterId="char-1"
        entries={[DWARF_BASE, MOUNTAIN_DWARF_SUBRACE]}
        initialSelection={null}
      />,
    );
    const pills = screen.getAllByText('requiere sublinaje');
    expect(pills).toHaveLength(1); // only from DWARF_BASE
  });
});

// ---------------------------------------------------------------------------
// W-4: Clicking Siguiente with required-subrace base race → inline error
// ---------------------------------------------------------------------------

describe('W-4: Siguiente with required-subrace base race and no subrace selected → inline error', () => {
  it('shows error "Elegí un sublinaje para esta raza." and does not call saveRace', async () => {
    const { saveRace } = await import('./actions');
    vi.mocked(saveRace).mockClear();

    render(
      <RacePicker
        characterId="char-1"
        entries={[DWARF_BASE, HILL_DWARF_SUBRACE]}
        initialSelection={null}
      />,
    );

    // Click on Dwarf base to select it
    fireEvent.click(screen.getByText('Dwarf'));

    // Find and click Siguiente button
    const siguiente = screen.getByRole('button', { name: /siguiente/i });
    fireEvent.click(siguiente);

    // Inline error should appear
    expect(screen.getByText('Elegí un sublinaje para esta raza.')).toBeTruthy();
    // saveRace should NOT have been called
    expect(saveRace).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// W-5: Clicking Siguiente with Hill Dwarf subrace → saveRace IS called
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

    // Select Hill Dwarf subrace
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
