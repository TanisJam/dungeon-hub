
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import type { CharacterSheet } from '@/lib/sheet-types';

// ResumenTab statically imports AtributosSectionEditor / RaceSection / ClassSection /
// BackgroundSection, which pull in Server Actions requiring Supabase env vars.
// Mock @/lib/env to avoid the env var requirement in this test (same pattern as hechizos.test.tsx).
vi.mock('@/lib/env', () => ({
  env: {
    SUPABASE_URL: 'http://localhost',
    SUPABASE_ANON_KEY: 'test-anon-key',
    API_URL: 'http://localhost:4000',
  },
}));

import { ResumenTab } from './resumen';

function makeSheet(overrides: Partial<CharacterSheet> = {}): CharacterSheet {
  return {
    identity: {
      name: 'Test',
      totalLevel: 1,
      classes: [
        { slug: 'fighter', source: 'PHB', level: 1, hitDie: 'd10', subclass: null },
      ],
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
    armorClass: { value: 12, formula: 'Unarmored (base 10) + DEX +2' },
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
    ...overrides,
  };
}

describe('ResumenTab — Rasgos de clase (REQ-UXP1-PLACEHOLDER-01)', () => {
  it('does not render the "Próximamente" placeholder copy', () => {
    const { container } = render(<ResumenTab sheet={makeSheet()} />);
    expect(container.textContent).not.toContain('Próximamente');
  });
});
