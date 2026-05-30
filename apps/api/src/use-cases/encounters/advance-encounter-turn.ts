/**
 * advance-encounter-turn.ts — Loads encounter, applies the pure domain
 * `advanceTurn`, and persists the new state via an optimistic-concurrency
 * UPDATE (`WHERE id = $1 AND version = $incoming`). Zero rows updated → 409.
 */
import { and, eq, sql } from 'drizzle-orm';
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

  // Capture the OUTGOING combatant id BEFORE domain advanceTurn computes the new pointer.
  // This is the sweep anchor key: the combatant whose turn is ENDING (REQ-TAS-03, ADR-1).
  const oldCombatantId = current.currentCombatantId;

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

  // Wrap the CAS UPDATE + sweep in ONE transaction (REQ-TAS-03, ADR-1).
  // Pattern: sentinel return (not throw) for VERSION_CONFLICT — matches perform-weapon-attack-apply.ts.
  // CAS-UPDATE-FIRST: if version is stale, returns {conflict:true} immediately → sweep never runs.
  // Drizzle commits when the callback resolves; {conflict:true} early-return commits an empty tx
  // (no mutation yet → harmless). Sweep errors throw → rollback includes CAS UPDATE.
  const txResult = await db.transaction(async (tx) => {
    // Step 1: CAS UPDATE — optimistic concurrency guard (cheapest abort path).
    const updated = await tx
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
      // CAS conflict → abort sweep (no double-decrement on lost update — REQ-TAS-03).
      return { conflict: true as const };
    }

    // Step 2: DELETE expired rows (turns_remaining=0, boundary='end') — DELETE-FIRST (ADR-2).
    // REQ-TAS-04: DELETE before DECREMENT is correctness-critical — decrement-first would
    // collapse 1→0 and immediately delete in the same fire, expiring the condition one full
    // turn too early (RAW violation, PHB p.189 "until the end of X's NEXT turn").
    await tx.execute(sql`
      DELETE FROM encounter_combatant_conditions
      WHERE turn_anchor_entity_id = ${oldCombatantId}
        AND turn_anchor_boundary = 'end'
        AND turns_remaining = 0
    `);
    // Note: 'start' boundary intentionally excluded — deferred TODO (no PHB consumer yet, ADR-2).
    // Scoping: combatant ids are gen_random_uuid() PKs — globally unique (schema.ts:910).
    // No encounter join needed; anchor uuid belongs to exactly one combatant (ADR-2).

    // Step 3: DECREMENT remaining rows (turns_remaining > 0) — after DELETE.
    await tx.execute(sql`
      UPDATE encounter_combatant_conditions
      SET turns_remaining = turns_remaining - 1
      WHERE turn_anchor_entity_id = ${oldCombatantId}
        AND turns_remaining > 0
    `);
    // turns_remaining - 1 arithmetic is static SQL text, not user input — injection-safe (ADR-2).

    return { conflict: false as const };
  });

  if (txResult.conflict) {
    return { ok: false, code: 'VERSION_CONFLICT' };
  }

  // Read-after-commit (stays OUTSIDE tx — same as before, ADR-1).
  const reloaded = await loadEncounter(encounterId);
  if (!reloaded) return { ok: false, code: 'NOT_FOUND' };
  return { ok: true, encounter: reloaded, allDead: result.allDead, wrapped: result.wrapped };
}
