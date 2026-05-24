/**
 * Race picker unit tests: subrace-required pill + preflight + detail panel hint
 *
 * Tests:
 * W-1: Base race entries that require subrace show amber pill 'requiere sublinaje'
 * W-2: Non-required base race entries (Human, Half-Elf, Dragonborn) do NOT show the pill
 * W-3: Subrace entries (Hill Dwarf, Mountain Dwarf) do NOT show the pill
 * W-4: Clicking Siguiente with a required-subrace base race selected → inline error
 * W-5: Clicking Siguiente with Hill Dwarf subrace selected + fixed ASIs → saveRace IS called
 * W-6: Detail panel for base Dwarf shows hint paragraph
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { RacePicker, type RaceEntry } from './_picker';

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
});

// ---------------------------------------------------------------------------
// W-2: Non-required base races do NOT show the pill
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

  it('Dragonborn base entry has no pill', () => {
    render(
      <RacePicker
        characterId="char-1"
        entries={[DRAGONBORN_BASE]}
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
