import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { CompendiumCuratedRow } from './compendium-curated-row';

describe('CompendiumCuratedRow', () => {
  it('WCP-CAMPAIGN-04: renders static stub copy "Mundo · Las Tres Lunas"', () => {
    const { getByText } = render(<CompendiumCuratedRow />);
    // WCP-CAMPAIGN-04: static curated row stub copy
    expect(getByText('Mundo · Las Tres Lunas')).toBeTruthy();
  });

  it('WCP-CAMPAIGN-04: renders subtitle "14 lugares · 27 NPCs · 9 facciones"', () => {
    const { getByText } = render(<CompendiumCuratedRow />);
    // WCP-CAMPAIGN-04: static subtitle copy
    expect(getByText('14 lugares · 27 NPCs · 9 facciones')).toBeTruthy();
  });
});
