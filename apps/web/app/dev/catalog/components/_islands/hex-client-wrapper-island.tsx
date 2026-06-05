'use client';

/**
 * HexClientWrapperIsland — catalog demo of the REAL HexClientWrapper.
 *
 * Passes a stub actions bundle so the component never fires real server actions.
 * listHexes resolves fixture data (~300ms). getHexDetail resolves a fixture hex
 * (~300ms). listPois is lazy — resolves only on accordion expand (~300ms).
 * create/update/delete resolve success shapes (~400ms). DM view shown.
 *
 * INTERACTIVE — search, tap row → detail sheet (includes PoiAccordion — expand to
 * load fixture POIs), FAB → create form, ← Ver mapa button (router.push stub in
 * next/navigation). All mutations are stubs.
 *
 * REQ-MAP-01, REQ-GATE-01.
 */

import { HexClientWrapper } from '@/components/world/map/hex-client-wrapper';
import type { HexWrapperActions } from '@/components/world/map/hex-client-wrapper';
import type { HexRow, HexSearchResult, PoiRow } from '@/app/mapa/actions';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FIXTURE_HEXES: HexRow[] = [
  {
    id: 'hex-svalich',
    worldId: 'world-barovia',
    parentHexId: null,
    scale: 'region',
    q: 3,
    r: -2,
    worldX: 320,
    worldY: 180,
    name: 'Bosque de Svalich',
    terrain: 'forest',
    status: 'explored',
    dmNotes: 'Un lobo fantasmal patrulla estos bosques de noche.',
    playerNotes: 'Vimos huellas de lobo enormes cerca del río.',
    createdAt: '2024-09-12T00:00:00.000Z',
    updatedAt: '2024-10-05T00:00:00.000Z',
  },
  {
    id: 'hex-village',
    worldId: 'world-barovia',
    parentHexId: null,
    scale: 'region',
    q: 0,
    r: 0,
    worldX: 240,
    worldY: 200,
    name: 'Pueblo de Barovia',
    terrain: 'settlement',
    status: 'explored',
    dmNotes: null,
    playerNotes: 'Los aldeanos se niegan a hablar sobre el Castillo.',
    createdAt: '2024-09-10T00:00:00.000Z',
    updatedAt: '2024-10-01T00:00:00.000Z',
  },
  {
    id: 'hex-castle',
    worldId: 'world-barovia',
    parentHexId: null,
    scale: 'region',
    q: 5,
    r: -4,
    worldX: 400,
    worldY: 120,
    name: 'Castillo Ravenloft',
    terrain: 'ruins',
    status: 'rumored',
    dmNotes: 'La cámara de Strahd está en la torre más alta.',
    playerNotes: null,
    createdAt: '2024-09-10T00:00:00.000Z',
    updatedAt: '2024-09-10T00:00:00.000Z',
  },
];

const FIXTURE_POIS: PoiRow[] = [
  {
    id: 'poi-ruins',
    hexId: 'hex-svalich',
    worldId: 'world-barovia',
    name: 'Ruinas del Templo',
    description: 'Antiguo templo devorado por la niebla. Piedras cubiertas de musgo rúnico.',
    dmNotes: 'Aquí yace el grimorio de Strahd (encuentro opcional).',
    status: 'discovered',
    worldX: 310,
    worldY: 175,
    createdAt: '2024-09-15T00:00:00.000Z',
    updatedAt: '2024-10-01T00:00:00.000Z',
  },
  {
    id: 'poi-camp',
    hexId: 'hex-svalich',
    worldId: 'world-barovia',
    name: 'Campamento Vistani',
    description: 'Un grupo de Vistani acampando junto a la hoguera.',
    dmNotes: null,
    status: 'discovered',
    worldX: null,
    worldY: null,
    createdAt: '2024-09-20T00:00:00.000Z',
    updatedAt: '2024-09-20T00:00:00.000Z',
  },
];

// ---------------------------------------------------------------------------
// Stub actions
// ---------------------------------------------------------------------------

const STUB_HEX_ACTIONS: HexWrapperActions = {
  async listHexes(_worldId, q, _offset): Promise<HexSearchResult> {
    await new Promise((r) => setTimeout(r, 300));
    const rows = q?.trim()
      ? FIXTURE_HEXES.filter((h) => h.name?.toLowerCase().includes(q.trim().toLowerCase()))
      : FIXTURE_HEXES;
    return { rows, total: rows.length };
  },

  async getHexDetail(hexId) {
    await new Promise((r) => setTimeout(r, 300));
    return FIXTURE_HEXES.find((h) => h.id === hexId) ?? null;
  },

  async createHex(_worldId, body) {
    await new Promise((r) => setTimeout(r, 400));
    const created: HexRow = {
      id: `hex-new-${Date.now()}`,
      worldId: _worldId,
      parentHexId: body.parentHexId ?? null,
      scale: body.scale ?? null,
      q: body.q,
      r: body.r,
      worldX: null,
      worldY: null,
      name: body.name ?? null,
      terrain: body.terrain ?? null,
      status: body.status ?? 'unexplored',
      dmNotes: body.dmNotes ?? null,
      playerNotes: body.playerNotes ?? null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    return { ok: true as const, data: created };
  },

  async updateHex(hexId, body) {
    await new Promise((r) => setTimeout(r, 400));
    const existing = FIXTURE_HEXES.find((h) => h.id === hexId);
    if (!existing) return { ok: false as const, error: 'Hex no encontrado' };
    return { ok: true as const, data: { ...existing, ...body, updatedAt: new Date().toISOString() } };
  },

  async deleteHex(_hexId) {
    await new Promise((r) => setTimeout(r, 400));
    return { ok: true as const, data: undefined };
  },

  // Lazy — only called on accordion expand (REQ-MAP-01)
  async listPois(_hexId) {
    await new Promise((r) => setTimeout(r, 300));
    return FIXTURE_POIS;
  },

  async createPoi(_hexId, body) {
    await new Promise((r) => setTimeout(r, 400));
    const created: PoiRow = {
      id: `poi-new-${Date.now()}`,
      hexId: _hexId,
      worldId: 'world-barovia',
      name: body.name,
      description: body.description ?? null,
      dmNotes: body.dmNotes ?? null,
      status: body.status ?? 'unknown',
      worldX: body.worldX ?? null,
      worldY: body.worldY ?? null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    return { ok: true as const, data: created };
  },

  async updatePoi(poiId, body) {
    await new Promise((r) => setTimeout(r, 400));
    const existing = FIXTURE_POIS.find((p) => p.id === poiId);
    if (!existing) return { ok: false as const, error: 'POI no encontrado' };
    return { ok: true as const, data: { ...existing, ...body, updatedAt: new Date().toISOString() } };
  },

  async deletePoi(_poiId) {
    await new Promise((r) => setTimeout(r, 400));
    return { ok: true as const, data: undefined };
  },
};

// ---------------------------------------------------------------------------
// Island
// ---------------------------------------------------------------------------

export function HexClientWrapperIsland() {
  return (
    <HexClientWrapper
      worldId="world-barovia"
      effectiveView="dm"
      initialHexes={FIXTURE_HEXES}
      actions={STUB_HEX_ACTIONS}
    />
  );
}
