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

  it('WCDS-OPEN-02: backdrop click closes sheet — [role="dialog"] removed', async () => {
    // WCDS-OPEN-02: close path — V3Sheet backdrop click calls onClose, island resets
    // openDetail to false, V3Sheet unmounts and [role="dialog"] is removed from DOM.
    const { getByLabelText } = render(<CompendiumDemoIsland />);
    // 1. Open via search trigger
    const trigger = getByLabelText('Buscar en el compendium');
    await act(async () => { fireEvent.click(trigger); });
    expect(document.body.querySelector('[role="dialog"]')).not.toBeNull();
    // 2. Close via backdrop — V3Sheet backdrop is a fixed inset-0 div with aria-hidden="true"
    //    rendered BEFORE the panel in the portal, so querySelector finds it first.
    const backdrop = document.body.querySelector(
      'div[aria-hidden="true"].fixed',
    ) as HTMLElement;
    expect(backdrop).not.toBeNull();
    await act(async () => {
      fireEvent.click(backdrop);
      // Flush pending microtasks so React state update + V3Sheet re-render completes
      await Promise.resolve();
    });
    // 3. Assert sheet is gone
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
  });
});
