import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { CompendiumCategoryGrid } from './compendium-category-grid';
import type { CategoryId } from './types';

const defaultCounts: Record<CategoryId, number | '—' | '∞'> = {
  spells: 320,
  items: 145,
  races: 40,
  classes: 13,
  monsters: 500,
  lore: '∞',
};

describe('CompendiumCategoryGrid', () => {
  it('WCP-GRID-03: renders 6 category cards in document order', () => {
    const { container } = render(<CompendiumCategoryGrid counts={defaultCounts} />);
    const cards = container.querySelectorAll('.compendium-init-cat-card');
    // WCP-GRID-03: exactly 6 cards
    expect(cards.length).toBe(6);
  });

  it('WCP-GRID-03 / WCP-COUNTS-01: numeric count renders as "320 entradas"', () => {
    const { getByText } = render(<CompendiumCategoryGrid counts={defaultCounts} />);
    // WCP-COUNTS-01: number → "{n} entradas"
    expect(getByText('320 entradas')).toBeTruthy();
  });

  it('WCP-COUNTS-01: em-dash fallback renders as "— entradas"', () => {
    const counts = { ...defaultCounts, spells: '—' as const };
    const { getByText } = render(<CompendiumCategoryGrid counts={counts} />);
    // WCP-COUNTS-01: '—' → "— entradas"
    expect(getByText('— entradas')).toBeTruthy();
  });

  it('WCP-LORE-02: infinity fallback renders as "∞ entradas"', () => {
    const { getByText } = render(<CompendiumCategoryGrid counts={defaultCounts} />);
    // WCP-LORE-02: Lore always shows '∞'
    expect(getByText('∞ entradas')).toBeTruthy();
  });

  it('WCP-GRID-03: Hechizos card has .spell tint class', () => {
    const { container } = render(<CompendiumCategoryGrid counts={defaultCounts} />);
    const cards = container.querySelectorAll('.compendium-init-cat-card');
    // First card = Hechizos → cls: 'spell'
    expect(cards[0]?.classList.contains('spell')).toBe(true);
  });

  it('WCP-GRID-03 / WCP-LORE-02: Lore card has .lore tint class', () => {
    const { container } = render(<CompendiumCategoryGrid counts={defaultCounts} />);
    const cards = container.querySelectorAll('.compendium-init-cat-card');
    // Sixth card = Lore → cls: 'lore'
    expect(cards[5]?.classList.contains('lore')).toBe(true);
  });
});
