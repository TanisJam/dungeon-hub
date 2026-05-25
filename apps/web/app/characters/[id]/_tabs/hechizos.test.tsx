/**
 * Component tests for HechizosTab — spell list rendering (SP-04).
 *
 * REQ-SP04-09: R/C/M badges per spell row — shared SpellBadges component
 * REQ-SP04-10: Per-class section layout — Trucos / Preparados / Conocidos labels
 * REQ-SP04-11: Empty state — "Sin hechizos seleccionados"
 * REQ-SP04-12: Multiclass — separate sections, no merging
 * REQ-SP04-13: Mobile-first (375px) — structural validation via test
 *
 * PHB ch.10 p.201 — Casting Spells
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { CharacterSheet, SpellSheetRef, ClassSpellSummary } from '@/lib/sheet-types';
import { HechizosTab } from './hechizos';

// SP-05: mock server actions so this test file doesn't need Supabase env.
vi.mock('../actions', () => ({
  useSpellSlot: vi.fn().mockResolvedValue({ ok: true }),
  shortRest: vi.fn().mockResolvedValue({ ok: true }),
  deleteCharacter: vi.fn().mockResolvedValue({ ok: true }),
}));

// ── Test helpers ──────────────────────────────────────────────────────────

function makeSpellRef(
  slug: string,
  level: number,
  overrides: Partial<SpellSheetRef> = {},
): SpellSheetRef {
  return {
    slug,
    source: 'PHB',
    name: slug.charAt(0).toUpperCase() + slug.slice(1).replace(/-/g, ' '),
    level,
    ritual: false,
    concentration: false,
    componentsM: false,
    componentsMCost: null,
    ...overrides,
  };
}

function makeSheet(spellsByClass: ClassSpellSummary[]): CharacterSheet {
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
      dex: { score: 10, modifier: 0 },
      con: { score: 10, modifier: 0 },
      int: { score: 10, modifier: 0 },
      wis: { score: 10, modifier: 0 },
      cha: { score: 10, modifier: 0 },
    },
    savingThrows: [],
    skills: [],
    passivePerception: 10,
    initiative: 0,
    armorClass: { value: 10, formula: '10' },
    hitPoints: { max: 8, formula: '8' },
    hitDice: {},
    speed: { walk: 30 },
    size: 'M',
    carryingCapacity: 150,
    proficiencies: { armor: [], weapons: [], tools: [], languages: [] },
    feats: [],
    racialSpells: [],
    racialTraits: [],
    spellcasting: [
      {
        classSlug: spellsByClass[0]?.classSlug ?? 'cleric',
        classSource: 'PHB',
        ability: 'wis',
        saveDC: 13,
        attackBonus: 5,
      },
    ],
    spellSlots: {
      slots: [2, 0, 0, 0, 0, 0, 0, 0, 0],
      pactMagic: null,
      slotsUsed: [0, 0, 0, 0, 0, 0, 0, 0, 0],
      pactSlotsUsed: 0,
    },
    spellsByClass,
  };
}

function makeClericSummary(overrides: Partial<ClassSpellSummary> = {}): ClassSpellSummary {
  return {
    classSlug: 'cleric',
    classSource: 'PHB',
    cantripsKnown: { count: 0, max: 3 },
    spellsKnown: null,
    spellsPrepared: { count: 0, max: 4 },
    spells: { cantrips: [], leveled: [] },
    ...overrides,
  };
}

function makeSorcererSummary(overrides: Partial<ClassSpellSummary> = {}): ClassSpellSummary {
  return {
    classSlug: 'sorcerer',
    classSource: 'PHB',
    cantripsKnown: { count: 0, max: 4 },
    spellsKnown: { count: 0, max: 2 },
    spellsPrepared: null,
    spells: { cantrips: [], leveled: [] },
    ...overrides,
  };
}

// ── C3-7.1: Cleric with 2 cantrips + 3 prepared ───────────────────────────

describe('REQ-SP04-10: per-class section — Cleric shows Trucos + Preparados', () => {
  it('renders spell names under Trucos and Preparados groups', () => {
const sacredFlame = makeSpellRef('sacred-flame', 0);
    const guidance = makeSpellRef('guidance', 0, { concentration: true });
    const bless = makeSpellRef('bless', 1);
    const cureMission = makeSpellRef('cure-wounds', 1);
    const spiritualWeapon = makeSpellRef('spiritual-weapon', 2);

    const sheet = makeSheet([
      makeClericSummary({
        cantripsKnown: { count: 2, max: 3 },
        spellsPrepared: { count: 3, max: 4 },
        spells: {
          cantrips: [sacredFlame, guidance],
          leveled: [bless, cureMission, spiritualWeapon],
        },
      }),
    ]);

    render(<HechizosTab sheet={sheet} charId="test-char-id" />);

    // REQ-SP04-10: "Trucos" group visible
    expect(screen.getByText('Trucos')).toBeTruthy();
    // REQ-SP04-10: "Preparados" label for prepared caster (spellsPrepared !== null)
    expect(screen.getByText('Preparados')).toBeTruthy();
    // Spell names present
    expect(screen.getByText(/Sacred flame/i)).toBeTruthy();
    expect(screen.getByText(/Guidance/i)).toBeTruthy();
    expect(screen.getByText(/Bless/i)).toBeTruthy();
    expect(screen.getByText(/Cure wounds/i)).toBeTruthy();
    expect(screen.getByText(/Spiritual weapon/i)).toBeTruthy();
  });
});

// ── C3-7.2: Empty caster → "Sin hechizos seleccionados" ───────────────────

describe('REQ-SP04-11: empty caster → placeholder shown', () => {
  it('renders "Sin hechizos seleccionados" when both arrays empty', () => {
const sheet = makeSheet([
      makeClericSummary({
        spells: { cantrips: [], leveled: [] },
      }),
    ]);

    render(<HechizosTab sheet={sheet} charId="test-char-id" />);
    expect(screen.getByText('Sin hechizos seleccionados')).toBeTruthy();
  });
});

// ── C3-7.3: Bard shows "Conocidos" label ──────────────────────────────────

describe('REQ-SP04-10: known caster (Bard) shows "Conocidos" label', () => {
  it('bard section has "Conocidos" not "Preparados"', () => {
const sheet: CharacterSheet = {
      ...makeSheet([]),
      spellcasting: [{ classSlug: 'bard', classSource: 'PHB', ability: 'cha', saveDC: 13, attackBonus: 5 }],
      spellsByClass: [
        {
          classSlug: 'bard',
          classSource: 'PHB',
          cantripsKnown: { count: 2, max: 2 },
          spellsKnown: { count: 2, max: 4 },
          spellsPrepared: null,
          spells: {
            cantrips: [makeSpellRef('vicious-mockery', 0)],
            leveled: [
              makeSpellRef('healing-word', 1),
              makeSpellRef('dissonant-whispers', 1),
              makeSpellRef('mirror-image', 2),
              makeSpellRef('heat-metal', 2),
            ],
          },
        },
      ],
    };

    render(<HechizosTab sheet={sheet} charId="test-char-id" />);
    expect(screen.getByText('Conocidos')).toBeTruthy();
    expect(screen.queryByText('Preparados')).toBeNull();
  });
});

// ── C3-7.4: Cleric 1 / Wizard 1 multiclass ────────────────────────────────

describe('REQ-SP04-12: multiclass — two independent sections', () => {
  it('Cleric+Wizard renders two sections with no spell bleed', () => {
const clericSpell = makeSpellRef('bless', 1);
    const wizardSpell = makeSpellRef('magic-missile', 1);

    const sheet: CharacterSheet = {
      ...makeSheet([]),
      spellcasting: [
        { classSlug: 'cleric', classSource: 'PHB', ability: 'wis', saveDC: 12, attackBonus: 4 },
        { classSlug: 'wizard', classSource: 'PHB', ability: 'int', saveDC: 13, attackBonus: 5 },
      ],
      spellsByClass: [
        makeClericSummary({
          spellsPrepared: { count: 1, max: 4 },
          spells: { cantrips: [], leveled: [clericSpell] },
        }),
        {
          classSlug: 'wizard',
          classSource: 'PHB',
          cantripsKnown: { count: 0, max: 3 },
          spellsKnown: null,
          spellsPrepared: { count: 1, max: 4 },
          spells: { cantrips: [], leveled: [wizardSpell] },
        },
      ],
    };

    render(<HechizosTab sheet={sheet} charId="test-char-id" />);

    // Should find BOTH spell names, not blended
    expect(screen.getByText(/Bless/i)).toBeTruthy();
    expect(screen.getByText(/Magic missile/i)).toBeTruthy();

    // Two "Preparados" groups (one per class)
    const preparadosLabels = screen.getAllByText('Preparados');
    expect(preparadosLabels).toHaveLength(2);
  });
});

// ── C3-7.5: All badge flags true → R, C, M chips all rendered ─────────────

describe('REQ-SP04-09: R/C/M badges — all three rendered when all flags true', () => {
  it('spell row with ritual=true, concentration=true, componentsM=true shows R, C, M chips', () => {
const allFlagsSpell = makeSpellRef('plane-shift', 7, {
      name: 'Plane Shift',
      ritual: true,
      concentration: true,
      componentsM: true,
      componentsMCost: 250,
    });

    const sheet = makeSheet([
      makeClericSummary({
        spellsPrepared: { count: 1, max: 4 },
        spells: { cantrips: [], leveled: [allFlagsSpell] },
      }),
    ]);

    render(<HechizosTab sheet={sheet} charId="test-char-id" />);
    expect(screen.getByTitle('Ritual')).toBeTruthy();
    expect(screen.getByTitle('Concentración')).toBeTruthy();
    expect(screen.getByTitle('Componente material')).toBeTruthy();
  });
});

// ── C3-7.6: No badge flags → no R/C/M chips ───────────────────────────────

describe('REQ-SP04-09: R/C/M badges — none rendered when all flags false', () => {
  it('plain spell with no flags shows no R/C/M chips', () => {
const plainSpell = makeSpellRef('magic-missile', 1, {
      ritual: false,
      concentration: false,
      componentsM: false,
    });

    const sheet = makeSheet([
      makeClericSummary({
        spellsPrepared: { count: 1, max: 4 },
        spells: { cantrips: [], leveled: [plainSpell] },
      }),
    ]);

    render(<HechizosTab sheet={sheet} charId="test-char-id" />);
    expect(screen.queryByTitle('Ritual')).toBeNull();
    expect(screen.queryByTitle('Concentración')).toBeNull();
    expect(screen.queryByTitle('Componente material')).toBeNull();
  });
});

// ── SP-07: REQ-SP07-HECHIZOS-SPELLSPREPARED-UNDEFINED ─────────────────────
// Drive-by fix: hechizos.tsx:80 uses `!== null` which treats `undefined` as falsy,
// showing "Preparados" label even when spellsPrepared is undefined.
// Fix: change to `!= null` (loose inequality also catches undefined).

describe('REQ-SP07-HECHIZOS-SPELLSPREPARED-UNDEFINED: undefined spellsPrepared → no Preparados label', () => {
  it('SP-07: ClassSpellSummary with spellsPrepared=undefined → "Conocidos" not "Preparados"', () => {
    // This test verifies the fix for the latent bug SP-04 S-01:
    // `summary?.spellsPrepared !== null` evaluates TRUE when spellsPrepared is undefined,
    // incorrectly showing "Preparados". After fix (`!= null`), undefined is also excluded.
    const summaryWithUndefinedPrepared: ClassSpellSummary = {
      classSlug: 'warlock',
      classSource: 'PHB',
      cantripsKnown: { count: 2, max: 2 },
      spellsKnown: { count: 2, max: 4 },
      // spellsPrepared deliberately omitted — TypeScript allows this via Partial
      // but we simulate via explicit undefined cast
      spellsPrepared: undefined as unknown as null,
      spells: {
        cantrips: [],
        leveled: [makeSpellRef('hex', 1, { name: 'Hex' })],
      },
    };

    const sheet: CharacterSheet = {
      ...makeSheet([]),
      spellcasting: [{ classSlug: 'warlock', classSource: 'PHB', ability: 'cha', saveDC: 13, attackBonus: 5 }],
      spellsByClass: [summaryWithUndefinedPrepared],
    };

    render(<HechizosTab sheet={sheet} charId="test-char-sp07" />);

    // "Preparados" must NOT appear — warlock has spells known, not prepared
    expect(screen.queryByText('Preparados')).toBeNull();
    // "Conocidos" MUST appear (or the section header for known casters)
    expect(screen.getByText('Conocidos')).toBeDefined();
  });
});

// ── SP-05: Slot grid integration ──────────────────────────────────────────────

describe('REQ-SP05-UX-CONSUME: HechizosTab renders SlotGrid when slots > 0', () => {
  it('renders "Nv 1" label and slot bubbles when spellSlots.slots[0] > 0', () => {
    const sheet = makeSheet([makeClericSummary()]);
    // slots[0]=2, slotsUsed[0]=0 → 2 filled bubbles at level 1
    sheet.spellSlots = {
      slots: [2, 0, 0, 0, 0, 0, 0, 0, 0],
      pactMagic: null,
      slotsUsed: [0, 0, 0, 0, 0, 0, 0, 0, 0],
      pactSlotsUsed: 0,
    };

    render(<HechizosTab sheet={sheet} charId="test-char-id" />);
    // Level label should be visible
    expect(screen.getByText('Nivel 1')).toBeTruthy();
    // Two slot bubbles rendered (plus ShortRestButton)
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThanOrEqual(2);
  });

  it('renders PactSlotGrid when pactMagic !== null', () => {
    const sheet = makeSheet([makeClericSummary()]);
    sheet.spellSlots = {
      slots: [0, 0, 0, 0, 0, 0, 0, 0, 0],
      pactMagic: { slotLevel: 3, slotCount: 2 },
      slotsUsed: [0, 0, 0, 0, 0, 0, 0, 0, 0],
      pactSlotsUsed: 0,
    };

    render(<HechizosTab sheet={sheet} charId="test-char-id" />);
    // 2 pact bubbles rendered
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThanOrEqual(2);
    // Rest buttons no longer live in this tab — they're at the sheet header.
    expect(screen.queryByText('Descanso Corto')).toBeNull();
  });

  it('shows per-level availability counter "X/Y" next to slot bubbles', () => {
    const sheet = makeSheet([makeClericSummary()]);
    sheet.spellSlots = {
      slots: [2, 0, 0, 0, 0, 0, 0, 0, 0],
      pactMagic: null,
      slotsUsed: [1, 0, 0, 0, 0, 0, 0, 0, 0],
      pactSlotsUsed: 0,
    };

    render(<HechizosTab sheet={sheet} charId="test-char-id" />);
    // 1 used, 1 available out of 2 at level 1 → "1/2"
    expect(screen.getByText('1/2')).toBeTruthy();
  });
});
