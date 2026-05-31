import { eq } from 'drizzle-orm';
import { db } from '../../infra/db/client.js';
import { encounterCombatantEffects } from '../../infra/db/schema.js';

/**
 * Removes all encounter combatant effects matching a concentration token.
 *
 * Sibling of removeByConcentrationToken (modifier_instances store).
 * The concentration-service dispatches here when the prior concentration
 * row names store='encounter_combatant_effects' (e.g. Hex, Hunter's Mark).
 *
 * Token uniqueness: tokens are server-minted UUIDs (globalThis.crypto.randomUUID),
 * so a token string is globally unique — no caster-scope guard is needed here
 * (contrast with removeByConcentrationToken which scopes by ownerCharacterId as
 * a legacy defence against client-supplied token collisions).
 *
 * Idempotent: no-op if no rows match (DELETE 0 rows is not an error).
 *
 * Design ref: sdd/engine-concentration-authority/design #1430 — ADR-5.
 */
export async function removeEffectsByConcentrationToken(token: string): Promise<void> {
  await db
    .delete(encounterCombatantEffects)
    .where(eq(encounterCombatantEffects.concentrationToken, token));
}
