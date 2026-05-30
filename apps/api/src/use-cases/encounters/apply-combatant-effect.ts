/**
 * applyCombatantEffect — apply a named effect to a target combatant.
 *
 * PHB p.251 — Hex: caster-sourced, concentration. Effect persists as long as
 * the caster concentrates. Slice A delivers the generic infra; Hex definition is Slice B.
 *
 * Flow (mirrors performForcedCheck active-guard + combatant-load pattern):
 *  1. Load encounter + active guard
 *  2. Load target combatant (validate it belongs to the encounter)
 *  3. App-level idempotency: SELECT existing row for the triple
 *     (combatant_id=targetId, effect_name=effectName, source_combatant_id=sourceCombatantId).
 *     If a match exists → no-op, return applied:false.
 *  4. INSERT new row → return applied:true.
 *
 * NO effectName allowlist in V1 — open text, min(1) only (REQ-CEF-08, ADR-5).
 * NO version/CAS coupling — append-only child table, no lost-update hazard (ADR-5).
 *
 * Design ref: sdd/engine-combatant-effects/design — ADR-5.
 */

import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../../infra/db/client.js';
import {
  encounters,
  encounterCombatants,
  encounterCombatantEffects,
} from '../../infra/db/schema.js';

// ── Input / Output ─────────────────────────────────────────────────────────────

export interface ApplyCombatantEffectInput {
  encounterId: string;
  targetCombatantId: string;
  effectName: string;
  /** encounter_combatants.id of the caster. null means no source attribution. */
  sourceCombatantId?: string | null;
  /** Unused V1 — reserved for concentration-enforcement SDD. */
  concentrationToken?: string | null;
}

export type ApplyCombatantEffectResult =
  | { ok: true; applied: boolean }
  | { ok: false; code: 'NOT_FOUND'; target: 'encounter' | 'target' }
  | { ok: false; code: 'ENCOUNTER_NOT_ACTIVE' };

// ── applyCombatantEffect ───────────────────────────────────────────────────────

/**
 * Idempotently applies a named effect to a target combatant.
 * Returns applied:true if a new row was inserted, applied:false if already present.
 */
export async function applyCombatantEffect(
  input: ApplyCombatantEffectInput,
): Promise<ApplyCombatantEffectResult> {
  const {
    encounterId,
    targetCombatantId,
    effectName,
    sourceCombatantId = null,
    concentrationToken = null,
  } = input;

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

  // ── Step 3: App-level idempotency — SELECT before INSERT ──────────────────────
  // Idempotency key: TRIPLE (combatant_id, effect_name, source_combatant_id).
  // Distinct sources can both mark the same target (future stacking — ADR-1 no unique constraint).
  const existingRows = await db
    .select({ id: encounterCombatantEffects.id })
    .from(encounterCombatantEffects)
    .where(
      and(
        eq(encounterCombatantEffects.combatantId, targetCombatantId),
        eq(encounterCombatantEffects.effectName, effectName),
        sourceCombatantId !== null
          ? eq(encounterCombatantEffects.sourceCombatantId, sourceCombatantId)
          : isNull(encounterCombatantEffects.sourceCombatantId),
      ),
    )
    .limit(1);

  if (existingRows.length > 0) {
    // Already present — idempotent no-op.
    return { ok: true, applied: false };
  }

  // ── Step 4: INSERT new row ────────────────────────────────────────────────────
  await db.insert(encounterCombatantEffects).values({
    combatantId: targetCombatantId,
    effectName,
    sourceCombatantId: sourceCombatantId ?? null,
    concentrationToken: concentrationToken ?? null,
  });

  return { ok: true, applied: true };
}
