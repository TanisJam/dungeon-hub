'use client';

/**
 * FactionClientWrapperIsland — catalog demo of the REAL FactionClientWrapper.
 *
 * Passes a stub actions bundle so the component never fires real server actions.
 * list* resolves fixture data (~300ms). create/update/delete resolve success shapes
 * (~400ms). DM view shown. INTERACTIVE — search, tap row → detail sheet, FAB →
 * create form. All mutations are stubs.
 *
 * REQ-FAC-01, REQ-FAC-03, REQ-GATE-01.
 */

import { FactionClientWrapper } from '@/components/world/factions/faction-client-wrapper';
import type { FactionWrapperActions } from '@/components/world/factions/faction-client-wrapper';
import type { FactionRow, SearchResult } from '@/app/herramientas/actions';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FIXTURE_FACTIONS: FactionRow[] = [
  {
    id: 'fac-order',
    worldId: 'world-barovia',
    name: 'La Orden del Cuervo',
    state: 'active',
    description: 'Un grupo secreto de cazadores de no-muertos que operan desde las sombras del bosque.',
    dmNotes: 'Conocen la ubicación de la tumba de Sergei von Zarovich.',
    createdAt: '2024-01-10T00:00:00.000Z',
    updatedAt: '2024-05-01T00:00:00.000Z',
  },
  {
    id: 'fac-vistani',
    worldId: 'world-barovia',
    name: 'Los Vistani',
    state: 'active',
    description: 'Nómadas que pueden viajar libremente a través de las nieblas. Sirven a Strahd a su manera.',
    dmNotes: 'Madame Eva tiene una lectura de tarot pendiente para los personajes.',
    createdAt: '2024-01-10T00:00:00.000Z',
    updatedAt: '2024-04-22T00:00:00.000Z',
  },
  {
    id: 'fac-guard',
    worldId: 'world-barovia',
    name: 'La Guardia de Vallaki',
    state: 'dormant',
    description: 'Guardias del Burgomaestre Vargas Vallakovich. Lealtad dudosa.',
    dmNotes: null,
    createdAt: '2024-02-01T00:00:00.000Z',
    updatedAt: '2024-02-01T00:00:00.000Z',
  },
];

// ---------------------------------------------------------------------------
// Stub actions
// ---------------------------------------------------------------------------

const STUB_FACTION_ACTIONS: FactionWrapperActions = {
  async listFactions(_worldId, q, _offset): Promise<SearchResult> {
    await new Promise((r) => setTimeout(r, 300));
    const rows = q?.trim()
      ? FIXTURE_FACTIONS.filter((f) => f.name.toLowerCase().includes(q.trim().toLowerCase()))
      : FIXTURE_FACTIONS;
    return { rows, total: rows.length };
  },

  async getFactionDetail(factionId) {
    await new Promise((r) => setTimeout(r, 300));
    return FIXTURE_FACTIONS.find((f) => f.id === factionId) ?? null;
  },

  async createFaction(_worldId, body) {
    await new Promise((r) => setTimeout(r, 400));
    const created: FactionRow = {
      id: `fac-new-${Date.now()}`,
      worldId: _worldId,
      name: body.name,
      state: body.state ?? 'active',
      description: body.description ?? null,
      dmNotes: body.dmNotes ?? null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    return { ok: true as const, data: created };
  },

  async updateFaction(factionId, body) {
    await new Promise((r) => setTimeout(r, 400));
    const existing = FIXTURE_FACTIONS.find((f) => f.id === factionId);
    if (!existing) return { ok: false as const, error: 'Facción no encontrada' };
    return { ok: true as const, data: { ...existing, ...body, updatedAt: new Date().toISOString() } };
  },

  async deleteFaction(_factionId) {
    await new Promise((r) => setTimeout(r, 400));
    return { ok: true as const, data: undefined };
  },
};

// ---------------------------------------------------------------------------
// Island
// ---------------------------------------------------------------------------

export function FactionClientWrapperIsland() {
  return (
    <FactionClientWrapper
      worldId="world-barovia"
      effectiveView="dm"
      initialFactions={FIXTURE_FACTIONS}
      actions={STUB_FACTION_ACTIONS}
    />
  );
}
