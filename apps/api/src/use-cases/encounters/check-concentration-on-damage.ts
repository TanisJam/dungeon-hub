/**
 * checkConcentrationOnDamage — shared use-case helper.
 *
 * Called by all three damage paths (perform-weapon-attack-apply, perform-cast-spell-apply,
 * resolve-cast-reaction) AFTER resolveResistance and AFTER the HP-commit CAS transaction
 * returns success. Orchestrates the PHB p.203 concentration save lifecycle:
 *
 *   Guard chain → DC formula → save roll → break on fail
 *
 * PHB p.203 — "Maintaining Concentration":
 *   "Whenever you take damage while you are concentrating on a spell, you must make a
 *    Constitution saving throw to maintain your concentration. The DC equals 10 or half
 *    the damage you take, whichever number is higher."
 *
 * SERVER-AUTHORITY INVARIANT (REQ-CB-05):
 *   This helper self-supplies a module-level cryptoRng and passes it to rollSavingThrow.
 *   The client NEVER supplies the d20 roll or the save modifier. Any request body field
 *   carrying a concentration roll that mutates state is FORBIDDEN.
 *
 * POST-TX PLACEMENT (ADR-3):
 *   Runs AFTER the HP-commit CAS tx (post-tx, mirroring Stunning Strike pattern).
 *   HP commit and concentration break are two separate atomic units — accepted V1 saga.
 *
 * Design ref: sdd/engine-concentration-break-damage/design — ADR-4.
 * REQ-CB-01, REQ-CB-02, REQ-CB-03, REQ-CB-04, REQ-CB-05, REQ-CB-08, REQ-CB-09, REQ-CB-10.
 */

import { eq } from 'drizzle-orm';
import {
  computeConcentrationSaveDc,
  rollSavingThrow,
  type RngFn,
} from '@dungeon-hub/domain/engine';
import { db } from '../../infra/db/client.js';
import { characterConcentration } from '../../infra/db/schema.js';
import { resolveTargetSave } from './resolve-target-save.js';
import { breakConcentration } from '../engine/concentration-service.js';

// ── Server-authoritative crypto RNG ───────────────────────────────────────────
//
// Mirrors the pattern in perform-weapon-attack-apply.ts:55-58 and
// perform-cast-spell-apply.ts:54-57. ONE module-level instance, used for every
// CON save rolled by this helper. The client NEVER supplies the dice (REQ-CB-05).

const cryptoRng: RngFn = (sides: number): number => {
  const buf = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buf);
  return (buf[0]! % sides) + 1;
};

// ── Types ──────────────────────────────────────────────────────────────────────

/**
 * ConcentrationSaveBlock — the outcome of one concentration save.
 *
 * Mirrors the stunningStrike.save sub-block shape for combat-log UI consistency.
 * Added `dc` (required for the client to display the threshold) and `broke`
 * (explicit flag for clarity and future War Caster / auto-fail nuance).
 *
 * REQ-CB-12: all 6 fields MUST be present when concentrationSave is in the response.
 */
export interface ConcentrationSaveBlock {
  /** DC computed from finalDamage: max(10, floor(finalDamage / 2)). PHB p.203. */
  dc: number;
  /** Kept d20 die result (post advantage/disadvantage selection). */
  d20: number;
  /** d20 (kept) + saveMod. */
  total: number;
  /** Server-derived CON save modifier (ability mod + proficiency if applicable). */
  saveMod: number;
  /** true = total >= dc → concentration maintained. PHB p.203: success ≥ dc. */
  success: boolean;
  /** true = !success → concentration dropped. Always === !success in V1. */
  broke: boolean;
}

/**
 * ConcentrationCheckResult — return type of checkConcentrationOnDamage.
 *
 * { concentrating: false } — any guard branch fired (NPC, zero damage, no registry row).
 * { concentrating: true; save: ConcentrationSaveBlock } — save was rolled.
 *
 * Call sites map concentrating:true to { concentrationSave: result.save } in the response,
 * and omit the key entirely on concentrating:false (REQ-CB-12 backward-compat omit-not-null).
 */
export type ConcentrationCheckResult =
  | { concentrating: false }
  | { concentrating: true; save: ConcentrationSaveBlock };

// ── checkConcentrationOnDamage ─────────────────────────────────────────────────

/**
 * Rolls the PHB p.203 CON save for a concentrating PC target.
 *
 * Guard chain (returns {concentrating:false} immediately on any guard hit):
 *   1. NPC target (characterId=null) → no registry row possible (REQ-CB-10).
 *   2. finalDamage=0 → PHB p.203: a save is only triggered by damage TAKEN (REQ-CB-08).
 *   3. No character_concentration row → target not concentrating (REQ-CB-09).
 *   4. resolveTargetSave fails (NOT_FOUND / NO_TARGET_SAVE) → skip defensively.
 *
 * Happy path: computeConcentrationSaveDc → rollSavingThrow → breakConcentration on fail.
 *
 * @param targetCombatant - Combatant shape: kind + characterId (matches resolveTargetSave input).
 * @param finalDamage     - Post-resistance damage (used for DC formula). PHB p.203.
 * @param opts.npcSaveMod - GM-supplied CON save mod for NPC targets (forward-compat; V1 NPCs skip via guard 1).
 */
export async function checkConcentrationOnDamage(
  targetCombatant: { kind: 'pc' | 'npc'; characterId: string | null },
  finalDamage: number,
  opts?: { npcSaveMod?: number },
): Promise<ConcentrationCheckResult> {
  // Guard 1: NPC → no registry row possible. REQ-CB-10.
  if (targetCombatant.characterId === null) {
    return { concentrating: false };
  }

  // Guard 2: zero damage → PHB p.203: save only triggered by damage TAKEN. REQ-CB-08.
  if (finalDamage === 0) {
    return { concentrating: false };
  }

  const characterId = targetCombatant.characterId;

  // Guard 3: No registry row → target not concentrating. REQ-CB-09.
  const [registryRow] = await db
    .select({ characterId: characterConcentration.characterId })
    .from(characterConcentration)
    .where(eq(characterConcentration.characterId, characterId))
    .limit(1);

  if (!registryRow) {
    return { concentrating: false };
  }

  // Step 4: Compute DC (pure domain). PHB p.203: max(10, floor(finalDamage / 2)).
  const dc = computeConcentrationSaveDc(finalDamage);

  // Step 5: Resolve server-side CON save modifier. Guard 4: on failure skip (never crash).
  const saveResult = await resolveTargetSave(
    { kind: targetCombatant.kind, characterId, ability: 'con' },
    opts?.npcSaveMod ?? undefined,
  );

  if (!saveResult.ok) {
    // NOT_FOUND or NO_TARGET_SAVE — defensive skip. PC should always resolve.
    return { concentrating: false };
  }

  const saveMod = saveResult.saveMod;

  // Step 6: Roll the save. Server-minted cryptoRng — client NEVER supplies the d20 (REQ-CB-05).
  // rollMode 'normal' in V1 (War Caster advantage deferred to future slice).
  const roll = rollSavingThrow(saveMod, dc, 'normal', cryptoRng);

  const success = roll.success;

  // Step 7: Break concentration on fail. REQ-CB-04.
  if (!success) {
    await breakConcentration(characterId);
  }

  return {
    concentrating: true,
    save: {
      dc,
      d20: roll.d20,
      total: roll.total,
      saveMod: roll.saveMod,
      success,
      broke: !success,
    },
  };
}
