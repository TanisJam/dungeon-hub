/**
 * CompendiumList — item type filter (#3.4).
 * The filter is items-only; selecting a type calls searchCompendium with { type }.
 *
 * NOTE: afterEach(cleanup) is global (vitest.setup.ts) — do NOT re-add.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Mock the registry — avoid pulling real RowView/Header components.
vi.mock('../_config/registry', () => ({
  CATEGORY_CONFIG: {
    items: { endpoint: 'items', label: 'Items', RowView: ({ row }: { row: { name: string } }) => <span>{row.name}</span>, Header: () => null },
    spells: { endpoint: 'spells', label: 'Hechizos', RowView: ({ row }: { row: { name: string } }) => <span>{row.name}</span>, Header: () => null },
  },
}));

// Mock the detail sheet (not under test here).
vi.mock('./detail-sheet', () => ({ DetailSheet: () => null }));

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
