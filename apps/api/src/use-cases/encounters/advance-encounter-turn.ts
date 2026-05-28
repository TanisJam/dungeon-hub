/**
 * advance-encounter-turn.ts — Loads encounter, applies the pure domain
 * `advanceTurn`, and persists the new state via an optimistic-concurrency
 * UPDATE (`WHERE id = $1 AND version = $incoming`). Zero rows updated → 409.
 */
import { and, eq } from 'drizzle-orm';
import { db } from '../../infra/db/client.js';
import { encounters } from '../../infra/db/schema.js';
import { advanceTurn } from '@dungeon-hub/domain/encounter';
import { loadEncounter, type LoadedEncounter } from './load-encounter.js';

export type AdvanceTurnResult =
  | { ok: true; encounter: LoadedEncounter; allDead: boolean; wrapped: boolean }
  | { ok: false; code: 'NOT_FOUND' | 'VERSION_CONFLICT' };

export async function advanceEncounterTurn(
  encounterId: string,
  incomingVersion: number,
): Promise<AdvanceTurnResult> {
  const current = await loadEncounter(encounterId);
  if (!current) return { ok: false, code: 'NOT_FOUND' };

  const result = advanceTurn({
    combatants: current.combatants.map((c) => ({
      id: c.id,
      initiative: c.initiative,
      insertionOrder: c.insertionOrder,
      hpCurrent: c.hpCurrent,
    })),
    currentCombatantId: current.currentCombatantId,
    round: current.round,
  });

  const updated = await db
    .update(encounters)
    .set({
      currentCombatantId: result.currentCombatantId,
      round: result.round,
      version: incomingVersion + 1,
      updatedAt: new Date(),
    })
    .where(and(eq(encounters.id, encounterId), eq(encounters.version, incomingVersion)))
    .returning();

  if (updated.length === 0) {
    return { ok: false, code: 'VERSION_CONFLICT' };
  }

  const reloaded = await loadEncounter(encounterId);
  if (!reloaded) return { ok: false, code: 'NOT_FOUND' };
  return { ok: true, encounter: reloaded, allDead: result.allDead, wrapped: result.wrapped };
}
