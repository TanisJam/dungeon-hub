/**
 * NpcClientWrapper component tests.
 * REQ-NPC-01, REQ-NPC-02, REQ-GATE-01, REQ-GATE-04.
 *
 * Tests:
 *   (a) DM view: FAB present, edit/delete present in sheet, dmNotes present,
 *       faction chip detach control present, "+" chip-add button present.
 *   (b) Player view: FAB absent, edit/delete absent from sheet, dmNotes absent,
 *       faction chip +/× controls absent (read-only chips).
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
import { NpcClientWrapper } from './npc-client-wrapper';
import type { NpcRow, FactionRow } from '@/app/herramientas/actions';

// WorldEntityShell calls useRouter().refresh() after mutations
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

// ─── Mock Server Actions ─────────────────────────────────────────────────────
// IMPORTANT: vi.mock is hoisted — do NOT reference outer variables (mockNpcRow etc.)
// inside the factory. Use vi.fn() and set .mockResolvedValue in beforeEach.

vi.mock('@/app/herramientas/actions', () => ({
  listNpcs: vi.fn(),
  getNpcDetail: vi.fn(),
  createNpc: vi.fn(),
  updateNpc: vi.fn(),
  deleteNpc: vi.fn(),
  attachNpcFaction: vi.fn(),
  detachNpcFaction: vi.fn(),
}));

// ─── Test data (defined AFTER vi.mock) ───────────────────────────────────────

const mockNpcRow: NpcRow = {
  id: 'npc-1',
  worldId: 'w-1',
  name: 'Varis Sombraluz',
  race: 'Elfo',
  description: 'Un elfo misterioso.',
  dmNotes: 'Secreto del DM: trabaja para el villano.',
  hexId: null,
  status: 'alive',
  worldX: null,
  worldY: null,
  factions: [
    {
      id: 'f-1',
      worldId: 'w-1',
      name: 'Los Cazadores',
      state: 'active',
      description: null,
    },
  ],
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

const mockWorldFaction: FactionRow = {
  id: 'f-2',
  worldId: 'w-1',
  name: 'El Concilio',
  state: 'active',
  description: null,
  dmNotes: null,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function renderWrapper(
  effectiveView: 'dm' | 'player',
  npcs: NpcRow[] = [mockNpcRow],
  worldFactions: FactionRow[] = [mockWorldFaction],
) {
  return render(
    <NpcClientWrapper
      worldId="w-1"
      effectiveView={effectiveView}
      initialNpcs={npcs}
      worldFactions={worldFactions}
    />,
    { baseElement: document.body },
  );
}

// Import the mocked module to set .mockResolvedValue in beforeEach
import * as actions from '@/app/herramientas/actions';

// ─── DM view tests ───────────────────────────────────────────────────────────

describe('NpcClientWrapper — DM view (effectiveView="dm")', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(actions.listNpcs).mockResolvedValue({ rows: [], total: 0 });
    vi.mocked(actions.getNpcDetail).mockResolvedValue(mockNpcRow);
    vi.mocked(actions.createNpc).mockResolvedValue({ ok: true, data: mockNpcRow });
    vi.mocked(actions.updateNpc).mockResolvedValue({ ok: true, data: mockNpcRow });
    vi.mocked(actions.deleteNpc).mockResolvedValue({ ok: true, data: undefined });
    vi.mocked(actions.attachNpcFaction).mockResolvedValue({ ok: true, data: undefined });
    vi.mocked(actions.detachNpcFaction).mockResolvedValue({ ok: true, data: undefined });
  });

  it('(a) FAB "Crear" is present in DM view', () => {
    renderWrapper('dm');
    const fab = screen.queryByRole('button', { name: /crear/i });
    expect(fab).toBeTruthy();
  });

  it('(a) edit button is present in detail sheet when DM taps a row', async () => {
    renderWrapper('dm');

    const rowButton = screen.getByRole('button', { name: /Varis Sombraluz/i });
    fireEvent.click(rowButton);

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /editar/i })).toBeTruthy();
    });
  });

  it('(a) delete button is present in detail sheet for DM view', async () => {
    renderWrapper('dm');

    const rowButton = screen.getByRole('button', { name: /Varis Sombraluz/i });
    fireEvent.click(rowButton);

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /eliminar/i })).toBeTruthy();
    });
  });

  it('(a) dmNotes are visible in detail sheet for DM view', async () => {
    renderWrapper('dm');

    const rowButton = screen.getByRole('button', { name: /Varis Sombraluz/i });
    fireEvent.click(rowButton);

    await waitFor(() => {
      expect(screen.queryByText('Secreto del DM: trabaja para el villano.')).toBeTruthy();
    });
  });

  it('(a) faction chip detach control (×) is present in DM view', async () => {
    renderWrapper('dm');

    const rowButton = screen.getByRole('button', { name: /Varis Sombraluz/i });
    fireEvent.click(rowButton);

    await waitFor(() => {
      // Detach button for "Los Cazadores" chip — DM-only
      expect(screen.queryByRole('button', { name: /Desvincular Los Cazadores/i })).toBeTruthy();
    });
  });

  it('(a) faction chip "+" add button is present in DM view when world factions available', async () => {
    renderWrapper('dm');

    const rowButton = screen.getByRole('button', { name: /Varis Sombraluz/i });
    fireEvent.click(rowButton);

    await waitFor(() => {
      // The "+" picker button — visible when there are unattached world factions
      expect(screen.queryByRole('button', { name: /añadir facción/i })).toBeTruthy();
    });
  });
});

// ─── Injected actions path ───────────────────────────────────────────────────

describe('NpcClientWrapper — injected actions (DI path)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders with stub actions bundle: getNpcDetail stub is called on row tap, real module action is NOT called', async () => {
    const stubGetNpcDetail = vi.fn().mockResolvedValue(mockNpcRow);
    const stubListNpcs = vi.fn().mockResolvedValue({ rows: [mockNpcRow], total: 1 });
    const stubCreateNpc = vi.fn().mockResolvedValue({ ok: true, data: mockNpcRow });
    const stubUpdateNpc = vi.fn().mockResolvedValue({ ok: true, data: mockNpcRow });
    const stubDeleteNpc = vi.fn().mockResolvedValue({ ok: true, data: undefined });
    const stubAttachNpcFaction = vi.fn().mockResolvedValue({ ok: true, data: undefined });
    const stubDetachNpcFaction = vi.fn().mockResolvedValue({ ok: true, data: undefined });

    render(
      <NpcClientWrapper
        worldId="w-stub"
        effectiveView="dm"
        initialNpcs={[mockNpcRow]}
        worldFactions={[mockWorldFaction]}
        actions={{
          listNpcs: stubListNpcs,
          getNpcDetail: stubGetNpcDetail,
          createNpc: stubCreateNpc,
          updateNpc: stubUpdateNpc,
          deleteNpc: stubDeleteNpc,
          attachNpcFaction: stubAttachNpcFaction,
          detachNpcFaction: stubDetachNpcFaction,
        }}
      />,
      { baseElement: document.body },
    );

    const rowButton = screen.getByRole('button', { name: /Varis Sombraluz/i });
    fireEvent.click(rowButton);

    await waitFor(() => {
      expect(stubGetNpcDetail).toHaveBeenCalledWith('npc-1');
    });

    // Real module actions must NOT have been called — stub was used instead
    expect(vi.mocked(actions.getNpcDetail)).not.toHaveBeenCalled();
    expect(vi.mocked(actions.listNpcs)).not.toHaveBeenCalled();
  });
});

// ─── Player view tests ───────────────────────────────────────────────────────

describe('NpcClientWrapper — Player view (effectiveView="player")', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(actions.listNpcs).mockResolvedValue({ rows: [], total: 0 });
    vi.mocked(actions.getNpcDetail).mockResolvedValue(mockNpcRow);
    vi.mocked(actions.createNpc).mockResolvedValue({ ok: true, data: mockNpcRow });
    vi.mocked(actions.updateNpc).mockResolvedValue({ ok: true, data: mockNpcRow });
    vi.mocked(actions.deleteNpc).mockResolvedValue({ ok: true, data: undefined });
    vi.mocked(actions.attachNpcFaction).mockResolvedValue({ ok: true, data: undefined });
    vi.mocked(actions.detachNpcFaction).mockResolvedValue({ ok: true, data: undefined });
  });

  it('(b) FAB "Crear" is NOT present in player view — REQ-GATE-01 absence', () => {
    renderWrapper('player');
    const fab = screen.queryByRole('button', { name: /crear/i });
    expect(fab).toBeNull();
  });

  it('(b) edit button is NOT present in detail sheet for player view', async () => {
    renderWrapper('player');

    const rowButton = screen.getByRole('button', { name: /Varis Sombraluz/i });
    fireEvent.click(rowButton);

    await waitFor(() => {
      expect(screen.queryByText('Varis Sombraluz')).toBeTruthy();
    });

    expect(screen.queryByRole('button', { name: /editar/i })).toBeNull();
  });

  it('(b) delete button is NOT present in detail sheet for player view', async () => {
    renderWrapper('player');

    const rowButton = screen.getByRole('button', { name: /Varis Sombraluz/i });
    fireEvent.click(rowButton);

    await waitFor(() => {
      expect(screen.queryByText('Varis Sombraluz')).toBeTruthy();
    });

    expect(screen.queryByRole('button', { name: /eliminar/i })).toBeNull();
  });

  it('(b) dmNotes are NOT present in detail sheet for player view — REQ-GATE-01 absence', async () => {
    renderWrapper('player');

    const rowButton = screen.getByRole('button', { name: /Varis Sombraluz/i });
    fireEvent.click(rowButton);

    await waitFor(() => {
      expect(screen.queryByText('Varis Sombraluz')).toBeTruthy();
    });

    expect(
      screen.queryByText('Secreto del DM: trabaja para el villano.'),
    ).toBeNull();
  });

  it('(b) faction chip detach control (×) is NOT present in player view — REQ-NPC-02 + REQ-GATE-01', async () => {
    renderWrapper('player');

    const rowButton = screen.getByRole('button', { name: /Varis Sombraluz/i });
    fireEvent.click(rowButton);

    await waitFor(() => {
      expect(screen.queryByText('Varis Sombraluz')).toBeTruthy();
    });

    expect(screen.queryByRole('button', { name: /Desvincular Los Cazadores/i })).toBeNull();
  });

  it('(b) faction chip "+" add button is NOT present in player view — REQ-NPC-02 + REQ-GATE-01', async () => {
    renderWrapper('player');

    const rowButton = screen.getByRole('button', { name: /Varis Sombraluz/i });
    fireEvent.click(rowButton);

    await waitFor(() => {
      expect(screen.queryByText('Varis Sombraluz')).toBeTruthy();
    });

    expect(screen.queryByRole('button', { name: /añadir facción/i })).toBeNull();
  });

  it('(b) faction chips render as read-only names in player view', async () => {
    renderWrapper('player');

    const rowButton = screen.getByRole('button', { name: /Varis Sombraluz/i });
    fireEvent.click(rowButton);

    await waitFor(() => {
      // Faction name chip should still be visible (read-only in player view)
      expect(screen.queryByText('Los Cazadores')).toBeTruthy();
    });
  });
});
