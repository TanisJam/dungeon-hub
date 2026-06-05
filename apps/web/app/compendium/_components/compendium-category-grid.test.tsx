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
  backgrounds: 40,
  feats: 42,
  conditions: 15,
  lore: '∞',
};

describe('CompendiumCategoryGrid', () => {
  it('WCP-GRID-03: renders 9 category cards in document order (including feats + conditions + lore)', () => {
    const { container } = render(<CompendiumCategoryGrid counts={defaultCounts} campaignId={null} />);
    const cards = container.querySelectorAll('.compendium-init-cat-card');
    // Now 9 cards: spells, items, races, classes, monsters, backgrounds, feats, conditions, lore
    expect(cards.length).toBe(9);
  });

  it('WCP-GRID-03 / WCP-COUNTS-01: numeric count renders as "320 entradas"', () => {
    const { getByText } = render(<CompendiumCategoryGrid counts={defaultCounts} campaignId={null} />);
    // WCP-COUNTS-01: number → "{n} entradas"
    expect(getByText('320 entradas')).toBeTruthy();
  });

  it('WCP-COUNTS-01: em-dash fallback renders as "— entradas"', () => {
    const counts = { ...defaultCounts, spells: '—' as const };
    const { getAllByText } = render(<CompendiumCategoryGrid counts={counts} campaignId={null} />);
    // Multiple '—' categories when null campaign, but at least one
    const dashes = getAllByText('— entradas');
    expect(dashes.length).toBeGreaterThanOrEqual(1);
  });

  it('WCP-LORE-02: lore card shows "Próximamente" (always disabled, no endpoint)', () => {
    const { getByText } = render(<CompendiumCategoryGrid counts={defaultCounts} campaignId={null} />);
    // WCP-LORE-02: Lore card is disabled with "Próximamente"
    expect(getByText('Próximamente')).toBeTruthy();
  });

  it('WCP-GRID-03: Hechizos card has .spell tint class', () => {
    const { container } = render(<CompendiumCategoryGrid counts={defaultCounts} campaignId={null} />);
    const cards = container.querySelectorAll('.compendium-init-cat-card');
    // First card = Hechizos → cls: 'spell'
    expect(cards[0]?.classList.contains('spell')).toBe(true);
  });

  it('WCP-GRID-03 / WCP-LORE-02: Lore card has .lore tint class', () => {
    const { container } = render(<CompendiumCategoryGrid counts={defaultCounts} campaignId={null} />);
    const cards = container.querySelectorAll('.compendium-init-cat-card');
    // Ninth (last) card = Lore → cls: 'lore'
    expect(cards[8]?.classList.contains('lore')).toBe(true);
  });

  it('REQ-CBROWSE-01: spell card has href to /compendium/spells?campaign=... when campaignId given', () => {
    const campaignId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    const { container } = render(
      <CompendiumCategoryGrid counts={defaultCounts} campaignId={campaignId} />,
    );
    // REQ-CBROWSE-01: spell card must be a link with the correct href
    const spellCard = container.querySelector('[data-category="spells"]');
    expect(spellCard?.tagName).toBe('A');
    expect(spellCard?.getAttribute('href')).toBe(`/compendium/spells?campaign=${campaignId}`);
  });

  it('REQ-CBROWSE-01: backgrounds card has href when campaignId given', () => {
    const campaignId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    const { container } = render(
      <CompendiumCategoryGrid counts={defaultCounts} campaignId={campaignId} />,
    );
    const bgCard = container.querySelector('[data-category="backgrounds"]');
    expect(bgCard?.tagName).toBe('A');
    expect(bgCard?.getAttribute('href')).toContain('/compendium/backgrounds');
  });

  it('ADR-7: lore card is disabled even when campaignId is provided', () => {
    const { container } = render(
      <CompendiumCategoryGrid counts={defaultCounts} campaignId="some-campaign-id" />,
    );
    const loreCard = container.querySelector('.lore');
    // Lore is always a button (disabled), never a Link
    expect(loreCard?.tagName).toBe('BUTTON');
    expect(loreCard?.hasAttribute('disabled')).toBe(true);
  });
});
