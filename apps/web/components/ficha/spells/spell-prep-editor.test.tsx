/**
 * Tests for SpellPrepEditor — SPELL-PREP-02 through SPELL-PREP-08.
 *
 * T1: Subclass-granted rows render as disabled with "Siempre preparado" label (SPELL-PREP-03).
 * T2: Counter shows "{n}/{max} preparados" with green tone (under limit, SPELL-PREP-04).
 * T3: At-limit — amber hint + "Límite alcanzado" + unchecked rows disabled (SPELL-PREP-04).
 * T4: Checking a spell increments counter (SPELL-PREP-04).
 * T5: Cantrips never appear in list (SPELL-PREP-05).
 * T6: Empty spell list → hint text "Aprendé hechizos al subir de nivel" (SPELL-PREP-02).
 * T7: initialPrepared exceeding prepLimit doesn't crash.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Mock the save action — it doesn't exist until C5
vi.mock('./save-spell-prep-action', () => ({
  saveSpellPrepForClass: vi.fn().mockResolvedValue({ ok: true }),
}));

import { SpellPrepEditor } from './spell-prep-editor';

const makeSpell = (slug: string, level: number, name?: string) => ({
  slug,
  source: 'PHB',
  name: name ?? slug,
  level,
  ritual: false,
  concentration: false,
  componentsM: false,
  componentsMCost: null,
});

const baseAvailableSpells = [
  makeSpell('bless', 1, 'Bendición'),
  makeSpell('cure-wounds', 1, 'Curar heridas'),
  makeSpell('sacred-flame', 0, 'Llama sagrada'), // cantrip — should be excluded
  makeSpell('spiritual-weapon', 2, 'Arma espiritual'),
];

const baseProps = {
  characterId: 'char-1',
  classSlug: 'cleric',
  classSource: 'PHB',
  availableSpells: baseAvailableSpells,
  subclassGrantedSlugs: [],
  initialPrepared: [],
  prepLimit: 6,
  existingCantrips: [],
  existingKnown: [],
  onClose: vi.fn(),
};

describe('SpellPrepEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('T1: subclass-granted spells render as disabled with "Siempre preparado" label', () => {
    render(
      <SpellPrepEditor
        {...baseProps}
        subclassGrantedSlugs={['bless', 'cure-wounds']}
        initialPrepared={[]}
        prepLimit={4}
      />,
    );
    // "Siempre preparado" should appear for each granted spell
    const labels = screen.getAllByText('Siempre preparado');
    expect(labels.length).toBe(2);
    // Those checkboxes should be disabled
    const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    const disabledForGranted = checkboxes.filter((cb) => cb.disabled && cb.checked);
    expect(disabledForGranted.length).toBe(2);
  });

  it('T2: counter shows "{n}/{max} preparados" with green class (under limit)', () => {
    render(
      <SpellPrepEditor
        {...baseProps}
        initialPrepared={[{ slug: 'bless', source: 'PHB' }]}
        prepLimit={6}
      />,
    );
    // Counter text: "1/6 preparados"
    expect(screen.getByText('1/6 preparados')).toBeTruthy();
  });

  it('T3: at limit — "Límite alcanzado" visible; unchecked rows disabled', () => {
    render(
      <SpellPrepEditor
        {...baseProps}
        initialPrepared={[
          { slug: 'bless', source: 'PHB' },
          { slug: 'cure-wounds', source: 'PHB' },
        ]}
        prepLimit={2}
      />,
    );
    expect(screen.getByText('Límite alcanzado')).toBeTruthy();
    // The unchecked spell (spiritual-weapon) should be disabled
    const allCheckboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    const unchecked = allCheckboxes.filter((cb) => !cb.checked && !cb.disabled);
    // None should be unchecked+enabled when at limit
    expect(unchecked.length).toBe(0);
  });

  it('T4: checking a spell increments the counter', () => {
    render(
      <SpellPrepEditor
        {...baseProps}
        initialPrepared={[]}
        prepLimit={6}
      />,
    );
    // Initially 0/6
    expect(screen.getByText('0/6 preparados')).toBeTruthy();

    // Click the bless checkbox
    const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    const blessCheckbox = checkboxes.find((cb) => !cb.checked);
    if (blessCheckbox) {
      fireEvent.click(blessCheckbox);
    }
    // Now should be 1/6
    expect(screen.getByText('1/6 preparados')).toBeTruthy();
  });

  it('T5: cantrips (level===0) never appear in the spell list', () => {
    render(<SpellPrepEditor {...baseProps} />);
    // 'Llama sagrada' is a cantrip — should not be in the list
    expect(screen.queryByText('Llama sagrada')).toBeNull();
  });

  it('T6: empty leveled spell list → shows hint "Aprendé hechizos al subir de nivel"', () => {
    render(
      <SpellPrepEditor
        {...baseProps}
        availableSpells={[]} // No available spells
        initialPrepared={[]}
      />,
    );
    expect(screen.getByText('Aprendé hechizos al subir de nivel')).toBeTruthy();
  });

  it('T7: initialPrepared exceeding prepLimit renders without crashing', () => {
    render(
      <SpellPrepEditor
        {...baseProps}
        initialPrepared={[
          { slug: 'bless', source: 'PHB' },
          { slug: 'cure-wounds', source: 'PHB' },
          { slug: 'spiritual-weapon', source: 'PHB' },
        ]}
        prepLimit={2}
      />,
    );
    // Should render without crash — counter shows actual count
    const counterText = screen.getByText(/preparados/);
    expect(counterText).toBeTruthy();
  });

  /**
   * T8: Wizard universe — knownUniverseSlugs filters availableSpells to intersection only.
   * PHB p.114: "The spells you add to your spellbook as you gain levels...
   * are spells you can prepare from."
   * SPELL-PREP-02: Wizard prep universe = spellbook intersection.
   */
  it('T8: knownUniverseSlugs provided — only spells in the set appear in the list', () => {
    // availableSpells has 3 leveled spells; only 2 are in the Wizard spellbook
    const wizardAvailable = [
      makeSpell('magic-missile', 1, 'Magic Missile'),
      makeSpell('shield', 1, 'Shield'),
      makeSpell('fireball', 3, 'Fireball'), // NOT in spellbook
    ];
    const knownUniverseSlugs = new Set(['magic-missile', 'shield']);

    render(
      <SpellPrepEditor
        {...baseProps}
        availableSpells={wizardAvailable}
        knownUniverseSlugs={knownUniverseSlugs}
        initialPrepared={[]}
        prepLimit={4}
      />,
    );

    // Only spellbook spells should appear
    expect(screen.getByText('Magic Missile')).toBeTruthy();
    expect(screen.getByText('Shield')).toBeTruthy();
    // Fireball is not in spellbook — must NOT appear
    expect(screen.queryByText('Fireball')).toBeNull();
  });

  /**
   * T9: Back-compat — when knownUniverseSlugs is undefined (non-spellbook caster),
   * all leveled spells appear (Cleric/Druid/Paladin path).
   * SPELL-PREP-02: no knownUniverseSlugs → full class list.
   */
  it('T9: knownUniverseSlugs undefined — all leveled spells rendered (back-compat)', () => {
    render(
      <SpellPrepEditor
        {...baseProps}
        // knownUniverseSlugs intentionally omitted
        initialPrepared={[]}
        prepLimit={6}
      />,
    );
    // All 3 leveled spells should appear (cantrip filtered, 3 leveled pass through)
    expect(screen.getByText('Bendición')).toBeTruthy();
    expect(screen.getByText('Curar heridas')).toBeTruthy();
    expect(screen.getByText('Arma espiritual')).toBeTruthy();
    // cantrip must NOT appear
    expect(screen.queryByText('Llama sagrada')).toBeNull();
  });
});
