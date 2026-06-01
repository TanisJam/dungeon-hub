/**
 * deactivate-rage — Barbarian Rage voluntary deactivation use-case.
 *
 * PHB p.48: "If you are able to cast spells, you can't cast them or concentrate on
 * them while raging. Your rage ends early if... you end it on your turn as a bonus action."
 *
 * Costs one bonus action. Removes the 'Raging' condition.
 *
 * Flow (ADR-7 engine-rage):
 *   PRE-TX: turn guard → bonus-action gate (BONUS_ACTION_ALREADY_USED) → confirm 'Raging' present.
 *   IN-TX:  CAS version → UPDATE bonus_action_used=true → DELETE 'Raging' row.
 *
 * NOTE: we do NOT reset the ledger flags here (single-reset-point invariant per ADR-4).
 * The flags reset at turn-end in advance-encounter-turn regardless.
 *
 * REQ-RAGE-10 (PHB p.48).
 */

import { eq, and } from 'drizzle-orm';
import { db } from '../../infra/db/client.js';
import {
  encounters,
  encounterCombatants,
  encounterCombatantConditions,
} from '../../infra/db/schema.js';

// ── Output ─────────────────────────────────────────────────────────────────────

export type DeactivateRageResult =
  | { ok: true }
  | { ok: false; code: 'NOT_FOUND'; target: 'encounter' | 'combatant' }
  | { ok: false; code: 'ENCOUNTER_NOT_ACTIVE' }
  | { ok: false; code: 'NOT_YOUR_TURN' }
  | { ok: false; code: 'VERSION_CONFLICT' }
  // Bonus action already used this turn (PHB p.48 — deactivation costs bonus action)
  | { ok: false; code: 'BONUS_ACTION_ALREADY_USED' }
  // Not currently raging — nothing to deactivate
  | { ok: false; code: 'NOT_RAGING' };

// ── deactivate-rage ───────────────────────────────────────────────────────────

export async function deactivateRage(input: {
  encounterId: string;
  ragerId: string; // encounter_combatants.id
  version: number;
}): Promise<DeactivateRageResult> {
  const { encounterId, ragerId, version } = input;

  // ── Step 1: Load encounter ────────────────────────────────────────────────────
  const [encounterRow] = await db
    .select()
    .from(encounters)
    .where(eq(encounters.id, encounterId))
    .limit(1);

  if (!encounterRow) return { ok: false, code: 'NOT_FOUND', target: 'encounter' };
  if (encounterRow.status !== 'active') return { ok: false, code: 'ENCOUNTER_NOT_ACTIVE' };

  if (encounterRow.version !== version) {
    return { ok: false, code: 'VERSION_CONFLICT' };
  }

  // ── Step 2: Load rager combatant ──────────────────────────────────────────────
  const [ragerCombatant] = await db
    .select()
    .from(encounterCombatants)
    .where(and(eq(encounterCombatants.id, ragerId), eq(encounterCombatants.encounterId, encounterId)))
    .limit(1);

  if (!ragerCombatant) return { ok: false, code: 'NOT_FOUND', target: 'combatant' };

  // ── Step 3: Turn guard ────────────────────────────────────────────────────────
  if (encounterRow.currentCombatantId !== ragerId) {
    return { ok: false, code: 'NOT_YOUR_TURN' };
  }

  // ── Step 4: Bonus-action gate (PHB p.48 — ends as a bonus action) ────────────
  if (ragerCombatant.bonusActionUsed) {
    return { ok: false, code: 'BONUS_ACTION_ALREADY_USED' };
  }

  // ── Step 5: Confirm 'Raging' is present ─────────────────────────────────────
  const [ragingRow] = await db
    .select({ id: encounterCombatantConditions.id })
    .from(encounterCombatantConditions)
    .where(
      and(
        eq(encounterCombatantConditions.combatantId, ragerId),
        eq(encounterCombatantConditions.conditionName, 'Raging'),
      ),
    )
    .limit(1);

  if (!ragingRow) {
    return { ok: false, code: 'NOT_RAGING' };
  }

  // ── IN-TX: CAS + bonus_action_used=true + DELETE 'Raging' ────────────────────
  const txResult = await db.transaction(async (tx) => {
    const updated = await tx
      .update(encounters)
      .set({ version: version + 1, updatedAt: new Date() })
      .where(and(eq(encounters.id, encounterId), eq(encounters.version, version)))
      .returning();

    if (updated.length === 0) {
      return { conflict: true as const };
    }

    // Consume bonus action.
    await tx
      .update(encounterCombatants)
      .set({ bonusActionUsed: true })
      .where(eq(encounterCombatants.id, ragerId));

    // Remove 'Raging' condition.
    await tx
      .delete(encounterCombatantConditions)
      .where(
        and(
          eq(encounterCombatantConditions.combatantId, ragerId),
          eq(encounterCombatantConditions.conditionName, 'Raging'),
        ),
      );

    return { conflict: false as const };
  });

  if (txResult.conflict) {
    return { ok: false, code: 'VERSION_CONFLICT' };
  }

  return { ok: true };
}
