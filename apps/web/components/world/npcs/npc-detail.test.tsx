/**
 * NpcDetailView component tests.
 * REQ-NPC-02, REQ-GATE-01, REQ-GATE-04.
 *
 * Tests:
 *   (a) DM view: dmNotes visible, faction chip detach control present.
 *   (b) Player view: dmNotes absent, faction chip controls absent.
 *   (c) Injected actions path: stub getNpcDetail/attachNpcFaction/detachNpcFaction
 *       are used instead of real module actions.
 *
 * NOTE: afterEach(cleanup) is NOT declared here — it is already global via
 * apps/web/vitest.setup.ts. REQ-GATE-04.
 *
 * Mocking strategy: Server Actions mocked via vi.mock.
 * IMPORTANT: vi.mock factory is hoisted — never reference outer variables inside it.
 *
 * Assertion style: uses .toBeTruthy() / .toBeNull() (no @testing-library/jest-dom).
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { NpcDetailView } from './npc-detail';
import type { NpcRow, FactionRow } from '@/app/herramientas/actions';

vi.mock('@/app/herramientas/actions', () => ({
  getNpcDetail: vi.fn(),
  attachNpcFaction: vi.fn(),
  detachNpcFaction: vi.fn(),
  // Other codex exports used elsewhere
  listNpcs: vi.fn(),
  createNpc: vi.fn(),
  updateNpc: vi.fn(),
  deleteNpc: vi.fn(),
  listFactions: vi.fn(),
  getFactionDetail: vi.fn(),
  createFaction: vi.fn(),
  updateFaction: vi.fn(),
  deleteFaction: vi.fn(),
}));

// ─── Test data ───────────────────────────────────────────────────────────────

const mockNpcRow: NpcRow = {
  id: 'npc-detail-1',
  worldId: 'w-1',
  name: 'Ireena Kolyana',
  race: 'Humana',
  description: 'Una joven noble de Barovia.',
  dmNotes: 'Secreto: lleva la marca de Strahd.',
  hexId: null,
  status: 'alive',
  worldX: null,
  worldY: null,
  factions: [
    {
      id: 'f-1',
      worldId: 'w-1',
      name: 'Los Aldeanos',
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
  name: 'El Orden del Cuervo',
  state: 'active',
  description: null,
  dmNotes: null,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

import * as actions from '@/app/herramientas/actions';

// ─── DM view tests ───────────────────────────────────────────────────────────

describe('NpcDetailView — DM view (effectiveView="dm")', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('(a) dmNotes are visible in DM view — REQ-GATE-01', () => {
    render(
      <NpcDetailView
        detail={mockNpcRow}
        effectiveView="dm"
        worldId="w-1"
        worldFactions={[mockWorldFaction]}
      />,
      { baseElement: document.body },
    );

    expect(screen.queryByText('Secreto: lleva la marca de Strahd.')).toBeTruthy();
  });

  it('(a) faction chip detach control (×) is present in DM view — REQ-NPC-02', () => {
    render(
      <NpcDetailView
        detail={mockNpcRow}
        effectiveView="dm"
        worldId="w-1"
        worldFactions={[mockWorldFaction]}
      />,
      { baseElement: document.body },
    );

    expect(screen.queryByRole('button', { name: /Desvincular Los Aldeanos/i })).toBeTruthy();
  });
});

// ─── Player view tests ───────────────────────────────────────────────────────

describe('NpcDetailView — Player view (effectiveView="player")', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('(b) dmNotes are NOT present in player view — REQ-GATE-01 absence', () => {
    render(
      <NpcDetailView
        detail={mockNpcRow}
        effectiveView="player"
        worldId="w-1"
        worldFactions={[mockWorldFaction]}
      />,
      { baseElement: document.body },
    );

    expect(screen.queryByText('Secreto: lleva la marca de Strahd.')).toBeNull();
  });

  it('(b) faction chip detach control is NOT present in player view — REQ-NPC-02 + REQ-GATE-01', () => {
    render(
      <NpcDetailView
        detail={mockNpcRow}
        effectiveView="player"
        worldId="w-1"
        worldFactions={[mockWorldFaction]}
      />,
      { baseElement: document.body },
    );

    expect(screen.queryByRole('button', { name: /Desvincular Los Aldeanos/i })).toBeNull();
  });
});

// ─── Injected actions path ───────────────────────────────────────────────────

describe('NpcDetailView — injected actions (DI path)', () => {
  it('(c) stub getNpcDetail is called after attach; real module action is NOT called', async () => {
    const stubNpcRow: NpcRow = { ...mockNpcRow, factions: [] };
    const stubGetNpcDetail = vi.fn().mockResolvedValue(stubNpcRow);
    const stubAttachNpcFaction = vi.fn().mockResolvedValue({ ok: true, data: undefined });
    const stubDetachNpcFaction = vi.fn().mockResolvedValue({ ok: true, data: undefined });

    vi.clearAllMocks();

    render(
      <NpcDetailView
        detail={mockNpcRow}
        effectiveView="dm"
        worldId="w-stub"
        worldFactions={[mockWorldFaction]}
        actions={{
          getNpcDetail: stubGetNpcDetail,
          attachNpcFaction: stubAttachNpcFaction,
          detachNpcFaction: stubDetachNpcFaction,
        }}
      />,
      { baseElement: document.body },
    );

    // Trigger detach on existing faction
    const detachBtn = screen.getByRole('button', { name: /Desvincular Los Aldeanos/i });
    detachBtn.click();

    await waitFor(() => {
      expect(stubDetachNpcFaction).toHaveBeenCalledWith('w-stub', 'npc-detail-1', 'f-1');
      // After detach, getNpcDetail is called to refresh
      expect(stubGetNpcDetail).toHaveBeenCalledWith('npc-detail-1');
    });

    // Real module actions must NOT have been called
    expect(vi.mocked(actions.detachNpcFaction)).not.toHaveBeenCalled();
    expect(vi.mocked(actions.getNpcDetail)).not.toHaveBeenCalled();
  });
});
