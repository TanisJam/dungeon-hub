/**
 * CompleteForm component tests.
 * REQ-DPPMB-COMPLETE-03, REQ-DPPMB-COMPLETE-04, REQ-DPPMB-COMPLETE-05, REQ-DPPMB-COMPLETE-06.
 * REQ-DPPMB-CT (complete-form slice):
 *   - add/remove item reward rows
 *   - recipient select scoped to active participants
 *   - exact submitted payload shape (Zod field names)
 *   - ITEM_REWARD_INVALID_RECIPIENT surfaced inline
 *
 * NOTE: afterEach(cleanup) is NOT declared here — global via apps/web/vitest.setup.ts.
 *
 * V3Sheet mocked to a simple div (portal not compatible with jsdom).
 * completeSession action mocked via vi.mock (hoisted).
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { CompleteForm } from './complete-form';
import type { EnrichedParticipant } from '@/app/campanas/[id]/sessions/actions';

// ── Mock V3Sheet ──────────────────────────────────────────────────────────────
vi.mock('@/components/ui/sheet', () => ({
  V3Sheet: ({
    open,
    onClose,
    title,
    children,
  }: {
    open: boolean;
    onClose: () => void;
    title?: string;
    children: React.ReactNode;
  }) =>
    open ? (
      <div data-testid="v3-sheet">
        {title && <div>{title}</div>}
        {children}
        <button type="button" onClick={onClose} data-testid="sheet-close">
          Cerrar
        </button>
      </div>
    ) : null,
}));

// ── Mock Server Actions ───────────────────────────────────────────────────────
// searchSessionMonsters is imported by the MonsterGrantPicker rendered inside the
// complete form (codex-knowledge B-3 gap, #1953). Defaults to [] so unrelated tests
// that never type into the monster search don't trigger a real fetch.
vi.mock('@/app/campanas/[id]/sessions/actions', () => ({
  completeSession: vi.fn(),
  searchSessionMonsters: vi.fn().mockResolvedValue([]),
  searchSessionItems: vi.fn().mockResolvedValue([]),
}));

import {
  completeSession,
  searchSessionMonsters,
  searchSessionItems,
} from '@/app/campanas/[id]/sessions/actions';

// ── Mock next/link ────────────────────────────────────────────────────────────
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const mockComplete = completeSession as ReturnType<typeof vi.fn>;
const mockSearchMonsters = searchSessionMonsters as ReturnType<typeof vi.fn>;
const mockSearchItems = searchSessionItems as ReturnType<typeof vi.fn>;

const activeParticipants: EnrichedParticipant[] = [
  {
    characterId: 'char-1',
    userId: 'user-1',
    joinedAt: '2025-01-01T10:00:00.000Z',
    leftAt: null,
    name: 'Aelar Windrunner',
    lineage: 'Elfo',
    level: 4,
  },
  {
    characterId: 'char-2',
    userId: 'user-2',
    joinedAt: '2025-01-01T10:00:00.000Z',
    leftAt: null,
    name: 'Bruenor Battlehammer',
    lineage: 'Enano',
    level: 5,
  },
];

// A participant who left — should NOT appear in the recipient dropdown.
const leftParticipant: EnrichedParticipant = {
  characterId: 'char-3',
  userId: 'user-3',
  joinedAt: '2025-01-01T10:00:00.000Z',
  leftAt: '2025-01-01T11:00:00.000Z',
  name: 'Gimli Stonefist',
  lineage: 'Enano',
  level: 3,
};

function renderForm({
  open = true,
  onClose = vi.fn(),
  onDone = vi.fn(),
  sessionId = 'sess-1',
  campaignId = 'camp-1',
  participants = activeParticipants,
} = {}) {
  return render(
    <CompleteForm
      open={open}
      onClose={onClose}
      onDone={onDone}
      sessionId={sessionId}
      campaignId={campaignId}
      participants={participants}
    />,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('CompleteForm', () => {
  beforeEach(() => {
    mockComplete.mockReset();
    mockSearchMonsters.mockReset();
    mockSearchMonsters.mockResolvedValue([]);
    mockSearchItems.mockReset();
    mockSearchItems.mockResolvedValue([]);
  });

  // ── REQ-DPPMB-COMPLETE-04: participant summary ────────────────────────────────

  it('renders active participants in the summary section', () => {
    renderForm();
    expect(screen.getByText(/aelar windrunner/i)).toBeTruthy();
    expect(screen.getByText(/bruenor battlehammer/i)).toBeTruthy();
  });

  it('does NOT render left participants in the summary or recipient selects', () => {
    renderForm({
      participants: [...activeParticipants, leftParticipant],
    });
    // Gimli left — should NOT appear anywhere in the form
    expect(screen.queryByText(/gimli stonefist/i)).toBeNull();
  });

  // ── REQ-DPPMB-COMPLETE-03: item reward rows — add/remove ─────────────────────

  it('starts with no item rows', () => {
    renderForm();
    // No item row selects should be present initially
    expect(screen.queryByTestId('item-row-0')).toBeNull();
  });

  it('adds an item row when "Agregar ítem" is clicked', () => {
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: /agregar ítem/i }));
    expect(screen.getByTestId('item-row-0')).toBeTruthy();
  });

  it('removes an item row when the remove button is clicked', () => {
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: /agregar ítem/i }));
    expect(screen.getByTestId('item-row-0')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /eliminar ítem 0/i }));
    expect(screen.queryByTestId('item-row-0')).toBeNull();
  });

  // ── Recipient select scoped to active participants ────────────────────────────

  it('item recipient select contains only active participants', () => {
    renderForm({
      participants: [...activeParticipants, leftParticipant],
    });
    fireEvent.click(screen.getByRole('button', { name: /agregar ítem/i }));

    const select = screen.getByTestId('item-row-0-recipient');
    const options = Array.from(select.querySelectorAll('option'));
    const names = options.map((o) => o.textContent);

    expect(names.some((n) => /aelar windrunner/i.test(n ?? ''))).toBe(true);
    expect(names.some((n) => /bruenor battlehammer/i.test(n ?? ''))).toBe(true);
    // Gimli left — must NOT be in the recipient list
    expect(names.some((n) => /gimli stonefist/i.test(n ?? ''))).toBe(false);
  });

  // ── REQ-DPPMB-COMPLETE-03: exact submitted payload shape (Zod field names) ────

  it('submits with exact CompleteSessionBody shape including rewards.xpPerPlayer', async () => {
    mockComplete.mockResolvedValueOnce({ ok: true, data: { id: 'sess-1', status: 'completed' } });
    renderForm();

    fireEvent.change(screen.getByLabelText(/xp por jugador/i), { target: { value: '200' } });
    fireEvent.click(screen.getByRole('button', { name: /cerrar sesión y repartir/i }));

    await waitFor(() => {
      expect(mockComplete).toHaveBeenCalledWith(
        'sess-1',
        'camp-1',
        expect.objectContaining({
          rewards: expect.objectContaining({ xpPerPlayer: 200 }),
        }),
      );
    });
  });

  it('submits with rewards.goldPerPlayer when filled', async () => {
    mockComplete.mockResolvedValueOnce({ ok: true, data: { id: 'sess-1', status: 'completed' } });
    renderForm();

    fireEvent.change(screen.getByLabelText(/oro por jugador/i), { target: { value: '50' } });
    fireEvent.click(screen.getByRole('button', { name: /cerrar sesión y repartir/i }));

    await waitFor(() => {
      const body = mockComplete.mock.calls[0][2] as { rewards?: { goldPerPlayer?: number } };
      expect(body.rewards?.goldPerPlayer).toBe(50);
    });
  });

  it('submits item rows with exact field names: characterId, slug, source, quantity (via picker)', async () => {
    mockComplete.mockResolvedValueOnce({ ok: true, data: { id: 'sess-1', status: 'completed' } });
    mockSearchItems.mockResolvedValue([
      { slug: 'potion-healing', source: 'PHB', name: 'Potion of Healing', type: null, weight: null },
    ]);
    renderForm();

    // Add one item row
    fireEvent.click(screen.getByRole('button', { name: /agregar ítem/i }));

    // Recipient
    fireEvent.change(screen.getByTestId('item-row-0-recipient'), { target: { value: 'char-1' } });

    // Item — search + pick (no free-text slug). The picker sets slug+source.
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/buscar ítem/i), { target: { value: 'pot' } });
    });
    await waitFor(() => screen.getByRole('button', { name: /Potion of Healing/i }), {
      timeout: 1000,
    });
    expect(mockSearchItems).toHaveBeenCalledWith('camp-1', 'pot');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Potion of Healing/i }));
    });

    // Quantity
    fireEvent.change(screen.getByTestId('item-row-0-quantity'), { target: { value: '2' } });

    fireEvent.click(screen.getByRole('button', { name: /cerrar sesión y repartir/i }));

    await waitFor(() => {
      expect(mockComplete).toHaveBeenCalledWith(
        'sess-1',
        'camp-1',
        expect.objectContaining({
          rewards: expect.objectContaining({
            items: [
              {
                characterId: 'char-1',
                slug: 'potion-healing',
                source: 'PHB',
                quantity: 2,
              },
            ],
          }),
        }),
      );
    });
  });

  it('omits items array when no rows are added', async () => {
    mockComplete.mockResolvedValueOnce({ ok: true, data: { id: 'sess-1', status: 'completed' } });
    renderForm();

    fireEvent.click(screen.getByRole('button', { name: /cerrar sesión y repartir/i }));

    await waitFor(() => {
      const body = mockComplete.mock.calls[0][2] as { rewards?: { items?: unknown[] } };
      expect(body.rewards?.items ?? undefined).toBeUndefined();
    });
  });

  // ── REQ-DPPMB-COMPLETE-06: ITEM_REWARD_INVALID_RECIPIENT inline error ─────────

  it('surfaces ITEM_REWARD_INVALID_RECIPIENT as an inline error without closing', async () => {
    mockComplete.mockResolvedValueOnce({
      ok: false,
      error: JSON.stringify([{ code: 'ITEM_REWARD_INVALID_RECIPIENT', index: 0 }]),
      status: 400,
    });
    renderForm();

    fireEvent.click(screen.getByRole('button', { name: /agregar ítem/i }));
    const recipientSelect = screen.getByTestId('item-row-0-recipient');
    fireEvent.change(recipientSelect, { target: { value: 'char-1' } });
    fireEvent.click(screen.getByRole('button', { name: /cerrar sesión y repartir/i }));

    await waitFor(() => {
      // The sheet should still be open (v3-sheet mock present)
      expect(screen.getByTestId('v3-sheet')).toBeTruthy();
      // Inline error message on the row
      expect(screen.getByText(/participante activo|recipient/i)).toBeTruthy();
    });
  });

  // ── Success: calls onDone ─────────────────────────────────────────────────────

  it('calls onDone after successful submit', async () => {
    mockComplete.mockResolvedValueOnce({ ok: true, data: { id: 'sess-1', status: 'completed' } });
    const onDone = vi.fn();
    renderForm({ onDone });

    fireEvent.click(screen.getByRole('button', { name: /cerrar sesión y repartir/i }));

    await waitFor(() => {
      expect(onDone).toHaveBeenCalledOnce();
    });
  });

  // ── worldChanges rows ─────────────────────────────────────────────────────────

  it('adds a world change row when "Agregar cambio" is clicked', () => {
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: /agregar cambio/i }));
    expect(screen.getByTestId('world-change-row-0')).toBeTruthy();
  });

  it('removes a world change row when the remove button is clicked', () => {
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: /agregar cambio/i }));
    expect(screen.getByTestId('world-change-row-0')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /eliminar cambio 0/i }));
    expect(screen.queryByTestId('world-change-row-0')).toBeNull();
  });

  // ── codex-knowledge B-3 gap (#1953): monster picker → candidate → grant ──────

  it('picking a monster then toggling its chip submits knowledgeGrants for all active participants', async () => {
    mockComplete.mockResolvedValueOnce({ ok: true, data: { id: 'sess-1', status: 'completed' } });
    mockSearchMonsters.mockResolvedValue([
      { slug: 'goblin', source: 'MM', name: 'Goblin', cr: '1/4', type: 'humanoid' },
    ]);
    renderForm();

    // 1. Search a monster in the DM grant picker.
    await act(async () => {
      fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'gob' } });
    });
    await waitFor(() => screen.getByRole('button', { name: /Goblin/i }), { timeout: 1000 });

    // 2. Pick it → becomes a candidate chip.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Goblin/i }));
    });

    // 3. Toggle the candidate chip ON (aria-pressed button in KnowledgeGrantSection).
    const chip = await screen.findByRole('button', { name: 'Goblin', pressed: false });
    await act(async () => {
      fireEvent.click(chip);
    });

    // 4. Submit → knowledgeGrants[] = selected entity × active participants (2).
    fireEvent.click(screen.getByRole('button', { name: /cerrar sesión y repartir/i }));

    await waitFor(() => {
      expect(mockComplete).toHaveBeenCalledWith(
        'sess-1',
        'camp-1',
        expect.objectContaining({
          knowledgeGrants: [
            { characterId: 'char-1', kind: 'bestiary', refKey: 'goblin', refSource: 'MM' },
            { characterId: 'char-2', kind: 'bestiary', refKey: 'goblin', refSource: 'MM' },
          ],
        }),
      );
    });
  });

  it('includes worldChanges in submitted payload with exact field names', async () => {
    mockComplete.mockResolvedValueOnce({ ok: true, data: { id: 'sess-1', status: 'completed' } });
    renderForm();

    fireEvent.click(screen.getByRole('button', { name: /agregar cambio/i }));

    const titleInput = screen.getByTestId('world-change-row-0-title');
    fireEvent.change(titleInput, { target: { value: 'La ciudad cayó' } });

    const visibilitySelect = screen.getByTestId('world-change-row-0-visibility');
    fireEvent.change(visibilitySelect, { target: { value: 'dm-only' } });

    fireEvent.click(screen.getByRole('button', { name: /cerrar sesión y repartir/i }));

    await waitFor(() => {
      expect(mockComplete).toHaveBeenCalledWith(
        'sess-1',
        'camp-1',
        expect.objectContaining({
          worldChanges: [
            expect.objectContaining({
              title: 'La ciudad cayó',
              visibility: 'dm-only',
            }),
          ],
        }),
      );
    });
  });
});
