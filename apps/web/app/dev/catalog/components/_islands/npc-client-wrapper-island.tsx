'use client';

/**
 * NpcClientWrapperIsland — catalog demo of the REAL NpcClientWrapper.
 *
 * Passes a stub actions bundle so the component never fires real server actions.
 * NpcClientWrapper threads the getNpcDetail/attachNpcFaction/detachNpcFaction subset
 * down into NpcDetailView automatically via the composition threading in the wrapper.
 *
 * list* resolves fixture data (~300ms). create/update/delete resolve success shapes
 * (~400ms). attach/detach stubs return success. DM view shown.
 *
 * INTERACTIVE — search, tap row → detail sheet (faction chip attach/detach stubs),
 * FAB → create form. All mutations are stubs.
 *
 * REQ-NPC-01, REQ-NPC-02, REQ-GATE-01.
 */

import { NpcClientWrapper } from '@/components/world/npcs/npc-client-wrapper';
import type { NpcWrapperActions } from '@/components/world/npcs/npc-client-wrapper';
import type { NpcRow, NpcSearchResult, FactionRow } from '@/app/codex/actions';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FIXTURE_FACTIONS: FactionRow[] = [
  {
    id: 'fac-order',
    worldId: 'world-barovia',
    name: 'La Orden del Cuervo',
    state: 'active',
    description: 'Cazadores de no-muertos.',
    dmNotes: null,
    createdAt: '2024-01-10T00:00:00.000Z',
    updatedAt: '2024-01-10T00:00:00.000Z',
  },
  {
    id: 'fac-vistani',
    worldId: 'world-barovia',
    name: 'Los Vistani',
    state: 'active',
    description: 'Nómadas libres de la niebla.',
    dmNotes: null,
    createdAt: '2024-01-10T00:00:00.000Z',
    updatedAt: '2024-01-10T00:00:00.000Z',
  },
];

const FIXTURE_NPCS: NpcRow[] = [
  {
    id: 'npc-ireena',
    worldId: 'world-barovia',
    name: 'Ireena Kolyana',
    race: 'Humana',
    description: 'La hija adoptiva del alcalde Kolyan Indirovich. Lleva la marca de Strahd.',
    dmNotes: 'Strahd la persigue porque cree que es la reencarnación de Tatyana.',
    hexId: 'hex-village',
    status: 'alive',
    worldX: 240,
    worldY: 200,
    factions: [
      {
        id: 'fac-order',
        worldId: 'world-barovia',
        name: 'La Orden del Cuervo',
        state: 'active',
        description: null,
      },
    ],
    createdAt: '2024-09-10T00:00:00.000Z',
    updatedAt: '2024-10-15T00:00:00.000Z',
  },
  {
    id: 'npc-ismark',
    worldId: 'world-barovia',
    name: 'Ismark Kolyanovich',
    race: 'Humano',
    description: 'Hermano de Ireena. Conocido como "Ismark el Menor" — vive bajo la sombra de su difunto padre.',
    dmNotes: null,
    hexId: null,
    status: 'alive',
    worldX: null,
    worldY: null,
    factions: [],
    createdAt: '2024-09-10T00:00:00.000Z',
    updatedAt: '2024-09-10T00:00:00.000Z',
  },
  {
    id: 'npc-strahd',
    worldId: 'world-barovia',
    name: 'Strahd von Zarovich',
    race: 'Vampiro',
    description: 'El Conde de Barovia. Señor vampiro inmortal atrapado en su dominio por su propia voluntad.',
    dmNotes: 'Tiene acceso a todos los sueños dentro de Barovia. Monitorear los hechizos de los jugadores que puedan bloquearlo.',
    hexId: 'hex-castle',
    status: 'alive',
    worldX: 400,
    worldY: 120,
    factions: [],
    createdAt: '2024-09-10T00:00:00.000Z',
    updatedAt: '2024-10-20T00:00:00.000Z',
  },
];

// ---------------------------------------------------------------------------
// Stub actions
// ---------------------------------------------------------------------------

const STUB_NPC_ACTIONS: NpcWrapperActions = {
  async listNpcs(_worldId, q, _offset): Promise<NpcSearchResult> {
    await new Promise((r) => setTimeout(r, 300));
    const rows = q?.trim()
      ? FIXTURE_NPCS.filter((n) => n.name.toLowerCase().includes(q.trim().toLowerCase()))
      : FIXTURE_NPCS;
    return { rows, total: rows.length };
  },

  async getNpcDetail(npcId) {
    await new Promise((r) => setTimeout(r, 300));
    return FIXTURE_NPCS.find((n) => n.id === npcId) ?? null;
  },

  async createNpc(_worldId, body) {
    await new Promise((r) => setTimeout(r, 400));
    const created: NpcRow = {
      id: `npc-new-${Date.now()}`,
      worldId: _worldId,
      name: body.name,
      race: body.race ?? null,
      description: body.description ?? null,
      dmNotes: body.dmNotes ?? null,
      hexId: body.hexId ?? null,
      status: body.status ?? 'unknown',
      worldX: null,
      worldY: null,
      factions: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    return { ok: true as const, data: created };
  },

  async updateNpc(npcId, body) {
    await new Promise((r) => setTimeout(r, 400));
    const existing = FIXTURE_NPCS.find((n) => n.id === npcId);
    if (!existing) return { ok: false as const, error: 'NPC no encontrado' };
    return { ok: true as const, data: { ...existing, ...body, updatedAt: new Date().toISOString() } };
  },

  async deleteNpc(_npcId) {
    await new Promise((r) => setTimeout(r, 400));
    return { ok: true as const, data: undefined };
  },

  async attachNpcFaction(_worldId, _npcId, _factionId) {
    await new Promise((r) => setTimeout(r, 350));
    return { ok: true as const, data: undefined };
  },

  async detachNpcFaction(_worldId, _npcId, _factionId) {
    await new Promise((r) => setTimeout(r, 350));
    return { ok: true as const, data: undefined };
  },
};

// ---------------------------------------------------------------------------
// Island
// ---------------------------------------------------------------------------

export function NpcClientWrapperIsland() {
  return (
    <NpcClientWrapper
      worldId="world-barovia"
      effectiveView="dm"
      initialNpcs={FIXTURE_NPCS}
      worldFactions={FIXTURE_FACTIONS}
      actions={STUB_NPC_ACTIONS}
    />
  );
}
