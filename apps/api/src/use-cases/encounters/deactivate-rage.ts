/**
 * deactivate-rage — Barbarian Rage voluntary deactivation use-case.
 *
 * PHB p.48: "If you are able to cast spells, you can't cast them or concentrate on
 * them while raging. Your rage ends early if... you end it on your turn as a bonus action."
 *
 * Costs one bonus action. Removes the 'Raging' condition.
 *
 * Flow (ADR-7 engine-rage + ADR-2 web-combat-rage):
 *   PRE-TX: turn guard → [REQ-WCR-AUTH-01] assertCombatantOwnerOrGm → bonus-action gate → confirm 'Raging'.
 *   IN-TX:  CAS version → UPDATE bonus_action_used=true → DELETE 'Raging' row.
 *
 * NOTE: we do NOT reset the ledger flags here (single-reset-point invariant per ADR-4).
 * The flags reset at turn-end in advance-encounter-turn regardless.
 *
 * REQ-RAGE-10 (PHB p.48). REQ-WCR-DEACT-01.
 */

import { eq, and } from 'drizzle-orm';
import { db } from '../../infra/db/client.js';
import {
  encounters,
  encounterCombatants,
  encounterCombatantConditions,
} from '../../infra/db/schema.js';
import { assertCombatantOwnerOrGm } from './assert-combatant-owner-or-gm.js';

// ── Output ─────────────────────────────────────────────────────────────────────

export type DeactivateRageResult =
  | { ok: true }
  | { ok: false; code: 'NOT_FOUND'; target: 'encounter' | 'combatant' }
  | { ok: false; code: 'ENCOUNTER_NOT_ACTIVE' }
  | { ok: false; code: 'NOT_YOUR_TURN' }
  | { ok: false; code: 'VERSION_CONFLICT' }
  // REQ-WCR-AUTH-01 — caller is not the owner of this combatant's character
  | { ok: false; code: 'FORBIDDEN' }
  // Bonus action already used this turn (PHB p.48 — deactivation costs bonus action)
  | { ok: false; code: 'BONUS_ACTION_ALREADY_USED' }
  // Not currently raging — nothing to deactivate
  | { ok: false; code: 'NOT_RAGING' };

// ── deactivate-rage ───────────────────────────────────────────────────────────

export async function deactivateRage(input: {
  encounterId: string;
  ragerId: string; // encounter_combatants.id
  version: number;
  callerId?: string;   // JWT userId of the caller (required for player authz; omit = GM-only legacy)
  callerRole?: 'gm' | 'player'; // member role in the campaign
}): Promise<DeactivateRageResult> {
  const { encounterId, ragerId, version } = input;
  // Default to 'gm' for legacy callers that don't pass caller identity.
  const callerId = input.callerId ?? '';
  const callerRole = input.callerRole ?? 'gm';

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

  // ── Step 3b: Owner-OR-GM authz (REQ-WCR-AUTH-01, ADR-2) ─────────────────────
  // Runs AFTER turn guard and BEFORE economy gates. The helper internally loads
  // the character row (+1 indexed read — accepted per ADR-2, keeps helper self-contained).
  const authzResult = await assertCombatantOwnerOrGm({
    encounterId,
    combatantId: ragerId,
    callerId,
    callerRole,
  });
  if (!authzResult.ok) {
    if (authzResult.code === 'FORBIDDEN') {
      return { ok: false, code: 'FORBIDDEN' };
    }
    // NOT_FOUND from the helper (NPC target or missing combatant).
    return { ok: false, code: 'NOT_FOUND', target: 'combatant' };
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
