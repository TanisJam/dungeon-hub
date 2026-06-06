/**
 * Component test: ItemRewardPicker — compendium item typeahead for reward rows.
 *
 * Bug fix (#1953): replaces the plain slug/source text inputs that caused
 * "item not found" when a DM typed a name instead of the exact slug.
 *
 * Tests:
 *   1. Typing searches (debounced) and renders item rows.
 *   2. Picking an item calls onPick with exact { slug, source, name }.
 *   3. Empty query → no search.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { ItemRewardPicker } from './item-reward-picker';

vi.mock('@/app/campanas/[id]/sessions/actions', () => ({
  searchSessionItems: vi.fn(),
}));

import { searchSessionItems } from '@/app/campanas/[id]/sessions/actions';

const mockSearch = searchSessionItems as ReturnType<typeof vi.fn>;

describe('ItemRewardPicker (#1953)', () => {
  beforeEach(() => {
    mockSearch.mockReset();
  });

  it('typing searches (debounced) and renders item rows', async () => {
    mockSearch.mockResolvedValue([
      { slug: 'potion-healing', source: 'PHB', name: 'Potion of Healing', type: null, weight: null },
    ]);

    render(<ItemRewardPicker campaignId="camp-1" onPick={vi.fn()} />);

    await act(async () => {
      fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'pot' } });
    });

    await waitFor(
      () => expect(screen.getByRole('button', { name: /Potion of Healing/i })).toBeTruthy(),
      { timeout: 1000 },
    );
    expect(mockSearch).toHaveBeenCalledWith('camp-1', 'pot');
  });

  it('picking an item calls onPick with exact slug/source/name', async () => {
    mockSearch.mockResolvedValue([
      { slug: 'potion-healing', source: 'PHB', name: 'Potion of Healing', type: null, weight: null },
    ]);
    const onPick = vi.fn();

    render(<ItemRewardPicker campaignId="camp-1" onPick={onPick} />);

    await act(async () => {
      fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'pot' } });
    });
    await waitFor(() => screen.getByRole('button', { name: /Potion of Healing/i }), {
      timeout: 1000,
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Potion of Healing/i }));
    });

    expect(onPick).toHaveBeenCalledWith({
      slug: 'potion-healing',
      source: 'PHB',
      name: 'Potion of Healing',
    });
  });

  it('empty query does not trigger a search', async () => {
    render(<ItemRewardPicker campaignId="camp-1" onPick={vi.fn()} />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockSearch).not.toHaveBeenCalled();
  });
});
