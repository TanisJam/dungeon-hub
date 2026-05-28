import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { CompendiumScreen } from './compendium-screen';
import type { CategoryId } from './types';

const defaultCounts: Record<CategoryId, number | '—' | '∞'> = {
  spells: 320,
  items: 145,
  races: 40,
  classes: 13,
  monsters: 500,
  lore: '∞',
};

describe('CompendiumScreen', () => {
  it('WED-CSS-SCOPED-05 / WCS-SCOPE-01: outer .compendium-init wrapper renders exactly once', () => {
    const { container } = render(<CompendiumScreen counts={defaultCounts} />);
    // WCS-SCOPE-01: outer .compendium-init wrapper must be present
    const wrappers = container.querySelectorAll('.compendium-init');
    expect(wrappers.length).toBe(1);
  });

  it('WCS-SCOPE-02: all 4 sections are present in the render', () => {
    const { getByText } = render(<CompendiumScreen counts={defaultCounts} />);
    // WCS-SCOPE-02: Categorías, Tu campaña, Más consultado, search trigger all present
    expect(getByText('Categorías')).toBeTruthy();
    expect(getByText('Tu campaña')).toBeTruthy();
    expect(getByText('Más consultado')).toBeTruthy();
    // Search bar presence
    expect(getByText('Hechizo, item, monstruo, lore…')).toBeTruthy();
  });
});
