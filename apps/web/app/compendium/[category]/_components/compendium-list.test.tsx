
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Mock the registry — avoid pulling real RowView/Header components.
vi.mock('../_config/registry', () => ({
  CATEGORY_CONFIG: {
    items: { endpoint: 'items', label: 'Items', RowView: ({ row }: { row: { name: string } }) => <span>{row.name}</span>, Header: () => null },
    spells: { endpoint: 'spells', label: 'Hechizos', RowView: ({ row }: { row: { name: string } }) => <span>{row.name}</span>, Header: () => null },
  },
}));

// Mock the detail sheet (not under test here) — renders the selected row's slug
// so seeding tests can assert whether the sheet opened without depending on
// DetailSheet's real fetch-on-tap implementation.
vi.mock('./detail-sheet', () => ({
  DetailSheet: ({ row }: { row: { slug: string } }) => (
    <div data-testid="detail-sheet">{row.slug}</div>
  ),
}));

// Mock the server action.
vi.mock('../actions', () => ({ searchCompendium: vi.fn() }));

import { searchCompendium } from '../actions';
import { CompendiumList } from './compendium-list';

const SCOPE = { campaign: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' } as const;

function renderList(category: 'items' | 'spells') {
  return render(
    <CompendiumList
      category={category}
      scope={SCOPE}
      worldId={null}
      accessToken="t"
      initialRows={[{ slug: 'club', name: 'Club', source: 'PHB' }]}
      total={1}
    />,
  );
}

describe('CompendiumList — item type filter (#3.4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(searchCompendium).mockResolvedValue({ rows: [], total: 0 });
  });

  it('renders the type filter only for the items category', () => {
    renderList('items');
    expect(screen.getByLabelText('Filtrar por tipo')).toBeTruthy();
    // "Todos los tipos" default + at least one type option
    expect(screen.getByRole('option', { name: 'Todos los tipos' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Melee Weapon' })).toBeTruthy();
  });

  it('does NOT render the type filter for non-items categories', () => {
    renderList('spells');
    expect(screen.queryByLabelText('Filtrar por tipo')).toBeNull();
  });

  it('selecting a type triggers searchCompendium with the type filter (no query needed)', async () => {
    renderList('items');
    fireEvent.change(screen.getByLabelText('Filtrar por tipo'), { target: { value: 'M' } });

    await waitFor(() => {
      expect(searchCompendium).toHaveBeenCalledWith(
        'items',
        SCOPE,
        '',
        0,
        { type: 'M' },
      );
    });
  });

  it('clearing the type back to "Todos los tipos" restores the SSR rows without a filtered call', async () => {
    renderList('items');
    // Select then clear
    fireEvent.change(screen.getByLabelText('Filtrar por tipo'), { target: { value: 'M' } });
    await waitFor(() => expect(searchCompendium).toHaveBeenCalled());
    vi.mocked(searchCompendium).mockClear();

    fireEvent.change(screen.getByLabelText('Filtrar por tipo'), { target: { value: '' } });
    // SSR row reappears, no new filtered search fired (empty q + empty filter short-circuits)
    await waitFor(() => expect(screen.getByText('Club')).toBeTruthy());
    expect(searchCompendium).not.toHaveBeenCalled();
  });
});

describe('CompendiumList — deep-link initial selection (feed-entity-tap-to-open, MVP #3.10)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(searchCompendium).mockResolvedValue({ rows: [], total: 0 });
  });

  it('opens the detail sheet when initialSelectionSlug+Source match a row in initialRows', () => {
    render(
      <CompendiumList
        category="items"
        scope={SCOPE}
        worldId={null}
        accessToken="t"
        initialRows={[{ slug: 'club', name: 'Club', source: 'PHB' }]}
        total={1}
        initialSelectionSlug="club"
        initialSelectionSource="PHB"
      />,
    );

    expect(screen.getByTestId('detail-sheet')).toBeTruthy();
    expect(screen.getByTestId('detail-sheet').textContent).toBe('club');
  });

  it('matches on slug alone when initialSelectionSource is omitted', () => {
    render(
      <CompendiumList
        category="items"
        scope={SCOPE}
        worldId={null}
        accessToken="t"
        initialRows={[{ slug: 'club', name: 'Club', source: 'PHB' }]}
        total={1}
        initialSelectionSlug="club"
      />,
    );

    expect(screen.getByTestId('detail-sheet')).toBeTruthy();
  });

  it('opens NOTHING when initialSelectionSlug matches no row (graceful miss — out-of-sources monster)', () => {
    render(
      <CompendiumList
        category="items"
        scope={SCOPE}
        worldId={null}
        accessToken="t"
        initialRows={[{ slug: 'club', name: 'Club', source: 'PHB' }]}
        total={1}
        initialSelectionSlug="does-not-exist"
        initialSelectionSource="PHB"
      />,
    );

    expect(screen.queryByTestId('detail-sheet')).toBeNull();
    // No error, plain list renders normally.
    expect(screen.getByText('Club')).toBeTruthy();
  });

  it('opens nothing when initialSelectionSlug is absent (unchanged default behavior)', () => {
    renderList('items');
    expect(screen.queryByTestId('detail-sheet')).toBeNull();
  });
});
