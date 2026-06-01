/**
 * load-combatant-raging — IO adapter for the Raging action-gate.
 *
 * Thin IO adapter: loads the condition row for a single combatant and delegates
 * the gate decision to the pure domain predicate `isRaging`.
 *
 * Mirrors load-combatant-incapacitated.ts exactly (ADR-5, engine-rage).
 *
 * REQ-RAGE-06: Server-authority — gate computed server-side from DB-loaded conditions.
 * REQ-RAGE-11: Read-path tolerant — legacy rows (no 'Raging' condition) return false.
 *
 * Query shape: targeted SELECT WHERE combatant_id = $id AND condition_name = 'Raging'
 * with .limit(1). Backed by idx_cond_combatant (schema) — no full-scan.
 */

import { isRaging } from '@dungeon-hub/domain/engine';
import { and, eq } from 'drizzle-orm';
import { db } from '../../infra/db/client.js';
import { encounterCombatantConditions } from '../../infra/db/schema.js';

/**
 * Returns true if the given combatant currently has the 'Raging' condition
 * in encounter_combatant_conditions.
 *
 * Performs ONE targeted SELECT (limit 1, indexed) then delegates to the pure
 * domain predicate `isRaging(conditions)`.
 */
export async function isCombatantRaging(combatantId: string): Promise<boolean> {
  const rows = await db
    .select({ name: encounterCombatantConditions.conditionName })
    .from(encounterCombatantConditions)
    .where(
      and(
        eq(encounterCombatantConditions.combatantId, combatantId),
        eq(encounterCombatantConditions.conditionName, 'Raging'),
      ),
    )
    .limit(1);
  return isRaging(rows.map((r) => ({ name: r.name })));
}
