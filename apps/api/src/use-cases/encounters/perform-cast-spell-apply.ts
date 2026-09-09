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

import { eq, and, sql, inArray } from 'drizzle-orm';
import { db } from '../../infra/db/client.js';
import { encounters, encounterCombatants, characters, encounterCombatantConditions } from '../../infra/db/schema.js';
import { isCombatantIncapacitated } from './load-combatant-incapacitated.js';
import { isCombatantRaging } from './load-combatant-raging.js';
import { isCombatantSurprisedFirstTurn } from './is-combatant-surprised-first-turn.js';
import {
  rollMagicMissile,
  type RngFn,
} from '@dungeon-hub/domain/engine';
import {
  computeSpellSlots,
  consumeSpellSlot,
} from '@dungeon-hub/domain/character/spellcasting';
import { resolveResistance } from './resolve-resistance.js';
import {
  prepareConcentrationCheck,
  resolveConcentrationCheck,
  type ConcentrationResolution,
} from './check-concentration-on-damage.js';
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
      /**
       * Concentration save result (engine-concentration-break-damage, REQ-CB-06).
       * Present only on the atomic path AND when the target was concentrating AND finalDamage > 0,
       * OR when newHp===0 (outright break — PHB p.197/p.203, REQ-CID-02).
       * Absent (key omitted) otherwise — backward-compat omit-not-null (REQ-CB-12).
       * Shape: ConcentrationSaveBlock | { broke: true; reason: 'incapacitated-0hp' }.
       * REQ-CID-04: breakConcentration runs INSIDE the same CAS tx as the HP UPDATE — atomicity saga closed.
       */
      concentrationSave?: ConcentrationResolution;
    }
  | { ok: false; code: 'ENCOUNTER_NOT_ACTIVE' }
  | { ok: false; code: 'NOT_FOUND'; target: 'encounter' | 'attacker' | 'target' | 'character' }
  | { ok: false; code: 'NOT_YOUR_TURN' }
  | { ok: false; code: 'VERSION_CONFLICT' }
  | { ok: false; code: 'CASTER_NOT_SPELLCASTER' }
  | { ok: false; code: 'INSUFFICIENT_SLOT' }
  | { ok: false; code: 'MULTI_TARGET_NOT_SUPPORTED' }
  // engine-incapacitated-gating — REQ-INC-03 (PHB p.290: can't take actions).
  | { ok: false; code: 'ACTOR_INCAPACITATED' }
  // engine-surprise-round1 (REQ-SUR-S2-02, PHB p.189 — actions blocked while surprised)
  | { ok: false; code: 'ACTOR_SURPRISED' }
  // engine-action-economy: caster's action budget exhausted for this turn (REQ-AE-02, PHB p.257).
  | { ok: false; code: 'ACTION_ALREADY_USED' }
  // engine-rage: caster is Raging — can't cast spells while raging (REQ-RAGE-06, PHB p.48).
  | { ok: false; code: 'ACTOR_RAGING' };

// ── perform-cast-spell-apply ──────────────────────────────────────────────────

/**
 * Applies a Magic Missile cast with optional Shield reaction suspension.
 *
 * Steps 1-7 mirror perform-spell-heal.ts:117-265 exactly:
 *   1. Load encounter → NOT_FOUND / ENCOUNTER_NOT_ACTIVE / VERSION_CONFLICT pre-check
 *   2. Load caster combatant → NOT_FOUND 'attacker'
 *   3. Turn guard (currentCombatantId ≠ casterId → NOT_YOUR_TURN)
 *   4. Caster-is-PC guard (characterId null → CASTER_NOT_SPELLCASTER)
 *   4a. Incapacitated gate → ACTOR_INCAPACITATED
 *   4a.1. Surprised gate (REQ-SUR-S2-02, PHB p.189) → ACTOR_SURPRISED
 *   4b. Action budget gate → ACTION_ALREADY_USED
 *   4c. Raging gate (REQ-RAGE-06) → ACTOR_RAGING
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

  // ── Step 4a: Incapacitated gate (REQ-INC-03, PHB p.290 — can't take actions) ──
  // Fail-fast BEFORE character sheet load and slot math (ADR-3.3).
  // Server-authority: gate computed from DB-loaded conditions, never client-supplied.
  if (await isCombatantIncapacitated(casterId)) {
    return { ok: false, code: 'ACTOR_INCAPACITATED' };
  }

  // ── Step 4a.1: Surprised gate (REQ-SUR-S2-02, PHB p.189 — can't act on first surprised turn) ──
  // Fail-fast AFTER incap gate, BEFORE action budget gate (ADR-3.2 version→turn→incap→SURPRISE ladder).
  // No RNG involved — surprise gating is deterministic state-based check.
  if (await isCombatantSurprisedFirstTurn(casterId)) {
    return { ok: false, code: 'ACTOR_SURPRISED' };
  }

  // ── Step 4b: Action budget gate (REQ-AE-02, PHB p.257 — casting costs the action) ──
  // Fail-fast: reject if this caster already spent their action this turn.
  // casterCombatant loaded via select() in Step 2 — actionUsed column available.
  if (casterCombatant.actionUsed) {
    return { ok: false, code: 'ACTION_ALREADY_USED' };
  }

  // ── Step 4c: Raging gate (REQ-RAGE-06, PHB p.48 — can't cast spells while raging) ──
  // Fail-fast BEFORE character sheet load and slot math.
  // Server-authority: gate computed from DB-loaded conditions, never client-supplied.
  if (await isCombatantRaging(casterId)) {
    return { ok: false, code: 'ACTOR_RAGING' };
  }

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

  // REQ-INC-06: Incapacitated defender cannot react — exclude from Shield eligibility
  // BEFORE loading character sheet (fail-fast; ADR-4.1 single targeted SELECT).
  const defenderIncapacitated = await isCombatantIncapacitated(targetId);

  let canShield = false;
  if (isDefenderPc && defenderNotUsedReaction && !defenderIncapacitated && targetCombatant.characterId) {
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

  // REQ-INC-06: Incapacitated combatants cannot react — exclude from canCounter eligibility.
  // ADR-4.2: ONE batched IN-query over all candidates (not N scalar calls) to keep O(1) round-trips.
  // Build a Set<combatantId> for O(1) membership testing inside the loop.
  const candidateIds = otherCombatants.map((c) => c.id);
  const incapacitatedIds = new Set<string>();
  if (candidateIds.length > 0) {
    const incapRows = await db
      .select({ combatantId: encounterCombatantConditions.combatantId })
      .from(encounterCombatantConditions)
      .where(
        and(
          inArray(encounterCombatantConditions.combatantId, candidateIds),
          eq(encounterCombatantConditions.conditionName, 'Incapacitated'),
        ),
      );
    for (const row of incapRows) {
      incapacitatedIds.add(row.combatantId);
    }
  }

  for (const combatant of otherCombatants) {
    // Must be non-caster (Counterspell is a reaction to ANOTHER creature's cast).
    if (combatant.id === casterId) continue;
    // Must be a PC (NPC counterspellers are out of scope — design #1386).
    if (combatant.kind !== 'pc') continue;
    // Must have reaction available.
    if (combatant.reactionUsed) continue;
    if (!combatant.characterId) continue;
    // REQ-INC-06: Incapacitated combatants cannot react — skip via batched set (ADR-4.2).
    if (incapacitatedIds.has(combatant.id)) continue;

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
  // engine-action-economy (B-9, ADR-5): the caster declared the spell — the action is spent
  // at ANNOUNCE time (PHB p.281: counterspell that negates the spell still spent the action).
  // The suspend write is converted to a tx: UPDATE caster actionUsed=true + bump version,
  // capture nextVersion, write pending_cast{encVersion:nextVersion}.
  // VERSION RE-THREAD SITE 5: pending_cast.encVersion MUST be nextVersion (the post-consume epoch).
  // If encVersion stays at the old version, resolve-cast-reaction's bind-check rejects valid state.
  if (shouldSuspend) {
    const rollResult = rollMagicMissile({ slotLevel, rng: cryptoRng });

    // Suspend tx: consume caster action + bump version (serializes concurrent applies) + write pending_cast.
    let suspendNextVersion = version;
    const suspendTxResult = await db.transaction(async (tx) => {
      // a. Consume caster action atomically.
      await tx
        .update(encounterCombatants)
        .set({ actionUsed: true })
        .where(
          and(
            eq(encounterCombatants.id, casterId),
            eq(encounterCombatants.encounterId, encounterId),
          ),
        );

      // b. Bump encounter version (CAS guard).
      const bumped = await tx
        .update(encounters)
        .set({ version: sql`${encounters.version} + 1`, updatedAt: new Date() })
        .where(and(eq(encounters.id, encounterId), eq(encounters.version, version)))
        .returning({ version: encounters.version });

      if (bumped.length === 0) return false;

      suspendNextVersion = bumped[0]!.version;

      // c. Write pending_cast with encVersion = nextVersion (VERSION RE-THREAD SITE 5).
      const pendingCast: PendingCast = {
        casterCombatantId: casterId,
        spellName,
        spellLevel: slotLevel,
        targets: [targetId],
        dartCount: rollResult.dartCount,
        serverRolledDamage: { total: rollResult.total, perDart: rollResult.perDart },
        encVersion: suspendNextVersion,
      };

      await tx
        .update(encounters)
        .set({ pendingCast, updatedAt: new Date() })
        .where(eq(encounters.id, encounterId));

      return true;
    });

    if (!suspendTxResult) {
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
  // Roll MM darts server-side, resolve resistance (PHB p.197), apply force damage,
  // consume caster slot. Single CAS tx: [defender HP + caster spellSlotsUsed + version++]
  // PHB p.257: Magic Missile auto-hits — no attack roll, no save.
  const rollResult = rollMagicMissile({ slotLevel, rng: cryptoRng });
  // resolveResistance: loads target conditions from DB → applyDamageWithResist.
  // rollResult.damageType === 'force' (PHB p.257). Runs OUTSIDE CAS tx (ADR-4).
  // B2f: capture finalDamage (post-resistance) for concentration DC.
  const { newHp: newDefenderHp, finalDamage: finalDamageCast } = await resolveResistance(
    targetId,
    rollResult.total,
    rollResult.damageType,
    targetCombatant.hpCurrent,
  );

  // ── REQ-CID-04: prepare/resolve split (ADR-1, Slice 3) ───────────────────────
  // PREPARE outside CAS tx: registry SELECT + save-bonus read (or breakOutright on newHp===0).
  // REQ-CB-11: ONE prepare call handles aggregate MM damage (not per-dart).
  const concPlan = await prepareConcentrationCheck(
    { kind: targetCombatant.kind, characterId: targetCombatant.characterId },
    finalDamageCast,
    newDefenderHp,
  );

  const txResult = await db.transaction(async (tx) => {
    // a. Update defender HP (apply force damage — PHB p.257).
    // B-11: set raged_took_damage=true when finalDamageCast > 0 (REQ-RAGE-09, PHB p.48).
    await tx
      .update(encounterCombatants)
      .set({
        hpCurrent: newDefenderHp,
        ...(finalDamageCast > 0 ? { ragedTookDamage: true } : {}),
      })
      .where(
        and(
          eq(encounterCombatants.id, targetId),
          eq(encounterCombatants.encounterId, encounterId),
        ),
      );

    // a2. Consume caster action budget (REQ-AE-02 — atomic with HP + version).
    await tx
      .update(encounterCombatants)
      .set({ actionUsed: true })
      .where(
        and(
          eq(encounterCombatants.id, casterId),
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

    // B-12: 0-HP auto-end — DELETE 'Raging' when target drops to 0 HP (REQ-RAGE-08, PHB p.48).
    // PHB p.48: "Your rage ends early if... you are knocked unconscious."
    if (newDefenderHp === 0) {
      await tx
        .delete(encounterCombatantConditions)
        .where(
          and(
            eq(encounterCombatantConditions.combatantId, targetId),
            eq(encounterCombatantConditions.conditionName, 'Raging'),
          ),
        );
    }

    // c. Consume caster spell slot atomically.
    await tx
      .update(characters)
      .set({
        data: sql`jsonb_set(data, '{spellSlotsUsed}', ${JSON.stringify([...nextCasterSlotsUsed])}::jsonb, true)`,
      })
      .where(eq(characters.id, casterCharId));

    // d. RESOLVE concentration IN-TX (REQ-CID-04, ADR-1).
    // CRITICAL: inside closure — breakConcentration receives the same tx → atomic with HP write.
    // concPlan===null → NPC/non-concentrating/zero-damage guard fired → no-op.
    const conc = concPlan ? await resolveConcentrationCheck(concPlan, tx) : undefined;

    return { committed: true as const, conc };
  });

  if (txResult === false) {
    return { ok: false, code: 'VERSION_CONFLICT' };
  }

  // REQ-CID-02, REQ-CID-04: concentrationSave from tx closure.
  // txResult.conc: ConcentrationResolution | undefined.
  // ConcentrationSaveBlock (save rolled) or { broke:true, reason:'incapacitated-0hp' } (outright).

  return {
    ok: true,
    damage: {
      total: rollResult.total,
      perDart: rollResult.perDart,
      dartCount: rollResult.dartCount,
    },
    ...(txResult.conc !== undefined ? { concentrationSave: txResult.conc } : {}),
  };
}
