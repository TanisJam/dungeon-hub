/**
 * load-encounter.ts — Loads an encounter + its combatants (ordered by
 * initiative DESC, insertionOrder ASC). Returns null when not found.
 */
import { asc, desc, eq } from 'drizzle-orm';
import { db } from '../../infra/db/client.js';
import { encounters, encounterCombatants } from '../../infra/db/schema.js';
import type { CreatedEncounter } from './create-encounter.js';

export type LoadedEncounter = CreatedEncounter;

export async function loadEncounter(id: string): Promise<LoadedEncounter | null> {
  const [row] = await db.select().from(encounters).where(eq(encounters.id, id)).limit(1);
  if (!row) return null;

  const combatants = await db
    .select()
    .from(encounterCombatants)
    .where(eq(encounterCombatants.encounterId, id))
    .orderBy(desc(encounterCombatants.initiative), asc(encounterCombatants.insertionOrder));

  return {
    id: row.id,
    campaignId: row.campaignId,
    sessionId: row.sessionId,
    name: row.name,
    round: row.round,
    status: row.status as 'active' | 'completed',
    currentCombatantId: row.currentCombatantId!,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    combatants: combatants.map((c) => ({
      id: c.id,
      name: c.name,
      kind: c.kind as 'pc' | 'npc',
      characterId: c.characterId,
      initiative: c.initiative,
      hpCurrent: c.hpCurrent,
      hpMax: c.hpMax,
      ac: c.ac,
      insertionOrder: c.insertionOrder,
    })),
  };
}
