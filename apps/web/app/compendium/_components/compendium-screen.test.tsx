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
  backgrounds: 40,
  feats: 42,
  conditions: 15,
  lore: '∞',
};

describe('CompendiumScreen', () => {
  it('WED-CSS-SCOPED-05 / WCS-SCOPE-01: outer .compendium-init wrapper renders exactly once', () => {
    const { container } = render(
      <CompendiumScreen counts={defaultCounts} campaignName={null} campaignId={null} worldId={null} />,
    );
    // WCS-SCOPE-01: outer .compendium-init wrapper must be present
    const wrappers = container.querySelectorAll('.compendium-init');
    expect(wrappers.length).toBe(1);
  });

  it('WCS-SCOPE-02: all 4 sections are present in the render', () => {
    const { getByText } = render(
      <CompendiumScreen counts={defaultCounts} campaignName={null} campaignId={null} worldId={null} />,
    );
    // WCS-SCOPE-02: Categorías, Tu campaña, Más consultado, search trigger all present
    expect(getByText('Categorías')).toBeTruthy();
    expect(getByText('Tu campaña')).toBeTruthy();
    expect(getByText('Más consultado')).toBeTruthy();
    // Search bar presence (REQ-CBROWSE-10: now a Link, aria-label still present)
    expect(getByText('Hechizo, item, monstruo…')).toBeTruthy();
  });

  it('WCP-CAMPAIGN-04: threads real campaign name into CuratedRow', () => {
    const { getByText } = render(
      <CompendiumScreen counts={defaultCounts} campaignName="La Gran Campaña" campaignId={null} worldId={null} />,
    );
    expect(getByText('La Gran Campaña')).toBeTruthy();
  });

  it('WCP-CAMPAIGN-04: renders empty-state when campaignName is null', () => {
    const { getByText } = render(
      <CompendiumScreen counts={defaultCounts} campaignName={null} campaignId={null} worldId={null} />,
    );
    expect(getByText('Sin campaña activa')).toBeTruthy();
  });

  it('does NOT render fake "Las Tres Lunas" copy', () => {
    const { queryByText } = render(
      <CompendiumScreen counts={defaultCounts} campaignName={null} campaignId={null} worldId={null} />,
    );
    expect(queryByText(/Las Tres Lunas/)).toBeNull();
  });
});
