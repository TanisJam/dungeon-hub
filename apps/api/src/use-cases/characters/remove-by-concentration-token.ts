import { and, eq } from 'drizzle-orm';
import { db } from '../../infra/db/client.js';
import { modifierInstances } from '../../infra/db/schema.js';

/**
 * Removes all persisted modifier instances matching a concentration token,
 * scoped to the caster (ownerCharacterId).
 *
 * GENERIC — zero knowledge of Bless or any specific modifier kind.
 * The caster scope prevents cross-caster token collision: two different casters
 * could theoretically share a token string without affecting each other's instances.
 *
 * Idempotent: no-op if no rows match (DELETE 0 rows is not an error).
 * The route layer returns 204 regardless (REQ-CONCENTRATION-01 Scenario B).
 *
 * Design ref: sdd/engine-stateful/design #1131 — D4; tasks #1132 — T4.
 */
export async function removeByConcentrationToken(
  ownerCharacterId: string,
  token: string,
): Promise<void> {
  await db
    .delete(modifierInstances)
    .where(
      and(
        eq(modifierInstances.concentrationToken, token),
        eq(modifierInstances.ownerCharacterId, ownerCharacterId),
      ),
    );
}
