// REQ-CBROWSE-03, REQ-CBROWSE-07, REQ-CBROWSE-09 — Batch 3 monster statblock tests.
// RED step: written BEFORE the components exist; each test must fail on first run.
// PHB 2014 MM p.166 (Goblin) and MM p.98 (Adult Red Dragon) used as fixtures.

import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

afterEach(cleanup);

// ---------------------------------------------------------------------------
// Fixtures — real API shapes
// ---------------------------------------------------------------------------

// The full detail row shape: extracted columns + data JSONB (the raw 5etools object).
// data.data.* = raw 5etools JSON stored in the JSONB column.
// Goblin: MM p.166 — CR 1/4, Small humanoid, AC 15, HP 7 (2d6)
const GOBLIN_FIXTURE = {
  id: 'abc123',
  slug: 'goblin',
  source: 'MM',
  name: 'Goblin',
  cr: '1/4',
  crNumeric: '0.25',
  type: 'humanoid',
  size: 'S',
  data: {
    name: 'Goblin',
    source: 'MM',
    size: ['S'],
    type: { type: 'humanoid', tags: ['goblinoid'] },
    alignment: ['N', 'E'],
    // PHB MM p.166
    ac: [{ ac: 15, from: ['{@item leather armor|phb}', '{@item shield|phb}'] }],
    hp: { average: 7, formula: '2d6' },
    speed: { walk: 30 },
    str: 8,
    dex: 14,
    con: 10,
    int: 10,
    wis: 8,
    cha: 8,
    skill: { stealth: '+6' },
    senses: ['darkvision 60 ft.'],
    passive: 9,
    languages: ['Common', 'Goblin'],
    cr: '1/4',
    trait: [
      {
        name: 'Nimble Escape',
        entries: ['The goblin can take the Disengage or Hide action as a bonus action.'],
      },
    ],
    action: [
      {
        name: 'Scimitar',
        entries: ['+4 to hit, reach 5 ft., one target. 5 (1d6 + 2) slashing damage.'],
      },
      {
        name: 'Shortbow',
        entries: ['+4 to hit, range 80/320 ft., one target. 5 (1d6 + 2) piercing damage.'],
      },
    ],
  },
};

// Adult Red Dragon: MM p.98 — CR 17, Huge dragon, has save{} and skill{}, fly speed.
const RED_DRAGON_FIXTURE = {
  id: 'def456',
  slug: 'adult-red-dragon',
  source: 'MM',
  name: 'Adult Red Dragon',
  cr: '17',
  crNumeric: '17',
  type: 'dragon',
  size: 'H',
  data: {
    name: 'Adult Red Dragon',
    source: 'MM',
    size: ['H'],
    type: 'dragon',
    alignment: ['C', 'E'],
    ac: [{ ac: 19, from: ['natural armor'] }],
    hp: { average: 256, formula: '19d12 + 133' },
    speed: { walk: 40, climb: 40, fly: 80 },
    str: 27,
    dex: 10,
    con: 25,
    int: 16,
    wis: 13,
    cha: 21,
    save: { dex: '+6', con: '+13', wis: '+7', cha: '+11' },
    skill: { perception: '+13', stealth: '+6' },
    senses: ['blindsight 60 ft.', 'darkvision 120 ft.'],
    passive: 23,
    immune: ['fire'],
    languages: ['Common', 'Draconic'],
    cr: '17',
    trait: [],
    action: [
      { name: 'Multiattack', entries: ['The dragon can use its Frightful Presence. It then makes three attacks: one with its bite and two with its claws.'] },
    ],
    legendary: [
      { name: 'Detect', entries: ['The dragon makes a Wisdom (Perception) check.'] },
    ],
  },
};

// List-hit fixture for MonsterRowView
const GOBLIN_HIT = {
  slug: 'goblin',
  source: 'MM',
  name: 'Goblin',
  cr: '1/4',
  crNumeric: '0.25',
  type: 'humanoid',
  size: 'S',
};

const DRAGON_HIT = {
  slug: 'adult-red-dragon',
  source: 'MM',
  name: 'Adult Red Dragon',
  cr: '17',
  crNumeric: '17',
  type: 'dragon',
  size: 'H',
};

// ---------------------------------------------------------------------------
// MonsterStatblockHeader — REQ-CBROWSE-07
// ---------------------------------------------------------------------------

describe('MonsterStatblockHeader — REQ-CBROWSE-07', () => {
  it('renders monster name', async () => {
    const { MonsterStatblockHeader } = await import('../_components/monster-statblock-header');
    const { getByText } = render(<MonsterStatblockHeader data={GOBLIN_FIXTURE} />);
    expect(getByText('Goblin')).toBeTruthy();
  });

  it('renders AC via data-field="ac"', async () => {
    // MM p.166 — Goblin AC 15 (leather armor + shield)
    const { MonsterStatblockHeader } = await import('../_components/monster-statblock-header');
    const { container } = render(<MonsterStatblockHeader data={GOBLIN_FIXTURE} />);
    const field = container.querySelector('[data-field="ac"]');
    expect(field).toBeTruthy();
    expect(field?.textContent).toContain('15');
  });

  it('renders HP average and formula via data-field="hp"', async () => {
    // MM p.166 — Goblin HP 7 (2d6)
    const { MonsterStatblockHeader } = await import('../_components/monster-statblock-header');
    const { container } = render(<MonsterStatblockHeader data={GOBLIN_FIXTURE} />);
    const field = container.querySelector('[data-field="hp"]');
    expect(field).toBeTruthy();
    expect(field?.textContent).toContain('7');
    expect(field?.textContent).toContain('2d6');
  });

  it('renders speed via data-field="speed"', async () => {
    // MM p.166 — Goblin speed 30 ft.
    const { MonsterStatblockHeader } = await import('../_components/monster-statblock-header');
    const { container } = render(<MonsterStatblockHeader data={GOBLIN_FIXTURE} />);
    const field = container.querySelector('[data-field="speed"]');
    expect(field).toBeTruthy();
    expect(field?.textContent).toContain('30');
  });

  it('renders CR via data-field="cr"', async () => {
    // MM p.166 — Goblin CR 1/4
    const { MonsterStatblockHeader } = await import('../_components/monster-statblock-header');
    const { container } = render(<MonsterStatblockHeader data={GOBLIN_FIXTURE} />);
    const field = container.querySelector('[data-field="cr"]');
    expect(field).toBeTruthy();
    expect(field?.textContent).toContain('1/4');
  });

  it('renders type/size line via data-field="type-size"', async () => {
    // MM p.166 — Goblin: Small humanoid (goblinoid)
    const { MonsterStatblockHeader } = await import('../_components/monster-statblock-header');
    const { container } = render(<MonsterStatblockHeader data={GOBLIN_FIXTURE} />);
    const field = container.querySelector('[data-field="type-size"]');
    expect(field).toBeTruthy();
    expect(field?.textContent?.toLowerCase()).toContain('humanoid');
  });

  // PHB MM — 6 ability scores: each stat appears + computed modifier
  it('renders all 6 ability scores via data-field="ability-scores"', async () => {
    const { MonsterStatblockHeader } = await import('../_components/monster-statblock-header');
    const { container } = render(<MonsterStatblockHeader data={GOBLIN_FIXTURE} />);
    const grid = container.querySelector('[data-field="ability-scores"]');
    expect(grid).toBeTruthy();
    // Must contain all 6 abbreviations
    const text = grid?.textContent ?? '';
    expect(text).toContain('STR');
    expect(text).toContain('DEX');
    expect(text).toContain('CON');
    expect(text).toContain('INT');
    expect(text).toContain('WIS');
    expect(text).toContain('CHA');
  });

  it('computes ability score modifiers correctly', async () => {
    // MM p.166 — Goblin STR 8 → modifier −1; DEX 14 → +2
    // PHB p.173: modifier = floor((score - 10) / 2)
    const { MonsterStatblockHeader } = await import('../_components/monster-statblock-header');
    const { container } = render(<MonsterStatblockHeader data={GOBLIN_FIXTURE} />);
    const grid = container.querySelector('[data-field="ability-scores"]');
    const text = grid?.textContent ?? '';
    // STR 8 → −1 modifier
    expect(text).toContain('−1');
    // DEX 14 → +2 modifier
    expect(text).toContain('+2');
  });

  it('ability score grid has 6 score cells (grid-cols-3 layout for @375px)', async () => {
    // REQ-CBROWSE-09: @375px must not cause horizontal scroll
    const { MonsterStatblockHeader } = await import('../_components/monster-statblock-header');
    const { container } = render(<MonsterStatblockHeader data={GOBLIN_FIXTURE} />);
    const grid = container.querySelector('[data-field="ability-scores"]');
    // Should have exactly 6 child elements (one per stat)
    const cells = grid?.querySelectorAll('[data-field^="ability-"]');
    expect(cells?.length).toBe(6);
  });

  it('renders traits section with trait names', async () => {
    // MM p.166 — Goblin trait: Nimble Escape
    const { MonsterStatblockHeader } = await import('../_components/monster-statblock-header');
    const { container } = render(<MonsterStatblockHeader data={GOBLIN_FIXTURE} />);
    expect(container.textContent).toContain('Nimble Escape');
  });

  it('renders actions section with action names', async () => {
    // MM p.166 — Goblin actions: Scimitar, Shortbow
    const { MonsterStatblockHeader } = await import('../_components/monster-statblock-header');
    const { container } = render(<MonsterStatblockHeader data={GOBLIN_FIXTURE} />);
    expect(container.textContent).toContain('Scimitar');
    expect(container.textContent).toContain('Shortbow');
  });

  it('renders fly speed for dragon via data-field="speed"', async () => {
    // MM p.98 — Adult Red Dragon fly 80 ft.
    const { MonsterStatblockHeader } = await import('../_components/monster-statblock-header');
    const { container } = render(<MonsterStatblockHeader data={RED_DRAGON_FIXTURE} />);
    const field = container.querySelector('[data-field="speed"]');
    expect(field?.textContent).toContain('80');
  });

  it('renders saving throws when present via data-field="saves"', async () => {
    // MM p.98 — Adult Red Dragon has save: {dex, con, wis, cha}
    const { MonsterStatblockHeader } = await import('../_components/monster-statblock-header');
    const { container } = render(<MonsterStatblockHeader data={RED_DRAGON_FIXTURE} />);
    const field = container.querySelector('[data-field="saves"]');
    expect(field).toBeTruthy();
    expect(field?.textContent?.trim().length).toBeGreaterThan(0);
  });

  it('renders skills when present via data-field="skills"', async () => {
    // MM p.166 — Goblin has skill: stealth +6
    const { MonsterStatblockHeader } = await import('../_components/monster-statblock-header');
    const { container } = render(<MonsterStatblockHeader data={GOBLIN_FIXTURE} />);
    const field = container.querySelector('[data-field="skills"]');
    expect(field).toBeTruthy();
    expect(field?.textContent).toContain('+6');
  });

  it('renders senses + passive perception via data-field="senses"', async () => {
    // MM p.166 — Goblin: darkvision 60 ft., passive 9
    const { MonsterStatblockHeader } = await import('../_components/monster-statblock-header');
    const { container } = render(<MonsterStatblockHeader data={GOBLIN_FIXTURE} />);
    const field = container.querySelector('[data-field="senses"]');
    expect(field).toBeTruthy();
    expect(field?.textContent).toContain('darkvision');
  });

  it('renders languages via data-field="languages"', async () => {
    // MM p.166 — Goblin: Common, Goblin
    const { MonsterStatblockHeader } = await import('../_components/monster-statblock-header');
    const { container } = render(<MonsterStatblockHeader data={GOBLIN_FIXTURE} />);
    const field = container.querySelector('[data-field="languages"]');
    expect(field).toBeTruthy();
    expect(field?.textContent).toContain('Common');
  });

  it('renders legendary actions section when present', async () => {
    // MM p.98 — Adult Red Dragon has legendary actions
    const { MonsterStatblockHeader } = await import('../_components/monster-statblock-header');
    const { container } = render(<MonsterStatblockHeader data={RED_DRAGON_FIXTURE} />);
    expect(container.textContent).toContain('Detect');
  });

  it('does not render saves section when saves absent', async () => {
    // MM p.166 — Goblin has no saving throw proficiencies
    const { MonsterStatblockHeader } = await import('../_components/monster-statblock-header');
    const { container } = render(<MonsterStatblockHeader data={GOBLIN_FIXTURE} />);
    const field = container.querySelector('[data-field="saves"]');
    // Goblin has no saves, field should be absent or empty
    expect(!field || (field.textContent?.trim().length ?? 0) === 0).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// MonsterRowView — REQ-CBROWSE-03
// ---------------------------------------------------------------------------

describe('MonsterRowView — REQ-CBROWSE-03', () => {
  it('renders monster name', async () => {
    const { MonsterRowView } = await import('../_components/row-views');
    const { getByText } = render(<MonsterRowView row={GOBLIN_HIT} />);
    expect(getByText('Goblin')).toBeTruthy();
  });

  it('renders CR via data showing "1/4"', async () => {
    const { MonsterRowView } = await import('../_components/row-views');
    const { container } = render(<MonsterRowView row={GOBLIN_HIT} />);
    expect(container.textContent).toContain('1/4');
  });

  it('renders type', async () => {
    const { MonsterRowView } = await import('../_components/row-views');
    const { container } = render(<MonsterRowView row={GOBLIN_HIT} />);
    expect(container.textContent?.toLowerCase()).toContain('humanoid');
  });

  it('row meets 44px min-height contract', async () => {
    // REQ-CBROWSE-03: minimum 44px tap target
    const { MonsterRowView } = await import('../_components/row-views');
    const { container } = render(<MonsterRowView row={GOBLIN_HIT} />);
    const row = container.firstChild as HTMLElement;
    expect(row?.className).toContain('min-h-[44px]');
  });

  it('renders dragon name + CR 17', async () => {
    const { MonsterRowView } = await import('../_components/row-views');
    const { container } = render(<MonsterRowView row={DRAGON_HIT} />);
    expect(container.textContent).toContain('Adult Red Dragon');
    expect(container.textContent).toContain('17');
  });
});
