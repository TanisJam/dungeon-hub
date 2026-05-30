/**
 * removeCombatantCondition — remove a named condition from a target combatant.
 *
 * PHB Appendix A conditions. Slice 1 of conditions-catalog: Blinded, Invisible, Poisoned.
 *
 * Flow (mirrors removeCombatantEffect):
 *  1. Load encounter + active guard
 *  2. Load target combatant (validate it belongs to the encounter)
 *  3. DELETE rows WHERE (combatant_id=targetId, condition_name=name).
 *     Zero-row delete = success (idempotent, no-op — REQ-COND-DEL-03).
 *
 * NO version/CAS coupling — append-only child table (mirrors forced-check/ADR-5).
 *
 * Design ref: sdd/conditions-catalog/design — ADR-4.
 */

import { and, eq } from 'drizzle-orm';
import { db } from '../../infra/db/client.js';
import {
  encounters,
  encounterCombatants,
  encounterCombatantConditions,
} from '../../infra/db/schema.js';

// ── Input / Output ─────────────────────────────────────────────────────────────

export interface RemoveCombatantConditionInput {
  encounterId: string;
  targetCombatantId: string;
  conditionName: string;
}

export type RemoveCombatantConditionResult =
  | { ok: true; removed: number }
  | { ok: false; code: 'NOT_FOUND'; target: 'encounter' | 'target' }
  | { ok: false; code: 'ENCOUNTER_NOT_ACTIVE' };

// ── removeCombatantCondition ───────────────────────────────────────────────────

/**
 * Removes matching condition rows. Returns the count of rows deleted (may be 0 — success).
 * ADR-4: zero-row delete → {ok:true, removed:0} (idempotent, NOT 404).
 */
export async function removeCombatantCondition(
  input: RemoveCombatantConditionInput,
): Promise<RemoveCombatantConditionResult> {
  const { encounterId, targetCombatantId, conditionName } = input;

  // ── Step 1: Load encounter + active guard ─────────────────────────────────────
  const [encounterRow] = await db
    .select({ id: encounters.id, status: encounters.status })
    .from(encounters)
    .where(eq(encounters.id, encounterId))
    .limit(1);

  if (!encounterRow) return { ok: false, code: 'NOT_FOUND', target: 'encounter' };
  if (encounterRow.status !== 'active') return { ok: false, code: 'ENCOUNTER_NOT_ACTIVE' };

  // ── Step 2: Load target combatant ─────────────────────────────────────────────
  const [targetCombatant] = await db
    .select({ id: encounterCombatants.id })
    .from(encounterCombatants)
    .where(
      and(
        eq(encounterCombatants.id, targetCombatantId),
        eq(encounterCombatants.encounterId, encounterId),
      ),
    )
    .limit(1);

  if (!targetCombatant) return { ok: false, code: 'NOT_FOUND', target: 'target' };

  // ── Step 3: DELETE matching rows ──────────────────────────────────────────────
  // Delete all rows for (combatantId, conditionName) — plain-text name, case-sensitive.
  // Zero rows deleted = success (REQ-COND-DEL-03: idempotent delete).
  const deleted = await db
    .delete(encounterCombatantConditions)
    .where(
      and(
        eq(encounterCombatantConditions.combatantId, targetCombatantId),
        eq(encounterCombatantConditions.conditionName, conditionName),
      ),
    )
    .returning({ id: encounterCombatantConditions.id });

  return { ok: true, removed: deleted.length };
}
