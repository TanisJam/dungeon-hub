import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { CompendiumDemoIsland } from './compendium-demo-island';

describe('CompendiumDemoIsland', () => {
  it('WCP-SEARCH-06 / REQ-CBROWSE-10: renders search trigger link with aria-label', () => {
    const { getByLabelText } = render(<CompendiumDemoIsland campaignId={null} />);
    expect(getByLabelText('Buscar en el compendium')).toBeTruthy();
  });

  it('REQ-CBROWSE-10: renders as a Link (anchor) — not a no-op button', () => {
    const { container } = render(<CompendiumDemoIsland campaignId={null} />);
    // REQ-CBROWSE-10: trigger must NOT be a no-op; it should be an <a> element
    const anchor = container.querySelector('a');
    expect(anchor).not.toBeNull();
  });

  it('REQ-CBROWSE-10: href points to /compendium/spells?campaign=... when campaignId given', () => {
    const { container } = render(
      <CompendiumDemoIsland campaignId="a1b2c3d4-e5f6-7890-abcd-ef1234567890" />,
    );
    const anchor = container.querySelector('a');
    expect(anchor?.getAttribute('href')).toContain('/compendium/spells');
    expect(anchor?.getAttribute('href')).toContain('campaign=');
  });

  it('does NOT render a spell detail sheet by default', () => {
    const { container } = render(<CompendiumDemoIsland campaignId={null} />);
    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog).toBeNull();
  });

  it('does NOT render fake "Bola de fuego" recents entry', () => {
    const { queryByText } = render(<CompendiumDemoIsland campaignId={null} />);
    expect(queryByText('Bola de fuego')).toBeNull();
  });
});
