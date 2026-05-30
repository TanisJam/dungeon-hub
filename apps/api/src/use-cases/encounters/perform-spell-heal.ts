/**
 * perform-spell-heal — Atomic spell healing apply use-case.
 *
 * Symmetric inverse of perform-weapon-attack-apply for the healing side.
 * Server-authoritative: resolves spellcasting modifier, rolls dice with crypto
 * RNG, clamps HP at hpMax, persists HP + version + spell slot atomically in ONE
 * transaction.
 *
 * Supports: Cure Wounds (1d8 per slot level, PHB p.230) and Healing Word
 * (1d4 per slot level, PHB p.250).
 *
 * Design ref: sdd/engine-healing/design — ADR-1, ADR-2, ADR-3, ADR-4, ADR-5.
 *
 * REQ-H-01: applyHealing clamp to hpMax (PHB p.197).
 * REQ-H-02: Cure Wounds dice = ${slotLevel}d8 (PHB p.230).
 * REQ-H-03: Healing Word dice = ${slotLevel}d4 (PHB p.250).
 * REQ-H-04: rollDamageBreakdown crit=false always (PHB p.196 — no attack roll).
 * REQ-H-05: spellcasting mod resolved server-side from healer sheet.
 * REQ-H-06: slot verified pre-roll; fail-fast → SLOT_NOT_AVAILABLE.
 * REQ-H-07: slot consumed even when target is at full HP.
 * REQ-H-09: healer must be a PC spellcaster.
 * REQ-H-11: turn guard, version conflict.
 * REQ-H-12: self-heal allowed.
 * REQ-H-13: target may be PC or NPC — only encounter_combatants row updated.
 * REQ-H-14: CAS atomicity — 3-tuple tx (hp + version + slot).
 */

import { eq, and, sql } from 'drizzle-orm';
import { db } from '../../infra/db/client.js';
import { encounters, encounterCombatants, characters } from '../../infra/db/schema.js';
import {
  rollDamageBreakdown,
  type RngFn,
  type Source,
  type DiceExpr,
} from '@dungeon-hub/domain/engine';
import type { EntityId } from '@dungeon-hub/domain/engine';
import {
  computeSpellSlots,
  consumeSpellSlot,
  SPELLCASTING_ABILITY,
} from '@dungeon-hub/domain/character/spellcasting';
import { applyHealing } from '@dungeon-hub/domain/encounter';
import { computeCharacterSheet } from '@dungeon-hub/domain/character/sheet';
import { abilityModifier } from '@dungeon-hub/domain/character/multiclass';
import type { AppliedClass } from '@dungeon-hub/domain/character/class';
import type { InventoryItem } from '@dungeon-hub/domain/character/inventory';

// ── Crypto RNG (mirrors perform-weapon-attack-apply.ts:52-56) ──────────────────

/**
 * Server-side crypto RNG. ADR-3 (engine-healing): single consumer this slice.
 * Returns an integer in [1..sides].
 */
const cryptoRng: RngFn = (sides: number): number => {
  const buf = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buf);
  return (buf[0]! % sides) + 1;
};

// ── Input / Output ─────────────────────────────────────────────────────────────

export type SpellName = 'Cure Wounds' | 'Healing Word';

export interface PerformSpellHealInput {
  encounterId: string;
  healerCombatantId: string;  // encounter_combatants.id
  targetCombatantId: string;  // encounter_combatants.id
  spellName: SpellName;
  slotLevel: number;          // 1..9
  version: number;            // CAS version from caller
  userId: string;             // for audit (GM identity)
}

export type PerformSpellHealResult =
  | {
      ok: true;
      spell: SpellName;
      slotLevel: number;
      dice: DiceExpr;
      /** Total rolled (dice + spellcasting modifier). */
      rolled: number;
      /** Effective HP delta (clamped — 0 when target was already at hpMax). */
      healed: number;
      /** Target's HP after healing. */
      newHp: number;
      /** Per-source audit trail. */
      perDie: ReturnType<typeof rollDamageBreakdown>['perDie'];
    }
  | { ok: false; code: 'ENCOUNTER_NOT_ACTIVE' }
  | { ok: false; code: 'NOT_FOUND'; target: 'encounter' | 'attacker' | 'target' | 'character' }
  | { ok: false; code: 'NOT_YOUR_TURN' }
  | { ok: false; code: 'VERSION_CONFLICT' }
  | { ok: false; code: 'HEALER_NOT_SPELLCASTER' }
  | { ok: false; code: 'SLOT_NOT_AVAILABLE' };

// ── perform-spell-heal ─────────────────────────────────────────────────────────

/**
 * Applies spell healing atomically following the 9-step flow (ADR-4):
 *
 *  1. Load encounter → NOT_FOUND / ENCOUNTER_NOT_ACTIVE / VERSION_CONFLICT pre-check
 *  2. Load healer combatant → NOT_FOUND 'attacker'
 *  3. Turn guard (currentCombatantId ≠ healerCombatantId → NOT_YOUR_TURN)
 *  4. Healer-is-PC guard (characterId null → HEALER_NOT_SPELLCASTER)
 *  5. Load target combatant (id, hpCurrent, hpMax, encounterId) → NOT_FOUND 'target'
 *  6. Load healer character row → compute sheet → resolve spellcasting mod → HEALER_NOT_SPELLCASTER
 *     Also read slotsMax + slotsUsed for consumeSpellSlot.
 *  7. consumeSpellSlot PRE-CHECK (fail-fast before roll) → SLOT_NOT_AVAILABLE
 *  8. Compute dice → rollDamageBreakdown (crit=false) → applyHealing
 *  9. CAS tx: UPDATE encounter_combatants hp_current + UPDATE encounters version + jsonb_set slots
 *
 * REQ-H-12: self-heal (healerCombatantId === targetCombatantId) is explicitly allowed.
 *   Target write is to encounter_combatants; healer slot write is to characters — different
 *   tables even on self-heal, no lost-update risk.
 */
export async function performSpellHeal(
  input: PerformSpellHealInput,
): Promise<PerformSpellHealResult> {
  const {
    encounterId,
    healerCombatantId,
    targetCombatantId,
    spellName,
    slotLevel,
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

  // Version pre-check: saves subsequent queries on conflict (CAS re-checked in tx).
  if (encounterRow.version !== version) {
    return { ok: false, code: 'VERSION_CONFLICT' };
  }

  // ── Step 2: Load healer combatant ────────────────────────────────────────────
  const [healerCombatant] = await db
    .select()
    .from(encounterCombatants)
    .where(
      and(
        eq(encounterCombatants.id, healerCombatantId),
        eq(encounterCombatants.encounterId, encounterId),
      ),
    )
    .limit(1);

  if (!healerCombatant) return { ok: false, code: 'NOT_FOUND', target: 'attacker' };

  // ── Step 3: Turn guard (REQ-H-11) ─────────────────────────────────────────────
  if (encounterRow.currentCombatantId !== healerCombatantId) {
    return { ok: false, code: 'NOT_YOUR_TURN' };
  }

  // ── Step 4: Healer-is-PC guard (REQ-H-09) ────────────────────────────────────
  // NPC combatants have no character sheet → no spellcasting mod derivable.
  if (healerCombatant.characterId === null || healerCombatant.characterId === undefined) {
    return { ok: false, code: 'HEALER_NOT_SPELLCASTER' };
  }

  const healerCharacterId = healerCombatant.characterId;

  // ── Step 5: Load target combatant ─────────────────────────────────────────────
  // Explicit select: we need hpCurrent and hpMax only (REQ-H-13: NPC targets allowed).
  const [targetCombatant] = await db
    .select({
      id: encounterCombatants.id,
      hpCurrent: encounterCombatants.hpCurrent,
      hpMax: encounterCombatants.hpMax,
      encounterId: encounterCombatants.encounterId,
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

  // ── Step 6: Load healer character → compute sheet → resolve spellcasting mod ──
  // ADR-2: inline resolution — no buildAttackContext (weapon/registry not needed).
  const [characterRow] = await db
    .select()
    .from(characters)
    .where(eq(characters.id, healerCharacterId))
    .limit(1);

  if (!characterRow) return { ok: false, code: 'NOT_FOUND', target: 'character' };

  const charData = (characterRow.data as Record<string, unknown>) ?? {};
  const classes = (charData['classes'] as AppliedClass[] | undefined) ?? [];

  // Resolve spellcasting class (ADR-2: first class found in SPELLCASTING_ABILITY wins).
  const spellcastingClass = classes.find((c) => SPELLCASTING_ABILITY[c.slug] !== undefined);
  if (!spellcastingClass) {
    return { ok: false, code: 'HEALER_NOT_SPELLCASTER' };
  }

  const abilityKey = SPELLCASTING_ABILITY[spellcastingClass.slug]!;

  // Compute character sheet for ability scores.
  const inventory = (characterRow.inventory as InventoryItem[]) ?? [];
  const characterInput = {
    name: characterRow.name,
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

  // Use .score (not .modifier) for consistency with the attack path (ADR-2).
  const abilityScore = sheet.abilityScores[abilityKey]?.score ?? 10;
  const spellcastingMod = abilityModifier(abilityScore);

  // Resolve slot ceiling + usage for consumeSpellSlot.
  const slotsMax = computeSpellSlots(classes).slots;
  const slotsUsed: readonly number[] =
    (charData['spellSlotsUsed'] as number[] | undefined) ?? [0, 0, 0, 0, 0, 0, 0, 0, 0];

  // ── Step 7: consumeSpellSlot PRE-CHECK (fail-fast — REQ-H-06) ────────────────
  // Pure check: validates the slot is available BEFORE rolling dice.
  // Storing nextSlotsUsed avoids double-decrement in the tx (design pitfall #1323 ADR-4).
  const slotResult = consumeSpellSlot({
    slotsMax,
    slotsUsed,
    pactMagic: null,
    pactSlotsUsed: 0,
    level: slotLevel,
    slotType: 'regular',
  });

  if (!slotResult.ok) {
    return { ok: false, code: 'SLOT_NOT_AVAILABLE' };
  }

  // Store the post-consume snapshot for the CAS tx — avoids double-decrement.
  const nextSlotsUsed = slotResult.slotsUsed;

  // ── Step 8: Dice → roll → applyHealing ───────────────────────────────────────
  // ADR-3: dice from spellName + slotLevel (server-derived, no client trust).
  // Cure Wounds = slotLevel d8 (PHB p.230); Healing Word = slotLevel d4 (PHB p.250).
  const dice: DiceExpr = `${slotLevel}d${spellName === 'Cure Wounds' ? 8 : 4}`;

  // Spellcasting mod as ONE flat Source in the breakdown (ADR-3 — mirrors Divine Smite Source).
  const modSource: Source = {
    label: 'spellcasting modifier',
    amount: spellcastingMod,
    type: 'untyped',
    origin: { id: healerCharacterId as EntityId, conditions: [] },
  };

  // crit=false always (REQ-H-04 — PHB p.196: crit doubling is for attack damage only).
  const { total, perDie } = rollDamageBreakdown(dice, [modSource], false, cryptoRng);

  // HP delta clamped at hpMax (REQ-H-01 — PHB p.197).
  const hpBefore = targetCombatant.hpCurrent;
  const newHp = applyHealing(hpBefore, total, targetCombatant.hpMax);

  // ── Step 9: CAS tx (REQ-H-14 — 3-tuple atomic write) ─────────────────────────
  // a. UPDATE encounter_combatants SET hp_current = newHp
  // b. UPDATE encounters version CAS (0 rows → VERSION_CONFLICT, full rollback)
  // c. jsonb_set healer spellSlotsUsed with nextSlotsUsed
  //
  // REQ-H-07: slot consumed even when target is at full HP (cast occurred).
  // REQ-H-12: self-heal safe — target (encounter_combatants) and slot (characters) are
  //           different tables; no row conflict when healerCombatantId === targetCombatantId.
  const txResult = await db.transaction(async (tx) => {
    // a. Update target HP.
    await tx
      .update(encounterCombatants)
      .set({ hpCurrent: newHp })
      .where(
        and(
          eq(encounterCombatants.id, targetCombatantId),
          eq(encounterCombatants.encounterId, encounterId),
        ),
      );

    // b. CAS version bump — authoritative check.
    const updated = await tx
      .update(encounters)
      .set({
        version: sql`${encounters.version} + 1`,
        updatedAt: new Date(),
      })
      .where(and(eq(encounters.id, encounterId), eq(encounters.version, version)))
      .returning({ version: encounters.version });

    if (updated.length === 0) {
      // Version conflict — full rollback (HP + slot unchanged).
      return false;
    }

    // c. Persist slot decrement atomically.
    // jsonb_set: only the spellSlotsUsed path is mutated; other data is untouched.
    await tx
      .update(characters)
      .set({
        data: sql`jsonb_set(data, '{spellSlotsUsed}', ${JSON.stringify([...nextSlotsUsed])}::jsonb, true)`,
      })
      .where(eq(characters.id, healerCharacterId));

    return true;
  });

  if (!txResult) {
    return { ok: false, code: 'VERSION_CONFLICT' };
  }

  return {
    ok: true,
    spell: spellName,
    slotLevel,
    dice,
    rolled: total,
    healed: newHp - hpBefore,   // effective delta (0 when at full HP — REQ-H-07)
    newHp,
    perDie,
  };
}
