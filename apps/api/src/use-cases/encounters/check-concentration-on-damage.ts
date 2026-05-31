/**
 * checkConcentrationOnDamage — shared use-case helper (kept for Batch B backward-compat).
 * prepareConcentrationCheck / resolveConcentrationCheck — Batch A split (ADR-1, Slice 3).
 *
 * Called by all three damage paths (perform-weapon-attack-apply, perform-cast-spell-apply,
 * resolve-cast-reaction). The NEW prepare/resolve split replaces the old single post-tx call:
 *   - prepareConcentrationCheck: PRE-tx reads (registry, save bonus). Returns a plan or null.
 *   - resolveConcentrationCheck: IN-tx commit (roll if needed, break on fail/outright).
 * checkConcentrationOnDamage remains for Batch B call-site migration (will be deleted in B5.2).
 *
 * PHB p.203 — "Maintaining Concentration":
 *   "Whenever you take damage while you are concentrating on a spell, you must make a
 *    Constitution saving throw to maintain your concentration. The DC equals 10 or half
 *    the damage you take, whichever number is higher."
 * PHB p.197 — 0 HP → Unconscious → Incapacitated → concentration ends (no save).
 *
 * SERVER-AUTHORITY INVARIANT (REQ-CB-05):
 *   This module self-supplies a module-level cryptoRng and passes it to rollSavingThrow.
 *   The client NEVER supplies the d20 roll or the save modifier. Any request body field
 *   carrying a concentration roll that mutates state is FORBIDDEN.
 *
 * POST-TX PLACEMENT (old checkConcentrationOnDamage — ADR-3):
 *   Runs AFTER the HP-commit CAS tx (post-tx, mirroring Stunning Strike pattern).
 *   HP commit and concentration break are two separate atomic units — accepted V1 saga.
 *   The prepare/resolve split (Batch A/B) closes this fisura by moving resolve INTO the tx.
 *
 * Design ref: sdd/engine-concentration-break-damage/design — ADR-4.
 * Design ref: sdd/engine-concentration-break-incap-death/design — ADR-1, ADR-2.
 * REQ-CB-01..REQ-CB-05, REQ-CB-08..REQ-CB-10, REQ-CID-02, REQ-CID-04.
 */

import { eq } from 'drizzle-orm';
import {
  computeConcentrationSaveDc,
  rollSavingThrow,
  type RngFn,
} from '@dungeon-hub/domain/engine';
import { db, type DbOrTx } from '../../infra/db/client.js';
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

// ── Batch A: ConcentrationPlan / ConcentrationResolution / prepare / resolve ───
//
// ADR-1 (Slice 3): split checkConcentrationOnDamage into two exported functions:
//   prepareConcentrationCheck — PRE-tx reads (registry, save bonus); no DB handle.
//   resolveConcentrationCheck — IN-tx commit (break outright OR roll save + break on fail).
//
// This split makes the read/commit boundary VISIBLE and statically enforceable:
//   const concPlan = await prepareConcentrationCheck(...)  // OUTSIDE tx
//   await db.transaction(async (tx) => {
//     ...
//     const conc = concPlan ? await resolveConcentrationCheck(concPlan, tx) : undefined;
//   });
//
// The plan object carries NO DB handle → reads cannot leak into the tx (Risk 2 closed).

/**
 * ConcentrationPlan — immutable value produced by prepareConcentrationCheck.
 *
 * Discriminant `breakOutright`:
 *   true  — newHp===0 branch: break outright, no save required (PHB p.197/p.203).
 *           Carries NO dc/saveBonus (omit-not-null per exactOptionalPropertyTypes).
 *   false — save branch: roll CON save; break on fail.
 *           Carries dc (pre-computed) and saveBonus (from character sheet).
 *
 * `characterId` on BOTH arms so resolveConcentrationCheck never re-reads it.
 *
 * REQ-CID-02, ADR-1.
 */
export type ConcentrationPlan =
  | { breakOutright: true; characterId: string }
  | { breakOutright: false; characterId: string; dc: number; saveBonus: number };

/**
 * ConcentrationResolution — return type of resolveConcentrationCheck.
 *
 * Two shapes (ADR-2):
 *   ConcentrationSaveBlock — save was rolled (6 fields, unchanged from Slice 2, REQ-CB-12).
 *   { broke: true; reason: 'incapacitated-0hp' } — outright break (newHp===0 arm).
 *     NO dc/d20/saveMod/total/success fields present (omit-not-null).
 *     Client can branch on `'d20' in concentrationSave` to distinguish shapes.
 *
 * Both shapes map to the existing `concentrationSave?:` response key (back-compat).
 * Call sites widen `concentrationSave?: ConcentrationSaveBlock` → `concentrationSave?: ConcentrationResolution`.
 *
 * REQ-CID-02, ADR-2.
 */
export type ConcentrationResolution =
  | ConcentrationSaveBlock
  | { broke: true; reason: 'incapacitated-0hp' };

// ── prepareConcentrationCheck ─────────────────────────────────────────────────

/**
 * PRE-TX READ phase — runs OUTSIDE the CAS transaction.
 *
 * Guard order (deliberate reorder vs Slice 2 — documented here per ADR-1 note):
 *   Guard 1: characterId===null (NPC) → null. [REQ-CB-10]
 *   Guard 2: registry SELECT → no row → null. [REQ-CB-09]
 *            NOTE: registry read MUST run before the 0-HP check. A non-concentrating
 *            PC at 0 HP is a no-op; break-outright is only meaningful when concentrating.
 *   Guard 3: newHp===0 → { breakOutright: true }. [REQ-CID-02 — PHB p.197/p.203]
 *            Skips DC computation and resolveTargetSave entirely (4+ queries saved).
 *   Guard 4: finalDamage===0 → null. [REQ-CB-08 — save only triggered by damage TAKEN]
 *   Guard 5: Save branch → computeConcentrationSaveDc + resolveTargetSave read.
 *
 * The plan carries NO DB handle so it cannot accidentally initiate reads inside the tx.
 *
 * @param targetCombatant - { kind, characterId } — matches resolveTargetSave input.
 * @param finalDamage     - Post-resistance damage. Used for DC and guard 4.
 * @param newHp           - HP after damage is applied. Guards 3 (0-HP short-circuit).
 * @param opts.npcSaveMod - GM-supplied CON save mod for NPC targets (forward-compat).
 */
export async function prepareConcentrationCheck(
  targetCombatant: { kind: 'pc' | 'npc'; characterId: string | null },
  finalDamage: number,
  newHp: number,
  opts?: { npcSaveMod?: number },
): Promise<ConcentrationPlan | null> {
  // Guard 1: NPC → no registry row possible. REQ-CB-10.
  if (targetCombatant.characterId === null) {
    return null;
  }

  const characterId = targetCombatant.characterId;

  // Guard 2: registry SELECT → no row → target not concentrating. REQ-CB-09.
  // MUST run before the 0-HP check: a non-concentrating PC at 0 HP is a no-op.
  const [registryRow] = await db
    .select({ characterId: characterConcentration.characterId })
    .from(characterConcentration)
    .where(eq(characterConcentration.characterId, characterId))
    .limit(1);

  if (!registryRow) {
    return null;
  }

  // Guard 3: 0-HP PRECEDENCE — break outright, no save rolled. REQ-CID-02.
  // PHB p.197: 0 HP → Unconscious → Incapacitated → concentration ends (PHB p.203).
  // Skips DC computation, resolveTargetSave entirely.
  if (newHp === 0) {
    return { breakOutright: true, characterId };
  }

  // Guard 4: zero damage → PHB p.203: save only triggered by damage TAKEN. REQ-CB-08.
  // Only reached when newHp > 0.
  if (finalDamage === 0) {
    return null;
  }

  // Guard 5: Save branch — compute DC + resolve server-side save bonus.
  const dc = computeConcentrationSaveDc(finalDamage);

  const saveResult = await resolveTargetSave(
    { kind: targetCombatant.kind, characterId, ability: 'con' },
    opts?.npcSaveMod ?? undefined,
  );

  if (!saveResult.ok) {
    // NOT_FOUND or NO_TARGET_SAVE — defensive skip. PC should always resolve.
    return null;
  }

  return {
    breakOutright: false,
    characterId,
    dc,
    saveBonus: saveResult.saveMod,
  };
}

// ── resolveConcentrationCheck ─────────────────────────────────────────────────

/**
 * IN-TX COMMIT phase — runs INSIDE the CAS transaction.
 *
 * Behavior per plan discriminant:
 *   breakOutright===true  → breakConcentration(characterId, tx); return { broke:true, reason:'incapacitated-0hp' }.
 *   breakOutright===false → rollSavingThrow (server-minted cryptoRng; NEVER from client);
 *                           on fail → breakConcentration(characterId, tx);
 *                           return ConcentrationSaveBlock.
 *
 * CRITICAL: the `tx` argument is the SAME transaction used for the HP UPDATE.
 * breakConcentration(characterId, tx) is therefore covered by the same rollback. This is
 * the fisura Slice 3 closes (vs the Slice 2 post-tx saga pattern).
 *
 * @param plan - Non-null plan from prepareConcentrationCheck.
 * @param tx   - Active Drizzle transaction (DbOrTx). MUST be inside the caller's tx closure.
 */
export async function resolveConcentrationCheck(
  plan: ConcentrationPlan,
  tx: DbOrTx,
): Promise<ConcentrationResolution | undefined> {
  // ── Outright break (newHp===0 arm) ──────────────────────────────────────────
  // PHB p.197/p.203: 0 HP → concentration ends unconditionally, no save.
  if (plan.breakOutright) {
    await breakConcentration(plan.characterId, tx);
    return { broke: true, reason: 'incapacitated-0hp' };
  }

  // ── Save branch ──────────────────────────────────────────────────────────────
  // Server-minted cryptoRng — client NEVER supplies the d20 (REQ-CB-05).
  const roll = rollSavingThrow(plan.saveBonus, plan.dc, 'normal', cryptoRng);

  if (!roll.success) {
    await breakConcentration(plan.characterId, tx);
  }

  return {
    dc: plan.dc,
    d20: roll.d20,
    total: roll.total,
    saveMod: roll.saveMod,
    success: roll.success,
    broke: !roll.success,
  };
}

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
