import { describe, it, expect } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import { CompendiumDemoIsland } from './compendium-demo-island';

describe('CompendiumDemoIsland', () => {
  it('WCDS-OPEN-02: initial openDetail=false — sheet not visible', () => {
    const { container } = render(<CompendiumDemoIsland />);
    // WCP-SEARCH-06 / WCDS-OPEN-02: sheet is closed by default
    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog).toBeNull();
  });

  it('WCP-SEARCH-06: click search trigger opens sheet', async () => {
    const { container, getByLabelText } = render(<CompendiumDemoIsland />);
    // WCP-SEARCH-06: search bar button opens Fireball sheet
    const trigger = getByLabelText('Buscar en el compendium');
    await act(async () => { fireEvent.click(trigger); });
    // V3Sheet renders in portal — check body
    const dialog = document.body.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
  });

  it('WCDS-OPEN-02: click Fireball row opens sheet', async () => {
    const { getByText } = render(<CompendiumDemoIsland />);
    // WCDS-OPEN-02: Fireball row is tappable
    await act(async () => { fireEvent.click(getByText('Bola de fuego')); });
    const dialog = document.body.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
  });
});
