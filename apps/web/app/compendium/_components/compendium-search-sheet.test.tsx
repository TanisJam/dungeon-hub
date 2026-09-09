// Tests for CompendiumSearchSheet — cross-category Biblioteca search (REQ-BIB-SEARCH-01..05).
// Covers: grouping by category, partial failure (results + failure notice together),
// debounce/cancellation (stale-drop), empty-result state, and the minimum-query-length gate.

import type React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Mock V3Sheet — renders children only when open, no portal/focus-trap (matches DetailSheet's
// own test convention in ../[category]/__tests__/detail-sheet.test.tsx).
vi.mock('@/components/ui', () => ({
  V3Sheet: vi.fn(({ open, children, title }: { open: boolean; children: React.ReactNode; title?: string }) =>
    open ? (
      <div role="dialog" aria-label={title}>
        {children}
      </div>
    ) : null,
  ),
}));

// Mock the registry — avoids pulling the real (heavy) per-category RowView/Header components.
vi.mock('../[category]/_config/registry', () => ({
  CATEGORY_CONFIG: {
    spells: {
      endpoint: 'spells',
      label: 'Hechizos',
      RowView: ({ row }: { row: { name: string } }) => <span>{row.name}</span>,
      Header: () => null,
    },
    items: {
      endpoint: 'items',
      label: 'Items',
      RowView: ({ row }: { row: { name: string } }) => <span>{row.name}</span>,
      Header: () => null,
    },
    monsters: {
      endpoint: 'monsters',
      label: 'Monstruos',
      RowView: ({ row }: { row: { name: string } }) => <span>{row.name}</span>,
      Header: () => null,
    },
  },
}));

vi.mock('../actions', () => ({ searchAllCategories: vi.fn() }));

import { searchAllCategories, type CategorySearchResult } from '../actions';
import { CompendiumSearchSheet } from './compendium-search-sheet';

const CAMPAIGN_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const mockSearch = vi.mocked(searchAllCategories);

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function getInput() {
  return screen.getByLabelText('Buscar en toda la Biblioteca');
}

describe('CompendiumSearchSheet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not render when closed', () => {
    render(<CompendiumSearchSheet open={false} onClose={vi.fn()} campaignId={CAMPAIGN_ID} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('without an active campaign, explains a campaign is required instead of searching', () => {
    render(<CompendiumSearchSheet open onClose={vi.fn()} campaignId={null} />);
    fireEvent.change(getInput(), { target: { value: 'fireball' } });
    expect(screen.getByText('Seleccioná una campaña para buscar en la Biblioteca.')).toBeTruthy();
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it('REQ-BIB-SEARCH-03: below the 2-character minimum, shows a hint and never calls the action', () => {
    render(<CompendiumSearchSheet open onClose={vi.fn()} campaignId={CAMPAIGN_ID} />);
    fireEvent.change(getInput(), { target: { value: 'f' } });
    expect(
      screen.getByText('Escribí al menos 2 letras para buscar en todas las categorías.'),
    ).toBeTruthy();
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it('groups results by category, each under its own label', async () => {
    mockSearch.mockResolvedValue([
      {
        category: 'spells',
        ok: true,
        total: 1,
        rows: [{ slug: 'fireball', source: 'PHB', name: 'Fireball' }],
      },
      {
        category: 'items',
        ok: true,
        total: 1,
        rows: [{ slug: 'fireball-item', source: 'PHB', name: 'Fireball Wand' }],
      },
    ] satisfies CategorySearchResult[]);

    render(<CompendiumSearchSheet open onClose={vi.fn()} campaignId={CAMPAIGN_ID} />);
    fireEvent.change(getInput(), { target: { value: 'fireball' } });

    await waitFor(() => expect(mockSearch).toHaveBeenCalledWith(CAMPAIGN_ID, 'fireball'));
    expect(await screen.findByText('Fireball')).toBeTruthy();
    expect(screen.getByText('Fireball Wand')).toBeTruthy();
    expect(screen.getByText('Hechizos')).toBeTruthy();
    expect(screen.getByText('Items')).toBeTruthy();
  });

  it('REQ-BIB-SEARCH-04: partial failure shows the results that arrived AND names the categories that failed', async () => {
    mockSearch.mockResolvedValue([
      {
        category: 'spells',
        ok: true,
        total: 1,
        rows: [{ slug: 'fireball', source: 'PHB', name: 'Fireball' }],
      },
      {
        category: 'monsters',
        ok: false,
        total: 0,
        rows: [],
        errorMessage: 'No se pudo conectar con el servidor.',
      },
    ] satisfies CategorySearchResult[]);

    render(<CompendiumSearchSheet open onClose={vi.fn()} campaignId={CAMPAIGN_ID} />);
    fireEvent.change(getInput(), { target: { value: 'fireball' } });

    // The category that succeeded is never blanked by the one that failed.
    expect(await screen.findByText('Fireball')).toBeTruthy();
    // The failed category is named explicitly, not silently dropped.
    expect(screen.getByText(/No pudimos buscar en algunas categorías/)).toBeTruthy();
    expect(screen.getByText(/Monstruos: No se pudo conectar con el servidor\./)).toBeTruthy();
  });

  it('REQ-BIB-SEARCH-04 (total outage): all categories failing still names each one, with no crash', async () => {
    mockSearch.mockResolvedValue([
      { category: 'spells', ok: false, total: 0, rows: [], errorMessage: 'El servidor tardó demasiado en responder.' },
      { category: 'items', ok: false, total: 0, rows: [], errorMessage: 'No se pudo conectar con el servidor.' },
    ] satisfies CategorySearchResult[]);

    render(<CompendiumSearchSheet open onClose={vi.fn()} campaignId={CAMPAIGN_ID} />);
    fireEvent.change(getInput(), { target: { value: 'fireball' } });

    expect(await screen.findByText(/Hechizos: El servidor tardó demasiado/)).toBeTruthy();
    expect(screen.getByText(/Items: No se pudo conectar/)).toBeTruthy();
  });

  it('empty-result state: all categories succeed with zero matches', async () => {
    mockSearch.mockResolvedValue([
      { category: 'spells', ok: true, total: 0, rows: [] },
      { category: 'items', ok: true, total: 0, rows: [] },
    ] satisfies CategorySearchResult[]);

    render(<CompendiumSearchSheet open onClose={vi.fn()} campaignId={CAMPAIGN_ID} />);
    fireEvent.change(getInput(), { target: { value: 'zzzzzz' } });

    expect(await screen.findByText('Sin resultados para “zzzzzz”.')).toBeTruthy();
  });

  it('debounce: rapid keystrokes settle into exactly one call, for the final value', async () => {
    mockSearch.mockResolvedValue([]);
    render(<CompendiumSearchSheet open onClose={vi.fn()} campaignId={CAMPAIGN_ID} />);
    const input = getInput();

    fireEvent.change(input, { target: { value: 'fi' } });
    fireEvent.change(input, { target: { value: 'fir' } });
    fireEvent.change(input, { target: { value: 'fireba' } });

    await waitFor(() => expect(mockSearch).toHaveBeenCalledTimes(1));
    expect(mockSearch).toHaveBeenCalledWith(CAMPAIGN_ID, 'fireba');
  });

  it('cancellation: a slow response for an earlier query never overwrites a later one (stale-drop)', async () => {
    const early = deferred<CategorySearchResult[]>();
    const late = deferred<CategorySearchResult[]>();
    mockSearch.mockImplementationOnce(() => early.promise);
    mockSearch.mockImplementationOnce(() => late.promise);

    render(<CompendiumSearchSheet open onClose={vi.fn()} campaignId={CAMPAIGN_ID} />);
    const input = getInput();

    fireEvent.change(input, { target: { value: 'fireba' } });
    await waitFor(() => expect(mockSearch).toHaveBeenCalledTimes(1));

    fireEvent.change(input, { target: { value: 'fireball' } });
    await waitFor(() => expect(mockSearch).toHaveBeenCalledTimes(2));

    // Resolve the LATER ("fireball") request first, as if the earlier one is just slow.
    late.resolve([
      { category: 'spells', ok: true, total: 1, rows: [{ slug: 'fireball', source: 'PHB', name: 'Fireball' }] },
    ]);
    expect(await screen.findByText('Fireball')).toBeTruthy();

    // Now the stale "fireba" response finally arrives — it must never overwrite the screen.
    early.resolve([
      { category: 'spells', ok: true, total: 1, rows: [{ slug: 'fire-bolt', source: 'PHB', name: 'Fire Bolt' }] },
    ]);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByText('Fire Bolt')).toBeNull();
    expect(screen.getByText('Fireball')).toBeTruthy();
  });

  it('resets to a clean slate when closed and reopened', async () => {
    mockSearch.mockResolvedValue([
      { category: 'spells', ok: true, total: 1, rows: [{ slug: 'fireball', source: 'PHB', name: 'Fireball' }] },
    ] satisfies CategorySearchResult[]);

    const { rerender } = render(<CompendiumSearchSheet open onClose={vi.fn()} campaignId={CAMPAIGN_ID} />);
    fireEvent.change(getInput(), { target: { value: 'fireball' } });
    expect(await screen.findByText('Fireball')).toBeTruthy();

    rerender(<CompendiumSearchSheet open={false} onClose={vi.fn()} campaignId={CAMPAIGN_ID} />);
    rerender(<CompendiumSearchSheet open onClose={vi.fn()} campaignId={CAMPAIGN_ID} />);

    expect((getInput() as HTMLInputElement).value).toBe('');
    expect(screen.queryByText('Fireball')).toBeNull();
  });
});
