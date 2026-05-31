/**
 * concentration-service — shared server-authoritative concentration service.
 *
 * PHB p.203: "You lose concentration on a spell if you cast another spell that
 * requires concentration." This service is the SINGLE enforcement point for that
 * rule across both effect stores (modifier_instances, encounter_combatant_effects).
 *
 * NEVER reimplement the one-at-a-time rule in individual routes or use-cases.
 * Both cast paths call this service AFTER writing their own store rows.
 *
 * Algorithm (single transaction — atomic drop+register):
 *   1. SELECT existing character_concentration row for characterId.
 *   2. If present → call the store-specific remover for {row.store, row.token}
 *      to drop the PRIOR concentration's child rows.
 *   3. UPSERT character_concentration with the new token/store/spellName.
 *      (ON CONFLICT characterId DO UPDATE) — PK invariant maintained.
 *
 * The pure PHB p.203 decision (does this incoming spell require concentration?
 * should we drop the prior?) lives in packages/domain — decideConcentration.
 * This service executes the decision's IO consequences.
 *
 * PC casters ONLY: registry keyed by characterId. NPC casters (characterId=null)
 * must NOT call this service — the route/use-case layer is responsible for the
 * skip. Calling this with a non-existent characterId will throw (FK violation).
 *
 * Design ref: sdd/engine-concentration-authority/design #1430 — ADR-4, ADR-5.
 * REQ-CONC-02, REQ-CONC-03, REQ-CONC-05.
 */

import { eq } from 'drizzle-orm';
import { decideConcentration, type ConcentrationEntry } from '@dungeon-hub/domain/engine';
import { db } from '../../infra/db/client.js';
import { characterConcentration } from '../../infra/db/schema.js';
import { removeByConcentrationToken } from '../characters/remove-by-concentration-token.js';
import { removeEffectsByConcentrationToken } from '../encounters/remove-effects-by-concentration-token.js';

// ── Input ─────────────────────────────────────────────────────────────────────

export interface StartConcentrationInput {
  /** The PC character who is casting. Must be non-null (NPC path skips this service). */
  characterId: string;
  newConcentration: {
    /** Which store this cast's effect rows land in. */
    store: 'modifier_instances' | 'encounter_combatant_effects';
    /** Open text spell name (matches schema: no enum, §1.2 homebrew). */
    spellName: string;
    /** Server-minted token (must have been written to the store rows already). */
    token: string;
  };
}

// ── startConcentration ────────────────────────────────────────────────────────

/**
 * Enforces PHB p.203 one-at-a-time rule for a PC caster.
 *
 * Preconditions (caller's responsibility):
 *   - The new effect rows have already been written to the store.
 *   - characterId is non-null (NPC callers must skip this function).
 *   - The token passed here is the same one written to the store rows.
 *
 * Postconditions:
 *   - Any prior concentration rows in either store are removed.
 *   - character_concentration has exactly one row for characterId (the new cast).
 */
export async function startConcentration(input: StartConcentrationInput): Promise<void> {
  const { characterId, newConcentration } = input;

  await db.transaction(async (tx) => {
    // Step 1: Read the current concentration registry row for this character.
    const [existingRow] = await tx
      .select({
        store: characterConcentration.store,
        token: characterConcentration.concentrationToken,
        spellName: characterConcentration.spellName,
      })
      .from(characterConcentration)
      .where(eq(characterConcentration.characterId, characterId))
      .limit(1);

    // Step 2: Apply the PHB p.203 decision via the pure domain helper.
    const prior: ConcentrationEntry | null = existingRow
      ? {
          store: existingRow.store as ConcentrationEntry['store'],
          token: existingRow.token,
          spellName: existingRow.spellName,
        }
      : null;

    const decision = decideConcentration(prior, {
      store: newConcentration.store,
      token: newConcentration.token,
      spellName: newConcentration.spellName,
      requiresConcentration: true, // all callers are concentration spells; non-concentration callers must not call this service
    });

    // The service is only called for concentration spells, so decision is never noOp.
    // Belt-and-suspenders guard: if somehow called for a non-concentration spell, do nothing.
    if ('noOp' in decision) return;

    // Step 3: Drop the prior concentration's child rows if one was active.
    if (decision.dropPrior) {
      const { store: priorStore, token: priorToken } = decision.dropPrior;
      if (priorStore === 'modifier_instances') {
        // removeByConcentrationToken is character-scoped (legacy caster-scope guard).
        await removeByConcentrationToken(characterId, priorToken);
      } else {
        // encounter_combatant_effects: token is globally unique (server-minted UUID).
        await removeEffectsByConcentrationToken(priorToken);
      }
    }

    // Step 4: UPSERT the registry row (PK = characterId; ON CONFLICT DO UPDATE).
    await tx
      .insert(characterConcentration)
      .values({
        characterId,
        concentrationToken: newConcentration.token,
        store: newConcentration.store,
        spellName: newConcentration.spellName,
      })
      .onConflictDoUpdate({
        target: characterConcentration.characterId,
        set: {
          concentrationToken: newConcentration.token,
          store: newConcentration.store,
          spellName: newConcentration.spellName,
          startedAt: new Date(),
        },
      });
  });
}
