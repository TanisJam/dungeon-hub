/**
 * performForcedCheck — forced saving throw + condition apply use-case.
 *
 * PHB p.179 — Saving Throws: DC set by ability or spell. success = total >= DC.
 * PHB p.292 — Stunned: automatically fails STR and DEX saving throws.
 * PHB p.292 — Stunned implies Incapacitated (dual-insert on fail, ADR-4).
 *
 * 9-step ADR-5 flow:
 *  1. Load encounter + active guard
 *  2. Load target combatant (kind, characterId)
 *  3. Validate conditionOnFail against hardcoded catalog (Stunned only in 3a)
 *  4. Load target's existing condition rows (for auto-fail check + idempotency)
 *  5. Stunned-STR/DEX auto-fail short-circuit (PHB p.292 — BEFORE rolling)
 *  6. resolveTargetSave → saveMod (NO_TARGET_SAVE → early-return)
 *  7. rollSavingThrow(saveMod, dc, rollMode ?? 'normal', cryptoRng)
 *  8. On fail: idempotent dual-insert Stunned + Incapacitated (ADR-3, ADR-4)
 *  9. Return discriminated response (save | fail | autoFail)
 *
 * CAS DECISION (ADR-5): forced-check does NOT require/bump encounters.version.
 * Condition insert is independent of encounter HP state (append-only child table).
 * No lost-update hazard in 3a (removal is 3b). Contrast: attack-apply bumps version
 * because it mutates HP (true optimistic-lock surface).
 *
 * Design ref: sdd/engine-forced-check-3a/design — ADR-5, ADR-4, ADR-3, ADR-2.
 */

import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../../infra/db/client.js';
import { encounters, encounterCombatants, encounterCombatantConditions } from '../../infra/db/schema.js';
import {
  rollSavingThrow,
  isImmuneToCondition,
  type RngFn,
} from '@dungeon-hub/domain/engine';
import { resolveTargetSave, type Ability } from './resolve-target-save.js';
import { breakConcentration } from '../engine/concentration-service.js';
import { isRaging } from '@dungeon-hub/domain/engine';

// ── Crypto RNG (mirrors perform-weapon-attack-apply.ts) ───────────────────────

/**
 * Server-side crypto RNG. Same pattern as attack-apply (ADR-5).
 * Returns an integer in [1..sides].
 */
const cryptoRng: RngFn = (sides: number): number => {
  const buf = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buf);
  return (buf[0]! % sides) + 1;
};

// ── Condition catalog (hardcoded in 3a) ───────────────────────────────────────

/**
 * Condition catalog — valid values for conditionOnFail.
 * TODO #513: replace with DB catalog when conditions-catalog SDD lands.
 */
const CONDITION_CATALOG = new Set(['Stunned', 'Blinded', 'Invisible', 'Poisoned', 'Incapacitated', 'Petrified']);

// Abilities that trigger auto-fail when target is Stunned (PHB p.292).
const STUNNED_AUTOFAIL_ABILITIES = new Set<Ability>(['str', 'dex']);

// ── Input / Output ─────────────────────────────────────────────────────────────

export interface PerformForcedCheckInput {
  encounterId: string;
  targetCombatantId: string;
  ability: Ability;
  dc: number;
  conditionOnFail: string;
  npcSaveMod?: number | null;
  rollMode?: 'normal' | 'advantage' | 'disadvantage';
  /** Optional: ID of the combatant that caused this forced check (for applied_by correlation). */
  appliedByCombatantId?: string | null;
  // Turn-anchor fields (3b-i sweep). All optional — when omitted, conditions are permanent.
  // TODO 3b-future: orphaned-anchor cleanup if anchor combatant is removed mid-stun (ADR-6).
  turnAnchorEntityId?: string | null;
  turnAnchorBoundary?: 'start' | 'end';
  turnsRemaining?: number | null;
  /**
   * When true AND turnAnchorEntityId is provided, an already-present condition row will
   * have its turn-anchor fields refreshed instead of being silently skipped.
   *
   * Used by Stunning Strike (Slice 3b-ii, ADR-4) to implement re-stun refresh semantics:
   * "until end of your next turn" restarts from the new Monk turn on a fresh Stunning Strike.
   *
   * BACKWARD-COMPAT INVARIANTS (double-gate — both must pass):
   *   (a) refreshAnchorOnExisting must be true
   *   (b) turnAnchorEntityId must be non-null
   * Standalone forced-check route passes neither → double-gate fails → continue/no-op as before.
   * NULL-anchor permanent conditions: flag true but anchor null → gate (b) fails → no-op.
   *
   * Default: false (undefined treated as false).
   */
  refreshAnchorOnExisting?: boolean;
}

/**
 * A skipped condition entry when the target is immune to a condition being applied.
 *
 * engine-resist-immunity C-8 / orchestrator reconciliation:
 * SILENT no-op + transparency field (not a hard reject).
 */
export interface SkippedImmuneEntry {
  condition: string;
  reason: 'immune';
}

export type PerformForcedCheckResult =
  // Rolled save — success: no condition applied.
  | {
      ok: true;
      outcome: 'save';
      save: {
        d20: number;
        d20All: number[];
        saveMod: number;
        dc: number;
        total: number;
        success: true;
        rollMode: 'normal' | 'advantage' | 'disadvantage';
      };
      applied: string[];
      /** Conditions skipped because the target is immune. Present only when non-empty. */
      skippedImmune?: SkippedImmuneEntry[];
    }
  // Rolled save — fail: condition(s) applied.
  | {
      ok: true;
      outcome: 'fail';
      save: {
        d20: number;
        d20All: number[];
        saveMod: number;
        dc: number;
        total: number;
        success: false;
        rollMode: 'normal' | 'advantage' | 'disadvantage';
      };
      applied: string[];
      /** Conditions skipped because the target is immune. Present only when non-empty. */
      skippedImmune?: SkippedImmuneEntry[];
    }
  // Auto-fail (Stunned or Petrified target, STR/DEX save — PHB p.292, p.291): no d20 rolled.
  | {
      ok: true;
      outcome: 'autoFail';
      reason: 'stunned-str-dex' | 'petrified-str-dex';
      applied: string[];
      /** Conditions skipped because the target is immune. Present only when non-empty. */
      skippedImmune?: SkippedImmuneEntry[];
    }
  // Error states
  | { ok: false; code: 'NOT_FOUND'; target: 'encounter' | 'target' }
  | { ok: false; code: 'ENCOUNTER_NOT_ACTIVE' }
  | { ok: false; code: 'NO_TARGET_SAVE' }
  | { ok: false; code: 'UNKNOWN_CONDITION'; condition: string };

// ── performForcedCheck ─────────────────────────────────────────────────────────

/**
 * Runs a forced saving throw against a target combatant and applies the specified
 * condition on failure (idempotent — skips insert if condition already present).
 *
 * PURE APPEND: no encounters.version bump (ADR-5).
 */
export async function performForcedCheck(
  input: PerformForcedCheckInput,
): Promise<PerformForcedCheckResult> {
  const {
    encounterId,
    targetCombatantId,
    ability,
    dc,
    conditionOnFail,
    npcSaveMod,
    rollMode = 'normal',
    appliedByCombatantId = null,
    turnAnchorEntityId = null,
    turnAnchorBoundary,       // undefined when omitted → maps to null in INSERT
    turnsRemaining = null,
    refreshAnchorOnExisting = false,
  } = input;

  // ── Step 1: Load encounter + active guard ─────────────────────────────────────
  const [encounterRow] = await db
    .select({ id: encounters.id, status: encounters.status })
    .from(encounters)
    .where(eq(encounters.id, encounterId))
    .limit(1);

  if (!encounterRow) return { ok: false, code: 'NOT_FOUND', target: 'encounter' };
  if (encounterRow.status !== 'active') return { ok: false, code: 'ENCOUNTER_NOT_ACTIVE' };

  // ── Step 2: Load target combatant ─────────────────────────────────────────────
  const [targetCombatant] = await db
    .select({
      id: encounterCombatants.id,
      kind: encounterCombatants.kind,
      characterId: encounterCombatants.characterId,
    })
    .from(encounterCombatants)
    .where(
      and(
        eq(encounterCombatants.id, targetCombatantId),
        eq(encounterCombatants.encounterId, encounterId),
      ),
    )
    .limit(1);

  if (!targetCombatant) return { ok: false, code: 'NOT_FOUND', target: 'target' };

  // ── Step 3: Validate conditionOnFail against 3a catalog ───────────────────────
  if (!CONDITION_CATALOG.has(conditionOnFail)) {
    return { ok: false, code: 'UNKNOWN_CONDITION', condition: conditionOnFail };
  }

  // ── Step 4: Load target's existing condition rows ────────────────────────────
  const existingConditionRows = await db
    .select({ conditionName: encounterCombatantConditions.conditionName })
    .from(encounterCombatantConditions)
    .where(eq(encounterCombatantConditions.combatantId, targetCombatantId));

  const existingConditionNames = new Set(existingConditionRows.map((r) => r.conditionName));

  // ── Step 5: Stunned/Petrified-STR/DEX auto-fail short-circuit ──────────────────
  // PHB p.292: "A stunned creature automatically fails Strength and Dexterity saving throws."
  // PHB p.291: Petrified applies the same auto-fail rule (same ability set: STR+DEX).
  // Both fire BEFORE resolveTargetSave (no save mod derivation needed on auto-fail).
  const targetIsStunned = existingConditionNames.has('Stunned');
  // engine-resist-immunity C-7: generalize to Petrified (PHB p.291).
  const targetIsPetrified = existingConditionNames.has('Petrified');
  const isAutoFailAbility = STUNNED_AUTOFAIL_ABILITIES.has(ability);

  if ((targetIsStunned || targetIsPetrified) && isAutoFailAbility) {
    // Auto-fail — apply conditions without rolling.
    const { applied, skippedImmune } = await applyConditions({
      targetCombatantId,
      conditionOnFail,
      existingConditionNames,
      appliedByCombatantId,
      turnAnchorEntityId,
      turnAnchorBoundary,
      turnsRemaining,
      refreshAnchorOnExisting,
    });

    // REQ-CID-01: break concentration when Incapacitated is freshly applied to a PC.
    // PHB p.203: concentration ends on incapacitation.
    // BEST-EFFORT POST-APPLY (ADR-4 — no mini-tx): breakConcentration runs after applyConditions
    // commits. A crash between condition insert and this call leaves an incapacitated-but-
    // concentrating state — a generous (not punitive) failure. The inverse (break without
    // condition) cannot occur because breakConcentration runs strictly after applyConditions.
    // NPC guard: characterId===null → skip (registry is characterId-keyed).
    if (applied.includes('Incapacitated') && targetCombatant.characterId !== null) {
      await breakConcentration(targetCombatant.characterId);
    }

    const reason = targetIsStunned ? 'stunned-str-dex' : 'petrified-str-dex';
    return {
      ok: true,
      outcome: 'autoFail',
      reason,
      applied,
      ...(skippedImmune.length > 0 ? { skippedImmune } : {}),
    };
  }

  // ── Step 5b: Raging STR-save advantage (REQ-RAGE-04, PHB p.48 — ADR-6 Option A) ──
  // PHB p.48: "You have advantage on Strength checks and Strength saving throws."
  // Pre-compute rollMode upgrade: if the TARGET is Raging and the ability is 'str',
  // upgrade rollMode → 'advantage' (explicit caller-supplied rollMode still wins if provided,
  // unless the caller left it at the default 'normal').
  // ADR-6: derive INSIDE performForcedCheck so every caller benefits without duplication.
  // NOTE: existingConditionNames is already loaded in Step 4 — no additional DB query needed.
  let resolvedRollMode = rollMode;
  if (
    resolvedRollMode === 'normal' &&
    ability === 'str' &&
    isRaging(existingConditionRows.map((r) => ({ name: r.conditionName })))
  ) {
    resolvedRollMode = 'advantage';
  }

  // ── Step 6: Resolve target save modifier ──────────────────────────────────────
  const saveResult = await resolveTargetSave(
    {
      kind: targetCombatant.kind as 'pc' | 'npc',
      characterId: targetCombatant.characterId,
      ability,
    },
    npcSaveMod ?? null,
  );

  if (!saveResult.ok) {
    if (saveResult.code === 'NO_TARGET_SAVE') {
      return { ok: false, code: 'NO_TARGET_SAVE' };
    }
    return { ok: false, code: 'NOT_FOUND', target: 'target' };
  }

  const { saveMod } = saveResult;

  // ── Step 7: Roll the saving throw ─────────────────────────────────────────────
  // Use resolvedRollMode (may be upgraded to 'advantage' by Step 5b Raging gate).
  const saveRoll = rollSavingThrow(saveMod, dc, resolvedRollMode, cryptoRng);

  // ── Step 8: On fail, apply conditions idempotently ───────────────────────────
  if (!saveRoll.success) {
    const { applied, skippedImmune } = await applyConditions({
      targetCombatantId,
      conditionOnFail,
      existingConditionNames,
      appliedByCombatantId,
      turnAnchorEntityId,
      turnAnchorBoundary,
      turnsRemaining,
      refreshAnchorOnExisting,
    });

    // REQ-CID-01: break concentration when Incapacitated is freshly applied to a PC.
    // PHB p.203: concentration ends on incapacitation.
    // BEST-EFFORT POST-APPLY (ADR-4 — no mini-tx): see comment in auto-fail branch above.
    // NPC guard: characterId===null → skip.
    if (applied.includes('Incapacitated') && targetCombatant.characterId !== null) {
      await breakConcentration(targetCombatant.characterId);
    }

    return {
      ok: true,
      outcome: 'fail',
      save: {
        d20: saveRoll.d20,
        d20All: saveRoll.d20All,
        saveMod: saveRoll.saveMod,
        dc: saveRoll.dc,
        total: saveRoll.total,
        success: false,
        rollMode: saveRoll.rollMode,
      },
      applied,
      ...(skippedImmune.length > 0 ? { skippedImmune } : {}),
    };
  }

  // ── Step 9: Save succeeded — no conditions applied ───────────────────────────
  return {
    ok: true,
    outcome: 'save',
    save: {
      d20: saveRoll.d20,
      d20All: saveRoll.d20All,
      saveMod: saveRoll.saveMod,
      dc: saveRoll.dc,
      total: saveRoll.total,
      success: true,
      rollMode: saveRoll.rollMode,
    },
    applied: [],
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Idempotently inserts (or refreshes) condition rows on fail (ADR-3, ADR-4).
 *
 * For conditionOnFail='Stunned': also inserts Incapacitated (PHB p.292 implication).
 * For conditionOnFail='Petrified': also inserts Incapacitated (PHB p.291 implication).
 * Each condition checked independently:
 *   - If immune → skip insert, push to skippedImmune[] (C-8 orchestrator reconciliation).
 *   - If absent → insert.
 *   - If already present + refreshAnchorOnExisting=true + turnAnchorEntityId≠null
 *     → UPDATE turn-anchor fields (re-stun refresh, Slice 3b-ii ADR-4).
 *   - Otherwise → skip insert/update (no-op).
 *
 * BACKWARD-COMPAT double-gate for refresh:
 *   Both (a) refreshAnchorOnExisting===true AND (b) turnAnchorEntityId!==null
 *   must hold. Standalone forced-check (no anchor, no flag) satisfies neither → no-op.
 *   NULL-anchor permanent conditions: flag true but anchor null → gate (b) fails → no-op.
 *
 * Returns { applied, skippedImmune }.
 *   applied      = list of newly-inserted condition names (refreshes NOT added).
 *   skippedImmune = list of skipped immune entries (empty when no immunity fires).
 */
async function applyConditions(opts: {
  targetCombatantId: string;
  conditionOnFail: string;
  existingConditionNames: Set<string>;
  appliedByCombatantId: string | null;
  turnAnchorEntityId: string | null;
  turnAnchorBoundary: 'start' | 'end' | undefined;
  turnsRemaining: number | null;
  refreshAnchorOnExisting: boolean;
}): Promise<{ applied: string[]; skippedImmune: SkippedImmuneEntry[] }> {
  const {
    targetCombatantId,
    conditionOnFail,
    existingConditionNames,
    appliedByCombatantId,
    turnAnchorEntityId,
    turnAnchorBoundary,
    turnsRemaining,
    refreshAnchorOnExisting,
  } = opts;
  const applied: string[] = [];
  const skippedImmune: SkippedImmuneEntry[] = [];

  // Determine which conditions to insert.
  // ADR-4: 'Stunned' implies 'Incapacitated' (PHB p.292 — dual-insert).
  // engine-resist-immunity C-6: 'Petrified' also implies 'Incapacitated' (PHB p.291 — dual-insert).
  const conditionsToApply: string[] = [conditionOnFail];
  if (conditionOnFail === 'Stunned' || conditionOnFail === 'Petrified') {
    conditionsToApply.push('Incapacitated');
  }

  // Build the set of existing condition objects for isImmuneToCondition (needs { name: string }[]).
  const existingConditionsForImmunity = Array.from(existingConditionNames).map((name) => ({ name }));

  for (const conditionName of conditionsToApply) {
    // ── C-8: Condition-immunity gate (engine-resist-immunity — ADR-7) ─────────
    // isImmuneToCondition checks if any EXISTING active condition grants immunity
    // to the incoming conditionName (e.g. Petrified → immune to Poisoned).
    //
    // ORCHESTRATOR RECONCILIATION (locked): SILENT no-op + skippedImmune[] transparency.
    // No hard reject — the request succeeds; Poisoned row is NOT inserted;
    // skippedImmune is surfaced in the result so DM/engine can observe the block.
    // Applies to EVERY conditionName in conditionsToApply (covers dual-insert names too).
    if (isImmuneToCondition(existingConditionsForImmunity, conditionName)) {
      skippedImmune.push({ condition: conditionName, reason: 'immune' });
      continue;
    }

    // ADR-3: App-level idempotency — skip if already present (with optional refresh).
    if (existingConditionNames.has(conditionName)) {
      // REFRESH path (Slice 3b-ii ADR-4): update turn-anchor on existing row when:
      //   (a) caller opts in via refreshAnchorOnExisting=true
      //   (b) a turn-anchor entity is supplied (not null)
      // Double-gate ensures standalone forced-check and NULL-anchor permanent conditions
      // are never refreshed — their existing behavior (continue/no-op) is preserved.
      // Dual-pair (Stunned+Incapacitated): loop runs per conditionName → both rows
      // get the same new anchor → 3b-i sweep still removes them as a pair (REQ-TAS-05).
      if (refreshAnchorOnExisting && turnAnchorEntityId != null) {
        await db
          .update(encounterCombatantConditions)
          .set({
            turnAnchorEntityId,
            turnAnchorBoundary: turnAnchorBoundary ?? null,
            turnsRemaining: turnsRemaining ?? null,
            appliedByCombatantId: appliedByCombatantId ?? null,
          })
          .where(
            and(
              eq(encounterCombatantConditions.combatantId, targetCombatantId),
              eq(encounterCombatantConditions.conditionName, conditionName),
            ),
          );
        // NOT pushed to `applied` (already applied; tracked separately as refresh if needed).
      }
      continue; // never double-insert regardless of refresh path
    }

    // INSERT into encounter_combatant_conditions (plain INSERT, no CAS — ADR-5).
    // Anchor fields: null when omitted → permanent condition (ADR-4 backward-compat).
    // Both Stunned+Incapacitated rows receive IDENTICAL anchor data from shared closure
    // vars → ensures the ADR-2 DELETE sweep removes them as an atomic pair (REQ-TAS-05).
    await db.insert(encounterCombatantConditions).values({
      combatantId: targetCombatantId,
      conditionName,
      appliedByCombatantId: appliedByCombatantId ?? null,
      turnAnchorEntityId: turnAnchorEntityId ?? null,
      turnAnchorBoundary: turnAnchorBoundary ?? null,
      turnsRemaining: turnsRemaining ?? null,
    });

    applied.push(conditionName);
  }

  return { applied, skippedImmune };
}
