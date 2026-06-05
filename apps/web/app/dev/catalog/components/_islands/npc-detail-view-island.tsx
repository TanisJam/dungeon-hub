'use client';

/**
 * NpcDetailViewIsland — catalog demo of the REAL NpcDetailView.
 *
 * NpcDetailView is the NPC detail sheet body: name, status pill, race, description,
 * DM-gated dmNotes, and a FactionChipSection for N:M faction membership (DM: attach/
 * detach; Player: read-only). DM view shown.
 *
 * Passes a stub actions bundle so getNpcDetail/attachNpcFaction/detachNpcFaction
 * never fire real server actions. attach/detach stubs return success (~350ms) and
 * getNpcDetail refreshes the faction list from the fixture.
 *
 * INTERACTIVE — tap × to detach a faction chip (stub), tap + to attach a faction
 * (stub). All mutations are stubs.
 *
 * REQ-NPC-02, REQ-GATE-01.
 */

import { NpcDetailView } from '@/components/world/npcs/npc-detail';
import type { NpcDetailActions } from '@/components/world/npcs/npc-detail';
import type { NpcRow, FactionRow } from '@/app/codex/actions';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FIXTURE_NPC: NpcRow = {
  id: 'npc-ireena',
  worldId: 'world-barovia',
  name: 'Ireena Kolyana',
  race: 'Humana',
  description: 'La hija adoptiva del alcalde Kolyan Indirovich. Lleva la marca de Strahd en el cuello y no recuerda cómo la obtuvo.',
  dmNotes: 'Strahd la persigue porque cree que es la reencarnación de Tatyana. No revelar hasta que el grupo gane su confianza.',
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
};

const WORLD_FACTIONS: FactionRow[] = [
  {
    id: 'fac-order',
    worldId: 'world-barovia',
    name: 'La Orden del Cuervo',
    state: 'active',
    description: null,
    dmNotes: null,
    createdAt: '2024-01-10T00:00:00.000Z',
    updatedAt: '2024-01-10T00:00:00.000Z',
  },
  {
    id: 'fac-vistani',
    worldId: 'world-barovia',
    name: 'Los Vistani',
    state: 'active',
    description: null,
    dmNotes: null,
    createdAt: '2024-01-10T00:00:00.000Z',
    updatedAt: '2024-01-10T00:00:00.000Z',
  },
];

// ---------------------------------------------------------------------------
// Stub actions
// ---------------------------------------------------------------------------

const STUB_NPC_DETAIL_ACTIONS: NpcDetailActions = {
  async getNpcDetail(_npcId) {
    await new Promise((r) => setTimeout(r, 300));
    // Return the fixture — faction list unchanged (stub doesn't mutate)
    return FIXTURE_NPC;
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

export function NpcDetailViewIsland() {
  return (
    <div className="border border-line rounded-md bg-paper overflow-hidden p-4" style={{ maxWidth: 375 }}>
      <NpcDetailView
        detail={FIXTURE_NPC}
        effectiveView="dm"
        worldId="world-barovia"
        worldFactions={WORLD_FACTIONS}
        actions={STUB_NPC_DETAIL_ACTIONS}
      />
    </div>
  );
}
