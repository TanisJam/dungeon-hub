/**
 * HexClientWrapper component tests.
 * REQ-MAP-01, REQ-GATE-01, REQ-GATE-04.
 *
 * Tests:
 *   (a) DM view: FAB present, edit/delete present in sheet, dmNotes present.
 *   (b) Player view: FAB absent, edit/delete absent, dmNotes absent (REQ-GATE-01 absence).
 *   (c) CRITICAL: listPois is NOT called on initial render — lazy only (REQ-MAP-01).
 *   (d) listPois IS called when user expands the accordion.
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
import { HexClientWrapper } from './hex-client-wrapper';
import type { HexRow } from '@/app/mapa/actions';

// WorldEntityShell calls useRouter().refresh() after mutations
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

// ─── Mock Server Actions ─────────────────────────────────────────────────────
// IMPORTANT: vi.mock is hoisted — do NOT reference outer variables inside the factory.

vi.mock('@/app/mapa/actions', () => ({
  listHexes: vi.fn(),
  getHexDetail: vi.fn(),
  createHex: vi.fn(),
  updateHex: vi.fn(),
  deleteHex: vi.fn(),
  listPois: vi.fn(),
  createPoi: vi.fn(),
  updatePoi: vi.fn(),
  deletePoi: vi.fn(),
}));

// ─── Test data (defined AFTER vi.mock) ───────────────────────────────────────

const mockHex: HexRow = {
  id: 'hex-1',
  worldId: 'w-1',
  parentHexId: null,
  scale: null,
  q: 0,
  r: 0,
  worldX: null,
  worldY: null,
  name: 'Valle de las Sombras',
  terrain: 'Bosque oscuro',
  status: 'explored',
  dmNotes: 'Secreto DM: hay una guarida de vampiros aquí.',
  playerNotes: 'Los árboles bloquean el sol.',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function renderWrapper(effectiveView: 'dm' | 'player', hexes: HexRow[] = [mockHex]) {
  return render(
    <HexClientWrapper
      worldId="w-1"
      effectiveView={effectiveView}
      initialHexes={hexes}
    />,
    { baseElement: document.body },
  );
}

// Import the mocked module to set .mockResolvedValue in beforeEach
import * as actions from '@/app/mapa/actions';

// ─── DM view tests ───────────────────────────────────────────────────────────

describe('HexClientWrapper — DM view (effectiveView="dm")', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(actions.listHexes).mockResolvedValue({ rows: [], total: 0 });
    vi.mocked(actions.getHexDetail).mockResolvedValue(mockHex);
    vi.mocked(actions.createHex).mockResolvedValue({ ok: true, data: mockHex });
    vi.mocked(actions.updateHex).mockResolvedValue({ ok: true, data: mockHex });
    vi.mocked(actions.deleteHex).mockResolvedValue({ ok: true, data: undefined });
    vi.mocked(actions.listPois).mockResolvedValue([]);
    vi.mocked(actions.createPoi).mockResolvedValue({ ok: true, data: undefined as never });
    vi.mocked(actions.updatePoi).mockResolvedValue({ ok: true, data: undefined as never });
    vi.mocked(actions.deletePoi).mockResolvedValue({ ok: true, data: undefined });
  });

  it('(a) FAB "Crear" is present in DM view', () => {
    renderWrapper('dm');
    const fab = screen.queryByRole('button', { name: /crear/i });
    expect(fab).toBeTruthy();
  });

  it('(a) edit button is present in detail sheet when DM taps a hex row', async () => {
    renderWrapper('dm');

    const rowButton = screen.getByRole('button', { name: /Valle de las Sombras/i });
    fireEvent.click(rowButton);

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /editar/i })).toBeTruthy();
    });
  });

  it('(a) delete button is present in detail sheet for DM view', async () => {
    renderWrapper('dm');

    const rowButton = screen.getByRole('button', { name: /Valle de las Sombras/i });
    fireEvent.click(rowButton);

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /eliminar/i })).toBeTruthy();
    });
  });

  it('(a) dmNotes are visible in detail sheet for DM view', async () => {
    renderWrapper('dm');

    const rowButton = screen.getByRole('button', { name: /Valle de las Sombras/i });
    fireEvent.click(rowButton);

    await waitFor(() => {
      expect(
        screen.queryByText('Secreto DM: hay una guarida de vampiros aquí.'),
      ).toBeTruthy();
    });
  });
});

// ─── Player view tests ───────────────────────────────────────────────────────

describe('HexClientWrapper — Player view (effectiveView="player")', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(actions.listHexes).mockResolvedValue({ rows: [], total: 0 });
    vi.mocked(actions.getHexDetail).mockResolvedValue(mockHex);
    vi.mocked(actions.createHex).mockResolvedValue({ ok: true, data: mockHex });
    vi.mocked(actions.updateHex).mockResolvedValue({ ok: true, data: mockHex });
    vi.mocked(actions.deleteHex).mockResolvedValue({ ok: true, data: undefined });
    vi.mocked(actions.listPois).mockResolvedValue([]);
  });

  it('(b) FAB "Crear" is NOT present in player view — REQ-GATE-01 absence', () => {
    renderWrapper('player');
    const fab = screen.queryByRole('button', { name: /crear/i });
    expect(fab).toBeNull();
  });

  it('(b) edit button is NOT present in detail sheet for player view', async () => {
    renderWrapper('player');

    const rowButton = screen.getByRole('button', { name: /Valle de las Sombras/i });
    fireEvent.click(rowButton);

    await waitFor(() => {
      expect(screen.queryByText('Valle de las Sombras')).toBeTruthy();
    });

    expect(screen.queryByRole('button', { name: /editar/i })).toBeNull();
  });

  it('(b) delete button is NOT present in detail sheet for player view', async () => {
    renderWrapper('player');

    const rowButton = screen.getByRole('button', { name: /Valle de las Sombras/i });
    fireEvent.click(rowButton);

    await waitFor(() => {
      expect(screen.queryByText('Valle de las Sombras')).toBeTruthy();
    });

    expect(screen.queryByRole('button', { name: /eliminar/i })).toBeNull();
  });

  it('(b) dmNotes are NOT present in detail sheet for player view — REQ-GATE-01 absence', async () => {
    renderWrapper('player');

    const rowButton = screen.getByRole('button', { name: /Valle de las Sombras/i });
    fireEvent.click(rowButton);

    await waitFor(() => {
      expect(screen.queryByText('Valle de las Sombras')).toBeTruthy();
    });

    expect(
      screen.queryByText('Secreto DM: hay una guarida de vampiros aquí.'),
    ).toBeNull();
  });
});

// ─── Lazy POI tests (CRITICAL) ───────────────────────────────────────────────
//
// Architecture: PoiAccordion is rendered inside the hex detail sheet (V3Sheet),
// NOT inline in the list row. This avoids the HTML spec violation of nesting
// <button> inside <button> (WorldEntityShell wraps rows in <button>).
// The design spec allows "hex row OR the hex detail sheet" — we use the sheet.
//
// The critical N+1 assertion: listPois must NOT be called on initial page render
// (the hex list), AND also not when the detail sheet first opens (that's just the
// hex detail fetch). listPois fires ONLY when the user explicitly expands the
// PoiAccordion toggle inside the detail sheet.

describe('HexClientWrapper — Lazy POI accordion (REQ-MAP-01)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(actions.listHexes).mockResolvedValue({ rows: [], total: 0 });
    vi.mocked(actions.getHexDetail).mockResolvedValue(mockHex);
    vi.mocked(actions.listPois).mockResolvedValue([]);
  });

  it('(c) CRITICAL: listPois is NOT called on initial render — no N+1 at page load', () => {
    renderWrapper('dm');
    // After render, listPois must not have been called yet
    expect(vi.mocked(actions.listPois)).not.toHaveBeenCalled();
  });

  it('(c) listPois is NOT called on initial render in player view either', () => {
    renderWrapper('player');
    expect(vi.mocked(actions.listPois)).not.toHaveBeenCalled();
  });

  it('(c) listPois is NOT called when the detail sheet opens — only on accordion expand', async () => {
    renderWrapper('dm');

    // Open detail sheet by clicking the hex row
    const rowButton = screen.getByRole('button', { name: /Valle de las Sombras/i });
    fireEvent.click(rowButton);

    // Wait for detail to load (getHexDetail is called, not listPois)
    await waitFor(() => {
      expect(vi.mocked(actions.getHexDetail)).toHaveBeenCalledWith('hex-1');
    });

    // listPois must still NOT have been called
    expect(vi.mocked(actions.listPois)).not.toHaveBeenCalled();
  });

  it('(d) listPois IS called when DM expands the POI accordion in the detail sheet', async () => {
    renderWrapper('dm');

    // Open detail sheet
    const rowButton = screen.getByRole('button', { name: /Valle de las Sombras/i });
    fireEvent.click(rowButton);

    // Wait for detail sheet to render with the POI accordion
    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: /ver puntos de interés/i }),
      ).toBeTruthy();
    });

    // listPois must still NOT have been called (accordion not yet expanded)
    expect(vi.mocked(actions.listPois)).not.toHaveBeenCalled();

    // Now expand the accordion
    const accordionBtn = screen.getByRole('button', { name: /ver puntos de interés/i });
    fireEvent.click(accordionBtn);

    // After expand, listPois must be called with the hex id
    await waitFor(() => {
      expect(vi.mocked(actions.listPois)).toHaveBeenCalledWith('hex-1');
    });
  });
});
