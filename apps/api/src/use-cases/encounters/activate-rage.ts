/**
 * activate-rage — Barbarian Rage activation use-case.
 *
 * PHB p.48 — Rage: "On your turn, you can enter a rage as a bonus action."
 * Costs one bonus action + one barbarian:rage-uses charge. Ends concentration.
 * Cannot be activated while wearing heavy armor.
 *
 * Flow (ADR-3 engine-rage + ADR-2 web-combat-rage):
 *
 * PRE-TX (fail-fast reads, cheapest-abort-first):
 *   1. Load encounter + version pre-check.
 *   2. Load combatant.
 *   3. Turn guard: currentCombatantId !== ragerId → NOT_YOUR_TURN.
 *   3b. [REQ-WCR-AUTH-01] assertCombatantOwnerOrGm → FORBIDDEN / NOT_FOUND.
 *   4. PC guard: characterId null → reject.
 *   4a. Incapacitated gate.
 *   5. Bonus-action gate: bonusActionUsed === true → BONUS_ACTION_ALREADY_USED.
 *   6. Load character → derive barbarianLevel → maxFor. Non-barbarian → RAGE_NOT_AVAILABLE.
 *   7. Rage-use gate: used >= max → RESOURCE_OVER_LIMIT.
 *   8. Heavy-armor precondition (pre-tx inventory read) → RAGE_BLOCKED_BY_HEAVY_ARMOR.
 *
 * IN-TX (single CAS transaction):
 *   9.  CAS UPDATE encounters version (WHERE version = incoming) → 0 rows → VERSION_CONFLICT.
 *   10. UPDATE encounter_combatants SET bonus_action_used = true.
 *   11. jsonb_set characters.data barbarian:rage-uses += 1.
 *   12. breakConcentration(ragerId's characterId, tx) — rager's own concentration.
 *   13. INSERT encounter_combatant_conditions ('Raging', turnsRemaining=10, anchor=ragerId, boundary='end').
 *
 * REQ-RAGE-01, REQ-RAGE-02 (PHB p.48). REQ-WCR-ACT-01.
 */

import { eq, and, sql } from 'drizzle-orm';
import { db } from '../../infra/db/client.js';
import {
  encounters,
  encounterCombatants,
  characters,
  encounterCombatantConditions,
} from '../../infra/db/schema.js';
import { isCombatantIncapacitated } from './load-combatant-incapacitated.js';
import { isCombatantSurprisedFirstTurn } from './is-combatant-surprised-first-turn.js';
import { isSurpriseExempt } from '@dungeon-hub/domain/engine';
import { loadItemDataDetailMany } from '../characters/load-item-data.js';
import { classifyItem } from '@dungeon-hub/domain/character/inventory';
import { breakConcentration } from '../engine/concentration-service.js';
import { assertCombatantOwnerOrGm } from './assert-combatant-owner-or-gm.js';
import type { AppliedClass } from '@dungeon-hub/domain/character/class';
import type { InventoryItem } from '@dungeon-hub/domain/character/inventory';

// ── Output ─────────────────────────────────────────────────────────────────────

export type ActivateRageResult =
  | { ok: true }
  | { ok: false; code: 'NOT_FOUND'; target: 'encounter' | 'combatant' | 'character' }
  | { ok: false; code: 'ENCOUNTER_NOT_ACTIVE' }
  | { ok: false; code: 'NOT_YOUR_TURN' }
  | { ok: false; code: 'VERSION_CONFLICT' }
  // REQ-WCR-AUTH-01 — caller is not the owner of this combatant's character
  | { ok: false; code: 'FORBIDDEN' }
  // engine-incapacitated-gating (PHB p.290 — can't take actions)
  | { ok: false; code: 'ACTOR_INCAPACITATED' }
  // Bonus action already used this turn (PHB p.48 — bonus action cost)
  | { ok: false; code: 'BONUS_ACTION_ALREADY_USED' }
  // Barbarian rage-uses exhausted (PHB p.48)
  | { ok: false; code: 'RESOURCE_OVER_LIMIT' }
  // Not a barbarian / level 0 → no rage-uses resource
  | { ok: false; code: 'RAGE_NOT_AVAILABLE' }
  // Wearing heavy armor (PHB p.48 — "not while wearing heavy armor")
  | { ok: false; code: 'RAGE_BLOCKED_BY_HEAVY_ARMOR' }
  // engine-surprise-round1 (REQ-SUR-S2-02, PHB p.189 — bonus actions blocked while surprised)
  // NOTE: S3 replaces this with the FI-aware version (isSurpriseExempt carve-out)
  | { ok: false; code: 'ACTOR_SURPRISED' };

// ── activate-rage ─────────────────────────────────────────────────────────────

export async function activateRage(input: {
  encounterId: string;
  ragerId: string; // encounter_combatants.id of the barbarian
  version: number;
  callerId: string;          // JWT userId of the caller (REQ-WCR-AUTH-01)
  callerRole: 'gm' | 'player'; // member role in the campaign
}): Promise<ActivateRageResult> {
  const { encounterId, ragerId, version, callerId, callerRole } = input;

  // ── Step 1: Load encounter ────────────────────────────────────────────────────
  const [encounterRow] = await db
    .select()
    .from(encounters)
    .where(eq(encounters.id, encounterId))
    .limit(1);

  if (!encounterRow) return { ok: false, code: 'NOT_FOUND', target: 'encounter' };
  if (encounterRow.status !== 'active') return { ok: false, code: 'ENCOUNTER_NOT_ACTIVE' };

  if (encounterRow.version !== version) {
    return { ok: false, code: 'VERSION_CONFLICT' };
  }

  // ── Step 2: Load rager combatant ──────────────────────────────────────────────
  const [ragerCombatant] = await db
    .select()
    .from(encounterCombatants)
    .where(and(eq(encounterCombatants.id, ragerId), eq(encounterCombatants.encounterId, encounterId)))
    .limit(1);

  if (!ragerCombatant) return { ok: false, code: 'NOT_FOUND', target: 'combatant' };

  // ── Step 3: Turn guard ────────────────────────────────────────────────────────
  if (encounterRow.currentCombatantId !== ragerId) {
    return { ok: false, code: 'NOT_YOUR_TURN' };
  }

  // ── Step 3b: Owner-OR-GM authz (REQ-WCR-AUTH-01, ADR-2) ─────────────────────
  // Runs AFTER turn guard (VERSION_CONFLICT / NOT_YOUR_TURN are cheaper to surface first)
  // and BEFORE economy gates and CAS tx (authz must precede mutation + resource disclosure).
  const authzResult = await assertCombatantOwnerOrGm({
    encounterId,
    combatantId: ragerId,
    callerId,
    callerRole,
  });
  if (!authzResult.ok) {
    if (authzResult.code === 'FORBIDDEN') {
      return { ok: false, code: 'FORBIDDEN' };
    }
    // NOT_FOUND from the helper (NPC target or missing combatant).
    return { ok: false, code: 'NOT_FOUND', target: 'combatant' };
  }

  // ── Step 4: PC guard ─────────────────────────────────────────────────────────
  if (ragerCombatant.characterId === null || ragerCombatant.characterId === undefined) {
    return { ok: false, code: 'NOT_FOUND', target: 'character' };
  }
  const ragerCharId = ragerCombatant.characterId;

  // ── Step 4a: Incapacitated gate (PHB p.290) ────────────────────────────────────
  if (await isCombatantIncapacitated(ragerId)) {
    return { ok: false, code: 'ACTOR_INCAPACITATED' };
  }

  // ── Step 5: Bonus-action gate (PHB p.48 — rage costs a bonus action) ──────────
  if (ragerCombatant.bonusActionUsed) {
    return { ok: false, code: 'BONUS_ACTION_ALREADY_USED' };
  }

  // ── Step 6: Load character → derive barbarianLevel → rage-uses max ────────────
  const [charRow] = await db
    .select()
    .from(characters)
    .where(eq(characters.id, ragerCharId))
    .limit(1);

  if (!charRow) return { ok: false, code: 'NOT_FOUND', target: 'character' };

  const charData = (charRow.data as Record<string, unknown>) ?? {};
  const classes = (charData['classes'] as AppliedClass[] | undefined) ?? [];
  const classResourcesUsed = (charData['classResourcesUsed'] as Record<string, number> | undefined) ?? {};

  const barbarianLevel = classes
    .filter((c) => c.slug === 'barbarian')
    .reduce((sum, c) => sum + c.level, 0);

  // ── Step 6a: Surprise gate — FI-aware (ADR-3.2, REQ-SUR-S3-02, PHB p.189 + p.50) ──
  // Placed HERE (after barbarianLevel) because the Feral Instinct carve-out requires knowing
  // the barbarian level. Exception to the standard version→turn→incap→SURPRISE ladder (ADR-3.2).
  //
  // PHB p.189: "you can't move or take an action on your first turn … and you can't take a reaction"
  // PHB p.50 Feral Instinct: "If you are surprised at the beginning of combat and aren't
  //   incapacitated, you can act normally on your first turn, but only if you enter your rage
  //   before doing anything else on that turn."
  //
  // Note: incap was already verified above (Step 4a returned ACTOR_INCAPACITATED).
  // So at this point isIncapacitated === false — safe to pass false to isSurpriseExempt.
  //
  // post-design #2256: rejected attempts are no-ops — rage need only be the FIRST SUCCESSFUL act.
  // A prior rejected attempt (ACTOR_SURPRISED) does NOT consume the FI exemption.
  let isFeralInstinctCase = false;
  if (await isCombatantSurprisedFirstTurn(ragerId)) {
    if (isSurpriseExempt(barbarianLevel, /* isIncapacitated = */ false)) {
      // FI carve-out applies: allow rage through. Mark for atomically lifting firstTurnActed in tx.
      isFeralInstinctCase = true;
    } else {
      // Surprised AND not FI-exempt (L1-6 Barbarian, non-Barbarian, or under incap) → gate.
      return { ok: false, code: 'ACTOR_SURPRISED' };
    }
  }

  // Derive max rage-uses from the same registry the domain uses (inline for V1).
  // PHB p.48 table: L1-2→2, L3-5→3, L6-11→4, L12-16→5, L17-19→6, L20→sentinel 999.
  let maxRageUses: number | null = null;
  if (barbarianLevel >= 1) {
    if (barbarianLevel >= 20) maxRageUses = 999;
    else if (barbarianLevel >= 17) maxRageUses = 6;
    else if (barbarianLevel >= 12) maxRageUses = 5;
    else if (barbarianLevel >= 6)  maxRageUses = 4;
    else if (barbarianLevel >= 3)  maxRageUses = 3;
    else maxRageUses = 2; // L1-2
  }

  if (maxRageUses === null) {
    // Not a barbarian (or L0 → null) → no rage resource
    return { ok: false, code: 'RAGE_NOT_AVAILABLE' };
  }

  // ── Step 7: Rage-use gate ─────────────────────────────────────────────────────
  const rageUsed = classResourcesUsed['barbarian:rage-uses'] ?? 0;
  if (rageUsed >= maxRageUses) {
    return { ok: false, code: 'RESOURCE_OVER_LIMIT' };
  }

  // ── Step 8: Heavy-armor precondition (PHB p.48 — "not while wearing heavy armor") ─
  // Pre-TX inventory read (inventory already in hand via charRow).
  const inventory = (charRow.inventory as InventoryItem[] | null) ?? [];
  const equippedItems = inventory.filter((item) => item.state === 'equipped');

  if (equippedItems.length > 0) {
    // Batch-load compendium data for equipped items to classify them.
    const itemKeys = equippedItems.map((item) => ({
      slug: item.itemSlug,
      source: item.itemSource,
    }));
    const itemDetails = await loadItemDataDetailMany(itemKeys);

    for (const detail of itemDetails) {
      if (detail && classifyItem(detail) === 'armor-heavy') {
        return { ok: false, code: 'RAGE_BLOCKED_BY_HEAVY_ARMOR' };
      }
    }
  }

  // ── IN-TX: CAS + bonus_action_used + rage-uses+1 + breakConcentration + INSERT 'Raging' ─
  const txResult = await db.transaction(async (tx) => {
    // Step 9: CAS UPDATE — optimistic concurrency guard (cheapest abort first).
    const updated = await tx
      .update(encounters)
      .set({ version: version + 1, updatedAt: new Date() })
      .where(and(eq(encounters.id, encounterId), eq(encounters.version, version)))
      .returning();

    if (updated.length === 0) {
      return { conflict: true as const };
    }

    // Step 10: Consume bonus action.
    // engine-surprise-round1 FI atomicity (ADR-5, REQ-SUR-S3-02): if this is the Feral
    // Instinct case (L7+ surprised Barbarian entering rage as their FIRST act), lift the
    // surprise restriction atomically here INSIDE this tx. Doing it outside the tx would
    // create a window where the flag is partially written. The write is idempotent: if
    // firstTurnActed is already true (impossible per pre-tx gate, but harmless if replayed).
    await tx
      .update(encounterCombatants)
      .set({ bonusActionUsed: true, ...(isFeralInstinctCase ? { firstTurnActed: true } : {}) })
      .where(eq(encounterCombatants.id, ragerId));

    // Step 11: Spend one rage-use via jsonb_set (atomic path mutation — mirrors ki pattern).
    // PHB p.48: Rage costs one rage-use charge on activation.
    // Safety: ensure classResourcesUsed key exists first (via jsonb ||), then set the nested key.
    // Two-step: (1) ensure classResourcesUsed exists; (2) set the barbarian:rage-uses key.
    // This handles the case where classResourcesUsed is absent in fresh character data.
    await tx
      .update(characters)
      .set({
        data: sql`jsonb_set(
          jsonb_set(
            data,
            '{classResourcesUsed}',
            COALESCE(data->'classResourcesUsed', '{}'::jsonb),
            true
          ),
          '{classResourcesUsed,barbarian:rage-uses}',
          to_jsonb((COALESCE((data#>>'{classResourcesUsed,barbarian:rage-uses}')::int, 0) + 1)),
          true
        )`,
      })
      .where(eq(characters.id, ragerCharId));

    // Step 12: Break the rager's own concentration (PHB p.48 — "can't concentrate while raging").
    // Reuse concentration service, passed the tx → covered by rollback.
    await breakConcentration(ragerCharId, tx);

    // Step 13: Insert 'Raging' condition.
    // PHB p.48: 1 minute = 10 rounds → turnsRemaining=10.
    // Anchor: ragerId (turn-end boundary), self-applied.
    await tx.insert(encounterCombatantConditions).values({
      combatantId: ragerId,
      conditionName: 'Raging',
      appliedByCombatantId: ragerId,
      turnAnchorEntityId: ragerId,
      turnAnchorBoundary: 'end',
      turnsRemaining: 10,
    });

    return { conflict: false as const };
  });

  if (txResult.conflict) {
    return { ok: false, code: 'VERSION_CONFLICT' };
  }

  return { ok: true };
}
