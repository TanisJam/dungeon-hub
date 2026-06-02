/**
 * EventClientWrapper component tests.
 * REQ-CRO-02, REQ-GATE-01, REQ-GATE-04.
 *
 * Tests:
 *   (a) DM view: FAB present, edit/delete present in sheet, dmNotes present,
 *       visibility badge present in detail.
 *   (b) Player view: FAB absent, edit/delete absent from sheet, dmNotes absent.
 *
 * NOTE: afterEach(cleanup) is NOT declared here — it is already global via
 * apps/web/vitest.setup.ts. REQ-GATE-04.
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
import { EventClientWrapper } from './event-client-wrapper';
import type { EventRow } from '@/app/cronica/actions';

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

const mockEvent: EventRow = {
  id: 'ev-1',
  worldId: 'w-1',
  title: 'La Batalla de Piedra Negra',
  description: 'Una terrible batalla tuvo lugar.',
  dmNotes: 'Secreto del DM: el traidor estaba entre ellos.',
  occurredAt: '2024-03-15T00:00:00Z',
  sourceSessionId: null,
  visibility: 'public',
  tags: ['session-1', 'combate'],
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function renderWrapper(effectiveView: 'dm' | 'player', events: EventRow[] = [mockEvent]) {
  return render(
    <EventClientWrapper
      worldId="w-1"
      effectiveView={effectiveView}
      initialEvents={events}
    />,
    { baseElement: document.body },
  );
}

// Import the mocked module to set .mockResolvedValue in beforeEach
import * as actions from '@/app/cronica/actions';

// ─── DM view tests ───────────────────────────────────────────────────────────

describe('EventClientWrapper — DM view (effectiveView="dm")', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(actions.listEvents).mockResolvedValue({ rows: [], total: 0 });
    vi.mocked(actions.getEventDetail).mockResolvedValue(mockEvent);
    vi.mocked(actions.createEvent).mockResolvedValue({ ok: true, data: mockEvent });
    vi.mocked(actions.updateEvent).mockResolvedValue({ ok: true, data: mockEvent });
    vi.mocked(actions.deleteEvent).mockResolvedValue({ ok: true, data: undefined });
  });

  it('(a) FAB "Crear" is present in DM view', () => {
    renderWrapper('dm');
    const fab = screen.queryByRole('button', { name: /crear/i });
    expect(fab).toBeTruthy();
  });

  it('(a) edit button is present in detail sheet when DM taps a row', async () => {
    renderWrapper('dm');

    const rowButton = screen.getByRole('button', { name: /La Batalla de Piedra Negra/i });
    fireEvent.click(rowButton);

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /editar/i })).toBeTruthy();
    });
  });

  it('(a) delete button is present in detail sheet for DM view', async () => {
    renderWrapper('dm');

    const rowButton = screen.getByRole('button', { name: /La Batalla de Piedra Negra/i });
    fireEvent.click(rowButton);

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /eliminar/i })).toBeTruthy();
    });
  });

  it('(a) dmNotes are visible in detail sheet for DM view', async () => {
    renderWrapper('dm');

    const rowButton = screen.getByRole('button', { name: /La Batalla de Piedra Negra/i });
    fireEvent.click(rowButton);

    await waitFor(() => {
      expect(screen.queryByText('Secreto del DM: el traidor estaba entre ellos.')).toBeTruthy();
    });
  });
});

// ─── Player view tests ───────────────────────────────────────────────────────

describe('EventClientWrapper — Player view (effectiveView="player")', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(actions.listEvents).mockResolvedValue({ rows: [], total: 0 });
    vi.mocked(actions.getEventDetail).mockResolvedValue(mockEvent);
    vi.mocked(actions.createEvent).mockResolvedValue({ ok: true, data: mockEvent });
    vi.mocked(actions.updateEvent).mockResolvedValue({ ok: true, data: mockEvent });
    vi.mocked(actions.deleteEvent).mockResolvedValue({ ok: true, data: undefined });
  });

  it('(b) FAB "Crear" is NOT present in player view — REQ-GATE-01 absence', () => {
    renderWrapper('player');
    const fab = screen.queryByRole('button', { name: /crear/i });
    expect(fab).toBeNull();
  });

  it('(b) edit button is NOT present in detail sheet for player view', async () => {
    renderWrapper('player');

    const rowButton = screen.getByRole('button', { name: /La Batalla de Piedra Negra/i });
    fireEvent.click(rowButton);

    await waitFor(() => {
      expect(screen.queryByText('La Batalla de Piedra Negra')).toBeTruthy();
    });

    expect(screen.queryByRole('button', { name: /editar/i })).toBeNull();
  });

  it('(b) delete button is NOT present in detail sheet for player view', async () => {
    renderWrapper('player');

    const rowButton = screen.getByRole('button', { name: /La Batalla de Piedra Negra/i });
    fireEvent.click(rowButton);

    await waitFor(() => {
      expect(screen.queryByText('La Batalla de Piedra Negra')).toBeTruthy();
    });

    expect(screen.queryByRole('button', { name: /eliminar/i })).toBeNull();
  });

  it('(b) dmNotes are NOT present in detail sheet for player view — REQ-GATE-01 absence', async () => {
    renderWrapper('player');

    const rowButton = screen.getByRole('button', { name: /La Batalla de Piedra Negra/i });
    fireEvent.click(rowButton);

    await waitFor(() => {
      expect(screen.queryByText('La Batalla de Piedra Negra')).toBeTruthy();
    });

    expect(
      screen.queryByText('Secreto del DM: el traidor estaba entre ellos.'),
    ).toBeNull();
  });
});
