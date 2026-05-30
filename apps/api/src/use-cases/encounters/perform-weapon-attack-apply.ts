/**
 * perform-weapon-attack-apply — Atomic weapon attack apply use-case.
 *
 * MUTATION slice of the action pipeline (engine-attack-apply-damage SDD + engine-to-hit-ac).
 * Server-authoritative: rolls d20, resolves target AC, derives damage expression,
 * rolls damage with crypto RNG, clamps HP, persists HP + version in ONE transaction.
 *
 * Design ref: sdd/engine-attack-apply-damage/design — ADR-5, ADR-7, ADR-10.
 * Design ref: sdd/engine-to-hit-ac/design — ADR-3, ADR-4.
 *
 * REQ-APPLY-FLOW-01: rollToHit BEFORE rollDamageBreakdown.
 * REQ-APPLY-FLOW-02: early-return on miss — no HP mutation, no CAS bump.
 * REQ-APPLY-FLOW-04: single RNG instance threaded to both rollToHit and rollDamageBreakdown.
 * REQ-TOHIT-CRIT-01: crit is SERVER-DERIVED from rollToHit, NOT caller-asserted.
 * REQ-ATK-APPLY-02: server derives and rolls damage — client supplies NO damage value.
 * REQ-ATK-VERSION-01: optimistic CAS — WHERE version=$incoming; 0 rows = 409.
 * REQ-ATK-TURN-01: attacker must be currentCombatantId.
 * REQ-ATK-AUTH-01: GM-only (enforced at route layer; use-case receives callerId for audit).
 * REQ-ATK-NPC-01: NPC target (characterId null) — updates encounter_combatants directly.
 */

import { eq, and, sql } from 'drizzle-orm';
import { db } from '../../infra/db/client.js';
import { encounters, encounterCombatants, characters } from '../../infra/db/schema.js';
import {
  resolveWeaponAttack,
  rollDamageBreakdown,
  rollToHit,
  computeKiSaveDc,
  computeDivineSmiteDice,
  type RngFn,
  type RollResult,
  type Source,
  type DiceExpr,
} from '@dungeon-hub/domain/engine';
import { consumeSpellSlot } from '@dungeon-hub/domain/character/spellcasting';
import { applyDamage } from '@dungeon-hub/domain/encounter';
import { buildAttackContext } from './build-attack-context.js';
import { resolveTargetAc } from './resolve-target-ac.js';
import { performForcedCheck, type PerformForcedCheckResult } from './perform-forced-check.js';

// ── Crypto RNG (ADR-5) ─────────────────────────────────────────────────────────

/**
 * Server-side crypto RNG for the apply use-case.
 *
 * ADR-5: single consumer this slice; IO/entropy belongs in IO layer, not domain.
 * ADR-3 (engine-to-hit-ac): the SAME instance is passed to rollToHit first,
 * then (on hit only) to rollDamageBreakdown. To-hit dice consumed before damage dice.
 * Returns an integer in [1..sides].
 */
const cryptoRng: RngFn = (sides: number): number => {
  const buf = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buf);
  return (buf[0]! % sides) + 1;
};

// ── Input / Output ─────────────────────────────────────────────────────────────

export interface PerformWeaponAttackApplyInput {
  encounterId: string;
  attackerId: string;          // encounter_combatants.id (NOT character.id)
  targetId: string;            // encounter_combatants.id
  weaponInstanceId: string;    // inventory instance UUID
  /** Caller-asserted runtime decisions (for Sneak Attack predicates, etc.). */
  runtimeDecisions?: Record<string, boolean>;
  /**
   * GM-supplied CON save modifier for an NPC target (mirrors npcSaveMod in ForcedCheckBody).
   * Required when stunningStrikeSpend=true AND the target is an NPC — omitting it returns
   * 400 NO_TARGET_SAVE (pre-roll, nothing committed). PC targets ignore this field.
   * Slice 3b-ii NPC fix (REQ-SS-NPC-01).
   */
  targetNpcSaveMod?: number;
  /**
   * Spell slot level to expend for Divine Smite (1..5).
   * Required when runtimeDecisions.divineSmiteSpend=true.
   * engine-divine-smite — REQ-DS-PREROLL-SLOT-01.
   */
  divineSmiteSlotLevel?: number;
  /**
   * Whether the target is an undead or fiend (caller-asserted).
   * Grants +1d8 smite dice when true (PHB p.85).
   * engine-divine-smite — REQ-DS-UNDEAD-01.
   */
  divineSmiteUndead?: boolean;
  /** Client's known version — must match encounters.version for CAS. */
  version: number;
}

/**
 * Divine Smite result block (engine-divine-smite, REQ-DS-RESPONSE-01).
 * Present on hit+spend only; key omitted (not null) on miss or no spend — backward-compat.
 */
export type DivineSmiteBlock = {
  spent: true;
  /** Slot level expended (echoed from divineSmiteSlotLevel). */
  slotLevel: number;
  /** Dice expression rolled, e.g. '3d8' (PHB p.85). */
  dice: DiceExpr;
  /** Total radiant damage rolled (post-crit — crit doubles via rollDamageBreakdown). */
  radiantDamage: number;
};

/** Stunning Strike result block (Slice 3b-ii, REQ-SS-RESPONSE-01). */
export type StunningStrikeBlock =
  // Save rolled — success: ki spent, no Stunned.
  | {
      spent: true;
      saveDc: number;
      save: { d20: number; total: number; saveMod: number; success: true };
      applied: string[];
    }
  // Save rolled — fail: ki spent, Stunned + Incapacitated applied.
  | {
      spent: true;
      saveDc: number;
      save: { d20: number; total: number; saveMod: number; success: false };
      applied: string[];
    }
  // Auto-fail (STR/DEX — future; CON does not auto-fail): ki spent, applied.
  | {
      spent: true;
      saveDc: number;
      autoFail: true;
      applied: string[];
    }
  // NPC target with no CON save mod (NO_TARGET_SAVE): ki spent, no save possible.
  | {
      spent: true;
      saveDc: number;
      save: null;
      reason: 'no-target-save';
      applied: string[];
    };

export type PerformWeaponAttackApplyResult =
  // MISS: no damage rolled, no HP mutation, no CAS bump (REQ-APPLY-FLOW-02).
  | {
      ok: true;
      hit: false;
      d20: number;
      d20All: number[];
      total: number;
      toHitBonus: number;
      targetAc: number;
    }
  // HIT: damage rolled, HP mutated, version bumped (REQ-APPLY-FLOW-03).
  | {
      ok: true;
      hit: true;
      crit: boolean;
      d20: number;
      d20All: number[];
      total: number;
      toHitBonus: number;
      targetAc: number;
      /** Integer damage total rolled. */
      rolledDamage: number;
      /** Per-source audit trail. */
      perDie: RollResult['perDie'];
      /** Target's HP after damage (clamped at 0, PHB p.197). */
      newHp: number;
      /** Weapon's damage type. */
      damageType: string;
      /**
       * Stunning Strike result block (Slice 3b-ii, REQ-SS-RESPONSE-01).
       * Present only when stunningStrikeSpend=true was in runtimeDecisions AND attack hit.
       * Absent (key omitted) for backward-compat when stunningStrikeSpend absent/false.
       */
      stunningStrike?: StunningStrikeBlock;
      /**
       * Divine Smite result block (engine-divine-smite, REQ-DS-RESPONSE-01).
       * Present only when divineSmiteSpend=true AND attack hits.
       * Absent (key omitted) for backward-compat when divineSmiteSpend absent/false — REQ-DS-COMPAT-01.
       */
      divineSmite?: DivineSmiteBlock;
    }
  | { ok: false; code: 'ENCOUNTER_NOT_ACTIVE' }
  | { ok: false; code: 'NOT_FOUND'; target: 'encounter' | 'attacker' | 'target' | 'weapon' | 'character' }
  | { ok: false; code: 'NOT_YOUR_TURN' }
  | { ok: false; code: 'VERSION_CONFLICT' }
  | { ok: false; code: 'NO_TARGET_AC' }     // NPC with null ac (legacy/unset)
  | { ok: false; code: 'FORBIDDEN' }
  // Stunning Strike pre-roll 400 guards (Slice 3b-ii, FAIL-FAST — REQ-SS-MELEE-01, REQ-SS-KI-EXHAUSTED-01, REQ-SS-NPC-01).
  // NOTHING committed (no to-hit roll, no HP change, no ki change) — pure pre-validation.
  | { ok: false; code: 'STUNNING_STRIKE_NOT_MELEE' }
  | { ok: false; code: 'KI_EXHAUSTED' }
  // NPC target + stunningStrikeSpend + missing targetNpcSaveMod → 400 pre-roll (REQ-SS-NPC-01).
  // Mirrors NO_TARGET_AC / NO_TARGET_SAVE: GM must supply the monster's CON save mod.
  | { ok: false; code: 'NO_TARGET_SAVE' }
  // Divine Smite pre-roll guards (engine-divine-smite, FAIL-FAST — PHB p.85).
  // NOTHING committed (no to-hit roll, no HP change, no slot change) — pure pre-validation.
  | { ok: false; code: 'DIVINE_SMITE_NOT_AVAILABLE' }    // not a Paladin L≥2 (PHB p.85)
  | { ok: false; code: 'DIVINE_SMITE_NOT_MELEE' }        // ranged weapon (PHB p.85: melee only)
  | { ok: false; code: 'DIVINE_SMITE_SLOT_NOT_AVAILABLE' }; // slot exhausted / level too high

// ── perform-weapon-attack-apply ────────────────────────────────────────────────

/**
 * Applies a weapon attack atomically following the 12-step flow (ADR-4):
 *
 *  1. Load encounter + version pre-check
 *  2. Load attacker combatant
 *  3. Turn guard
 *  4. Load target combatant (hp, ac, kind, characterId)
 *  5. NPC-attacker guard
 *  6. buildAttackContext (attacker character+weapon+registry)
 *  7. resolveWeaponAttack → damage expression + toHit + rollMode
 *  8. resolveTargetAc → AC (NO_TARGET_AC → early-return 400)
 *  9. rollToHit(toHit.value, targetAc, rollMode.mode, cryptoRng) → toHitResult
 * 10. Early-return on miss (no rollDamageBreakdown, no applyDamage, no tx)
 * 11. rollDamageBreakdown(damage.dice, damage.breakdown, crit, cryptoRng)
 * 12. applyDamage → newHp; tx: UPDATE hp + CAS version bump
 *
 * REQ-ATK-NPC-01: target may be an NPC (characterId null) — OK, we only update
 * encounter_combatants.hpCurrent, no character sheet query for the target.
 */
export async function performWeaponAttackApply(
  input: PerformWeaponAttackApplyInput,
): Promise<PerformWeaponAttackApplyResult> {
  const {
    encounterId,
    attackerId,
    targetId,
    weaponInstanceId,
    runtimeDecisions,
    targetNpcSaveMod,
    divineSmiteSlotLevel,
    divineSmiteUndead,
    version,
  } = input;

  // ── Step 1: Load encounter ────────────────────────────────────────────────────
  const [encounterRow] = await db
    .select()
    .from(encounters)
    .where(eq(encounters.id, encounterId))
    .limit(1);

  if (!encounterRow) return { ok: false, code: 'NOT_FOUND', target: 'encounter' };
  if (encounterRow.status !== 'active') return { ok: false, code: 'ENCOUNTER_NOT_ACTIVE' };

  // ── Version pre-check (optimistic CAS — ADR-10) ──────────────────────────────
  // Check before loading all the character data; saves 7+ queries on conflict.
  // The CAS happens again inside the transaction (authoritative check).
  if (encounterRow.version !== version) {
    return { ok: false, code: 'VERSION_CONFLICT' };
  }

  // ── Step 2: Load attacker combatant ──────────────────────────────────────────
  const [attackerCombatant] = await db
    .select()
    .from(encounterCombatants)
    .where(and(eq(encounterCombatants.id, attackerId), eq(encounterCombatants.encounterId, encounterId)))
    .limit(1);

  if (!attackerCombatant) return { ok: false, code: 'NOT_FOUND', target: 'attacker' };

  // ── Step 3: Turn guard (REQ-ATK-TURN-01) ─────────────────────────────────────
  if (encounterRow.currentCombatantId !== attackerId) {
    return { ok: false, code: 'NOT_YOUR_TURN' };
  }

  // ── Step 4: Load target combatant (explicit select: hp, ac, kind, characterId) ─
  // REQ: target SELECT must explicitly include ac, kind, characterId for resolveTargetAc.
  const [targetCombatant] = await db
    .select({
      id: encounterCombatants.id,
      hpCurrent: encounterCombatants.hpCurrent,
      encounterId: encounterCombatants.encounterId,
      ac: encounterCombatants.ac,
      kind: encounterCombatants.kind,
      characterId: encounterCombatants.characterId,
    })
    .from(encounterCombatants)
    .where(and(eq(encounterCombatants.id, targetId), eq(encounterCombatants.encounterId, encounterId)))
    .limit(1);

  if (!targetCombatant) return { ok: false, code: 'NOT_FOUND', target: 'target' };

  // ── Step 5: NPC attacker guard — GM-only route uses attacker characterId ──────
  // For the apply endpoint the route already enforces GM-only (403 guard at route).
  // If the attacker is an NPC (characterId null), buildAttackContext will NOT have a
  // characterId — this endpoint only supports PC attackers (weapon on sheet).
  if (attackerCombatant.characterId === null || attackerCombatant.characterId === undefined) {
    return { ok: false, code: 'NOT_FOUND', target: 'character' };
  }

  // ── Step 6: Build character+weapon+registry context ──────────────────────────
  // ADR-8: shared with perform-weapon-attack.
  const ctxResult = await buildAttackContext({
    characterId: attackerCombatant.characterId,
    attackerId,
    targetId,
    weaponInstanceId,
    encounterRound: encounterRow.round,
    ...(runtimeDecisions !== undefined ? { runtimeDecisions } : {}),
  });

  if (!ctxResult.ok) {
    if (ctxResult.code === 'FORBIDDEN') return { ok: false, code: 'FORBIDDEN' };
    return { ok: false, code: 'NOT_FOUND', target: ctxResult.target };
  }

  const {
    charId,
    attackerCharacterId,
    ctx,
    registry,
    strMod,
    dexMod,
    wisMod,
    proficiencyBonus,
    isProficient,
    monkLevel,
    kiUsedBefore,
    paladinLevel,
    attackerSlotsMax,
    attackerSlotsUsed,
    weapon,
  } = ctxResult;

  // ── Step 6b: Stunning Strike pre-roll validation (FAIL-FAST — Slice 3b-ii) ────
  // Per the reconciled flow (LOCKED by Mauricio): ALL validation fires BEFORE rollToHit
  // and BEFORE any mutation. Nothing is rolled or committed on these 400s.
  // PHB p.85: Stunning Strike requires a melee weapon attack and costs ki.
  const stunningStrikeSpend = runtimeDecisions?.['stunningStrikeSpend'] === true;
  if (stunningStrikeSpend) {
    // Guard 1: melee-only (PHB p.85 — "when you hit another creature with a melee weapon attack").
    if (weapon.kind === 'ranged') {
      return { ok: false, code: 'STUNNING_STRIKE_NOT_MELEE' };
    }
    // Guard 2: ki availability (PHB p.78 — ki pool max = Monk level; 0 remaining = exhausted).
    // kiUsedBefore + 1 > monkLevel means no ki remaining.
    if (kiUsedBefore + 1 > monkLevel) {
      return { ok: false, code: 'KI_EXHAUSTED' };
    }
    // Guard 3: NPC target without CON save mod → reject PRE-ROLL (REQ-SS-NPC-01).
    // Mirrors NO_TARGET_AC: GM must supply the monster's CON save modifier (npcSaveMod pattern).
    // PC targets always resolve via resolveStat server-side; they never need targetNpcSaveMod.
    // Firing PRE-ROLL (same place as melee/ki guards) ensures NO ki is spent, NO damage rolled.
    if (targetCombatant.kind === 'npc' && (targetNpcSaveMod === undefined || targetNpcSaveMod === null)) {
      return { ok: false, code: 'NO_TARGET_SAVE' };
    }
  }

  // ── Step 6c: Divine Smite pre-roll validation (FAIL-FAST — engine-divine-smite) ─
  // ALL three guards fire BEFORE resolveWeaponAttack, BEFORE rollToHit, BEFORE any mutation.
  // Nothing rolled, nothing committed on any of these 400s (REQ-DS-PREROLL-*).
  const divineSmiteSpend = runtimeDecisions?.['divineSmiteSpend'] === true;
  let nextSlotsUsed: readonly number[] | undefined;

  if (divineSmiteSpend) {
    // Guard 1: Paladin L≥2 (PHB p.85 — "Starting at 2nd level").
    if (paladinLevel < 2) {
      return { ok: false, code: 'DIVINE_SMITE_NOT_AVAILABLE' };
    }
    // Guard 2: melee-only (PHB p.85 — "melee weapon attack").
    if (weapon.kind === 'ranged') {
      return { ok: false, code: 'DIVINE_SMITE_NOT_MELEE' };
    }
    // Guard 3: slot level provided + slot available (PHB p.201 — slot must exist to expend).
    if (divineSmiteSlotLevel === undefined) {
      return { ok: false, code: 'DIVINE_SMITE_SLOT_NOT_AVAILABLE' };
    }
    const slotResult = consumeSpellSlot({
      slotsMax: attackerSlotsMax,
      slotsUsed: attackerSlotsUsed,
      pactMagic: null,
      pactSlotsUsed: 0,
      level: divineSmiteSlotLevel,
      slotType: 'regular',
    });
    if (!slotResult.ok) {
      return { ok: false, code: 'DIVINE_SMITE_SLOT_NOT_AVAILABLE' };
    }
    // Store result for use in CAS tx — avoids double-decrement (ADR-4).
    nextSlotsUsed = slotResult.slotsUsed;
  }

  // ── Step 7: resolveWeaponAttack → damage expression + toHit + rollMode ────────
  // REQ-ATK-APPLY-02: server derives authoritative DiceExpr — client never supplies it.
  // resolveWeaponAttack is PURE (REQ-ATK-PURE-01); deterministic given same inputs.
  const attackResult = resolveWeaponAttack({
    self: charId,
    ctx,
    registry,
    strMod,
    dexMod,
    proficiencyBonus,
    isProficient,
    weapon,
  });

  const { damage, rollMode, toHit, action } = attackResult;
  void action; // action (pipeline phase) is unused in the apply path

  // ── Step 8: resolveTargetAc → AC (or NO_TARGET_AC early-return) ──────────────
  // REQ-APPLY-FLOW-05: NO_TARGET_AC → return error; route maps to 400.
  const acResult = await resolveTargetAc({
    kind: targetCombatant.kind as 'pc' | 'npc',
    characterId: targetCombatant.characterId,
    ac: targetCombatant.ac,
  });

  if (!acResult.ok) {
    if (acResult.code === 'NO_TARGET_AC') return { ok: false, code: 'NO_TARGET_AC' };
    return { ok: false, code: 'NOT_FOUND', target: 'character' };
  }

  const targetAc = acResult.ac;

  // ── Step 9: rollToHit → hit/crit/autoMiss (ADR-3 — single RNG instance) ──────
  // The SAME cryptoRng is passed here and then (on hit) to rollDamageBreakdown.
  // To-hit dice consumed FIRST (1 for normal, 2 for adv/disadv).
  // PHB p.194: to-hit is resolved before damage.
  const toHitResult = rollToHit(toHit.value, targetAc, rollMode.mode, cryptoRng);

  // ── Step 10: Early-return on miss ─────────────────────────────────────────────
  // REQ-APPLY-FLOW-02: miss → no rollDamageBreakdown, no applyDamage, no transaction.
  // No HP mutation; no version bump; miss is a no-op mutation.
  // PHB p.85: ki is only spent on a HIT — no ki decrement on miss (REQ-SS-MISS-01).
  if (!toHitResult.hit) {
    return {
      ok: true,
      hit: false,
      d20: toHitResult.d20,
      d20All: toHitResult.d20All,
      total: toHitResult.total,
      toHitBonus: toHitResult.toHitBonus,
      targetAc: toHitResult.targetAc,
    };
  }

  // ── Step 11: rollDamageBreakdown (crit SERVER-DERIVED — REQ-TOHIT-CRIT-01) ────
  // Divine Smite Source injection: BEFORE rollDamageBreakdown so crit-doubling flows through
  // automatically (PHB p.196 — "roll all of the attack's damage dice twice"). ADR-3.
  // Inject into a LOCAL copy of breakdown — never mutate damage.breakdown directly (shared ref risk).
  let smiteDice: DiceExpr | undefined;
  const breakdownWithSmite = (() => {
    if (!divineSmiteSpend || divineSmiteSlotLevel === undefined) return damage.breakdown;
    smiteDice = computeDivineSmiteDice(divineSmiteSlotLevel, divineSmiteUndead ?? false);
    const smiteSource: Source = {
      label: 'Divine Smite',
      amount: smiteDice,
      type: 'untyped',
      origin: { id: charId, conditions: [] },
    };
    return [...damage.breakdown, smiteSource];
  })();

  // Pass (dice, breakdownWithSmite) — NOT flatMods. flatMods is a SUBSET already inside
  // breakdown (ability mod is in both). Passing flatMods separately double-counts.
  // crit from rollToHit.crit doubles dice count per NdM source (PHB p.196).
  const rollResult = rollDamageBreakdown(damage.dice, breakdownWithSmite, toHitResult.crit, cryptoRng);
  const { total: rolledDamage, perDie } = rollResult;

  // Capture smite radiant contribution for the response block (ADR-3).
  // perDie carries per-source roll breakdowns after rollDamageBreakdown.
  let radiantDamage = 0;
  if (divineSmiteSpend && smiteDice !== undefined) {
    const smiteEntry = perDie.find((e) => e.label === 'Divine Smite');
    radiantDamage = smiteEntry?.rolls?.reduce((a, b) => a + b, 0) ?? 0;
  }

  // ── Step 12: applyDamage + transaction ───────────────────────────────────────
  // applyDamage → newHp (PHB p.197 clamp at 0).
  const newHp = applyDamage(targetCombatant.hpCurrent, rolledDamage);

  // Transaction: UPDATE target HP + CAS version bump (ADR-10).
  // UPDATE encounters WHERE id=$id AND version=$incoming → 0 rows = VERSION_CONFLICT.
  // On stunningStrikeSpend=true: ALSO decrement ki via jsonb_set INSIDE this tx
  // so that HP + version + ki are atomic (REQ-SS-ATOMICITY-01, ADR-2).
  const txResult = await db.transaction(async (tx) => {
    await tx
      .update(encounterCombatants)
      .set({ hpCurrent: newHp })
      .where(
        and(
          eq(encounterCombatants.id, targetId),
          eq(encounterCombatants.encounterId, encounterId),
        ),
      );

    const updated = await tx
      .update(encounters)
      .set({
        version: sql`${encounters.version} + 1`,
        updatedAt: new Date(),
      })
      .where(and(eq(encounters.id, encounterId), eq(encounters.version, version)))
      .returning({ version: encounters.version });

    if (updated.length === 0) {
      // CAS conflict — rollback entire tx (ki NOT decremented).
      return false;
    }

    // ── Step 12b: Ki decrement (Slice 3b-ii, REQ-SS-ATOMICITY-01) ────────────────
    // jsonb_set: atomic server-side mutation of only the ki path.
    // PHB p.85: ki is spent on HIT regardless of save outcome.
    // jsonb_set path '{classResourcesUsed,monk:ki-points}': colon in key is safe in PG
    // path-array literals (only commas, braces, and quotes are structural).
    // WHY jsonb_set (not whole-data overwrite): avoids read-modify-write race — only the
    // ki path is mutated; other data fields are untouched (ADR-2).
    if (stunningStrikeSpend) {
      await tx
        .update(characters)
        .set({
          data: sql`jsonb_set(
            data,
            '{classResourcesUsed,monk:ki-points}',
            to_jsonb((COALESCE((data#>>'{classResourcesUsed,monk:ki-points}')::int, 0) + 1)),
            true
          )`,
        })
        .where(eq(characters.id, attackerCharacterId));
    }

    // ── Step 12b-ii: Divine Smite slot persist (engine-divine-smite — ADR-4) ────
    // Write the full 9-tuple to {spellSlotsUsed} — atomic with HP + version bump.
    // On CAS conflict (updated.length===0 → return false) the tx rolls back →
    // no slot is consumed (mirrors the ki rollback comment above).
    // PHB p.85: slot is spent ON HIT — only fires post-miss-early-return (ADR-1).
    if (divineSmiteSpend && nextSlotsUsed !== undefined) {
      await tx
        .update(characters)
        .set({
          data: sql`jsonb_set(data, '{spellSlotsUsed}', ${JSON.stringify([...nextSlotsUsed])}::jsonb, true)`,
        })
        .where(eq(characters.id, attackerCharacterId));
    }

    return true;
  });

  if (!txResult) {
    return { ok: false, code: 'VERSION_CONFLICT' };
  }

  // ── Step 12c: Stunning Strike post-tx (Slice 3b-ii, REQ-SS-CONDITION-01) ──────
  // performForcedCheck runs OUTSIDE the CAS tx (append-only, its own connection).
  // Ki+HP are committed; Stunned insert follows as a near-atomic append.
  // TODO saga: ki+HP commit and Stunned insert are not one atomic unit (cross-entity:
  // characters JSONB vs encounter_combatant_conditions). Crash between leaves ki spent
  // w/o stun. Accept for V1; future event-sourcing/compensating-tx slice.
  // TODO perf: performForcedCheck re-loads encounter+target+conditions already in scope
  // here; accept 3 redundant selects for V1, optimize via shared loaded-context handle
  // if profiling flags it.
  let stunningStrike: StunningStrikeBlock | undefined;

  if (stunningStrikeSpend) {
    const kiSaveDc = computeKiSaveDc(proficiencyBonus, wisMod);

    const fc: PerformForcedCheckResult = await performForcedCheck({
      encounterId,
      targetCombatantId: targetId,
      ability: 'con',
      dc: kiSaveDc,
      conditionOnFail: 'Stunned',
      // NPC: targetNpcSaveMod is guaranteed non-null here (pre-roll guard above fires otherwise).
      // PC: targetNpcSaveMod is undefined; resolveTargetSave derives CON mod server-side.
      // exactOptionalPropertyTypes: spread conditionally to avoid passing undefined.
      ...(targetNpcSaveMod !== undefined ? { npcSaveMod: targetNpcSaveMod } : {}),
      appliedByCombatantId: attackerId,
      turnAnchorEntityId: attackerId,      // anchor = monk combatant (PHB p.85: "YOUR next turn")
      turnAnchorBoundary: 'end',           // PHB p.85: "until END of your next turn"
      turnsRemaining: 1,
      refreshAnchorOnExisting: true,       // re-stun refreshes existing anchor (ADR-4)
    });

    // Map performForcedCheck result to stunningStrike response block (ADR-6).
    if (!fc.ok) {
      // NO_TARGET_SAVE: NPC with no CON save → ki was spent, no save possible.
      // RAW: ki is spent on the attempt regardless (PHB p.85).
      stunningStrike = { spent: true, saveDc: kiSaveDc, save: null, reason: 'no-target-save', applied: [] };
    } else if (fc.outcome === 'save') {
      stunningStrike = {
        spent: true,
        saveDc: kiSaveDc,
        save: { d20: fc.save.d20, total: fc.save.total, saveMod: fc.save.saveMod, success: true },
        applied: fc.applied,
      };
    } else if (fc.outcome === 'fail') {
      stunningStrike = {
        spent: true,
        saveDc: kiSaveDc,
        save: { d20: fc.save.d20, total: fc.save.total, saveMod: fc.save.saveMod, success: false },
        applied: fc.applied,
      };
    } else {
      // autoFail (STR/DEX — CON does not normally auto-fail; defensive forwarding).
      stunningStrike = { spent: true, saveDc: kiSaveDc, autoFail: true, applied: fc.applied };
    }
  }

  // ── Step 12d: Divine Smite response block (engine-divine-smite — ADR-8) ────────
  // Key OMITTED (not null) when divineSmiteSpend absent/false — backward-compat (REQ-DS-COMPAT-01).
  const divineSmiteResult: DivineSmiteBlock | undefined =
    divineSmiteSpend && smiteDice !== undefined
      ? { spent: true, slotLevel: divineSmiteSlotLevel!, dice: smiteDice, radiantDamage }
      : undefined;

  return {
    ok: true,
    hit: true,
    crit: toHitResult.crit,
    d20: toHitResult.d20,
    d20All: toHitResult.d20All,
    total: toHitResult.total,
    toHitBonus: toHitResult.toHitBonus,
    targetAc: toHitResult.targetAc,
    rolledDamage,
    perDie,
    newHp,
    damageType: weapon.damageType,
    ...(stunningStrike !== undefined ? { stunningStrike } : {}),
    ...(divineSmiteResult !== undefined ? { divineSmite: divineSmiteResult } : {}),
  };
}
