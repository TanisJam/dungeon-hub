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
 * REQ-ATK-AUTH-01: owner-OR-GM gate — assertCombatantOwnerOrGm enforces ownership (Step 3b);
 *   callerId/callerRole are the authoritative gate inputs, not merely audit fields.
 * REQ-ATK-NPC-01: NPC target (characterId null) — updates encounter_combatants directly.
 */

import { eq, and, sql } from 'drizzle-orm';
import { db } from '../../infra/db/client.js';
import { encounters, encounterCombatants, characters, encounterCombatantConditions } from '../../infra/db/schema.js';
import {
  resolveWeaponAttack,
  rollDamageBreakdown,
  rollToHit,
  computeKiSaveDc,
  computeDivineSmiteDice,
  isShieldableHit,
  extraAttacksPerAction,
  compileRule,
  recklessAttackRuleDoc,
  isSurprisedFirstTurn,
  type RngFn,
  type RollResult,
  type Source,
  type DiceExpr,
  type EntityId,
} from '@dungeon-hub/domain/engine';
import { consumeSpellSlot, computeSpellSlots } from '@dungeon-hub/domain/character/spellcasting';
import type { AppliedClass } from '@dungeon-hub/domain/character/class';
import { buildAttackContext } from './build-attack-context.js';
import { assertCombatantOwnerOrGm } from './assert-combatant-owner-or-gm.js';
import { resolveResistance } from './resolve-resistance.js';
import { resolveTargetAc } from './resolve-target-ac.js';
import { performForcedCheck, type PerformForcedCheckResult } from './perform-forced-check.js';
import { isCombatantIncapacitated } from './load-combatant-incapacitated.js';
import { isCombatantSurprisedFirstTurn } from './is-combatant-surprised-first-turn.js';
import {
  prepareConcentrationCheck,
  resolveConcentrationCheck,
  type ConcentrationResolution,
} from './check-concentration-on-damage.js';

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

// ── Module-scope compiled rules (ADR-3 pattern — compile once, .build() per request) ──

// PHB p.48 — recklessAttackRuleDoc: grant (self STR melee) + impose (attackers-of).
// Compiled here (parallel to build-attack-context.ts) because the pre-roll condition
// INSERT + registry patch must happen in perform-weapon-attack-apply before resolveWeaponAttack.
const compiledRecklessForApply = compileRule(recklessAttackRuleDoc);

// ── Input / Output ─────────────────────────────────────────────────────────────

export interface PerformWeaponAttackApplyInput {
  encounterId: string;
  attackerId: string;          // encounter_combatants.id (NOT character.id)
  targetId: string;            // encounter_combatants.id
  weaponInstanceId: string;    // inventory instance UUID
  /**
   * ID of the caller (from request.user.sub). Forwarded from the route layer.
   * Required for assertCombatantOwnerOrGm (REQ-WCA-API-01 — C2 gate relaxation).
   */
  callerId: string;
  /**
   * Campaign role of the caller ('gm' | 'player'). Forwarded from the route layer.
   * Required for assertCombatantOwnerOrGm and TARGET_NOT_NPC gating (REQ-WCA-API-02).
   */
  callerRole: 'gm' | 'player';
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
  /**
   * Whether the attacker is declaring Reckless Attack on this attack (PHB p.48).
   * Absent/false = no reckless declaration; true = insert RecklessAttacking condition
   * inside the CAS transaction if not already present (idempotency: SELECT-exists check).
   * REQ-API-01, REQ-API-02, SCENARIO-10..14.
   */
  reckless?: boolean;
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
  // REACTION OFFERED: shieldable hit — no commit; client must call resolve-reaction.
  // REQ-ERB-FLOW-01: no HP mutation, no version bump, no slot consumed.
  // PHB p.275: "When you are hit by an attack... you can use your reaction."
  // Server-authoritative: rolled damage is persisted server-side in encounters.pending_reaction.
  // The client does NOT echo damage — only reactionDecision + defenderCombatantId + version.
  | {
      ok: true;
      hit: true;
      reactionOffered: {
        kind: 'shield';
        defenderCombatantId: string;
        toHitTotal: number;
        currentAc: number;
        /** Damage type for provenance only — actual damage is stored server-side. */
        damageType: string;
      };
    }
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
      /**
       * Concentration save result (engine-concentration-break-damage, REQ-CB-06).
       * Present only when the target was concentrating AND finalDamage > 0, OR when newHp===0
       * (outright break — PHB p.197/p.203, REQ-CID-02).
       * Absent (key omitted) when no concentration row or finalDamage===0 — backward-compat omit-not-null (REQ-CB-12).
       * Shape: ConcentrationSaveBlock (save rolled) | { broke: true; reason: 'incapacitated-0hp' } (outright).
       * REQ-CID-04: breakConcentration now runs INSIDE the same CAS tx as the HP UPDATE — atomicity saga closed.
       */
      concentrationSave?: ConcentrationResolution;
    }
  | { ok: false; code: 'ENCOUNTER_NOT_ACTIVE' }
  | { ok: false; code: 'NOT_FOUND'; target: 'encounter' | 'attacker' | 'target' | 'weapon' | 'character' }
  | { ok: false; code: 'NOT_YOUR_TURN' }
  | { ok: false; code: 'VERSION_CONFLICT' }
  | { ok: false; code: 'NO_TARGET_AC' }     // NPC with null ac (legacy/unset)
  | { ok: false; code: 'FORBIDDEN' }
  // engine-incapacitated-gating — REQ-INC-02 (PHB p.290: can't take actions).
  | { ok: false; code: 'ACTOR_INCAPACITATED' }
  // engine-surprise-round1 — REQ-SUR-S2-02 (PHB p.189: can't act on first surprised turn).
  | { ok: false; code: 'ACTOR_SURPRISED' }
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
  | { ok: false; code: 'DIVINE_SMITE_SLOT_NOT_AVAILABLE' } // slot exhausted / level too high
  // engine-action-economy: per-turn Attack action budget (REQ-AE-04, REQ-AE-06).
  // action_used===true && attacks_remaining===0 → action fully spent for this turn (PHB p.198).
  | { ok: false; code: 'ACTION_ALREADY_USED' }
  // C2 — REQ-WCA-API-02: player-only guard that prevents attacking a PC target.
  // Fires AFTER target load, BEFORE any mutation (budget tx). Gated on callerRole==='player'
  // so the GM path stays unaffected (ADR-1 LOCK — CLAUDE.md project conventions).
  | { ok: false; code: 'TARGET_NOT_NPC' };

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
    callerId,
    callerRole,
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

  // ── Step 3a: Incapacitated gate (REQ-INC-02, PHB p.290 — can't take actions) ──
  // Fail-fast BEFORE buildAttackContext (skips the heavy sheet/weapon/registry build).
  // Per ADR-3.2: fires after turn guard, after version pre-check, before Step 4+.
  // Server-authority: gate computed from DB-loaded conditions, never client-supplied.
  if (await isCombatantIncapacitated(attackerId)) {
    return { ok: false, code: 'ACTOR_INCAPACITATED' };
  }

  // ── Step 3a.1: Surprised gate (REQ-SUR-S2-02, PHB p.189 — can't act on first surprised turn) ──
  // Fail-fast AFTER incap gate, BEFORE auth/context build (ADR-3.2 version→turn→incap→SURPRISE ladder).
  // No RNG involved — surprise gating is deterministic state-based check.
  if (await isCombatantSurprisedFirstTurn(attackerId)) {
    return { ok: false, code: 'ACTOR_SURPRISED' };
  }

  // ── Step 3b: Owner-or-GM auth gate (REQ-WCA-API-01 — C2 gate relaxation) ────────
  // Replaces the old inline NPC-attacker check (Step 5, L334-336) which was GM-only-compatible
  // only because the route enforced GM-only before use-case entry.
  // assertCombatantOwnerOrGm ADR-1 ordering: after turn guard, BEFORE target load/mutation.
  //   GM caller: short-circuits immediately → ok:true (no ownership check).
  //   Player caller: must own the attacker combatant's character → FORBIDDEN if not.
  //   NPC attacker + player caller: characterId null → NOT_FOUND (no FORBIDDEN leak).
  // FORBIDDEN and NOT_FOUND from the helper are folded into the use-case result union.
  const authResult = await assertCombatantOwnerOrGm({
    encounterId,
    combatantId: attackerId,
    callerId,
    callerRole,
  });
  if (!authResult.ok) {
    // NOT_FOUND from helper → attacker combatant missing or NPC targeted by player (no info leak).
    // FORBIDDEN from helper → attacker owned by a different player.
    if (authResult.code === 'NOT_FOUND') {
      return { ok: false, code: 'NOT_FOUND', target: 'attacker' };
    }
    return { ok: false, code: 'FORBIDDEN' };
  }

  // ── Step 4: Load target combatant (explicit select: hp, ac, kind, characterId) ─
  // REQ: target SELECT must explicitly include ac, kind, characterId for resolveTargetAc.
  // engine-surprise-round1 S3: include surprised + firstTurnActed to gate Shield reaction (REQ-SUR-S3-01).
  const [targetCombatant] = await db
    .select({
      id: encounterCombatants.id,
      hpCurrent: encounterCombatants.hpCurrent,
      encounterId: encounterCombatants.encounterId,
      ac: encounterCombatants.ac,
      kind: encounterCombatants.kind,
      characterId: encounterCombatants.characterId,
      reactionUsed: encounterCombatants.reactionUsed,
      surprised: encounterCombatants.surprised,
      firstTurnActed: encounterCombatants.firstTurnActed,
    })
    .from(encounterCombatants)
    .where(and(eq(encounterCombatants.id, targetId), eq(encounterCombatants.encounterId, encounterId)))
    .limit(1);

  if (!targetCombatant) return { ok: false, code: 'NOT_FOUND', target: 'target' };

  // ── Step 4b: TARGET_NOT_NPC guard (REQ-WCA-API-02 — player-only) ───────────────
  // Fires AFTER target load (need characterId), BEFORE budget tx (no mutation committed).
  // Defense-in-depth: blocks player from attacking a PC target even if UI filtering missed it.
  // GATED on callerRole==='player' ONLY — GM path must remain unaffected (ADR-1 LOCK).
  // A player targeting a PC → 400 VALIDATION_FAILED {code:'TARGET_NOT_NPC'} (CLAUDE.md §6).
  // NOTE: reactionOffered path (PHB p.275 Shield) only fires for PC targets (predicate `kind==='pc'`);
  //   since player callers can never reach that path here, reactionOffered is never triggered for C2.
  if (targetCombatant.characterId !== null && callerRole === 'player') {
    return { ok: false, code: 'TARGET_NOT_NPC' };
  }

  // ── Step 5: NPC attacker guard — ensure attacker is a PC (has characterId) ────
  // Step 3b (assertCombatantOwnerOrGm) already handles NPC-attacker for player callers
  // (returns NOT_FOUND when characterId is null). This guard catches the edge case where
  // a GM might attempt to attack with an NPC combatant that has no character sheet — the
  // GM path skips the ownership check, so we guard here to prevent buildAttackContext
  // from failing with a misleading NOT_FOUND on the character.
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
    classes,
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

  // ── Step 6d: Reckless Attack pre-roll condition insert (C1 fix — PHB p.48) ─────
  // PHB p.48: "When you make your first attack on your turn, you can decide to attack
  //   recklessly. Doing so gives you advantage on melee weapon attack rolls using Strength
  //   during this turn." Advantage applies from the moment of DECLARATION — including the
  //   declaring attack itself, and regardless of whether that attack hits or misses.
  //
  // Fix for C1 (verify-report #2104): the original insert was inside the HIT CAS tx (Step 12e),
  // which meant (a) the declaring attack never saw the condition at buildAttackContext time
  // and therefore never received advantage, and (b) a miss left no condition row at all.
  //
  // Placement: BEFORE resolveWeaponAttack (Step 7). resolveWeaponAttack queries the registry
  // to compute rollMode — the reckless grant must be in the registry BEFORE that call.
  // buildAttackContext (Step 6) loads conditions from DB before the insert happens, so
  // attackerIsReckless is false for the declaring attack. We fix this by:
  //   1. Inserting the condition row here in its own transaction (outcome-independent).
  //   2. Patching ctx.self.conditions, ctx.attacker.conditions, ctx.activeConditions to
  //      include { name: 'RecklessAttacking' } so resolveWeaponAttack sees it.
  //   3. Registering compiledRecklessForApply into the registry so the grant emit fires
  //      and rollMode resolves to 'advantage' for this attack.
  //
  // SELECT-exists idempotency guard: preserved from the original implementation.
  // Own transaction: if this tx commits and a downstream error occurs, the condition row
  //   persists (by design — PHB says declaration is irrevocable once made). This mirrors
  //   how the budget tx (Step 8b) is also outcome-independent of the eventual roll.
  //
  // The Step 12e block (old HIT-only insert) is now REMOVED from the HIT CAS tx.
  if (input.reckless === true) {
    const existingReckless = await db
      .select({ id: encounterCombatantConditions.id })
      .from(encounterCombatantConditions)
      .where(
        and(
          eq(encounterCombatantConditions.combatantId, attackerId),
          eq(encounterCombatantConditions.conditionName, 'RecklessAttacking'),
        ),
      )
      .limit(1);

    if (existingReckless.length === 0) {
      await db.insert(encounterCombatantConditions).values({
        conditionName: 'RecklessAttacking',
        combatantId: attackerId,
        appliedByCombatantId: attackerId,
        turnAnchorEntityId: attackerId,
        turnAnchorBoundary: 'start',
        turnsRemaining: 1,
      });

      // Patch ctx so resolveWeaponAttack (Step 7) sees the condition this attack.
      // ctx.self and ctx.attacker share the same conditions array reference from
      // buildAttackContext; push once covers both.
      ctx.self.conditions.push({ name: 'RecklessAttacking' });
      ctx.activeConditions.push({ name: 'RecklessAttacking' });
      // ctx.attacker.conditions is the same array as ctx.self.conditions (same reference
      // from build-attack-context.ts line 302/305), so the push above already covers it.
      // Register compiledRecklessForApply so rollMode resolves to 'advantage'.
      const recklessInstances = compiledRecklessForApply.build({ recklessId: charId as EntityId });
      for (const inst of recklessInstances) {
        registry.register(inst);
      }
    }
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

  // ── Step 8b: Action-budget state machine + pre-roll budget tx (ADR-3, ADR-4 engine-action-economy) ─
  // PHB p.198: "You take the Attack action" — DECLARATION spends the action, regardless of outcome.
  // Three-branch machine (computed pre-roll, fail-fast before rollToHit):
  //   1. action_used===false → first attack: consume action, set attacks_remaining = N-1.
  //   2. action_used===true && attacks_remaining>0 → multiattack continuation: decrement.
  //   3. action_used===true && attacks_remaining===0 → reject ACTION_ALREADY_USED (REQ-AE-06).
  // The budget tx bumps version (+1) BEFORE the roll so the version re-thread below is correct.
  // VERSION RE-THREAD: capture nextVersion from this tx; use it for all downstream writes
  //   (miss echo, suspend pending_reaction.encVersion, HIT CAS tx) so the client always has
  //   the correct epoch and resolveAttackReaction's bind-check passes. (ADR-4.)
  const totalAttacks = extraAttacksPerAction(classes);
  const { actionUsed: currentActionUsed, attacksRemaining: currentAttacksRemaining } = attackerCombatant;

  // Branch 3: reject pre-roll — no tx, no roll.
  if (currentActionUsed && currentAttacksRemaining === 0) {
    return { ok: false, code: 'ACTION_ALREADY_USED' };
  }

  // Branches 1 & 2: compute planned next state.
  const nextActionUsed = true;
  const nextAttacksRemaining = currentActionUsed
    ? currentAttacksRemaining - 1              // continuation: decrement allowance
    : totalAttacks - 1;                         // first attack: set full allowance minus 1

  // Atomic budget tx: UPDATE combatant budget + bump encounter version.
  // If concurrent apply already consumed the action, CAS fails → VERSION_CONFLICT (serialized).
  const budgetTxRows = await db.transaction(async (tx) => {
    await tx
      .update(encounterCombatants)
      .set({ actionUsed: nextActionUsed, attacksRemaining: nextAttacksRemaining })
      .where(
        and(
          eq(encounterCombatants.id, attackerId),
          eq(encounterCombatants.encounterId, encounterId),
        ),
      );

    return tx
      .update(encounters)
      .set({ version: sql`${encounters.version} + 1`, updatedAt: new Date() })
      .where(and(eq(encounters.id, encounterId), eq(encounters.version, version)))
      .returning({ version: encounters.version });
  });

  if (budgetTxRows.length === 0) {
    return { ok: false, code: 'VERSION_CONFLICT' };
  }

  // nextVersion is the authoritative version after the budget tx.
  // ALL downstream version-guarded writes MUST use nextVersion, not the client's `version`.
  const nextVersion = budgetTxRows[0]!.version;

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

  // ── Step 10b: Reaction window (ADR-1 engine-reaction-bus) ─────────────────────
  // PHB p.275: Shield — "+5 bonus to AC until the start of your next turn,
  //   including against the triggering attack." Triggered "when you are hit by an attack."
  // Predicate: hit && !crit && gap<5 (domain pure check) && PC defender
  //   && reaction_used===false && defender has ≥1 level-1+ slot.
  //
  // ADR-1: UX optimization — gap<5 means Shield could change the outcome.
  // Gap≥5 slots falls through to commit (no reaction window opened).
  // Crit bypasses Shield entirely (PHB p.194: nat-20 always hits regardless of AC).
  if (
    targetCombatant.kind === 'pc' &&
    !targetCombatant.reactionUsed &&
    // engine-surprise-round1 S3 (REQ-SUR-S3-01, PHB p.189): "you can't take a reaction until
    // that turn ends." A surprised defender cannot use Shield. The gate is silent (no error —
    // the surprised state is unknown to the attacker; the reaction window simply doesn't open).
    !isSurprisedFirstTurn(targetCombatant.surprised, targetCombatant.firstTurnActed) &&
    isShieldableHit({
      hit: toHitResult.hit,
      crit: toHitResult.crit,
      total: toHitResult.total,
      targetAc,
    })
  ) {
    // Check if defender PC has at least one 1st-level+ spell slot available.
    // This is a PC check (characterId must exist from kind==='pc' guard above).
    const defenderCharId = targetCombatant.characterId;
    let defenderHasSlot = false;
    if (defenderCharId) {
      const [defCharRow] = await db
        .select({ data: characters.data })
        .from(characters)
        .where(eq(characters.id, defenderCharId))
        .limit(1);
      if (defCharRow) {
        const defData = (defCharRow.data as Record<string, unknown>) ?? {};
        const { slots: defSlotsMax } = computeSpellSlots(
          (defData['classes'] as AppliedClass[] | undefined) ?? [],
        );
        const defSlotsUsed = (defData['spellSlotsUsed'] as number[] | undefined) ?? new Array(9).fill(0);
        // Has a free level-1+ slot if any slot index 0..8 has (max > used)
        for (let lvl = 0; lvl < 9; lvl++) {
          const slotMax = defSlotsMax[lvl] ?? 0;
          const slotUsed = defSlotsUsed[lvl] ?? 0;
          if (slotMax > slotUsed) {
            defenderHasSlot = true;
            break;
          }
        }
      }
    }

    if (defenderHasSlot) {
      // SUSPEND: server pre-rolls damage and persists it as server-authoritative pending
      // reaction state on the encounter row. The client does NOT supply damage in
      // resolve-reaction — the server reads it back from pending_reaction. This is the
      // C-1 fix: server-authority is fully preserved (no client-echo trust).
      // crit=false here because isShieldableHit already requires !crit.
      // We still roll with the current cryptoRng (same instance — ADR-3).
      const breakdownWithSmite = (() => {
        if (!runtimeDecisions?.['divineSmiteSpend'] || divineSmiteSlotLevel === undefined) {
          return damage.breakdown;
        }
        const smiteDice = computeDivineSmiteDice(divineSmiteSlotLevel, divineSmiteUndead ?? false);
        const smiteSource: Source = {
          label: 'Divine Smite',
          amount: smiteDice,
          type: 'untyped',
          origin: { id: charId, conditions: [] },
        };
        return [...damage.breakdown, smiteSource];
      })();
      const suspendRoll = rollDamageBreakdown(damage.dice, breakdownWithSmite, false, cryptoRng);

      // Persist server-rolled pending state to the DB (does NOT bump version — this is
      // bookkeeping, not a game-state change). encVersion binds the pending state to this
      // CAS epoch; a concurrent commit before resolve-reaction will cause a version mismatch
      // and the CAS guard in resolveAttackReaction will reject the stale state.
      //
      // VERSION RE-THREAD SITE 3 (B-6, ADR-4 engine-action-economy): the budget tx in Step 8b
      // already bumped version to nextVersion. The pending_reaction write MUST use nextVersion
      // as both the WHERE guard AND the encVersion payload — otherwise resolveAttackReaction's
      // bind-check (pending.encVersion !== version) rejects every valid shielded attack with
      // a spurious VERSION_CONFLICT. W-3 pattern still applies: 0 rows → VERSION_CONFLICT.
      const suspendUpdated = await db
        .update(encounters)
        .set({
          pendingReaction: {
            defenderCombatantId: targetId,
            attackerCombatantId: attackerId,
            toHitTotal: toHitResult.total,
            targetAc,
            rolledDamage: suspendRoll.total,
            damageType: weapon.damageType,
            encVersion: nextVersion,
          },
          updatedAt: new Date(),
        })
        .where(and(eq(encounters.id, encounterId), eq(encounters.version, nextVersion)))
        .returning({ id: encounters.id });

      if (suspendUpdated.length === 0) {
        return { ok: false, code: 'VERSION_CONFLICT' };
      }

      return {
        ok: true,
        hit: true,
        reactionOffered: {
          kind: 'shield',
          defenderCombatantId: targetId,
          toHitTotal: toHitResult.total,
          currentAc: targetAc,
          // rolledDamage is intentionally NOT included in the reactionOffered response —
          // it is stored server-side in pending_reaction only. The client supplies NO
          // damage value in resolve-reaction; it only supplies reactionDecision + defenderCombatantId + version.
          damageType: weapon.damageType,
        },
      };
    }
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

  // ── Step 12: resolveResistance + transaction ─────────────────────────────────
  // resolveResistance: loads target conditions → applyDamageWithResist → newHp.
  // Replaces bare applyDamage; if target has no resist conditions, result is identical.
  // Runs OUTSIDE the CAS tx (read-then-CAS — ADR-4 engine-resist-immunity).
  // PHB p.197: resistance applied after all other modifiers, before HP loss.
  const { newHp, finalDamage } = await resolveResistance(
    targetId,
    rolledDamage,
    weapon.damageType,
    targetCombatant.hpCurrent,
  );

  // ── REQ-CID-04: prepare/resolve split (ADR-1, Slice 3) ───────────────────────
  // PREPARE runs OUTSIDE the CAS tx: registry SELECT + save-bonus read (4+ queries).
  // On newHp===0 → plan.breakOutright=true (skip resolveTargetSave entirely — REQ-CID-02).
  // On finalDamage===0 → null (PHB p.203: save only triggered by damage TAKEN — REQ-CB-08).
  // Returns null when NPC, non-concentrating, or zero-damage guard fires.
  const concPlan = await prepareConcentrationCheck(
    { kind: targetCombatant.kind, characterId: targetCombatant.characterId },
    finalDamage,
    newHp,
  );

  // Transaction: UPDATE target HP + CAS version bump (ADR-10).
  // VERSION RE-THREAD SITE 4 (B-7, ADR-4 engine-action-economy): the budget tx in Step 8b
  // already bumped version to nextVersion. This HIT CAS tx MUST use nextVersion as the
  // WHERE guard so it bumps nextVersion → nextVersion+1 (net +2 from client's original).
  // On stunningStrikeSpend=true: ALSO decrement ki via jsonb_set INSIDE this tx
  // so that HP + version + ki are atomic (REQ-SS-ATOMICITY-01, ADR-2).
  // REQ-CID-04: RESOLVE runs INSIDE the tx closure, after the CAS guard.
  // breakConcentration receives the same tx → covered by rollback (saga closed).
  const txResult = await db.transaction(async (tx) => {
    // Note: the RecklessAttacking condition INSERT was moved from here (Step 12e — on-hit only)
    // to a pre-roll block in Step 6d above, so it fires regardless of hit/miss outcome (C1 fix).

    // Build the HP update set — may also include raged_took_damage (B-11).
    // B-11: set raged_took_damage=true on the TARGET when finalDamage > 0 (REQ-RAGE-09).
    // Write unconditionally on target row alongside hpCurrent UPDATE — no extra query.
    await tx
      .update(encounterCombatants)
      .set({
        hpCurrent: newHp,
        ...(finalDamage > 0 ? { ragedTookDamage: true } : {}),
      })
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
      .where(and(eq(encounters.id, encounterId), eq(encounters.version, nextVersion)))
      .returning({ version: encounters.version });

    if (updated.length === 0) {
      // CAS conflict — rollback entire tx (ki NOT decremented, concentration NOT broken).
      return false;
    }

    // B-10: set raged_attacked_hostile=true on ATTACKER when target is opposite kind (REQ-RAGE-09).
    // Hostility approximation: attacker.kind !== target.kind (pc→npc or npc→pc).
    // Write unconditionally (1 extra column) — harmless when not raging.
    if (attackerCombatant.kind !== targetCombatant.kind) {
      await tx
        .update(encounterCombatants)
        .set({ ragedAttackedHostile: true })
        .where(
          and(
            eq(encounterCombatants.id, attackerId),
            eq(encounterCombatants.encounterId, encounterId),
          ),
        );
    }

    // B-12: 0-HP auto-end — DELETE 'Raging' in the 0-HP branch (REQ-RAGE-08).
    // PHB p.48: "Your rage ends early if... you are knocked unconscious."
    // Runs alongside concentration break (below) in the same tx.
    if (newHp === 0) {
      await tx
        .delete(encounterCombatantConditions)
        .where(
          and(
            eq(encounterCombatantConditions.combatantId, targetId),
            eq(encounterCombatantConditions.conditionName, 'Raging'),
          ),
        );
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

    // ── Step 12c-conc: resolveConcentrationCheck IN-TX (REQ-CID-04, ADR-1) ──────
    // CRITICAL: called INSIDE the closure, after the CAS guard, so breakConcentration
    // commits atomically with the HP UPDATE. If the tx rolls back, the break rolls back too.
    // concPlan===null → no concentration row (NPC/non-concentrating/zero-dmg guard fired).
    const conc = concPlan ? await resolveConcentrationCheck(concPlan, tx) : undefined;

    return { committed: true as const, conc };
  });

  if (txResult === false) {
    return { ok: false, code: 'VERSION_CONFLICT' };
  }

  // ── Step 12d: Stunning Strike post-tx (Slice 3b-ii, REQ-SS-CONDITION-01) ──────
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

  // ── Step 12e: Divine Smite response block (engine-divine-smite — ADR-8) ────────
  // Key OMITTED (not null) when divineSmiteSpend absent/false — backward-compat (REQ-DS-COMPAT-01).
  const divineSmiteResult: DivineSmiteBlock | undefined =
    divineSmiteSpend && smiteDice !== undefined
      ? { spent: true, slotLevel: divineSmiteSlotLevel!, dice: smiteDice, radiantDamage }
      : undefined;

  // ── Step 12f: concentrationSave from tx result (REQ-CID-02, REQ-CID-04) ───────
  // txResult.conc is the ConcentrationResolution returned by resolveConcentrationCheck
  // inside the tx closure. undefined when no concentration check was needed.
  // Shape: ConcentrationSaveBlock (save rolled) or { broke:true, reason:'incapacitated-0hp' }.

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
    ...(txResult.conc !== undefined ? { concentrationSave: txResult.conc } : {}),
  };
}
