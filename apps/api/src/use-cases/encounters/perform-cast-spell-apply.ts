/**
 * perform-cast-spell-apply — Interceptable spell cast use-case (Magic Missile).
 *
 * Two-path design (engine-spell-cast-suspend ADR-1, ADR-8):
 *
 *  SUSPEND PATH (defender is PC with free reaction + 1st-level slot):
 *    Steps 1-7 mirror perform-spell-heal.ts (load/version/turn/PC-guard/sheet/slot-pre-check).
 *    Server rolls MM darts via rollMagicMissile, stores in pending_cast (version-guarded UPDATE,
 *    NO version bump on suspend). Returns castAnnounced (no HP, no slot commit, no dart values).
 *
 *  ATOMIC PATH (NPC target / defender has no slot / reaction_used=true):
 *    Same steps 1-7. Rolls darts, applies force damage + caster slot consumed in ONE CAS tx.
 *    Returns damage result immediately.
 *
 * NON-NEGOTIABLE invariants (engine-spell-cast-suspend design):
 *   C-1: Server rolls darts server-side, stored in pending_cast.serverRolledDamage — NEVER in response.
 *   W-3: pending_cast write is WHERE id=$enc AND version=$v (0 rows → VERSION_CONFLICT, no partial writes).
 *   NO version bump on suspend (bookkeeping only — mirrors pending_reaction posture).
 *   Slot consumed AT RESOLVE (inside the atomic CAS tx), not at suspend.
 *
 * PHB p.257 — Magic Missile:
 *   "You create three glowing darts of magical force. Each dart deals 1d4+1 force damage to its target."
 *   Auto-hit (no attack roll, no saving throw).
 * PHB p.275 — Shield reaction timing.
 *
 * REQ-SC-01: rollMagicMissile — dartCount = 3 + (slotLevel - 1) (PHB p.257).
 * REQ-SC-02: INSUFFICIENT_SLOT — caster must have a slot at the requested level.
 * REQ-SC-03: MULTI_TARGET_NOT_SUPPORTED — v1 enforces targets.length === 1.
 * REQ-SC-04: CAST_ANNOUNCED suspension — version-guarded pending_cast write, no commit.
 * REQ-SC-05: Atomic cast — NPC / no defender slot / reaction_used=true → immediate damage.
 */

import { eq, and, sql } from 'drizzle-orm';
import { db } from '../../infra/db/client.js';
import { encounters, encounterCombatants, characters } from '../../infra/db/schema.js';
import {
  rollMagicMissile,
  type RngFn,
} from '@dungeon-hub/domain/engine';
import {
  computeSpellSlots,
  consumeSpellSlot,
} from '@dungeon-hub/domain/character/spellcasting';
import { applyDamage } from '@dungeon-hub/domain/encounter';
import type { AppliedClass } from '@dungeon-hub/domain/character/class';

// ── Crypto RNG (mirrors perform-spell-heal.ts:55-59) ─────────────────────────

/**
 * Server-side crypto RNG — each call returns a uniform integer in [1..sides].
 * Mirrors the pattern from perform-weapon-attack-apply and perform-spell-heal.
 */
const cryptoRng: RngFn = (sides: number): number => {
  const buf = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buf);
  return (buf[0]! % sides) + 1;
};

// ── PendingCast shape ─────────────────────────────────────────────────────────

/**
 * Shape of encounters.pending_cast JSONB.
 * encVersion binds the pending state to the CAS epoch (mirror of PendingReaction.encVersion).
 */
interface PendingCast {
  casterCombatantId: string;
  spellName: 'Magic Missile';
  spellLevel: number;
  targets: string[];
  dartCount: number;
  serverRolledDamage: { total: number; perDart: number[] };
  encVersion: number;
}

// ── Input / Output ─────────────────────────────────────────────────────────────

export interface PerformCastSpellApplyInput {
  encounterId: string;
  casterId: string;        // encounter_combatants.id for the caster
  spellName: 'Magic Missile';
  slotLevel: number;       // 1..9
  targets: string[];       // encounter_combatants.id[] (v1: length must be 1)
  version: number;         // CAS version from caller
  userId: string;          // for audit (GM identity)
}

/**
 * A reaction option offered in the cast-announced window.
 *
 * kind:'shield'       — the targeted defender can cast Shield (PHB p.275).
 * kind:'counterspell' — one or more non-caster combatants can Counterspell (PHB p.281).
 *
 * ADR-4 (engine-counterspell): options[] generalizes the single-kind shape so one
 * window can carry both reaction types simultaneously.
 */
export type CastAnnouncedOption =
  | { kind: 'shield'; defenderCombatantId: string }
  | { kind: 'counterspell'; eligibleCounterspellerIds: string[] };

export type PerformCastSpellApplyResult =
  | {
      ok: true;
      /**
       * Returned when at least one reaction option is available (suspend path).
       * spellName + slotLevel are top-level; options[] carries per-reaction-type details.
       * ADR-4 (engine-counterspell): replaces the former single-kind shape.
       */
      castAnnounced?: {
        spellName: 'Magic Missile';
        slotLevel: number;
        options: CastAnnouncedOption[];
      };
      /** Returned on the atomic path (NPC / no slot / reaction used). */
      damage?: {
        total: number;
        perDart: number[];
        dartCount: number;
      };
    }
  | { ok: false; code: 'ENCOUNTER_NOT_ACTIVE' }
  | { ok: false; code: 'NOT_FOUND'; target: 'encounter' | 'attacker' | 'target' | 'character' }
  | { ok: false; code: 'NOT_YOUR_TURN' }
  | { ok: false; code: 'VERSION_CONFLICT' }
  | { ok: false; code: 'CASTER_NOT_SPELLCASTER' }
  | { ok: false; code: 'INSUFFICIENT_SLOT' }
  | { ok: false; code: 'MULTI_TARGET_NOT_SUPPORTED' };

// ── perform-cast-spell-apply ──────────────────────────────────────────────────

/**
 * Applies a Magic Missile cast with optional Shield reaction suspension.
 *
 * Steps 1-7 mirror perform-spell-heal.ts:117-265 exactly:
 *   1. Load encounter → NOT_FOUND / ENCOUNTER_NOT_ACTIVE / VERSION_CONFLICT pre-check
 *   2. Load caster combatant → NOT_FOUND 'attacker'
 *   3. Turn guard (currentCombatantId ≠ casterId → NOT_YOUR_TURN)
 *   4. Caster-is-PC guard (characterId null → CASTER_NOT_SPELLCASTER)
 *   5. Single-target guard (targets.length !== 1 → MULTI_TARGET_NOT_SUPPORTED, REQ-SC-03)
 *   6. Load target combatant → NOT_FOUND 'target'
 *   7. Load caster character + consumeSpellSlot PRE-CHECK (fail-fast) → INSUFFICIENT_SLOT
 *   8. Determine suspend vs atomic branch.
 *   9a. SUSPEND: rollMagicMissile → version-guarded pending_cast UPDATE (NO version bump) → return castAnnounced.
 *   9b. ATOMIC: rollMagicMissile → applyDamage → CAS tx [defender HP + caster slot + version++] → return damage.
 */
export async function performCastSpellApply(
  input: PerformCastSpellApplyInput,
): Promise<PerformCastSpellApplyResult> {
  const { encounterId, casterId, spellName, slotLevel, targets, version } = input;

  // ── Step 5: Single-target guard (early — no DB needed, REQ-SC-03) ─────────────
  // v1 enforces exactly one target (multi-target is a pure data-shape extension later).
  if (targets.length !== 1) {
    return { ok: false, code: 'MULTI_TARGET_NOT_SUPPORTED' };
  }

  const targetId = targets[0]!;

  // ── Step 1: Load encounter ────────────────────────────────────────────────────
  const [encounterRow] = await db
    .select()
    .from(encounters)
    .where(eq(encounters.id, encounterId))
    .limit(1);

  if (!encounterRow) return { ok: false, code: 'NOT_FOUND', target: 'encounter' };
  if (encounterRow.status !== 'active') return { ok: false, code: 'ENCOUNTER_NOT_ACTIVE' };

  // Version pre-check (CAS re-checked at suspend write or tx commit).
  if (encounterRow.version !== version) {
    return { ok: false, code: 'VERSION_CONFLICT' };
  }

  // ── Step 2: Load caster combatant ─────────────────────────────────────────────
  const [casterCombatant] = await db
    .select()
    .from(encounterCombatants)
    .where(
      and(
        eq(encounterCombatants.id, casterId),
        eq(encounterCombatants.encounterId, encounterId),
      ),
    )
    .limit(1);

  if (!casterCombatant) return { ok: false, code: 'NOT_FOUND', target: 'attacker' };

  // ── Step 3: Turn guard ────────────────────────────────────────────────────────
  if (encounterRow.currentCombatantId !== casterId) {
    return { ok: false, code: 'NOT_YOUR_TURN' };
  }

  // ── Step 4: Caster-is-PC guard ────────────────────────────────────────────────
  if (casterCombatant.characterId === null || casterCombatant.characterId === undefined) {
    return { ok: false, code: 'CASTER_NOT_SPELLCASTER' };
  }

  const casterCharId = casterCombatant.characterId;

  // ── Step 6: Load target combatant ─────────────────────────────────────────────
  const [targetCombatant] = await db
    .select({
      id: encounterCombatants.id,
      kind: encounterCombatants.kind,
      characterId: encounterCombatants.characterId,
      hpCurrent: encounterCombatants.hpCurrent,
      hpMax: encounterCombatants.hpMax,
      encounterId: encounterCombatants.encounterId,
      reactionUsed: encounterCombatants.reactionUsed,
    })
    .from(encounterCombatants)
    .where(
      and(
        eq(encounterCombatants.id, targetId),
        eq(encounterCombatants.encounterId, encounterId),
      ),
    )
    .limit(1);

  if (!targetCombatant) return { ok: false, code: 'NOT_FOUND', target: 'target' };

  // ── Step 7: Load caster character + slot pre-check ────────────────────────────
  const [casterCharRow] = await db
    .select()
    .from(characters)
    .where(eq(characters.id, casterCharId))
    .limit(1);

  if (!casterCharRow) return { ok: false, code: 'NOT_FOUND', target: 'character' };

  const charData = (casterCharRow.data as Record<string, unknown>) ?? {};
  const classes = (charData['classes'] as AppliedClass[] | undefined) ?? [];

  const slotsMax = computeSpellSlots(classes).slots;
  const slotsUsed: readonly number[] =
    (charData['spellSlotsUsed'] as number[] | undefined) ?? new Array(9).fill(0);

  // consumeSpellSlot PRE-CHECK (fail-fast, BEFORE rolling dice — REQ-SC-02).
  const slotResult = consumeSpellSlot({
    slotsMax,
    slotsUsed,
    pactMagic: null,
    pactSlotsUsed: 0,
    level: slotLevel,
    slotType: 'regular',
  });

  if (!slotResult.ok) {
    return { ok: false, code: 'INSUFFICIENT_SLOT' };
  }

  const nextCasterSlotsUsed = slotResult.slotsUsed;

  // ── Step 8: Determine suspend vs atomic branch ────────────────────────────────
  // Suspend predicate: canShield || canCounter (ADR-3 engine-counterspell).
  //
  // canShield: defender is PC + reaction_used===false + has ≥1 1st-level+ slot (PHB p.275).
  // canCounter: any non-caster PC combatant in encounter with reaction_used===false +
  //             has ≥1 3rd-level+ slot (slot index ≥2, PHB p.281).
  // When NEITHER holds → atomic path (byte-identical to Slice 0 — REQ-CS-10, REQ-SC-05).

  // ── canShield check (mirrors L244-269 from Slice 0) ──────────────────────────
  const isDefenderPc = targetCombatant.kind === 'pc';
  const defenderNotUsedReaction = !targetCombatant.reactionUsed;

  let canShield = false;
  if (isDefenderPc && defenderNotUsedReaction && targetCombatant.characterId) {
    const [defCharRow] = await db
      .select({ data: characters.data })
      .from(characters)
      .where(eq(characters.id, targetCombatant.characterId))
      .limit(1);

    if (defCharRow) {
      const defData = (defCharRow.data as Record<string, unknown>) ?? {};
      const { slots: defSlotsMax } = computeSpellSlots(
        (defData['classes'] as AppliedClass[] | undefined) ?? [],
      );
      const defSlotsUsed =
        (defData['spellSlotsUsed'] as number[] | undefined) ?? new Array(9).fill(0);

      // Has a free level-1+ slot if any slot index 0..8 has (max > used).
      for (let lvl = 0; lvl < 9; lvl++) {
        const slotMax = defSlotsMax[lvl] ?? 0;
        const slotUsed = defSlotsUsed[lvl] ?? 0;
        if (slotMax > slotUsed) {
          canShield = true;
          break;
        }
      }
    }
  }

  // ── canCounter check (ADR-3 engine-counterspell) ─────────────────────────────
  // SELECT all non-caster PC combatants in encounter with reaction_used=false.
  // For each, check if they have ≥1 free 3rd-level+ slot (slot index ≥2).
  // PHB p.281: Counterspell requires a spell slot of 3rd level or higher.
  const eligibleCounterspellerIds: string[] = [];

  const otherCombatants = await db
    .select({
      id: encounterCombatants.id,
      kind: encounterCombatants.kind,
      characterId: encounterCombatants.characterId,
      reactionUsed: encounterCombatants.reactionUsed,
    })
    .from(encounterCombatants)
    .where(
      and(
        eq(encounterCombatants.encounterId, encounterId),
      ),
    );

  for (const combatant of otherCombatants) {
    // Must be non-caster (Counterspell is a reaction to ANOTHER creature's cast).
    if (combatant.id === casterId) continue;
    // Must be a PC (NPC counterspellers are out of scope — design #1386).
    if (combatant.kind !== 'pc') continue;
    // Must have reaction available.
    if (combatant.reactionUsed) continue;
    if (!combatant.characterId) continue;

    const [charRow] = await db
      .select({ data: characters.data })
      .from(characters)
      .where(eq(characters.id, combatant.characterId))
      .limit(1);

    if (!charRow) continue;

    const data = (charRow.data as Record<string, unknown>) ?? {};
    const { slots: slotsMax } = computeSpellSlots(
      (data['classes'] as AppliedClass[] | undefined) ?? [],
    );
    const slotsUsed =
      (data['spellSlotsUsed'] as number[] | undefined) ?? new Array(9).fill(0);

    // Has a free 3rd-level+ slot: index ≥2 (index 0 = level 1, index 2 = level 3).
    let hasThirdLevelSlot = false;
    for (let lvl = 2; lvl < 9; lvl++) {
      const slotMax = slotsMax[lvl] ?? 0;
      const slotUsed = slotsUsed[lvl] ?? 0;
      if (slotMax > slotUsed) {
        hasThirdLevelSlot = true;
        break;
      }
    }

    if (hasThirdLevelSlot) {
      eligibleCounterspellerIds.push(combatant.id);
    }
  }

  const canCounter = eligibleCounterspellerIds.length > 0;

  // shouldSuspend = canShield || canCounter (ADR-3).
  const shouldSuspend = canShield || canCounter;

  // ── Step 9a: SUSPEND PATH ─────────────────────────────────────────────────────
  // Roll MM darts server-side (C-1). Write pending_cast with version guard (W-3).
  // NO version bump on suspend. NO slot consumed yet (slot consumed at resolve — ADR-1).
  if (shouldSuspend) {
    const rollResult = rollMagicMissile({ slotLevel, rng: cryptoRng });

    // Version-guarded UPDATE — mirrors pending_reaction posture in perform-weapon-attack-apply.
    // If 0 rows updated (concurrent commit changed version), return VERSION_CONFLICT.
    const pendingCast: PendingCast = {
      casterCombatantId: casterId,
      spellName,
      spellLevel: slotLevel,
      targets: [targetId],
      dartCount: rollResult.dartCount,
      serverRolledDamage: { total: rollResult.total, perDart: rollResult.perDart },
      encVersion: version,
    };

    const suspendUpdated = await db
      .update(encounters)
      .set({
        pendingCast,
        updatedAt: new Date(),
      })
      .where(and(eq(encounters.id, encounterId), eq(encounters.version, version)))
      .returning({ id: encounters.id });

    if (suspendUpdated.length === 0) {
      return { ok: false, code: 'VERSION_CONFLICT' };
    }

    // Build options[] for castAnnounced (ADR-4 engine-counterspell).
    // C-1: NO dart damage values in response (server-authority — ADR-6).
    const castOptions: CastAnnouncedOption[] = [];
    if (canShield) {
      castOptions.push({ kind: 'shield', defenderCombatantId: targetId });
    }
    if (canCounter) {
      castOptions.push({ kind: 'counterspell', eligibleCounterspellerIds });
    }

    return {
      ok: true,
      castAnnounced: {
        spellName,
        slotLevel,
        options: castOptions,
      },
    };
  }

  // ── Step 9b: ATOMIC PATH ──────────────────────────────────────────────────────
  // NPC target / defender has no slot / reaction_used=true → resolve immediately.
  // Roll MM darts server-side, apply force damage to defender, consume caster slot.
  // Single CAS tx: [defender HP + caster spellSlotsUsed + encounters.version++]
  // PHB p.257: Magic Missile auto-hits — no attack roll, no save.
  const rollResult = rollMagicMissile({ slotLevel, rng: cryptoRng });
  const newDefenderHp = applyDamage(targetCombatant.hpCurrent, rollResult.total);

  const txResult = await db.transaction(async (tx) => {
    // a. Update defender HP (apply force damage — PHB p.257).
    await tx
      .update(encounterCombatants)
      .set({ hpCurrent: newDefenderHp })
      .where(
        and(
          eq(encounterCombatants.id, targetId),
          eq(encounterCombatants.encounterId, encounterId),
        ),
      );

    // b. CAS version bump + clear pending_cast (atomic commit).
    const updated = await tx
      .update(encounters)
      .set({
        version: sql`${encounters.version} + 1`,
        pendingCast: null,
        updatedAt: new Date(),
      })
      .where(and(eq(encounters.id, encounterId), eq(encounters.version, version)))
      .returning({ version: encounters.version });

    if (updated.length === 0) {
      return false;
    }

    // c. Consume caster spell slot atomically.
    await tx
      .update(characters)
      .set({
        data: sql`jsonb_set(data, '{spellSlotsUsed}', ${JSON.stringify([...nextCasterSlotsUsed])}::jsonb, true)`,
      })
      .where(eq(characters.id, casterCharId));

    return true;
  });

  if (!txResult) {
    return { ok: false, code: 'VERSION_CONFLICT' };
  }

  return {
    ok: true,
    damage: {
      total: rollResult.total,
      perDart: rollResult.perDart,
      dartCount: rollResult.dartCount,
    },
  };
}
