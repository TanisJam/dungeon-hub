/**
 * resolveCastReaction — two-step Shield-vs-MM reaction resolution use-case.
 *
 * Called after `performCastSpellApply` returns `castAnnounced` with { kind:'shield' }.
 * The server reads back the server-authoritative pending_cast from `encounters.pending_cast`.
 * The client does NOT supply damage values — only: { reactionDecision, defenderCombatantId, version }.
 * This enforces full server-authority over combat outcomes (C-1 invariant).
 *
 * Design ref: engine-spell-cast-suspend ADR-5, ADR-6.
 *
 * PHB p.275 — Shield: "you take no damage from magic missile" (damage NEGATION, not AC bonus).
 * PHB p.190 — "You can take only one reaction per round."
 * PHB p.201 — slot consumption: spend a 1st-level spell slot.
 *
 * Validation order (fail-fast, mirrors resolve-attack-reaction.ts:119-379):
 *   1. Load encounter + CAS version pre-check (409 VERSION_CONFLICT)
 *   2. Load + typeguard pending_cast; bind-check defenderCombatantId ∈ targets + encVersion===version
 *      → VERSION_CONFLICT if missing/stale/wrong-defender
 *   3. Load defender combatant (auth enforced at route layer — GM-only)
 *   4a. decline → applyDamage(serverRolledDamage.total) → CAS tx [defender HP + caster slot + version++ + pending_cast=NULL]
 *   4b. cast-shield:
 *       (a) reaction_used===false (else 400 REACTION_ALREADY_USED)
 *       (b) consumeSpellSlot(level:1) on defender (else 400 SHIELD_NO_SLOT_AVAILABLE)
 *       (c) zero damage: newHp = hpCurrent (negate-spell-damage arm, PHB p.275)
 *       (d) atomic CAS tx: [caster slot + defender Shield slot + reaction_used=true + version++ + pending_cast=NULL]
 *
 * REQ-SC-06: cast-shield → 0 damage to defender + reaction_used=true + both slots consumed.
 * REQ-SC-07: decline → full server-rolled damage + caster slot consumed.
 * REQ-SC-08: REACTION_ALREADY_USED → 400 when reaction_used===true.
 */

import { eq, and, sql } from 'drizzle-orm';
import { db } from '../../infra/db/client.js';
import { encounters, encounterCombatants, characters } from '../../infra/db/schema.js';
import {
  consumeSpellSlot,
  computeSpellSlots,
} from '@dungeon-hub/domain/character/spellcasting';
import { applyDamage } from '@dungeon-hub/domain/encounter';
import type { AppliedClass } from '@dungeon-hub/domain/character/class';

// ── PendingCast type-guard ─────────────────────────────────────────────────────

interface PendingCast {
  casterCombatantId: string;
  spellName: string;
  spellLevel: number;
  targets: string[];
  dartCount: number;
  serverRolledDamage: { total: number; perDart: number[] };
  encVersion: number;
}

function isPendingCast(v: unknown): v is PendingCast {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  const dmg = o['serverRolledDamage'];
  return (
    typeof o['casterCombatantId'] === 'string' &&
    typeof o['spellLevel'] === 'number' &&
    Array.isArray(o['targets']) &&
    typeof o['encVersion'] === 'number' &&
    typeof dmg === 'object' &&
    dmg !== null &&
    typeof (dmg as Record<string, unknown>)['total'] === 'number'
  );
}

// ── Input / Output ─────────────────────────────────────────────────────────────

export interface ResolveCastReactionInput {
  encounterId: string;
  reactionDecision: 'cast-shield' | 'decline';
  defenderCombatantId: string;
  /** Client's known encounter version for CAS. */
  version: number;
  /** Caller's userId for audit (auth enforced at route layer). */
  callerId: string;
}

export type ResolveCastReactionResult =
  | {
      ok: true;
      shieldCast: boolean;
      /** Defender's HP after resolve (unchanged on cast-shield, decreased on decline). */
      newHp: number;
      /** Server-rolled total damage applied (0 on cast-shield, server-rolled on decline). */
      damageApplied: number;
    }
  | { ok: false; code: 'NOT_FOUND'; target: 'encounter' | 'defender' | 'character' | 'caster-character' }
  | { ok: false; code: 'VERSION_CONFLICT' }
  | { ok: false; code: 'ENCOUNTER_NOT_ACTIVE' }
  | { ok: false; code: 'REACTION_ALREADY_USED' }
  | { ok: false; code: 'SHIELD_NO_SLOT_AVAILABLE' };

// ── resolveCastReaction ────────────────────────────────────────────────────────

export async function resolveCastReaction(
  input: ResolveCastReactionInput,
): Promise<ResolveCastReactionResult> {
  const { encounterId, reactionDecision, defenderCombatantId, version } = input;

  // ── Step 1: Load encounter + version pre-check ──────────────────────────────
  const [encounterRow] = await db
    .select()
    .from(encounters)
    .where(eq(encounters.id, encounterId))
    .limit(1);

  if (!encounterRow) return { ok: false, code: 'NOT_FOUND', target: 'encounter' };
  if (encounterRow.status !== 'active') return { ok: false, code: 'ENCOUNTER_NOT_ACTIVE' };

  // CAS pre-check (optimistic — authoritative check in tx)
  if (encounterRow.version !== version) {
    return { ok: false, code: 'VERSION_CONFLICT' };
  }

  // ── Step 2: Load + typeguard pending_cast ─────────────────────────────────────
  // The pending_cast was stored by performCastSpellApply at suspend time.
  // It carries the server-rolled dart damage and the encVersion binding.
  const pendingRaw = encounterRow.pendingCast;
  if (!isPendingCast(pendingRaw)) {
    // No pending cast exists — out-of-order call or already consumed.
    return { ok: false, code: 'VERSION_CONFLICT' };
  }

  const pending = pendingRaw;

  // Bind-check: the pending state must target this defender and this version epoch.
  if (
    !pending.targets.includes(defenderCombatantId) ||
    pending.encVersion !== version
  ) {
    return { ok: false, code: 'VERSION_CONFLICT' };
  }

  // Server-authoritative values — read from DB, NEVER from client (C-1 invariant — ADR-6).
  const serverDamage = pending.serverRolledDamage.total;
  const casterCombatantId = pending.casterCombatantId;

  // ── Step 3: Load defender combatant ─────────────────────────────────────────
  const [defenderCombatant] = await db
    .select({
      id: encounterCombatants.id,
      kind: encounterCombatants.kind,
      characterId: encounterCombatants.characterId,
      hpCurrent: encounterCombatants.hpCurrent,
      encounterId: encounterCombatants.encounterId,
      reactionUsed: encounterCombatants.reactionUsed,
    })
    .from(encounterCombatants)
    .where(
      and(
        eq(encounterCombatants.id, defenderCombatantId),
        eq(encounterCombatants.encounterId, encounterId),
      ),
    )
    .limit(1);

  if (!defenderCombatant) return { ok: false, code: 'NOT_FOUND', target: 'defender' };

  // ── Load caster combatant to get casterCharId ──────────────────────────────
  const [casterCombatant] = await db
    .select({ characterId: encounterCombatants.characterId })
    .from(encounterCombatants)
    .where(
      and(
        eq(encounterCombatants.id, casterCombatantId),
        eq(encounterCombatants.encounterId, encounterId),
      ),
    )
    .limit(1);

  if (!casterCombatant?.characterId) {
    return { ok: false, code: 'NOT_FOUND', target: 'caster-character' };
  }

  const casterCharId = casterCombatant.characterId;

  // ── Load caster character data for slot decrement ──────────────────────────
  const [casterCharRow] = await db
    .select({ data: characters.data })
    .from(characters)
    .where(eq(characters.id, casterCharId))
    .limit(1);

  if (!casterCharRow) return { ok: false, code: 'NOT_FOUND', target: 'caster-character' };

  const casterData = (casterCharRow.data as Record<string, unknown>) ?? {};
  const casterClasses = (casterData['classes'] as AppliedClass[] | undefined) ?? [];
  const casterSlotsMax = computeSpellSlots(casterClasses).slots;
  const casterSlotsUsed =
    (casterData['spellSlotsUsed'] as number[] | undefined) ?? new Array(9).fill(0);

  // Pre-check caster slot at the spell level stored in pending (never trust client).
  const casterSlotResult = consumeSpellSlot({
    slotsMax: casterSlotsMax,
    slotsUsed: casterSlotsUsed,
    pactMagic: null,
    pactSlotsUsed: 0,
    level: pending.spellLevel,
    slotType: 'regular',
  });

  if (!casterSlotResult.ok) {
    // Slot was valid at suspend time but consumed concurrently — VERSION_CONFLICT is the safest error.
    return { ok: false, code: 'VERSION_CONFLICT' };
  }

  const nextCasterSlotsUsed = casterSlotResult.slotsUsed;

  // ── Step 4a: decline path ─────────────────────────────────────────────────
  // reaction_used NOT set (player chose not to react).
  if (reactionDecision === 'decline') {
    // Apply full server-rolled force damage (C-1: from pending_cast, never from client body).
    const newHp = applyDamage(defenderCombatant.hpCurrent, serverDamage);

    const txResult = await db.transaction(async (tx) => {
      // Update defender HP.
      await tx
        .update(encounterCombatants)
        .set({ hpCurrent: newHp })
        .where(
          and(
            eq(encounterCombatants.id, defenderCombatantId),
            eq(encounterCombatants.encounterId, encounterId),
          ),
        );

      // CAS version bump + clear pending_cast.
      const updated = await tx
        .update(encounters)
        .set({
          version: sql`${encounters.version} + 1`,
          pendingCast: null,
          updatedAt: new Date(),
        })
        .where(and(eq(encounters.id, encounterId), eq(encounters.version, version)))
        .returning({ version: encounters.version });

      if (updated.length === 0) return false;

      // Consume caster spell slot atomically.
      await tx
        .update(characters)
        .set({
          data: sql`jsonb_set(data, '{spellSlotsUsed}', ${JSON.stringify([...nextCasterSlotsUsed])}::jsonb, true)`,
        })
        .where(eq(characters.id, casterCharId));

      return true;
    });

    if (!txResult) return { ok: false, code: 'VERSION_CONFLICT' };

    return {
      ok: true,
      shieldCast: false,
      newHp,
      damageApplied: serverDamage,
    };
  }

  // ── Step 4b: cast-shield path ────────────────────────────────────────────
  // PHB p.275: "you take no damage from magic missile" — zero damage.
  // PHB p.190: one reaction per round.

  // Step 4b-a: reaction availability (REQ-SC-08, PHB p.190).
  if (defenderCombatant.reactionUsed) {
    return { ok: false, code: 'REACTION_ALREADY_USED' };
  }

  // Step 4b-b: load defender character + spell slots.
  if (!defenderCombatant.characterId) {
    return { ok: false, code: 'NOT_FOUND', target: 'character' };
  }

  const [defCharRow] = await db
    .select({ data: characters.data })
    .from(characters)
    .where(eq(characters.id, defenderCombatant.characterId))
    .limit(1);

  if (!defCharRow) return { ok: false, code: 'NOT_FOUND', target: 'character' };

  const defData = (defCharRow.data as Record<string, unknown>) ?? {};
  const { slots: defSlotsMax } = computeSpellSlots(
    (defData['classes'] as AppliedClass[] | undefined) ?? [],
  );
  const defSlotsUsed =
    (defData['spellSlotsUsed'] as number[] | undefined) ?? new Array(9).fill(0) as number[];

  // consumeSpellSlot at level 1 (PHB p.275 — Shield is a 1st-level spell).
  const defSlotResult = consumeSpellSlot({
    slotsMax: defSlotsMax,
    slotsUsed: defSlotsUsed,
    pactMagic: null,
    pactSlotsUsed: 0,
    level: 1,
    slotType: 'regular',
  });

  if (!defSlotResult.ok) {
    return { ok: false, code: 'SHIELD_NO_SLOT_AVAILABLE' };
  }

  const nextDefenderSlotsUsed = defSlotResult.slotsUsed as number[];

  // Step 4b-c: zero damage (negate-spell-damage arm, PHB p.275).
  // "you take no damage from magic missile" — HP unchanged.
  const newHp = defenderCombatant.hpCurrent;

  // Step 4b-d: atomic CAS tx.
  // 5-tuple: caster slot + defender Shield slot + reaction_used=true + version++ + pending_cast=NULL.
  // caster and defender are DIFFERENT character rows (even if same encounter) — no lost-update risk.
  const txResult = await db.transaction(async (tx) => {
    // reaction_used=true (PHB p.190 — reaction expended).
    await tx
      .update(encounterCombatants)
      .set({ reactionUsed: true })
      .where(
        and(
          eq(encounterCombatants.id, defenderCombatantId),
          eq(encounterCombatants.encounterId, encounterId),
        ),
      );

    // Consume caster spell slot (the MM slot — ADR-1: slot-at-resolve).
    await tx
      .update(characters)
      .set({
        data: sql`jsonb_set(data, '{spellSlotsUsed}', ${JSON.stringify([...nextCasterSlotsUsed])}::jsonb, true)`,
      })
      .where(eq(characters.id, casterCharId));

    // Consume defender Shield slot (PHB p.275 — Shield costs a 1st-level spell slot).
    await tx
      .update(characters)
      .set({
        data: sql`jsonb_set(data, '{spellSlotsUsed}', ${JSON.stringify([...nextDefenderSlotsUsed])}::jsonb, true)`,
      })
      .where(eq(characters.id, defenderCombatant.characterId!));

    // CAS version bump + clear pending_cast atomically.
    const updated = await tx
      .update(encounters)
      .set({
        version: sql`${encounters.version} + 1`,
        pendingCast: null,
        updatedAt: new Date(),
      })
      .where(and(eq(encounters.id, encounterId), eq(encounters.version, version)))
      .returning({ version: encounters.version });

    if (updated.length === 0) return false;
    return true;
  });

  if (!txResult) return { ok: false, code: 'VERSION_CONFLICT' };

  return {
    ok: true,
    shieldCast: true,
    newHp, // unchanged — 0 damage (PHB p.275)
    damageApplied: 0,
  };
}
