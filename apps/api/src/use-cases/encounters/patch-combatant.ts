/**
 * patch-combatant.ts — Updates a combatant's HP and bumps the parent
 * encounter's `version` so subsequent advance-turn calls observe the change
 * (and stale clients get 409).
 *
 * `hpCurrent = 0` marks the combatant effectively dead (no explicit column).
 *
 * REQ-CID-03 (Slice 3): when a PC is patched to 0 HP, breakConcentration fires
 * INSIDE this transaction. PHB p.197: 0 HP → Unconscious → Incapacitated → concentration ends
 * (PHB p.203). The GM HP tool carries this engine logic because 0-HP is a 0-HP event
 * regardless of cause — GM fiat included (no-fisuras decision, see engram #1453).
 * Only fires on hpCurrent===0 AND kind==='pc' AND characterId!==null.
 */
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../infra/db/client.js';
import { encounters, encounterCombatants } from '../../infra/db/schema.js';
import { breakConcentration } from '../engine/concentration-service.js';

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
    // Widen .returning() to include characterId + kind so the concentration hook
    // can run inside this transaction without a second SELECT. ADR-5.
    const updated = await tx
      .update(encounterCombatants)
      .set({ hpCurrent: input.hpCurrent })
      .where(
        and(
          eq(encounterCombatants.id, input.combatantId),
          eq(encounterCombatants.encounterId, input.encounterId),
        ),
      )
      .returning({
        hpCurrent: encounterCombatants.hpCurrent,
        characterId: encounterCombatants.characterId,
        kind: encounterCombatants.kind,
      });

    if (updated.length === 0) {
      return { ok: false, code: 'NOT_FOUND' };
    }

    // REQ-CID-03: break concentration when the GM sets a PC's HP to 0.
    // PHB p.197: 0 HP → Unconscious → Incapacitated → concentration ends (PHB p.203).
    // Runs INSIDE this transaction so the HP write and the concentration break are atomic.
    // Only fires for PC combatants with a characterId (NPC guard: characterId===null → skip).
    // breakConcentration is idempotent — non-concentrating PC is a cheap no-op (one SELECT, no rows found).
    if (
      input.hpCurrent === 0 &&
      updated[0]!.kind === 'pc' &&
      updated[0]!.characterId !== null
    ) {
      await breakConcentration(updated[0]!.characterId, tx);
    }

    const [enc] = await tx
      .update(encounters)
      .set({ version: sql`${encounters.version} + 1`, updatedAt: new Date() })
      .where(eq(encounters.id, input.encounterId))
      .returning({ version: encounters.version });

    return { ok: true, hpCurrent: updated[0]!.hpCurrent, newVersion: enc!.version };
  });
}
