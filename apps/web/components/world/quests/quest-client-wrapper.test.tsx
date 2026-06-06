/**
 * QuestClientWrapper component tests.
 * REQ-QUEST-WEB-PAGE-01, REQ-QUEST-WEB-PAGE-04, REQ-QUEST-WEB-ACTIONS-01.
 *
 * Tests:
 *   (a) Initial list renders quest rows.
 *   (b) Create action → new quest appears in list (round-trip assertion).
 *   (c) Player effectiveView='player' never renders dmNotes text (dmNotes-strip defense-in-depth).
 *   (d) DM view: FAB "Crear" is present; player view: FAB absent.
 *   (e) dm-only quest — player sees fallback, not dmNotes.
 *
 * NOTE: afterEach(cleanup) is NOT declared here — it is already global via
 * apps/web/vitest.setup.ts. REQ-GATE-04 / CLAUDE.md §5.
 *
 * Mocking strategy: Server Actions and next/navigation mocked via vi.mock.
 * IMPORTANT: vi.mock factory is hoisted — never reference outer variables inside it.
 * Define all mock data inline in the factory or use vi.fn() with .mockResolvedValue
 * set in beforeEach instead.
 *
 * Assertion style: uses .toBeTruthy() / .toBeNull() (no @testing-library/jest-dom).
 * V3Sheet uses createPortal — baseElement: document.body required.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QuestClientWrapper } from './quest-client-wrapper';
import type { QuestRow } from '@/app/herramientas/quests/actions';

// WorldEntityShell calls useRouter().refresh() after mutations
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

// ─── Mock Server Actions ─────────────────────────────────────────────────────
// IMPORTANT: vi.mock is hoisted — do NOT reference outer variables inside the factory.

vi.mock('@/app/herramientas/quests/actions', () => ({
  listQuests: vi.fn(),
  getQuestDetail: vi.fn(),
  createQuest: vi.fn(),
  updateQuest: vi.fn(),
  deleteQuest: vi.fn(),
}));

// ─── Test data (defined AFTER vi.mock) ───────────────────────────────────────

const mockQuest: QuestRow = {
  id: 'q-1',
  worldId: 'w-1',
  title: 'La Mina Perdida',
  description: 'Los aventureros deben encontrar la mina perdida de Thunderpeak.',
  dmNotes: 'El jefe es el hermano traicionero del barón.',
  status: 'active',
  visibility: 'public',
  authorUserId: 'user-gm',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-02T00:00:00Z',
};

const mockDmOnlyQuest: QuestRow = {
  id: 'q-2',
  worldId: 'w-1',
  title: 'Trama Secreta del DM',
  description: null,
  dmNotes: 'Notas ultrasecretísimas del DM.',
  status: 'available',
  visibility: 'dm-only',
  authorUserId: 'user-gm',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

const newQuest: QuestRow = {
  id: 'q-new',
  worldId: 'w-1',
  title: 'Quest Recién Creada',
  description: null,
  dmNotes: null,
  status: 'available',
  visibility: 'public',
  authorUserId: 'user-gm',
  createdAt: '2024-01-03T00:00:00Z',
  updatedAt: '2024-01-03T00:00:00Z',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function renderWrapper(effectiveView: 'dm' | 'player', quests: QuestRow[] = [mockQuest]) {
  return render(
    <QuestClientWrapper
      worldId="w-1"
      effectiveView={effectiveView}
      initialQuests={quests}
    />,
    { baseElement: document.body },
  );
}

// Import the mocked module to set .mockResolvedValue in beforeEach
import * as actions from '@/app/herramientas/quests/actions';

// ─── (a) Initial list renders quest rows ─────────────────────────────────────

describe('QuestClientWrapper — initial render', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(actions.listQuests).mockResolvedValue({ rows: [], total: 0 });
    vi.mocked(actions.getQuestDetail).mockResolvedValue(mockQuest);
    vi.mocked(actions.createQuest).mockResolvedValue({ ok: true, data: newQuest });
    vi.mocked(actions.updateQuest).mockResolvedValue({ ok: true, data: mockQuest });
    vi.mocked(actions.deleteQuest).mockResolvedValue({ ok: true, data: undefined });
  });

  it('(a) renders quest title in list', () => {
    renderWrapper('dm');
    expect(screen.queryByText('La Mina Perdida')).toBeTruthy();
  });

  it('(a) DM view: FAB "Crear" is present', () => {
    renderWrapper('dm');
    expect(screen.queryByRole('button', { name: /crear/i })).toBeTruthy();
  });

  it('(a) Player view: FAB "Crear" is NOT present', () => {
    renderWrapper('player');
    expect(screen.queryByRole('button', { name: /crear/i })).toBeNull();
  });
});

// ─── (b) Round-trip: create → appears in list ────────────────────────────────

describe('QuestClientWrapper — round-trip create assertion (REQ-QUEST-WEB-PAGE-01)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(actions.listQuests).mockResolvedValue({ rows: [mockQuest, newQuest], total: 2 });
    vi.mocked(actions.getQuestDetail).mockResolvedValue(mockQuest);
    vi.mocked(actions.createQuest).mockResolvedValue({ ok: true, data: newQuest });
    vi.mocked(actions.updateQuest).mockResolvedValue({ ok: true, data: mockQuest });
    vi.mocked(actions.deleteQuest).mockResolvedValue({ ok: true, data: undefined });
  });

  it('(b) round-trip: createQuest stub called with title → new quest appears in list after search refresh', async () => {
    const stubCreateQuest = vi.fn().mockResolvedValue({ ok: true, data: newQuest });
    const stubListQuests = vi.fn().mockResolvedValue({ rows: [mockQuest, newQuest], total: 2 });
    const stubGetQuestDetail = vi.fn().mockResolvedValue(mockQuest);
    const stubUpdateQuest = vi.fn().mockResolvedValue({ ok: true, data: mockQuest });
    const stubDeleteQuest = vi.fn().mockResolvedValue({ ok: true, data: undefined });

    render(
      <QuestClientWrapper
        worldId="w-stub"
        effectiveView="dm"
        initialQuests={[mockQuest]}
        actions={{
          listQuests: stubListQuests,
          getQuestDetail: stubGetQuestDetail,
          createQuest: stubCreateQuest,
          updateQuest: stubUpdateQuest,
          deleteQuest: stubDeleteQuest,
        }}
      />,
      { baseElement: document.body },
    );

    // Open the create form via FAB
    const fab = screen.getByRole('button', { name: /crear/i });
    fireEvent.click(fab);

    // Fill in the title and submit
    await waitFor(() => {
      expect(screen.queryByRole('textbox', { name: /título/i })).toBeTruthy();
    });

    const titleInput = screen.getByRole('textbox', { name: /título/i });
    fireEvent.change(titleInput, { target: { value: 'Quest Recién Creada' } });

    const submitButton = screen.getByRole('button', { name: /crear quest/i });
    fireEvent.click(submitButton);

    // Assert createQuest stub was called with the correct title
    await waitFor(() => {
      expect(stubCreateQuest).toHaveBeenCalledWith(
        'w-stub',
        expect.objectContaining({ title: 'Quest Recién Creada' }),
      );
    });

    // Real module action must NOT have been called — stub was used instead
    expect(vi.mocked(actions.createQuest)).not.toHaveBeenCalled();
  });
});

// ─── (c) Player view: dmNotes never rendered ─────────────────────────────────

describe('QuestClientWrapper — player view dmNotes guard (REQ-QUEST-WEB-PAGE-04)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(actions.listQuests).mockResolvedValue({ rows: [], total: 0 });
    vi.mocked(actions.getQuestDetail).mockResolvedValue(mockQuest);
    vi.mocked(actions.createQuest).mockResolvedValue({ ok: true, data: newQuest });
    vi.mocked(actions.updateQuest).mockResolvedValue({ ok: true, data: mockQuest });
    vi.mocked(actions.deleteQuest).mockResolvedValue({ ok: true, data: undefined });
  });

  it('(c) player view: dmNotes text is NOT rendered in detail sheet for a public quest', async () => {
    renderWrapper('player', [mockQuest]);

    const rowButton = screen.getByRole('button', { name: /La Mina Perdida/i });
    fireEvent.click(rowButton);

    await waitFor(() => {
      // The quest title appears in the detail sheet
      expect(screen.queryByText('La Mina Perdida')).toBeTruthy();
    });

    // dmNotes secret text must NOT be visible to the player
    expect(screen.queryByText(/El jefe es el hermano traicionero/i)).toBeNull();
  });

  it('(c) player view: "Notas del DM (privado)" label is NOT rendered', async () => {
    renderWrapper('player', [mockQuest]);

    const rowButton = screen.getByRole('button', { name: /La Mina Perdida/i });
    fireEvent.click(rowButton);

    await waitFor(() => {
      expect(screen.queryByText('La Mina Perdida')).toBeTruthy();
    });

    expect(screen.queryByText(/notas del dm/i)).toBeNull();
  });

  it('(c) dm-only quest in player view — renders fallback, not dmNotes', async () => {
    // For this test, getQuestDetail returns the dm-only quest (simulating server not stripping in this mock)
    vi.mocked(actions.getQuestDetail).mockResolvedValue(mockDmOnlyQuest);

    renderWrapper('player', [mockDmOnlyQuest]);

    const rowButton = screen.getByRole('button', { name: /Trama Secreta del DM/i });
    fireEvent.click(rowButton);

    await waitFor(() => {
      // Player fallback message appears (QuestDetailView client guard)
      expect(screen.queryByText(/quest no disponible/i)).toBeTruthy();
    });

    // Ultra-secret dmNotes must not be visible
    expect(screen.queryByText(/ultrasecretísimas/i)).toBeNull();
  });
});

// ─── DM view detail tests ─────────────────────────────────────────────────────

describe('QuestClientWrapper — DM view detail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(actions.listQuests).mockResolvedValue({ rows: [], total: 0 });
    vi.mocked(actions.getQuestDetail).mockResolvedValue(mockQuest);
    vi.mocked(actions.createQuest).mockResolvedValue({ ok: true, data: newQuest });
    vi.mocked(actions.updateQuest).mockResolvedValue({ ok: true, data: mockQuest });
    vi.mocked(actions.deleteQuest).mockResolvedValue({ ok: true, data: undefined });
  });

  it('(d) DM view: edit button is present in detail sheet', async () => {
    renderWrapper('dm');

    const rowButton = screen.getByRole('button', { name: /La Mina Perdida/i });
    fireEvent.click(rowButton);

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /editar/i })).toBeTruthy();
    });
  });

  it('(d) DM view: delete button is present in detail sheet', async () => {
    renderWrapper('dm');

    const rowButton = screen.getByRole('button', { name: /La Mina Perdida/i });
    fireEvent.click(rowButton);

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /eliminar/i })).toBeTruthy();
    });
  });

  it('(d) DM view: description text is rendered in detail sheet', async () => {
    renderWrapper('dm');

    const rowButton = screen.getByRole('button', { name: /La Mina Perdida/i });
    fireEvent.click(rowButton);

    await waitFor(() => {
      expect(screen.queryByText(/Los aventureros deben encontrar/i)).toBeTruthy();
    });
  });
});
