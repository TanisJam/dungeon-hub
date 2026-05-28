/**
 * patch-combatant.ts — Updates a combatant's HP and bumps the parent
 * encounter's `version` so subsequent advance-turn calls observe the change
 * (and stale clients get 409).
 *
 * `hpCurrent = 0` marks the combatant effectively dead (no explicit column).
 */
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../infra/db/client.js';
import { encounters, encounterCombatants } from '../../infra/db/schema.js';

export interface PatchCombatantInput {
  encounterId: string;
  combatantId: string;
  hpCurrent: number;
}

export type PatchCombatantResult =
  | { ok: true; hpCurrent: number; newVersion: number }
  | { ok: false; code: 'NOT_FOUND' };

export async function patchCombatant(input: PatchCombatantInput): Promise<PatchCombatantResult> {
  return db.transaction(async (tx) => {
    const updated = await tx
      .update(encounterCombatants)
      .set({ hpCurrent: input.hpCurrent })
      .where(
        and(
          eq(encounterCombatants.id, input.combatantId),
          eq(encounterCombatants.encounterId, input.encounterId),
        ),
      )
      .returning({ hpCurrent: encounterCombatants.hpCurrent });

    if (updated.length === 0) {
      return { ok: false, code: 'NOT_FOUND' };
    }

    const [enc] = await tx
      .update(encounters)
      .set({ version: sql`${encounters.version} + 1`, updatedAt: new Date() })
      .where(eq(encounters.id, input.encounterId))
      .returning({ version: encounters.version });

    return { ok: true, hpCurrent: updated[0]!.hpCurrent, newVersion: enc!.version };
  });
}
