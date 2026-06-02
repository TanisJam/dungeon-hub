import { eq } from 'drizzle-orm';
import { db } from '../../infra/db/client.js';
import { npcFactions, npcs } from '../../infra/db/schema.js';
import type { WorldAccess } from '../auth/get-world-access.js';
import type { LoadedFaction } from './load-faction.js';
import { loadFaction } from './load-faction.js';

export type NpcStatus = 'alive' | 'dead' | 'missing' | 'unknown';

export interface LoadedNpc {
  id: string;
  worldId: string;
  name: string;
  race: string | null;
  description: string | null;
  dmNotes: string | null;
  hexId: string | null;
  status: NpcStatus;
  worldX: number | null;
  worldY: number | null;
  factions: LoadedFaction[];
  createdAt: Date;
  updatedAt: Date;
}

export async function loadNpc(id: string): Promise<LoadedNpc | null> {
  const rows = await db.select().from(npcs).where(eq(npcs.id, id)).limit(1);
  const npc = rows[0];
  if (!npc) return null;

  const factionRows = await db
    .select()
    .from(npcFactions)
    .where(eq(npcFactions.npcId, id));

  const factionList: LoadedFaction[] = [];
  for (const row of factionRows) {
    const f = await loadFaction(row.factionId);
    if (f) factionList.push(f);
  }

  return { ...(npc as Omit<LoadedNpc, 'factions'>), factions: factionList };
}

export async function listNpcsInWorld(worldId: string): Promise<LoadedNpc[]> {
  const rows = await db.select().from(npcs).where(eq(npcs.worldId, worldId));

  const result: LoadedNpc[] = [];
  for (const npc of rows) {
    const factionRows = await db
      .select()
      .from(npcFactions)
      .where(eq(npcFactions.npcId, npc.id));

    const factionList: LoadedFaction[] = [];
    for (const row of factionRows) {
      const f = await loadFaction(row.factionId);
      if (f) factionList.push(f);
    }

    result.push({ ...(npc as Omit<LoadedNpc, 'factions'>), factions: factionList });
  }

  return result;
}

export function sanitizeNpcForRole(
  npc: LoadedNpc,
  access: WorldAccess,
): Omit<LoadedNpc, 'dmNotes'> & { dmNotes?: string | null } {
  if (access === 'gm') return npc;
  const { dmNotes: _omit, ...rest } = npc;
  return rest;
}
