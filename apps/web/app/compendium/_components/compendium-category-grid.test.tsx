import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { CompendiumCategoryGrid } from './compendium-category-grid';
import type { CategoryId } from './types';

// counts is typed Record<CategoryId> (all keys) — the grid only renders the
// 6 Biblioteca categories (codex-ia-reframe W1: items/monsters/lore dropped).
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
  it('REQ-BIB-02: renders the 6 library cards only (no items/monsters/lore)', () => {
    const { container } = render(<CompendiumCategoryGrid counts={defaultCounts} campaignId={null} />);
    const cards = container.querySelectorAll('.compendium-init-cat-card');
    expect(cards.length).toBe(6);
  });

  it('REQ-BIB-02: items, monsters and lore cards are NOT rendered', () => {
    const { container } = render(<CompendiumCategoryGrid counts={defaultCounts} campaignId="c1" />);
    expect(container.querySelector('[data-category="items"]')).toBeNull();
    expect(container.querySelector('[data-category="monsters"]')).toBeNull();
    expect(container.querySelector('[data-category="lore"]')).toBeNull();
    expect(container.querySelector('.lore')).toBeNull();
  });

  it('WCP-COUNTS-01: numeric count renders as "320 entradas"', () => {
    const { getByText } = render(<CompendiumCategoryGrid counts={defaultCounts} campaignId={null} />);
    expect(getByText('320 entradas')).toBeTruthy();
  });

  it('WCP-COUNTS-01: em-dash fallback renders as "— entradas"', () => {
    const counts = { ...defaultCounts, spells: '—' as const };
    const { getAllByText } = render(<CompendiumCategoryGrid counts={counts} campaignId={null} />);
    const dashes = getAllByText('— entradas');
    expect(dashes.length).toBeGreaterThanOrEqual(1);
  });

  it('WCP-GRID-03: Hechizos card is first and has .spell tint class', () => {
    const { container } = render(<CompendiumCategoryGrid counts={defaultCounts} campaignId={null} />);
    const cards = container.querySelectorAll('.compendium-init-cat-card');
    expect(cards[0]?.classList.contains('spell')).toBe(true);
  });

  it('REQ-CBROWSE-01: spell card links to /compendium/spells?campaign=... when campaignId given', () => {
    const campaignId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    const { container } = render(
      <CompendiumCategoryGrid counts={defaultCounts} campaignId={campaignId} />,
    );
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

  it('renders non-navigating buttons (not links) when campaignId is null', () => {
    const { container } = render(<CompendiumCategoryGrid counts={defaultCounts} campaignId={null} />);
    const firstCard = container.querySelector('.compendium-init-cat-card');
    expect(firstCard?.tagName).toBe('BUTTON');
    // Links (which carry data-category) are not rendered without a campaign.
    expect(container.querySelector('[data-category="spells"]')).toBeNull();
  });
});
