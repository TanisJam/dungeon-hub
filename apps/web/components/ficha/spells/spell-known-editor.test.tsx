/**
 * Tests for SpellKnownEditor — DM-only toggle list for 'known' spells.
 *
 * T1: Renders only non-cantrip spells (level>0 filtered out cantrips defensively).
 * T2: Toggling a spell adds/removes it from the selection.
 * T3: Selected count is displayed.
 * T4: Guardar calls saveSpellKnown with selected slugs.
 *
 * Spec: sdd/ficha-dm-affordances #995 — SpellKnownEditor Component
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

// Mock save action
vi.mock('./save-spell-known-action', () => ({
  saveSpellKnown: vi.fn().mockResolvedValue({ ok: true }),
}));

import { saveSpellKnown } from './save-spell-known-action';
import { SpellKnownEditor } from './spell-known-editor';

const availableSpells = [
  { slug: 'mage-hand', source: 'PHB', name: 'Mage Hand', level: 0 },   // cantrip — must be filtered
  { slug: 'magic-missile', source: 'PHB', name: 'Magic Missile', level: 1 },
  { slug: 'shield', source: 'PHB', name: 'Shield', level: 1 },
  { slug: 'fireball', source: 'PHB', name: 'Fireball', level: 3 },
];

const baseProps = {
  characterId: 'char-1',
  classSlug: 'wizard',
  availableSpells,
  currentKnownSlugs: new Set<string>(),
  onClose: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SpellKnownEditor', () => {
  it('T1: renders only non-cantrip spells (level 0 mage-hand filtered out)', () => {
    render(<SpellKnownEditor {...baseProps} />);

    // Leveled spells should appear
    expect(screen.getByText('Magic Missile')).toBeTruthy();
    expect(screen.getByText('Shield')).toBeTruthy();
    expect(screen.getByText('Fireball')).toBeTruthy();
    // Cantrip must NOT appear
    expect(screen.queryByText('Mage Hand')).toBeNull();
  });

  it('T2: toggling a spell adds it to the selection', () => {
    render(<SpellKnownEditor {...baseProps} />);

    const checkbox = screen.getByLabelText('Magic Missile') as HTMLInputElement;
    expect(checkbox.checked).toBeFalsy();

    fireEvent.click(checkbox);
    expect(checkbox.checked).toBeTruthy();

    fireEvent.click(checkbox);
    expect(checkbox.checked).toBeFalsy();
  });

  it('T3: selected count is displayed', () => {
    render(
      <SpellKnownEditor
        {...baseProps}
        currentKnownSlugs={new Set(['magic-missile'])}
      />,
    );

    // 1 spell pre-selected
    expect(screen.getByText(/1 hechizo/)).toBeTruthy();

    // Toggle another
    fireEvent.click(screen.getByLabelText('Shield'));
    expect(screen.getByText(/2 hechizos/)).toBeTruthy();
  });

  it('T4: Guardar calls saveSpellKnown with selected slugs', async () => {
    (saveSpellKnown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });

    render(
      <SpellKnownEditor
        {...baseProps}
        currentKnownSlugs={new Set(['magic-missile'])}
      />,
    );

    const submitBtn = screen.getByRole('button', { name: /guardar/i });
    await act(async () => {
      fireEvent.click(submitBtn);
    });

    expect(saveSpellKnown).toHaveBeenCalledWith(
      expect.objectContaining({
        characterId: 'char-1',
        classSlug: 'wizard',
        known: expect.arrayContaining([
          expect.objectContaining({ slug: 'magic-missile' }),
        ]),
      }),
    );
  });
});
