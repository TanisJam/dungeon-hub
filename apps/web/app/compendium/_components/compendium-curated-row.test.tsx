import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { CompendiumCuratedRow } from './compendium-curated-row';

describe('CompendiumCuratedRow', () => {
  it('WCP-CAMPAIGN-04: renders real campaign name when provided', () => {
    const { getByText } = render(<CompendiumCuratedRow campaignName="La Gran Campaña" />);
    expect(getByText('La Gran Campaña')).toBeTruthy();
  });

  it('WCP-CAMPAIGN-04: renders empty state when campaignName is null', () => {
    const { getByText } = render(<CompendiumCuratedRow campaignName={null} />);
    expect(getByText('Sin campaña activa')).toBeTruthy();
  });

  it('WCP-CAMPAIGN-04: does NOT render fake "Las Tres Lunas" copy', () => {
    const { queryByText } = render(<CompendiumCuratedRow campaignName={null} />);
    expect(queryByText('Las Tres Lunas')).toBeNull();
  });

  it('WCP-CAMPAIGN-04: does NOT render fake place/NPC/faction counts', () => {
    const { queryByText } = render(<CompendiumCuratedRow campaignName="My Campaign" />);
    expect(queryByText(/14 lugares/)).toBeNull();
    expect(queryByText(/27 NPCs/)).toBeNull();
    expect(queryByText(/9 facciones/)).toBeNull();
  });
});
