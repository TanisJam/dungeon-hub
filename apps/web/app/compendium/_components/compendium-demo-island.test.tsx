import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { CompendiumDemoIsland } from './compendium-demo-island';

describe('CompendiumDemoIsland', () => {
  it('WCP-SEARCH-06: renders search trigger button', () => {
    const { getByLabelText } = render(<CompendiumDemoIsland />);
    expect(getByLabelText('Buscar en el compendium')).toBeTruthy();
  });

  it('does NOT render a spell detail sheet by default', () => {
    const { container } = render(<CompendiumDemoIsland />);
    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog).toBeNull();
  });

  it('does NOT render fake "Bola de fuego" recents entry', () => {
    const { queryByText } = render(<CompendiumDemoIsland />);
    expect(queryByText('Bola de fuego')).toBeNull();
  });
});
