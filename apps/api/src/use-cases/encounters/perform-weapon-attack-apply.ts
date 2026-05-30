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
import { encounters, encounterCombatants } from '../../infra/db/schema.js';
import {
  resolveWeaponAttack,
  rollDamageBreakdown,
  rollToHit,
  type RngFn,
  type RollResult,
} from '@dungeon-hub/domain/engine';
import { applyDamage } from '@dungeon-hub/domain/encounter';
import { buildAttackContext } from './build-attack-context.js';
import { resolveTargetAc } from './resolve-target-ac.js';

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
  /** Client's known version — must match encounters.version for CAS. */
  version: number;
}

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
    }
  | { ok: false; code: 'ENCOUNTER_NOT_ACTIVE' }
  | { ok: false; code: 'NOT_FOUND'; target: 'encounter' | 'attacker' | 'target' | 'weapon' | 'character' }
  | { ok: false; code: 'NOT_YOUR_TURN' }
  | { ok: false; code: 'VERSION_CONFLICT' }
  | { ok: false; code: 'NO_TARGET_AC' }     // NPC with null ac (legacy/unset)
  | { ok: false; code: 'FORBIDDEN' };

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

  const { charId, ctx, registry, strMod, dexMod, proficiencyBonus, isProficient, weapon } = ctxResult;

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
  // Pass (dice, breakdown) — NOT flatMods. flatMods is a SUBSET already inside
  // breakdown (ability mod is in both). Passing flatMods separately double-counts.
  // crit from rollToHit.crit doubles dice count per NdM source (PHB p.196).
  const rollResult = rollDamageBreakdown(damage.dice, damage.breakdown, toHitResult.crit, cryptoRng);
  const { total: rolledDamage, perDie } = rollResult;

  // ── Step 12: applyDamage + transaction ───────────────────────────────────────
  // applyDamage → newHp (PHB p.197 clamp at 0).
  const newHp = applyDamage(targetCombatant.hpCurrent, rolledDamage);

  // Transaction: UPDATE target HP + CAS version bump (ADR-10).
  // UPDATE encounters WHERE id=$id AND version=$incoming → 0 rows = VERSION_CONFLICT.
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

    return updated.length > 0;
  });

  if (!txResult) {
    return { ok: false, code: 'VERSION_CONFLICT' };
  }

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
  };
}
