import { eq } from 'drizzle-orm';
import { db } from '../../infra/db/client.js';
import { factions } from '../../infra/db/schema.js';
import type { WorldAccess } from '../auth/get-world-access.js';

export type FactionState = 'active' | 'dormant' | 'destroyed' | 'disbanded';

export interface LoadedFaction {
  id: string;
  worldId: string;
  name: string;
  description: string | null;
  dmNotes: string | null;
  state: FactionState;
  createdAt: Date;
  updatedAt: Date;
}

export async function loadFaction(id: string): Promise<LoadedFaction | null> {
  const rows = await db.select().from(factions).where(eq(factions.id, id)).limit(1);
  return (rows[0] as LoadedFaction | undefined) ?? null;
}

export async function listFactionsInWorld(worldId: string): Promise<LoadedFaction[]> {
  const rows = await db.select().from(factions).where(eq(factions.worldId, worldId));
  return rows as LoadedFaction[];
}

export function sanitizeFactionForRole(
  faction: LoadedFaction,
  access: WorldAccess,
): Omit<LoadedFaction, 'dmNotes'> & { dmNotes?: string | null } {
  if (access === 'gm') return faction;
  const { dmNotes: _omit, ...rest } = faction;
  return rest;
}
