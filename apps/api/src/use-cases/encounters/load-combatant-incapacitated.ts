/**
 * load-combatant-incapacitated — IO adapter for the Incapacitated action-gate.
 *
 * Thin IO adapter: loads the condition row for a single combatant and delegates
 * the gate decision to the pure domain predicate `isIncapacitated`.
 *
 * Design ref: sdd/engine-incapacitated-gating/design — ADR-3 (shared scalar helper).
 *
 * REQ-INC-09: Server-authority — gate computed server-side from DB-loaded conditions.
 * REQ-INC-02..06: Action/reaction gates call this helper for per-combatant checks.
 *
 * Query shape: targeted SELECT WHERE combatant_id = $id AND condition_name = 'Incapacitated'
 * with .limit(1). Backed by idx_cond_combatant (schema L993) — no full-scan.
 *
 * NOTE: ADR-4 (canCounter loop) uses a separate batched IN-query for N candidates.
 * This helper is SINGLE-combatant only. Do NOT call it N times in a loop for a
 * multi-combatant eligibility check — use the batched pattern there.
 */

import { isIncapacitated } from '@dungeon-hub/domain';
import { and, eq } from 'drizzle-orm';
import { db } from '../../infra/db/client.js';
import { encounterCombatantConditions } from '../../infra/db/schema.js';

/**
 * Returns true if the given combatant currently has the 'Incapacitated' condition
 * in encounter_combatant_conditions.
 *
 * Performs ONE targeted SELECT (limit 1, indexed) then delegates to the pure
 * domain predicate `isIncapacitated(conditions)`.
 */
export async function isCombatantIncapacitated(combatantId: string): Promise<boolean> {
  const rows = await db
    .select({ name: encounterCombatantConditions.conditionName })
    .from(encounterCombatantConditions)
    .where(
      and(
        eq(encounterCombatantConditions.combatantId, combatantId),
        eq(encounterCombatantConditions.conditionName, 'Incapacitated'),
      ),
    )
    .limit(1);
  return isIncapacitated(rows.map((r) => ({ name: r.name })));
}
