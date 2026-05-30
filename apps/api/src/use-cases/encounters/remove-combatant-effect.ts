/**
 * removeCombatantEffect — remove a named effect from a target combatant.
 *
 * PHB p.251 — Hex: ends when caster loses concentration or re-casts at new target.
 * Slice A delivers generic infrastructure; Hex definition is Slice B.
 *
 * Flow (mirrors applyCombatantEffect):
 *  1. Load encounter + active guard
 *  2. Load target combatant (validate it belongs to the encounter)
 *  3. DELETE rows WHERE (combatant_id=targetId, effect_name=effectName) AND source matches.
 *     When sourceCombatantId provided: scopes deletion to that source only.
 *     When sourceCombatantId omitted: deletes ALL rows for (target, effectName) regardless of source.
 *     Zero-row delete = success (idempotent, no-op — REQ-CEF-07 edge case #2).
 *
 * NO version/CAS coupling — append-only child table (ADR-5 mirroring forced-check).
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

export interface RemoveCombatantEffectInput {
  encounterId: string;
  targetCombatantId: string;
  effectName: string;
  /**
   * When provided: deletes only rows sourced by this combatant (scoped remove).
   * When omitted: deletes ALL rows for (targetCombatantId, effectName) — GM sweeps all.
   */
  sourceCombatantId?: string | null;
}

export type RemoveCombatantEffectResult =
  | { ok: true; removed: number }
  | { ok: false; code: 'NOT_FOUND'; target: 'encounter' | 'target' }
  | { ok: false; code: 'ENCOUNTER_NOT_ACTIVE' };

// ── removeCombatantEffect ──────────────────────────────────────────────────────

/**
 * Removes matching effect rows. Returns the count of rows deleted (may be 0 — success).
 */
export async function removeCombatantEffect(
  input: RemoveCombatantEffectInput,
): Promise<RemoveCombatantEffectResult> {
  const {
    encounterId,
    targetCombatantId,
    effectName,
    sourceCombatantId,
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

  // ── Step 3: DELETE matching rows ──────────────────────────────────────────────
  // When sourceCombatantId provided: scope to that source (null source matched by isNull).
  // When sourceCombatantId is undefined (omitted): delete all sources for (target, effectName).
  let deleted: { id: string }[];

  if (sourceCombatantId !== undefined) {
    // Scoped delete: match the exact source (or null-source rows when null provided).
    deleted = await db
      .delete(encounterCombatantEffects)
      .where(
        and(
          eq(encounterCombatantEffects.combatantId, targetCombatantId),
          eq(encounterCombatantEffects.effectName, effectName),
          sourceCombatantId !== null
            ? eq(encounterCombatantEffects.sourceCombatantId, sourceCombatantId)
            : isNull(encounterCombatantEffects.sourceCombatantId),
        ),
      )
      .returning({ id: encounterCombatantEffects.id });
  } else {
    // Unscoped delete: remove all rows for (target, effectName) regardless of source.
    deleted = await db
      .delete(encounterCombatantEffects)
      .where(
        and(
          eq(encounterCombatantEffects.combatantId, targetCombatantId),
          eq(encounterCombatantEffects.effectName, effectName),
        ),
      )
      .returning({ id: encounterCombatantEffects.id });
  }

  return { ok: true, removed: deleted.length };
}
