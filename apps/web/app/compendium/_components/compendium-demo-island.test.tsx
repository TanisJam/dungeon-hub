import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { CompendiumDemoIsland } from './compendium-demo-island';

// Mock V3Sheet — renders children only when open (matches DetailSheet's test convention).
vi.mock('@/components/ui', () => ({
  Icon: () => null,
  V3Sheet: vi.fn(({ open, children, title }: { open: boolean; children: React.ReactNode; title?: string }) =>
    open ? (
      <div role="dialog" aria-label={title}>
        {children}
      </div>
    ) : null,
  ),
}));

// The sheet's own search behavior is covered by compendium-search-sheet.test.tsx —
// here it is enough that the trigger mounts/opens it.
vi.mock('../actions', () => ({ searchAllCategories: vi.fn() }));
vi.mock('../[category]/_config/registry', () => ({ CATEGORY_CONFIG: {} }));

describe('CompendiumDemoIsland', () => {
  it('WCP-SEARCH-06: renders the search trigger button with aria-label', () => {
    const { getByLabelText } = render(<CompendiumDemoIsland campaignId={null} />);
    expect(getByLabelText('Buscar en el compendium')).toBeTruthy();
  });

  it('the trigger is a button (opens the search sheet in place, not a navigating link)', () => {
    const { getByLabelText } = render(<CompendiumDemoIsland campaignId={null} />);
    expect(getByLabelText('Buscar en el compendium').tagName).toBe('BUTTON');
  });

  it('does NOT render the search sheet dialog by default', () => {
    render(<CompendiumDemoIsland campaignId={null} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('REQ-BIB-SEARCH-01: tapping the trigger opens the search sheet', () => {
    const { getByLabelText } = render(<CompendiumDemoIsland campaignId={null} />);
    fireEvent.click(getByLabelText('Buscar en el compendium'));
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('without an active campaign, the opened sheet explains a campaign is required', () => {
    const { getByLabelText } = render(<CompendiumDemoIsland campaignId={null} />);
    fireEvent.click(getByLabelText('Buscar en el compendium'));
    expect(screen.getByText('Seleccioná una campaña para buscar en la Biblioteca.')).toBeTruthy();
  });

  it('ux-p2-consistency Fix 2: ⌘K kbd hint is hidden on mobile (hidden base, md:inline-flex)', () => {
    const { container } = render(<CompendiumDemoIsland campaignId={null} />);
    const kbd = container.querySelector('.kbd');
    expect(kbd).toBeTruthy();
    expect(kbd!.className).toContain('hidden');
    expect(kbd!.className).toMatch(/md:(inline|flex|inline-flex)/);
  });
});
