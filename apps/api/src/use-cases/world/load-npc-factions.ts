import { and, eq } from 'drizzle-orm';
import { db } from '../../infra/db/client.js';
import { npcFactions } from '../../infra/db/schema.js';
import type { LoadedFaction } from './load-faction.js';
import { loadFaction } from './load-faction.js';
import { loadNpc } from './load-npc.js';

export type AttachNpcFactionResult =
  | { ok: true }
  | { ok: false; issues: Array<{ code: string; [k: string]: unknown }> };

/**
 * Attaches a faction to an NPC (N:M membership).
 *
 * Cross-scope guard: npc.worldId MUST equal faction.worldId — otherwise
 * returns 400-equivalent issue code NPC_FACTION_CROSS_WORLD.
 *
 * Duplicate insert is a PK violation → caller maps pg error 23505 → 409.
 */
export async function attachNpcFaction(
  npcId: string,
  factionId: string,
): Promise<AttachNpcFactionResult> {
  const npc = await loadNpc(npcId);
  if (!npc) {
    return { ok: false, issues: [{ code: 'NPC_NOT_FOUND', npcId }] };
  }

  const faction = await loadFaction(factionId);
  if (!faction) {
    return { ok: false, issues: [{ code: 'FACTION_NOT_FOUND', factionId }] };
  }

  // ADR-5: same-world invariant.
  if (npc.worldId !== faction.worldId) {
    return {
      ok: false,
      issues: [
        {
          code: 'NPC_FACTION_CROSS_WORLD',
          npcWorldId: npc.worldId,
          factionWorldId: faction.worldId,
        },
      ],
    };
  }

  await db.insert(npcFactions).values({ npcId, factionId });
  return { ok: true };
}

/**
 * Detaches a faction from an NPC.
 *
 * Returns ok: false if the membership row does not exist (caller → 404).
 */
export async function detachNpcFaction(
  npcId: string,
  factionId: string,
): Promise<{ ok: true } | { ok: false; issues: Array<{ code: string }> }> {
  const deleted = await db
    .delete(npcFactions)
    .where(and(eq(npcFactions.npcId, npcId), eq(npcFactions.factionId, factionId)))
    .returning();

  if (deleted.length === 0) {
    return { ok: false, issues: [{ code: 'NPC_FACTION_NOT_FOUND' }] };
  }
  return { ok: true };
}

/**
 * Lists all factions an NPC belongs to.
 */
export async function listNpcFactions(npcId: string): Promise<LoadedFaction[]> {
  const rows = await db.select().from(npcFactions).where(eq(npcFactions.npcId, npcId));

  const result: LoadedFaction[] = [];
  for (const row of rows) {
    const f = await loadFaction(row.factionId);
    if (f) result.push(f);
  }
  return result;
}
