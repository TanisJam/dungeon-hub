/**
 * perform-weapon-attack-apply — Atomic weapon attack apply use-case.
 *
 * MUTATION slice of the action pipeline (engine-attack-apply-damage SDD).
 * Server-authoritative: re-derives damage expression from DB, rolls with
 * crypto RNG, clamps HP, and persists HP + version in ONE transaction.
 *
 * Design ref: sdd/engine-attack-apply-damage/design — data flow, ADR-5, ADR-7, ADR-10.
 *
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
  type RngFn,
  type RollResult,
} from '@dungeon-hub/domain/engine';
import { applyDamage } from '@dungeon-hub/domain/encounter';
import { buildAttackContext } from './build-attack-context.js';

// ── Crypto RNG (ADR-5) ─────────────────────────────────────────────────────────

/**
 * Server-side crypto RNG for the apply use-case.
 *
 * ADR-5: single consumer this slice; IO/entropy belongs in IO layer, not domain.
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
  /** Optional: crit=true doubles dice count (PHB p.196). Defaults to false. */
  crit?: boolean;
  /** Caller-asserted runtime decisions (for Sneak Attack predicates, etc.). */
  runtimeDecisions?: Record<string, boolean>;
  /** Client's known version — must match encounters.version for CAS. */
  version: number;
}

export type PerformWeaponAttackApplyResult =
  | {
      ok: true;
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
  | { ok: false; code: 'FORBIDDEN' };

// ── perform-weapon-attack-apply ────────────────────────────────────────────────

/**
 * Applies damage atomically in a transaction:
 *   1. Load encounter + version check
 *   2. Turn guard
 *   3. Load target combatant HP
 *   4. buildAttackContext (attacker character+weapon+registry)
 *   5. resolveWeaponAttack → damage expression
 *   6. rollDamageBreakdown → total + perDie
 *   7. applyDamage → newHp
 *   8. tx: UPDATE encounter_combatants hp + UPDATE encounters version (CAS)
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
    crit = false,
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

  // ── Step 4: Load target combatant ────────────────────────────────────────────
  const [targetCombatant] = await db
    .select({
      id: encounterCombatants.id,
      hpCurrent: encounterCombatants.hpCurrent,
      encounterId: encounterCombatants.encounterId,
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

  // ── Steps 6-13: Build character+weapon+registry context ──────────────────────
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

  // ── Step: resolveWeaponAttack → damage expression ────────────────────────────
  // REQ-ATK-APPLY-02: server derives authoritative DiceExpr — client never supplies it.
  // resolveWeaponAttack is PURE (REQ-ATK-PURE-01); result is deterministic given same inputs.
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

  const { damage, action } = attackResult;
  void action; // action (pipeline phase) is unused in the apply path

  // ── Step: rollDamageBreakdown → total + perDie (ADR-1 — CRITICAL) ────────────
  // Pass (dice, breakdown) — NOT flatMods. flatMods is a SUBSET already inside
  // breakdown (ability mod is in both). Passing flatMods separately double-counts.
  // crit=true doubles dice count per NdM source; flat integers unchanged (PHB p.196).
  const rollResult = rollDamageBreakdown(damage.dice, damage.breakdown, crit, cryptoRng);
  const { total: rolledDamage, perDie } = rollResult;

  // ── Step: applyDamage → newHp (PHB p.197 clamp) ──────────────────────────────
  const newHp = applyDamage(targetCombatant.hpCurrent, rolledDamage);

  // ── Step: Transaction — persist HP + bump version (CAS — ADR-10) ─────────────
  // UPDATE encounters WHERE id=$id AND version=$incoming → 0 rows = VERSION_CONFLICT.
  // Mirrors advance-encounter-turn.ts:42 pattern.
  const txResult = await db.transaction(async (tx) => {
    // Update target HP
    await tx
      .update(encounterCombatants)
      .set({ hpCurrent: newHp })
      .where(
        and(
          eq(encounterCombatants.id, targetId),
          eq(encounterCombatants.encounterId, encounterId),
        ),
      );

    // CAS version bump — authoritative check
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
    rolledDamage,
    perDie,
    newHp,
    damageType: weapon.damageType,
  };
}
