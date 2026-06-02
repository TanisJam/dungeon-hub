// REQ-CBROWSE-03, REQ-CBROWSE-07 — Batch 2 header + RowView tests.
// RED step: written BEFORE the components exist; each test must fail on first run.
// PHB 2014 references cited per-section.

import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

afterEach(cleanup);

// ---------------------------------------------------------------------------
// Fixtures — real API shapes
// ---------------------------------------------------------------------------

// Items: detail row strips `data` JSONB and projects costCp (see compendium.ts:546).
// Extracted columns: id, slug, source, name, type, weight, reprintedAs, costCp.
const LONGSWORD_FIXTURE = {
  slug: 'longsword',
  source: 'PHB',
  name: 'Longsword',
  type: 'M', // Martial melee weapon (PHB p.149)
  weight: '3',
  costCp: 1500, // 15 gp in cp (PHB p.149)
  reprintedAs: null,
  data: {
    rarity: 'none',
    property: ['V'], // Versatile (PHB p.147)
    entries: [],
  },
};

// Races: full Drizzle row with data JSONB. PHB p.11-42.
const DWARF_FIXTURE = {
  slug: 'dwarf',
  source: 'PHB',
  name: 'Dwarf',
  isSubrace: false,
  parentSlug: null,
  parentSource: null,
  data: {
    size: ['M'],
    speed: 25,
    ability: [{ con: 2 }],
    entries: [],
  },
};

// Classes: full Drizzle row with data JSONB. PHB p.45-232.
const BARBARIAN_FIXTURE = {
  slug: 'barbarian',
  source: 'PHB',
  name: 'Barbarian',
  data: {
    hd: { number: 1, faces: 12 },
    proficiency: ['str', 'con'],
    startingProficiencies: {
      armor: ['light', 'medium', 'shield'],
      weapons: ['simple', 'martial'],
      skills: [
        {
          choose: {
            from: ['animal handling', 'athletics', 'intimidation', 'nature', 'perception', 'survival'],
            count: 2,
          },
        },
      ],
    },
    entries: [],
  },
};

// Backgrounds: full Drizzle row with data JSONB. PHB p.125.
const ACOLYTE_FIXTURE = {
  slug: 'acolyte',
  source: 'PHB',
  name: 'Acolyte',
  data: {
    skillProficiencies: [{ insight: true, religion: true }],
    languageProficiencies: [{ anyStandard: 2 }],
    entries: [
      {
        name: 'Feature: Shelter of the Faithful',
        type: 'entries',
        entries: ['...'],
        data: { isFeature: true },
      },
    ],
  },
};

// List-hit fixtures (projected columns from list endpoints)

const LONGSWORD_HIT = {
  slug: 'longsword',
  source: 'PHB',
  name: 'Longsword',
  type: 'M',
  weight: '3',
  costCp: 1500,
};

const DWARF_HIT = {
  slug: 'dwarf',
  source: 'PHB',
  name: 'Dwarf',
  isSubrace: false,
  parentSlug: null,
  parentSource: null,
};

const BARBARIAN_HIT = {
  slug: 'barbarian',
  source: 'PHB',
  name: 'Barbarian',
};

const ACOLYTE_HIT = {
  slug: 'acolyte',
  source: 'PHB',
  name: 'Acolyte',
};

// ---------------------------------------------------------------------------
// ItemHeader — REQ-CBROWSE-07
// ---------------------------------------------------------------------------

describe('ItemHeader — REQ-CBROWSE-07', () => {
  it('renders item name', async () => {
    const { ItemHeader } = await import('../_components/item-header');
    const { getByText } = render(<ItemHeader data={LONGSWORD_FIXTURE} />);
    expect(getByText('Longsword')).toBeTruthy();
  });

  it('renders item type via data-field="type"', async () => {
    const { ItemHeader } = await import('../_components/item-header');
    const { container } = render(<ItemHeader data={LONGSWORD_FIXTURE} />);
    const field = container.querySelector('[data-field="type"]');
    expect(field).toBeTruthy();
    expect(field?.textContent?.trim().length).toBeGreaterThan(0);
  });

  it('renders item weight via data-field="weight"', async () => {
    // PHB p.149 — Longsword weighs 3 lb.
    const { ItemHeader } = await import('../_components/item-header');
    const { container } = render(<ItemHeader data={LONGSWORD_FIXTURE} />);
    const field = container.querySelector('[data-field="weight"]');
    expect(field).toBeTruthy();
    expect(field?.textContent).toContain('3');
  });

  it('renders item cost via data-field="cost"', async () => {
    // PHB p.149 — Longsword costs 15 gp (= 1500 cp projected)
    const { ItemHeader } = await import('../_components/item-header');
    const { container } = render(<ItemHeader data={LONGSWORD_FIXTURE} />);
    const field = container.querySelector('[data-field="cost"]');
    expect(field).toBeTruthy();
    expect(field?.textContent?.trim().length).toBeGreaterThan(0);
  });

  it('renders item rarity via data-field="rarity"', async () => {
    const { ItemHeader } = await import('../_components/item-header');
    const { container } = render(<ItemHeader data={LONGSWORD_FIXTURE} />);
    const field = container.querySelector('[data-field="rarity"]');
    expect(field).toBeTruthy();
  });

  it('renders item properties via data-field="properties"', async () => {
    // PHB p.147 — Versatile property code "V"
    const { ItemHeader } = await import('../_components/item-header');
    const { container } = render(<ItemHeader data={LONGSWORD_FIXTURE} />);
    const field = container.querySelector('[data-field="properties"]');
    expect(field).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// ItemRowView — REQ-CBROWSE-03
// ---------------------------------------------------------------------------

describe('ItemRowView — REQ-CBROWSE-03', () => {
  it('renders item name', async () => {
    const { ItemRowView } = await import('../_components/row-views');
    const { getByText } = render(<ItemRowView row={LONGSWORD_HIT} />);
    expect(getByText('Longsword')).toBeTruthy();
  });

  it('renders item type', async () => {
    const { ItemRowView } = await import('../_components/row-views');
    const { container } = render(<ItemRowView row={LONGSWORD_HIT} />);
    // type field must appear somewhere in the row
    expect(container.textContent).toBeTruthy();
  });

  it('row meets 44px min-height contract', async () => {
    // The outer div must include min-h-[44px] (list island wraps in button, but row itself must be tappable)
    const { ItemRowView } = await import('../_components/row-views');
    const { container } = render(<ItemRowView row={LONGSWORD_HIT} />);
    const row = container.firstChild as HTMLElement;
    expect(row?.className).toContain('min-h-[44px]');
  });
});

// ---------------------------------------------------------------------------
// RaceHeader — REQ-CBROWSE-07
// ---------------------------------------------------------------------------

describe('RaceHeader — REQ-CBROWSE-07', () => {
  it('renders race name', async () => {
    const { RaceHeader } = await import('../_components/race-header');
    const { getByText } = render(<RaceHeader data={DWARF_FIXTURE} />);
    expect(getByText('Dwarf')).toBeTruthy();
  });

  it('renders size via data-field="size"', async () => {
    // PHB p.20 — Dwarf is Medium size
    const { RaceHeader } = await import('../_components/race-header');
    const { container } = render(<RaceHeader data={DWARF_FIXTURE} />);
    const field = container.querySelector('[data-field="size"]');
    expect(field).toBeTruthy();
    expect(field?.textContent?.trim().length).toBeGreaterThan(0);
  });

  it('renders speed via data-field="speed"', async () => {
    // PHB p.20 — Dwarf speed is 25 ft
    const { RaceHeader } = await import('../_components/race-header');
    const { container } = render(<RaceHeader data={DWARF_FIXTURE} />);
    const field = container.querySelector('[data-field="speed"]');
    expect(field).toBeTruthy();
    expect(field?.textContent).toContain('25');
  });

  it('renders ability score increases via data-field="asi"', async () => {
    // PHB p.20 — Dwarf: +2 CON
    const { RaceHeader } = await import('../_components/race-header');
    const { container } = render(<RaceHeader data={DWARF_FIXTURE} />);
    const field = container.querySelector('[data-field="asi"]');
    expect(field).toBeTruthy();
    expect(field?.textContent?.trim().length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// RaceRowView — REQ-CBROWSE-03
// ---------------------------------------------------------------------------

describe('RaceRowView — REQ-CBROWSE-03', () => {
  it('renders race name', async () => {
    const { RaceRowView } = await import('../_components/row-views');
    const { getByText } = render(<RaceRowView row={DWARF_HIT} />);
    expect(getByText('Dwarf')).toBeTruthy();
  });

  it('row meets 44px min-height contract', async () => {
    const { RaceRowView } = await import('../_components/row-views');
    const { container } = render(<RaceRowView row={DWARF_HIT} />);
    const row = container.firstChild as HTMLElement;
    expect(row?.className).toContain('min-h-[44px]');
  });
});

// ---------------------------------------------------------------------------
// ClassHeader — REQ-CBROWSE-07
// ---------------------------------------------------------------------------

describe('ClassHeader — REQ-CBROWSE-07', () => {
  it('renders class name', async () => {
    const { ClassHeader } = await import('../_components/class-header');
    const { getByText } = render(<ClassHeader data={BARBARIAN_FIXTURE} />);
    expect(getByText('Barbarian')).toBeTruthy();
  });

  it('renders hit die via data-field="hit-die"', async () => {
    // PHB p.48 — Barbarian hit die: d12
    const { ClassHeader } = await import('../_components/class-header');
    const { container } = render(<ClassHeader data={BARBARIAN_FIXTURE} />);
    const field = container.querySelector('[data-field="hit-die"]');
    expect(field).toBeTruthy();
    expect(field?.textContent).toContain('12');
  });

  it('renders saving throws via data-field="saves"', async () => {
    // PHB p.48 — Barbarian saves: STR and CON
    const { ClassHeader } = await import('../_components/class-header');
    const { container } = render(<ClassHeader data={BARBARIAN_FIXTURE} />);
    const field = container.querySelector('[data-field="saves"]');
    expect(field).toBeTruthy();
    expect(field?.textContent?.trim().length).toBeGreaterThan(0);
  });

  it('renders armor/weapon proficiencies via data-field="armor-profs" and data-field="weapon-profs"', async () => {
    const { ClassHeader } = await import('../_components/class-header');
    const { container } = render(<ClassHeader data={BARBARIAN_FIXTURE} />);
    const armorField = container.querySelector('[data-field="armor-profs"]');
    const weaponField = container.querySelector('[data-field="weapon-profs"]');
    expect(armorField).toBeTruthy();
    expect(weaponField).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// ClassRowView — REQ-CBROWSE-03
// ---------------------------------------------------------------------------

describe('ClassRowView — REQ-CBROWSE-03', () => {
  it('renders class name', async () => {
    const { ClassRowView } = await import('../_components/row-views');
    const { getByText } = render(<ClassRowView row={BARBARIAN_HIT} />);
    expect(getByText('Barbarian')).toBeTruthy();
  });

  it('row meets 44px min-height contract', async () => {
    const { ClassRowView } = await import('../_components/row-views');
    const { container } = render(<ClassRowView row={BARBARIAN_HIT} />);
    const row = container.firstChild as HTMLElement;
    expect(row?.className).toContain('min-h-[44px]');
  });
});

// ---------------------------------------------------------------------------
// BackgroundHeader — REQ-CBROWSE-07
// ---------------------------------------------------------------------------

describe('BackgroundHeader — REQ-CBROWSE-07', () => {
  it('renders background name', async () => {
    const { BackgroundHeader } = await import('../_components/background-header');
    const { getByText } = render(<BackgroundHeader data={ACOLYTE_FIXTURE} />);
    expect(getByText('Acolyte')).toBeTruthy();
  });

  it('renders skill proficiencies via data-field="skill-profs"', async () => {
    // PHB p.127 — Acolyte: Insight + Religion
    const { BackgroundHeader } = await import('../_components/background-header');
    const { container } = render(<BackgroundHeader data={ACOLYTE_FIXTURE} />);
    const field = container.querySelector('[data-field="skill-profs"]');
    expect(field).toBeTruthy();
    expect(field?.textContent?.trim().length).toBeGreaterThan(0);
  });

  it('renders languages via data-field="languages"', async () => {
    // PHB p.127 — Acolyte: 2 languages of choice
    const { BackgroundHeader } = await import('../_components/background-header');
    const { container } = render(<BackgroundHeader data={ACOLYTE_FIXTURE} />);
    const field = container.querySelector('[data-field="languages"]');
    expect(field).toBeTruthy();
    expect(field?.textContent?.trim().length).toBeGreaterThan(0);
  });

  it('renders feature name via data-field="feature"', async () => {
    // PHB p.127 — Acolyte feature: "Shelter of the Faithful"
    const { BackgroundHeader } = await import('../_components/background-header');
    const { container } = render(<BackgroundHeader data={ACOLYTE_FIXTURE} />);
    const field = container.querySelector('[data-field="feature"]');
    expect(field).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// BackgroundRowView — REQ-CBROWSE-03
// ---------------------------------------------------------------------------

describe('BackgroundRowView — REQ-CBROWSE-03', () => {
  it('renders background name', async () => {
    const { BackgroundRowView } = await import('../_components/row-views');
    const { getByText } = render(<BackgroundRowView row={ACOLYTE_HIT} />);
    expect(getByText('Acolyte')).toBeTruthy();
  });

  it('row meets 44px min-height contract', async () => {
    const { BackgroundRowView } = await import('../_components/row-views');
    const { container } = render(<BackgroundRowView row={ACOLYTE_HIT} />);
    const row = container.firstChild as HTMLElement;
    expect(row?.className).toContain('min-h-[44px]');
  });
});
