/**
 * Component test: MonsterGrantPicker — DM monster typeahead → candidateEntities.
 *
 * codex-knowledge B-3 gap closure (next-steps #1953):
 *   ADR-2 (#1946): monsters only. Feeds candidateEntities so the DM can produce
 *   knowledgeGrants[] from the complete form (REQ-CK-UNLOCK-03/08).
 *
 * Tests:
 *   1. Typing searches (debounced) and renders monster rows.
 *   2. Picking a monster calls onAdd with a bestiary CandidateEntity.
 *   3. Already-added monsters (existingKeys) are NOT re-added.
 *   4. Empty query → no search, no rows.
 *
 * Design intent: FORK 1 (#1944). This arc encodes NO PHB rule.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { MonsterGrantPicker } from './monster-grant-picker';

// ── Mock the campaign sessions actions module (searchSessionMonsters) ──────────
vi.mock('@/app/campanas/[id]/sessions/actions', () => ({
  searchSessionMonsters: vi.fn(),
}));

import { searchSessionMonsters } from '@/app/campanas/[id]/sessions/actions';

const mockSearch = searchSessionMonsters as ReturnType<typeof vi.fn>;

describe('MonsterGrantPicker (B-3 gap)', () => {
  beforeEach(() => {
    mockSearch.mockReset();
  });

  it('typing searches (debounced) and renders monster rows', async () => {
    mockSearch.mockResolvedValue([
      { slug: 'goblin', source: 'MM', name: 'Goblin', cr: '1/4', type: 'humanoid' },
    ]);

    render(
      <MonsterGrantPicker campaignId="camp-1" existingKeys={new Set()} onAdd={vi.fn()} />,
    );

    await act(async () => {
      fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'gob' } });
    });

    await waitFor(
      () => {
        expect(screen.getByRole('button', { name: /Goblin/i })).toBeTruthy();
      },
      { timeout: 1000 },
    );
    expect(mockSearch).toHaveBeenCalledWith('camp-1', 'gob');
  });

  it('picking a monster calls onAdd with a bestiary CandidateEntity', async () => {
    mockSearch.mockResolvedValue([
      { slug: 'goblin', source: 'MM', name: 'Goblin', cr: '1/4', type: 'humanoid' },
    ]);
    const onAdd = vi.fn();

    render(
      <MonsterGrantPicker campaignId="camp-1" existingKeys={new Set()} onAdd={onAdd} />,
    );

    await act(async () => {
      fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'gob' } });
    });
    await waitFor(() => screen.getByRole('button', { name: /Goblin/i }), { timeout: 1000 });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Goblin/i }));
    });

    expect(onAdd).toHaveBeenCalledWith({
      kind: 'bestiary',
      refKey: 'goblin',
      refSource: 'MM',
      label: 'Goblin',
    });
  });

  it('does NOT re-add a monster already in existingKeys', async () => {
    mockSearch.mockResolvedValue([
      { slug: 'goblin', source: 'MM', name: 'Goblin', cr: '1/4', type: 'humanoid' },
    ]);
    const onAdd = vi.fn();

    render(
      <MonsterGrantPicker
        campaignId="camp-1"
        existingKeys={new Set(['bestiary|goblin|MM'])}
        onAdd={onAdd}
      />,
    );

    await act(async () => {
      fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'gob' } });
    });
    await waitFor(() => screen.getByRole('button', { name: /Goblin/i }), { timeout: 1000 });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Goblin/i }));
    });

    expect(onAdd).not.toHaveBeenCalled();
  });

  it('empty query does not trigger a search', async () => {
    render(
      <MonsterGrantPicker campaignId="camp-1" existingKeys={new Set()} onAdd={vi.fn()} />,
    );
    // No typing → no search call.
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockSearch).not.toHaveBeenCalled();
  });
});
