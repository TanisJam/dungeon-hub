/**
 * resolveCastReaction — two-step Shield-vs-MM and Counterspell reaction resolution use-case.
 *
 * Called after `performCastSpellApply` returns `castAnnounced`.
 * The server reads back the server-authoritative pending_cast from `encounters.pending_cast`.
 * The client does NOT supply damage values — only: { reactionDecision, ...ids, version }.
 * This enforces full server-authority over combat outcomes (C-1 invariant).
 *
 * Design ref: engine-spell-cast-suspend ADR-5, ADR-6.
 * Design ref: engine-counterspell ADR-5, ADR-6, ADR-7, ADR-8, ADR-9.
 *
 * PHB p.275 — Shield: "you take no damage from magic missile" (damage NEGATION, not AC bonus).
 * PHB p.190 — "You can take only one reaction per round."
 * PHB p.201 — slot consumption: spend a 1st-level spell slot.
 * PHB p.281 — Counterspell: spell fails with no effect on success; slots still spent.
 *
 * Validation order (fail-fast, mirrors resolve-attack-reaction.ts:119-379):
 *   1. Load encounter + CAS version pre-check (409 VERSION_CONFLICT)
 *   2. Load + typeguard pending_cast; bind-check encVersion===version
 *      → VERSION_CONFLICT if missing/stale
 *   3. Load defender / counterspeller combatant
 *   4a. decline → applyDamage(serverRolledDamage.total) → CAS tx
 *   4b. cast-shield:
 *       (a) reaction_used===false (else 400 REACTION_ALREADY_USED)
 *       (b) consumeSpellSlot(level:1) on defender (else 400 SHIELD_NO_SLOT_AVAILABLE)
 *       (c) zero damage: newHp = hpCurrent (negate-spell-damage arm, PHB p.275)
 *       (d) atomic CAS tx: [caster slot + defender Shield slot + reaction_used=true + version++ + pending_cast=NULL]
 *   4c. cast-counterspell (ADR-5 engine-counterspell):
 *       (a) counterspellerCombatantId !== casterCombatantId → else COUNTERSPELLER_IS_CASTER
 *       (b) reaction_used===false → else REACTION_ALREADY_USED
 *       (c) slotLevel ≥3 + has free slot at slotLevel → else INSUFFICIENT_SLOT
 *       (d) derive counterspeller spellcasting mod (ADR-7 — mirror perform-spell-heal)
 *       (e) resolveCounterspell server-roll d20 via cryptoRng (ADR-8 server-authority)
 *       (f) triple-row atomic CAS tx (ADR-9):
 *           - counterspeller reaction_used=true
 *           - caster slot decrement (ALWAYS — PHB p.281: slot spent on cast)
 *           - counterspeller slot decrement at slotLevel (ALWAYS — reaction used)
 *           - target HP applyDamage (ONLY when countered===false — spell resolves)
 *           - encounters version++ + pending_cast=NULL WHERE id AND version
 *
 * REQ-SC-06: cast-shield → 0 damage to defender + reaction_used=true + both slots consumed.
 * REQ-SC-07: decline → full server-rolled damage + caster slot consumed.
 * REQ-SC-08: REACTION_ALREADY_USED → 400 when reaction_used===true.
 * REQ-CS-05: cast-counterspell success → CANCELLED (no damage), all slots spent, reaction_used=true.
 * REQ-CS-06: cast-counterspell failure → spell resolves normally, counterspeller slots still spent.
 * REQ-CS-07: validation codes — INSUFFICIENT_SLOT, COUNTERSPELLER_IS_CASTER, REACTION_ALREADY_USED.
 */

import { eq, and, sql } from 'drizzle-orm';
import { db } from '../../infra/db/client.js';
import { encounters, encounterCombatants, characters } from '../../infra/db/schema.js';
import {
  consumeSpellSlot,
  computeSpellSlots,
  SPELLCASTING_ABILITY,
} from '@dungeon-hub/domain/character/spellcasting';
import { applyDamage } from '@dungeon-hub/domain/encounter';
import { computeCharacterSheet } from '@dungeon-hub/domain/character/sheet';
import { abilityModifier } from '@dungeon-hub/domain/character/multiclass';
import { resolveCounterspell, type RngFn } from '@dungeon-hub/domain/engine';
import { isCombatantIncapacitated } from './load-combatant-incapacitated.js';
import { resolveResistance } from './resolve-resistance.js';
import {
  checkConcentrationOnDamage,
  type ConcentrationSaveBlock,
} from './check-concentration-on-damage.js';
import type { AppliedClass } from '@dungeon-hub/domain/character/class';
import type { InventoryItem } from '@dungeon-hub/domain/character/inventory';

// ── Crypto RNG (mirrors perform-cast-spell-apply.ts:53-57) ────────────────────

/**
 * Server-side crypto RNG — each call returns a uniform integer in [1..sides].
 * Used for the counterspell DC-check d20 roll (ADR-8 server-authority).
 */
const cryptoRng: RngFn = (sides: number): number => {
  const buf = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buf);
  return (buf[0]! % sides) + 1;
};

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

// ── T-4: Counterspeller ability-mod derivation ────────────────────────────────
// Mirror of perform-spell-heal.ts:204-241 (ADR-7 engine-counterspell).
// Returns 0 if no spellcasting class found (NPC edge case — out of scope #1386).

function deriveSpellcastingMod(
  charData: Record<string, unknown>,
  charRow: {
    name: string;
    inventory: unknown;
  },
): number {
  const classes = (charData['classes'] as AppliedClass[] | undefined) ?? [];
  const spellcastingClass = classes.find((c) => SPELLCASTING_ABILITY[c.slug] !== undefined);
  if (!spellcastingClass) return 0;

  const abilityKey = SPELLCASTING_ABILITY[spellcastingClass.slug]!;

  const inventory = (charRow.inventory as InventoryItem[]) ?? [];
  const characterInput = {
    name: charRow.name,
    baseStats: charData['baseStats'] as never,
    asisApplied: charData['asisApplied'] as never,
    levelUpAsis: charData['levelUpAsis'] as never,
    classes: charData['classes'] as never,
    background: charData['background'] as never,
    feats: charData['feats'] as never,
    race: (charData['race'] ?? null) as never,
    subrace: (charData['subrace'] ?? null) as never,
    inventory,
    currency: charData['currency'] as never,
    spells: charData['spells'] as never,
    exhaustion: charData['exhaustion'] as never,
    classFeatures: charData['classFeatures'] as never,
    raceLanguageChoices: charData['raceLanguageChoices'] as never,
    raceSkillChoices: charData['raceSkillChoices'] as never,
    raceCantrip: charData['raceCantrip'] as never,
    spellSlotsUsed: charData['spellSlotsUsed'] as never,
    warlockSlotsUsed: charData['warlockSlotsUsed'] as never,
    classResourcesUsed: charData['classResourcesUsed'] as never,
  };

  const sheet = computeCharacterSheet({ character: characterInput });
  const abilityScore = sheet.abilityScores[abilityKey]?.score ?? 10;
  return abilityModifier(abilityScore);
}

// ── Input / Output ─────────────────────────────────────────────────────────────

export interface ResolveCastReactionInput {
  encounterId: string;
  reactionDecision: 'cast-shield' | 'decline' | 'cast-counterspell';
  defenderCombatantId: string;
  /** Required when reactionDecision === 'cast-counterspell'. */
  counterspellerCombatantId?: string | undefined;
  /** Slot level used to cast Counterspell (≥3). Required for cast-counterspell. */
  counterspellSlotLevel?: number | undefined;
  /** Client's known encounter version for CAS. */
  version: number;
  /** Caller's userId for audit (auth enforced at route layer). */
  callerId: string;
}

export type ResolveCastReactionResult =
  | {
      ok: true;
      shieldCast: boolean;
      /** Whether the counterspell succeeded (true = spell CANCELLED). */
      spellCountered?: boolean;
      /** Defender's HP after resolve (unchanged on cast-shield, decreased on decline). */
      newHp: number;
      /** Server-rolled total damage applied (0 on cast-shield/counter-success, server-rolled on decline/counter-fail). */
      damageApplied: number;
      /**
       * Concentration save result (REQ-CB-06, REQ-CB-12).
       * Present when the defender was concentrating AND finalDamage > 0.
       * Absent (key omitted) otherwise — backward-compat omit-not-null.
       * TODO-saga: HP commit and concentration break are two separate atomic units.
       * A crash between them leaves HP reduced but concentration intact — accepted V1 saga.
       */
      concentrationSave?: ConcentrationSaveBlock;
    }
  | { ok: false; code: 'NOT_FOUND'; target: 'encounter' | 'defender' | 'character' | 'caster-character' | 'counterspeller' | 'counterspeller-character' }
  | { ok: false; code: 'VERSION_CONFLICT' }
  | { ok: false; code: 'ENCOUNTER_NOT_ACTIVE' }
  | { ok: false; code: 'REACTION_ALREADY_USED' }
  | { ok: false; code: 'SHIELD_NO_SLOT_AVAILABLE' }
  | { ok: false; code: 'INSUFFICIENT_SLOT'; slotLevel?: number }
  | { ok: false; code: 'COUNTERSPELLER_IS_CASTER' }
  // engine-incapacitated-gating — REQ-INC-05 (PHB p.290: can't take reactions).
  | { ok: false; code: 'ACTOR_INCAPACITATED' };

// ── resolveCastReaction ────────────────────────────────────────────────────────

export async function resolveCastReaction(
  input: ResolveCastReactionInput,
): Promise<ResolveCastReactionResult> {
  const {
    encounterId,
    reactionDecision,
    defenderCombatantId,
    counterspellerCombatantId,
    counterspellSlotLevel,
    version,
  } = input;

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

  // Bind-check: the pending state must match this version epoch.
  if (pending.encVersion !== version) {
    return { ok: false, code: 'VERSION_CONFLICT' };
  }

  // Server-authoritative values — read from DB, NEVER from client (C-1 invariant — ADR-6).
  const serverDamage = pending.serverRolledDamage.total;
  const casterCombatantId = pending.casterCombatantId;
  const targetId = pending.targets[0]!;

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
    // B2b: Apply resolveResistance (replaces bare applyDamage).
    // REQ-CB-07: resistance applied before concentration DC — DC uses post-resistance finalDamage.
    // PHB p.197: resistance halves damage before HP loss. Force damage type from Magic Missile.
    const { newHp: newHpDecline, finalDamage: finalDamageDecline } = await resolveResistance(
      defenderCombatantId,
      serverDamage,
      'force',
      defenderCombatant.hpCurrent,
    );

    const txResult = await db.transaction(async (tx) => {
      // Update defender HP.
      await tx
        .update(encounterCombatants)
        .set({ hpCurrent: newHpDecline })
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

    // B2d: wire checkConcentrationOnDamage post-HP-commit.
    // REQ-CB-06: all damage paths fire the check. Uses finalDamageDecline (post-resistance).
    // TODO-saga: HP commit and concentration break are two separate atomic units.
    // A crash between them leaves HP reduced but concentration intact — accepted V1 saga.
    const concCheckDecline = await checkConcentrationOnDamage(
      { kind: defenderCombatant.kind, characterId: defenderCombatant.characterId },
      finalDamageDecline,
    );

    return {
      ok: true,
      shieldCast: false,
      newHp: newHpDecline,
      damageApplied: finalDamageDecline,
      ...(concCheckDecline.concentrating
        ? { concentrationSave: concCheckDecline.save }
        : {}),
    };
  }

  // ── Step 4b: cast-shield path ────────────────────────────────────────────
  // PHB p.275: "you take no damage from magic missile" — zero damage.
  // PHB p.190: one reaction per round.

  if (reactionDecision === 'cast-shield') {
    // Step 4b-i: Incapacitated gate (REQ-INC-05, PHB p.290 — can't take reactions).
    // Fires FIRST in the cast-shield arm — independent of reactionUsed gate (ADR-4.4).
    // decline path (Step 4a) is NOT gated — declining is not taking a reaction.
    if (await isCombatantIncapacitated(defenderCombatantId)) {
      return { ok: false, code: 'ACTOR_INCAPACITATED' };
    }

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

    // B2d (cast-shield arm): call checkConcentrationOnDamage for symmetry.
    // finalDamage=0 (Shield negates all MM damage) → helper returns {concentrating:false} immediately.
    // No concentrationSave in response (key omitted — REQ-CB-08).
    // TODO-saga: HP commit and concentration break are two separate atomic units (N/A here — damage=0).
    await checkConcentrationOnDamage(
      { kind: defenderCombatant.kind, characterId: defenderCombatant.characterId },
      0,
    );

    return {
      ok: true,
      shieldCast: true,
      newHp, // unchanged — 0 damage (PHB p.275)
      damageApplied: 0,
    };
  }

  // ── Step 4c: cast-counterspell path (ADR-5 engine-counterspell) ──────────────
  // PHB p.281: attempt to interrupt a spell; slots spent win or lose (ADR-6).

  // Validate required counterspell fields are present.
  if (!counterspellerCombatantId || counterspellSlotLevel === undefined) {
    return { ok: false, code: 'VERSION_CONFLICT' };
  }

  // (a) Counterspeller must not be the caster (REQ-CS-07).
  if (counterspellerCombatantId === casterCombatantId) {
    return { ok: false, code: 'COUNTERSPELLER_IS_CASTER' };
  }

  // (b) Slot level must be ≥3 (PHB p.281 — Counterspell is a 3rd-level spell).
  if (counterspellSlotLevel < 3) {
    return { ok: false, code: 'INSUFFICIENT_SLOT', slotLevel: counterspellSlotLevel };
  }

  // Load counterspeller combatant.
  const [counterspellerCombatant] = await db
    .select({
      id: encounterCombatants.id,
      kind: encounterCombatants.kind,
      characterId: encounterCombatants.characterId,
      reactionUsed: encounterCombatants.reactionUsed,
      encounterId: encounterCombatants.encounterId,
    })
    .from(encounterCombatants)
    .where(
      and(
        eq(encounterCombatants.id, counterspellerCombatantId),
        eq(encounterCombatants.encounterId, encounterId),
      ),
    )
    .limit(1);

  if (!counterspellerCombatant) {
    return { ok: false, code: 'NOT_FOUND', target: 'counterspeller' };
  }

  // (b-i) Incapacitated gate (REQ-INC-05, PHB p.290 — can't take reactions).
  // Independent gate: fires before reactionUsed check (ADR-4.4).
  if (await isCombatantIncapacitated(counterspellerCombatantId)) {
    return { ok: false, code: 'ACTOR_INCAPACITATED' };
  }

  // (c) Reaction must be available (PHB p.190).
  if (counterspellerCombatant.reactionUsed) {
    return { ok: false, code: 'REACTION_ALREADY_USED' };
  }

  if (!counterspellerCombatant.characterId) {
    return { ok: false, code: 'NOT_FOUND', target: 'counterspeller-character' };
  }

  const counterspellerCharId = counterspellerCombatant.characterId;

  // Load counterspeller character data.
  const [counterspellerCharRow] = await db
    .select({ data: characters.data, name: characters.name, inventory: characters.inventory })
    .from(characters)
    .where(eq(characters.id, counterspellerCharId))
    .limit(1);

  if (!counterspellerCharRow) {
    return { ok: false, code: 'NOT_FOUND', target: 'counterspeller-character' };
  }

  const counterData = (counterspellerCharRow.data as Record<string, unknown>) ?? {};
  const counterClasses = (counterData['classes'] as AppliedClass[] | undefined) ?? [];
  const counterSlotsMax = computeSpellSlots(counterClasses).slots;
  const counterSlotsUsed =
    (counterData['spellSlotsUsed'] as number[] | undefined) ?? new Array(9).fill(0);

  // (c cont.) Verify the counterspeller has a free slot at counterspellSlotLevel.
  const counterSlotResult = consumeSpellSlot({
    slotsMax: counterSlotsMax,
    slotsUsed: counterSlotsUsed,
    pactMagic: null,
    pactSlotsUsed: 0,
    level: counterspellSlotLevel,
    slotType: 'regular',
  });

  if (!counterSlotResult.ok) {
    return { ok: false, code: 'INSUFFICIENT_SLOT', slotLevel: counterspellSlotLevel };
  }

  const nextCounterSlotsUsed = counterSlotResult.slotsUsed;

  // (d) Derive counterspeller spellcasting ability modifier (T-4 / ADR-7).
  // Mirror perform-spell-heal.ts:204-241.
  const counterspellerAbilityMod = deriveSpellcastingMod(
    counterData,
    { name: counterspellerCharRow.name, inventory: counterspellerCharRow.inventory },
  );

  // (e) resolveCounterspell — SERVER-SIDE d20 roll via cryptoRng (ADR-8 server-authority C-1).
  // Client body carries NO roll values. Resolve body: reactionDecision + counterspellerCombatantId + slotLevel + version.
  const counterspellResult = resolveCounterspell({
    counteredSpellLevel: pending.spellLevel,
    counterspellSlotLevel,
    counterspellerAbilityMod,
    rng: cryptoRng,
  });

  // (f) Triple-row atomic CAS tx (ADR-9).
  // On countered===true: CANCELLED — no damage to target (PHB p.281 — "spell fails and has no effect").
  // On countered===false: RESOLVING — spell resolves, MM damage applied to target.
  // Caster slot ALWAYS consumed (PHB — slot spent when spell is cast, not when it succeeds).
  // Counterspeller slot + reaction ALWAYS consumed (PHB p.281 — slot and reaction spent win or lose).
  const countered = counterspellResult.countered;

  // Load target combatant for HP update (only needed when spell resolves).
  // B2a: widen SELECT to include kind + characterId for checkConcentrationOnDamage.
  const [targetCombatant] = await db
    .select({
      id: encounterCombatants.id,
      kind: encounterCombatants.kind,
      characterId: encounterCombatants.characterId,
      hpCurrent: encounterCombatants.hpCurrent,
      encounterId: encounterCombatants.encounterId,
    })
    .from(encounterCombatants)
    .where(
      and(
        eq(encounterCombatants.id, targetId),
        eq(encounterCombatants.encounterId, encounterId),
      ),
    )
    .limit(1);

  // targetCombatant may be the same as defenderCombatant — that's fine (no row conflict).
  const targetHpCurrent = targetCombatant?.hpCurrent ?? defenderCombatant.hpCurrent;
  // B2c: resolveResistance replaces bare applyDamage (REQ-CB-07: resistance before concentration DC).
  // On countered===true: damage=0, no resistance check needed (PHB p.281: "spell fails and has no effect").
  const {
    newHp: newTargetHp,
    finalDamage: finalDamageCounter,
  } = countered
    ? { newHp: targetHpCurrent, finalDamage: 0 }
    : await resolveResistance(
        targetId,
        serverDamage,
        'force',
        targetHpCurrent,
      );
  const damageApplied = finalDamageCounter;

  const txResult = await db.transaction(async (tx) => {
    // (a) counterspeller reaction_used=true (PHB p.190 — reaction expended regardless of outcome).
    await tx
      .update(encounterCombatants)
      .set({ reactionUsed: true })
      .where(
        and(
          eq(encounterCombatants.id, counterspellerCombatantId),
          eq(encounterCombatants.encounterId, encounterId),
        ),
      );

    // (b) Consume caster spell slot (ALWAYS — PHB p.281: slot spent on cast, regardless of counter outcome).
    await tx
      .update(characters)
      .set({
        data: sql`jsonb_set(data, '{spellSlotsUsed}', ${JSON.stringify([...nextCasterSlotsUsed])}::jsonb, true)`,
      })
      .where(eq(characters.id, casterCharId));

    // (c) Consume counterspeller slot at slotLevel (ALWAYS — PHB p.281: slot spent regardless of outcome).
    await tx
      .update(characters)
      .set({
        data: sql`jsonb_set(data, '{spellSlotsUsed}', ${JSON.stringify([...nextCounterSlotsUsed])}::jsonb, true)`,
      })
      .where(eq(characters.id, counterspellerCharId));

    // (d) Apply damage to target ONLY when spell resolves (countered===false).
    // PHB p.281: countered===true → "spell fails and has no effect" — zero damage.
    if (!countered && targetCombatant) {
      await tx
        .update(encounterCombatants)
        .set({ hpCurrent: newTargetHp })
        .where(
          and(
            eq(encounterCombatants.id, targetId),
            eq(encounterCombatants.encounterId, encounterId),
          ),
        );
    }

    // (e) CAS version bump + clear pending_cast atomically (W-3).
    // 0 rows → VERSION_CONFLICT (concurrent write changed version).
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

  // B2d: wire checkConcentrationOnDamage post-HP-commit in COUNTERSPELL-RESOLVE arm.
  // On countered===true: finalDamageCounter=0 → helper guard 2 returns {concentrating:false}.
  // On countered===false (spell resolves): use finalDamageCounter (post-resistance).
  // REQ-CB-06: all damage paths fire the check.
  // TODO-saga: HP commit and concentration break are two separate atomic units.
  // A crash between them leaves HP reduced but concentration intact — accepted V1 saga.
  const concCheckCounter = targetCombatant
    ? await checkConcentrationOnDamage(
        { kind: targetCombatant.kind, characterId: targetCombatant.characterId },
        finalDamageCounter,
      )
    : { concentrating: false as const };

  // SpellPhase.CANCELLED on countered===true (ADR-6): no damage to anyone.
  // SpellPhase.RESOLVING on countered===false: spell resolves, post-resistance damage landed.
  return {
    ok: true,
    shieldCast: false,
    spellCountered: countered,
    newHp: newTargetHp,
    damageApplied,
    ...(concCheckCounter.concentrating
      ? { concentrationSave: concCheckCounter.save }
      : {}),
  };
}
