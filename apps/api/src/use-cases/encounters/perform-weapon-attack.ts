/**
 * perform-weapon-attack — Use-case for the engine action pipeline weapon attack route.
 *
 * Slice 1 (engine-action-pipeline SDD): Synchronous, read-only weapon attack resolver.
 * Loads encounter guards, delegates character+weapon context to buildAttackContext,
 * calls the pure domain resolveWeaponAttack, and returns the result. NO DB writes.
 *
 * Design ref: sdd/engine-action-pipeline/design — ADR-9, data flow section.
 * ADR-8 (engine-attack-apply-damage): character+weapon context loading extracted to
 * buildAttackContext to avoid drift between read-only and mutation use-cases.
 *
 * REQ-ATK-READONLY-01: zero DB writes. No HP mutation, no encounter version bump,
 * no encounter_actions row created.
 * REQ-ATK-NULLSAFE-01: returns typed error codes instead of throwing for missing data.
 * REQ-ATK-CTX-01: ctx populated from real encounter/character data.
 */
import { eq, and } from 'drizzle-orm';
import { db } from '../../infra/db/client.js';
import { encounters, encounterCombatants, characters } from '../../infra/db/schema.js';
import {
  resolveWeaponAttack,
  type WeaponAttackResult,
} from '@dungeon-hub/domain/engine';
import { buildAttackContext } from './build-attack-context.js';

// ── Input / Output ─────────────────────────────────────────────────────────────

export interface PerformWeaponAttackInput {
  encounterId: string;
  attackerId: string;        // encounter_combatants.id (NOT character.id)
  targetId: string;          // encounter_combatants.id
  weaponInstanceId: string;  // inventory instance UUID
  activeConditions?: string[];
  /**
   * Caller-asserted per-action runtime decisions (REQ-SA-API-01).
   * Threaded into EvaluationContext.runtimeDecisions for predicate evaluation.
   * Absence = no assertions → all runtimeDecision leaves evaluate to false.
   * Backwards-compatible: existing callers may omit this field.
   * exactOptionalPropertyTypes: use conditional spread; never assign undefined.
   */
  runtimeDecisions?: Record<string, boolean>;
  /** User ID of the authenticated caller (for ownership + turn guard). */
  callerId: string;
}

export type PerformWeaponAttackResult =
  | { ok: true; toHit: WeaponAttackResult['toHit']; damage: WeaponAttackResult['damage']; rollMode: WeaponAttackResult['rollMode'] }
  | { ok: false; code: 'ENCOUNTER_NOT_ACTIVE' }
  | { ok: false; code: 'NOT_FOUND'; target: 'encounter' | 'attacker' | 'target' | 'weapon' | 'character' }
  | { ok: false; code: 'NOT_YOUR_TURN' }
  | { ok: false; code: 'FORBIDDEN' };

// ── perform-weapon-attack ──────────────────────────────────────────────────────

/**
 * Loads encounter + attacker combatant, checks ownership + turn guard, then
 * delegates character+weapon context building to buildAttackContext, calls
 * resolveWeaponAttack, and returns the read-only result.
 *
 * ADR-9 ownership guard: caller must own the attacker character. If attackerCombatant
 * is an NPC (characterId === null), only GM role passes (but full GM check is done at
 * the route layer; here we check ownership or null-characterId).
 *
 * NPC null safety: target.characterId may be null (NPC) — we only need EntityRef{id}
 * for ctx.target, no character load required for the target this slice.
 */
export async function performWeaponAttack(
  input: PerformWeaponAttackInput,
): Promise<PerformWeaponAttackResult> {
  const { encounterId, attackerId, targetId, weaponInstanceId, callerId, runtimeDecisions } = input;

  // ── Step 1: Load encounter ────────────────────────────────────────────────────
  const [encounterRow] = await db
    .select()
    .from(encounters)
    .where(eq(encounters.id, encounterId))
    .limit(1);

  if (!encounterRow) return { ok: false, code: 'NOT_FOUND', target: 'encounter' };
  if (encounterRow.status !== 'active') return { ok: false, code: 'ENCOUNTER_NOT_ACTIVE' };

  // ── Step 2: Load attacker combatant ──────────────────────────────────────────
  const [attackerCombatant] = await db
    .select()
    .from(encounterCombatants)
    .where(and(eq(encounterCombatants.id, attackerId), eq(encounterCombatants.encounterId, encounterId)))
    .limit(1);

  if (!attackerCombatant) return { ok: false, code: 'NOT_FOUND', target: 'attacker' };

  // ── Step 3: Turn guard ────────────────────────────────────────────────────────
  if (encounterRow.currentCombatantId !== attackerId) {
    return { ok: false, code: 'NOT_YOUR_TURN' };
  }

  // ── Step 4: Load target combatant ────────────────────────────────────────────
  const [targetCombatant] = await db
    .select()
    .from(encounterCombatants)
    .where(and(eq(encounterCombatants.id, targetId), eq(encounterCombatants.encounterId, encounterId)))
    .limit(1);

  if (!targetCombatant) return { ok: false, code: 'NOT_FOUND', target: 'target' };

  // ── Step 5: Ownership guard ───────────────────────────────────────────────────
  // NPC combatants have characterId === null — ownership check skipped (GM-only
  // is enforced at route layer via memberRole check; this use-case only handles
  // PC ownership). If characterId is null, the route already blocked with 403.
  if (attackerCombatant.characterId !== null && attackerCombatant.characterId !== undefined) {
    // Load the character to verify ownership
    const [charRow] = await db
      .select({ userId: characters.userId })
      .from(characters)
      .where(eq(characters.id, attackerCombatant.characterId))
      .limit(1);

    if (!charRow) return { ok: false, code: 'NOT_FOUND', target: 'character' };
    if (charRow.userId !== callerId) return { ok: false, code: 'FORBIDDEN' };
  }

  // attackerCombatant.characterId is not null at this point (enforced above for PC).
  const characterId = attackerCombatant.characterId!;

  // ── Steps 6-13: Build character+weapon+registry context ──────────────────────
  // ADR-8: extracted to buildAttackContext to share with perform-weapon-attack-apply.
  const ctxResult = await buildAttackContext({
    characterId,
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

  // ── Step 13: Call resolveWeaponAttack ─────────────────────────────────────────
  const result = resolveWeaponAttack({
    self: charId,
    ctx,
    registry,
    strMod,
    dexMod,
    proficiencyBonus,
    isProficient,
    weapon,
  });

  return {
    ok: true,
    toHit: result.toHit,
    damage: result.damage,
    rollMode: result.rollMode,
  };
}
