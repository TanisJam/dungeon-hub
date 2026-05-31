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
import { db, type DbOrTx } from '../../infra/db/client.js';
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

// ── Private: dropConcentrationRows ───────────────────────────────────────────

/**
 * Drops the child rows for a concentration entry from its store.
 *
 * Private helper — called by startConcentration (drop-prior) and breakConcentration.
 * Dispatches on store type: modifier_instances uses character-scoped remover;
 * encounter_combatant_effects uses token-scoped remover (token is globally unique).
 *
 * @param characterId - PC caster (needed for modifier_instances scope guard).
 * @param store       - Which store holds the live rows.
 * @param token       - Server-minted concentration token.
 * @param executor    - DB or transaction proxy (required for atomicity with callers).
 */
async function dropConcentrationRows(
  characterId: string,
  store: 'modifier_instances' | 'encounter_combatant_effects',
  token: string,
  executor: DbOrTx,
): Promise<void> {
  if (store === 'modifier_instances') {
    // removeByConcentrationToken is character-scoped (legacy caster-scope guard).
    await removeByConcentrationToken(characterId, token, executor);
  } else {
    // encounter_combatant_effects: token is globally unique (server-minted UUID).
    await removeEffectsByConcentrationToken(token, executor);
  }
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
    // Pass `tx` to the drop helper so the DROP executes inside this transaction —
    // not against the module-level db. This closes the atomicity gap identified
    // in verify WARNING-1: without tx threading, a crash between drop and upsert
    // would leave the caster with no concentration row despite the prior rows
    // being deleted (or vice-versa). ADR-4 promised drop+register is atomic.
    if (decision.dropPrior) {
      const { store: priorStore, token: priorToken } = decision.dropPrior;
      await dropConcentrationRows(characterId, priorStore, priorToken, tx);
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

// ── breakConcentration ────────────────────────────────────────────────────────

/**
 * Breaks concentration for a concentrating PC.
 *
 * PHB p.203: on a failed CON save (or incapacitation/death in future slices),
 * the concentration effect is removed and the registry row is deleted.
 *
 * Design ref: sdd/engine-concentration-break-damage/design — ADR-1.
 * REQ-CB-04: save failure → remove effect from store + DELETE registry row.
 *
 * Idempotent: if no registry row exists, returns immediately (no-op).
 * Safe to call when the caller has already verified a row exists (the concentration
 * check helper always does), and safe to call defensively from future Slice 3
 * (incapacitation/death) paths.
 *
 * @param characterId - PC caster whose concentration to break.
 * @param executor    - Optional DB or transaction proxy. Self-opens a transaction
 *                      when absent (drop+DELETE are atomic within this call).
 */
export async function breakConcentration(
  characterId: string,
  executor?: DbOrTx,
): Promise<void> {
  // SELECT the registry row to get store + token.
  const exec = executor ?? db;
  const [row] = await exec
    .select({
      store: characterConcentration.store,
      token: characterConcentration.concentrationToken,
    })
    .from(characterConcentration)
    .where(eq(characterConcentration.characterId, characterId))
    .limit(1);

  // Idempotent no-op: no registry row → nothing to break.
  if (!row) return;

  const runBreak = async (tx: DbOrTx): Promise<void> => {
    // Drop the effect rows from the relevant store.
    await dropConcentrationRows(
      characterId,
      row.store as 'modifier_instances' | 'encounter_combatant_effects',
      row.token,
      tx,
    );
    // DELETE the registry row.
    await tx
      .delete(characterConcentration)
      .where(eq(characterConcentration.characterId, characterId));
  };

  if (executor) {
    // Caller supplied a transaction — run inside it (no nested tx).
    await runBreak(executor);
  } else {
    // Self-open a transaction so drop + DELETE are atomic.
    await db.transaction(runBreak);
  }
}
