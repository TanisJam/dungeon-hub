import { and, eq, sql } from 'drizzle-orm';
import type { EndCondition } from '@dungeon-hub/domain/engine';
import { db } from '../../infra/db/client.js';
import { modifierInstances } from '../../infra/db/schema.js';

/**
 * Removes all persisted modifier instances for a character whose duration.endsOn
 * array contains the given EndCondition (event-triggered DELETE pattern).
 *
 * Mirrors removeByConcentrationToken — same DELETE-on-event pattern (ADR-5).
 *
 * Uses JSONB containment: `duration -> 'endsOn' @> [cond]::jsonb`
 * to match instances whose endsOn array includes the given condition.
 * This handles the array-contains-element check efficiently in Postgres.
 *
 * Idempotent: DELETE 0 rows is not an error.
 *
 * PHB p.186: short rest ends 'short-rest' effects; long rest ends BOTH
 * 'short-rest' AND 'long-rest' effects (call this function twice on long rest).
 *
 * REQ-DUR-REST-01 (sdd/engine-timeline-duration/spec).
 * Design ref: sdd/engine-timeline-duration/design — ADR-5.
 */
export async function removeByEndCondition(
  ownerCharacterId: string,
  cond: EndCondition,
): Promise<void> {
  await db
    .delete(modifierInstances)
    .where(
      and(
        eq(modifierInstances.ownerCharacterId, ownerCharacterId),
        sql`${modifierInstances.duration} -> 'endsOn' @> ${JSON.stringify([cond])}::jsonb`,
      ),
    );
}
