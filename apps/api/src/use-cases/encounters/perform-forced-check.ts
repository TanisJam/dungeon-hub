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
  type RngFn,
} from '@dungeon-hub/domain/engine';
import { resolveTargetSave, type Ability } from './resolve-target-save.js';

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
 * 3a condition catalog — valid values for conditionOnFail.
 * TODO #513: replace with DB catalog when conditions-catalog SDD lands.
 */
const CONDITION_CATALOG_3A = new Set(['Stunned']);

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
    }
  // Auto-fail (Stunned target, STR/DEX save — PHB p.292): no d20 rolled.
  | {
      ok: true;
      outcome: 'autoFail';
      reason: 'stunned-str-dex';
      applied: string[];
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
  if (!CONDITION_CATALOG_3A.has(conditionOnFail)) {
    return { ok: false, code: 'UNKNOWN_CONDITION', condition: conditionOnFail };
  }

  // ── Step 4: Load target's existing condition rows ────────────────────────────
  const existingConditionRows = await db
    .select({ conditionName: encounterCombatantConditions.conditionName })
    .from(encounterCombatantConditions)
    .where(eq(encounterCombatantConditions.combatantId, targetCombatantId));

  const existingConditionNames = new Set(existingConditionRows.map((r) => r.conditionName));

  // ── Step 5: Stunned-STR/DEX auto-fail short-circuit (PHB p.292) ───────────────
  // "A stunned creature automatically fails Strength and Dexterity saving throws."
  // This runs BEFORE resolveTargetSave (no need to derive save mod on auto-fail).
  const targetIsStunned = existingConditionNames.has('Stunned');
  const isAutoFailAbility = STUNNED_AUTOFAIL_ABILITIES.has(ability);

  if (targetIsStunned && isAutoFailAbility) {
    // Auto-fail — apply conditions without rolling.
    const applied = await applyConditions({
      targetCombatantId,
      conditionOnFail,
      existingConditionNames,
      appliedByCombatantId,
      turnAnchorEntityId,
      turnAnchorBoundary,
      turnsRemaining,
    });
    return {
      ok: true,
      outcome: 'autoFail',
      reason: 'stunned-str-dex',
      applied,
    };
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
  const saveRoll = rollSavingThrow(saveMod, dc, rollMode, cryptoRng);

  // ── Step 8: On fail, apply conditions idempotently ───────────────────────────
  if (!saveRoll.success) {
    const applied = await applyConditions({
      targetCombatantId,
      conditionOnFail,
      existingConditionNames,
      appliedByCombatantId,
      turnAnchorEntityId,
      turnAnchorBoundary,
      turnsRemaining,
    });

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
 * Idempotently inserts condition rows on fail (ADR-3, ADR-4).
 *
 * For conditionOnFail='Stunned': also inserts Incapacitated (PHB p.292 implication).
 * Each condition checked independently:
 *   - If already present → skip insert (no-op).
 *   - If absent → insert.
 * Returns list of newly-inserted condition names.
 */
async function applyConditions(opts: {
  targetCombatantId: string;
  conditionOnFail: string;
  existingConditionNames: Set<string>;
  appliedByCombatantId: string | null;
  turnAnchorEntityId: string | null;
  turnAnchorBoundary: 'start' | 'end' | undefined;
  turnsRemaining: number | null;
}): Promise<string[]> {
  const {
    targetCombatantId,
    conditionOnFail,
    existingConditionNames,
    appliedByCombatantId,
    turnAnchorEntityId,
    turnAnchorBoundary,
    turnsRemaining,
  } = opts;
  const applied: string[] = [];

  // Determine which conditions to insert.
  // ADR-4: 'Stunned' implies 'Incapacitated' (PHB p.292 — dual-insert).
  const conditionsToApply: string[] = [conditionOnFail];
  if (conditionOnFail === 'Stunned') {
    conditionsToApply.push('Incapacitated');
  }

  for (const conditionName of conditionsToApply) {
    // ADR-3: App-level idempotency — skip if already present.
    if (existingConditionNames.has(conditionName)) {
      continue;
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

  return applied;
}
