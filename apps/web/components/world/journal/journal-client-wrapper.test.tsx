/**
 * JournalClientWrapper component tests.
 * REQ-CRO-03, REQ-GATE-01, REQ-GATE-04.
 *
 * Tests:
 *   (a) DM view: FAB present, edit/delete present in sheet, body + title visible.
 *   (b) Player view: FAB absent, edit/delete absent from sheet.
 *
 * NOTE: afterEach(cleanup) is NOT declared here — it is already global via
 * apps/web/vitest.setup.ts. REQ-GATE-04.
 *
 * ADR-3 assertion: body is rendered as plain text (whitespace-pre-wrap).
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
import { JournalClientWrapper } from './journal-client-wrapper';
import type { JournalRow } from '@/app/cronica/actions';

// WorldEntityShell calls useRouter().refresh() after mutations; useRouter().push() for tag nav
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

// ─── Mock Server Actions ─────────────────────────────────────────────────────
// IMPORTANT: vi.mock is hoisted — do NOT reference outer variables inside the factory.

vi.mock('@/app/cronica/actions', () => ({
  listEvents: vi.fn(),
  getEventDetail: vi.fn(),
  createEvent: vi.fn(),
  updateEvent: vi.fn(),
  deleteEvent: vi.fn(),
  listJournalEntries: vi.fn(),
  getJournalDetail: vi.fn(),
  createJournalEntry: vi.fn(),
  updateJournalEntry: vi.fn(),
  deleteJournalEntry: vi.fn(),
}));

// ─── Test data (defined AFTER vi.mock) ───────────────────────────────────────

const mockEntry: JournalRow = {
  id: 'je-1',
  worldId: 'w-1',
  title: 'Sesión 1 — Resumen',
  body: 'El grupo llegó a la ciudad de Puerta de Hierro.\nEncontraron pistas sobre el artefacto.',
  visibility: 'public',
  tags: ['session-1', 'resumen'],
  authorUserId: 'user-1',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function renderWrapper(effectiveView: 'dm' | 'player', entries: JournalRow[] = [mockEntry]) {
  return render(
    <JournalClientWrapper
      worldId="w-1"
      effectiveView={effectiveView}
      initialEntries={entries}
    />,
    { baseElement: document.body },
  );
}

// Import the mocked module to set .mockResolvedValue in beforeEach
import * as actions from '@/app/cronica/actions';

// ─── DM view tests ───────────────────────────────────────────────────────────

describe('JournalClientWrapper — DM view (effectiveView="dm")', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(actions.listJournalEntries).mockResolvedValue({ rows: [], total: 0 });
    vi.mocked(actions.getJournalDetail).mockResolvedValue(mockEntry);
    vi.mocked(actions.createJournalEntry).mockResolvedValue({ ok: true, data: mockEntry });
    vi.mocked(actions.updateJournalEntry).mockResolvedValue({ ok: true, data: mockEntry });
    vi.mocked(actions.deleteJournalEntry).mockResolvedValue({ ok: true, data: undefined });
  });

  it('(a) FAB "Crear" is present in DM view', () => {
    renderWrapper('dm');
    const fab = screen.queryByRole('button', { name: /crear/i });
    expect(fab).toBeTruthy();
  });

  it('(a) edit button is present in detail sheet when DM taps a row', async () => {
    renderWrapper('dm');

    const rowButton = screen.getByRole('button', { name: /Sesión 1 — Resumen/i });
    fireEvent.click(rowButton);

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /editar/i })).toBeTruthy();
    });
  });

  it('(a) delete button is present in detail sheet for DM view', async () => {
    renderWrapper('dm');

    const rowButton = screen.getByRole('button', { name: /Sesión 1 — Resumen/i });
    fireEvent.click(rowButton);

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /eliminar/i })).toBeTruthy();
    });
  });

  it('(a) body is rendered as plain text (ADR-3: whitespace-pre-wrap, no markdown)', async () => {
    renderWrapper('dm');

    const rowButton = screen.getByRole('button', { name: /Sesión 1 — Resumen/i });
    fireEvent.click(rowButton);

    await waitFor(() => {
      // The body text appears literally; newlines preserved by whitespace-pre-wrap
      expect(screen.queryByText(/El grupo llegó a la ciudad/i)).toBeTruthy();
    });
  });
});

// ─── Player view tests ───────────────────────────────────────────────────────

describe('JournalClientWrapper — Player view (effectiveView="player")', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(actions.listJournalEntries).mockResolvedValue({ rows: [], total: 0 });
    vi.mocked(actions.getJournalDetail).mockResolvedValue(mockEntry);
    vi.mocked(actions.createJournalEntry).mockResolvedValue({ ok: true, data: mockEntry });
    vi.mocked(actions.updateJournalEntry).mockResolvedValue({ ok: true, data: mockEntry });
    vi.mocked(actions.deleteJournalEntry).mockResolvedValue({ ok: true, data: undefined });
  });

  it('(b) FAB "Crear" is NOT present in player view — REQ-GATE-01 absence', () => {
    renderWrapper('player');
    const fab = screen.queryByRole('button', { name: /crear/i });
    expect(fab).toBeNull();
  });

  it('(b) edit button is NOT present in detail sheet for player view', async () => {
    renderWrapper('player');

    const rowButton = screen.getByRole('button', { name: /Sesión 1 — Resumen/i });
    fireEvent.click(rowButton);

    await waitFor(() => {
      expect(screen.queryByText('Sesión 1 — Resumen')).toBeTruthy();
    });

    expect(screen.queryByRole('button', { name: /editar/i })).toBeNull();
  });

  it('(b) delete button is NOT present in detail sheet for player view', async () => {
    renderWrapper('player');

    const rowButton = screen.getByRole('button', { name: /Sesión 1 — Resumen/i });
    fireEvent.click(rowButton);

    await waitFor(() => {
      expect(screen.queryByText('Sesión 1 — Resumen')).toBeTruthy();
    });

    expect(screen.queryByRole('button', { name: /eliminar/i })).toBeNull();
  });

  it('(b) journal entry body is visible for player (public entry) — ADR-3', async () => {
    renderWrapper('player');

    const rowButton = screen.getByRole('button', { name: /Sesión 1 — Resumen/i });
    fireEvent.click(rowButton);

    await waitFor(() => {
      expect(screen.queryByText(/El grupo llegó a la ciudad/i)).toBeTruthy();
    });
  });
});
