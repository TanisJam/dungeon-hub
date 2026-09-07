/**
 * is-combatant-surprised-first-turn — IO adapter for the surprise action-gate.
 *
 * Structural twin of `load-combatant-incapacitated.ts` (same design: thin IO adapter,
 * delegates gate decision to the pure domain predicate).
 *
 * SELECTs `surprised, first_turn_acted` from `encounter_combatants` WHERE `id = $combatantId`
 * LIMIT 1. Delegates to `isSurprisedFirstTurn`. Missing row → false (legacy/absent tolerant,
 * REQ-SUR-S1-01d: DEFAULT false backfills legacy rows; gate is inert for them).
 *
 * NO round read — gate predicate has no round condition (#2252.3, REQ-SUR-S1-04).
 *
 * Design ref: sdd/engine-surprise-round1/design — ADR-3.
 * REQ-SUR-S2-01, REQ-SUR-S2-02 (ACTOR_SURPRISED gate).
 */

import { isSurprisedFirstTurn } from '@dungeon-hub/domain';
import { eq } from 'drizzle-orm';
import { db } from '../../infra/db/client.js';
import { encounterCombatants } from '../../infra/db/schema.js';

/**
 * Returns true if the given combatant is currently in the surprised+pre-first-turn state.
 *
 * Performs ONE targeted SELECT (limit 1) then delegates to the pure domain predicate
 * `isSurprisedFirstTurn(surprised, firstTurnActed)`.
 *
 * Missing row → false (legacy-tolerant: rows predating the migration have DEFAULT false columns,
 * so the gate is inert for them; a missing row is also treated as safe).
 */
export async function isCombatantSurprisedFirstTurn(combatantId: string): Promise<boolean> {
  const [row] = await db
    .select({
      surprised: encounterCombatants.surprised,
      firstTurnActed: encounterCombatants.firstTurnActed,
    })
    .from(encounterCombatants)
    .where(eq(encounterCombatants.id, combatantId))
    .limit(1);
  if (!row) return false;
  return isSurprisedFirstTurn(row.surprised, row.firstTurnActed);
}
