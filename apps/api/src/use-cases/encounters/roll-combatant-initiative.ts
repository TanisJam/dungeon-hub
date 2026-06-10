/**
 * rollCombatantInitiative — initiative roll use-case (combatant polarity).
 *
 * PHB p.189 — Initiative:
 *   "At the beginning of every combat, roll initiative by making a Dexterity check."
 *   Initiative is an ORDERING number (the total). There is NO DC, NO success/fail.
 *
 * PHB p.50 — Feral Instinct (Barbarian level 7):
 *   "By 7th level, your instincts are so honed that you have advantage on
 *    initiative rolls."
 *
 * Flow (9 steps):
 *  1. Load encounter + active guard
 *  2. Load combatant (kind, characterId) scoped to encounterId
 *  3. NPC arm: npcInitiativeMod absent → NO_ACTOR_INITIATIVE; present → checkMod = mod
 *  4. PC arm: computeCharacterSheet → dexMod → modifierCatalog + deriveCharacterModifiers
 *             + loadPersistedModifiers → registry → ctx (NO check/save fields) →
 *             resolveStat('initiative', dexMod) → checkMod
 *  5. Compute barbarianLevel (c.slug === 'barbarian' pattern, REQ-GATHER-04)
 *  6. Feral Instinct registration-time gate: if barbarianLevel >= 7 AND callerRollMode === 'normal'
 *  7. registry.query({trigger:'on-initiative'}) + resolveRollMode (upgrade-only-from-normal)
 *  8. Caller rollMode override wins (REQ-ROUTE-05 — DM authority)
 *  9. rollInitiative(checkMod, resolvedRollMode, cryptoRng)
 * 10. PATCH encounter_combatants.initiative = roll.total
 * 11. Return { ok: true, initiative: { ...roll } }
 *
 * INLINE gather — NO resolveActorInitiative helper (ADR-2 accepted-duplication, design D4).
 * Single ctx-build site (REQ-HYGIENE-06, lesson #2160).
 * ctx shape: { self: { id, conditions:[] } } — NO check/save fields (initiative is pre-combat).
 * feralInstinctRuleDoc: NO predicate — barbarianLevel >= 7 is registration-time gate.
 *
 * REQ-GATHER-01..06, REQ-ROUTE-01..06, REQ-PERSIST-01..02, REQ-LEAK-01..03.
 * Design ref: sdd/engine-feral-instinct/design — D4 (use-case flow).
 */

import { and, eq } from 'drizzle-orm';
import { db } from '../../infra/db/client.js';
import { encounters, encounterCombatants, characters } from '../../infra/db/schema.js';
import {
  rollInitiative,
  compileRule,
  feralInstinctRuleDoc,
  createInMemoryRegistry,
  resolveStat,
  resolveRollMode,
  type RngFn,
  type EntityId,
  type EvaluationContext,
} from '@dungeon-hub/domain/engine';
import type { InventoryItem } from '@dungeon-hub/domain/character/inventory';
import { computeCharacterSheet } from '@dungeon-hub/domain/character/sheet';
import { abilityModifier } from '@dungeon-hub/domain/character/multiclass';
import { loadModifierDefinitions } from '../characters/load-modifier-definitions.js';
import { loadPersistedModifiers } from '../characters/load-persisted-modifiers.js';
import { deriveCharacterModifiers } from '../characters/derive-character-modifiers.js';

// ── Crypto RNG (mirrors perform-ability-check.ts) ─────────────────────────────

/**
 * Server-side crypto RNG. Same pattern as perform-ability-check.ts:48-52.
 * Returns an integer in [1..sides].
 */
const cryptoRng: RngFn = (sides: number): number => {
  const buf = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buf);
  return (buf[0]! % sides) + 1;
};

// ── Module-scope compiled rule (REQ-RULEDOC-02, build-once pattern) ───────────

// Compiled once at module scope — pure/no-IO. .build() called per request inside level gate.
// Mirrors perform-ability-check.ts:62 compiledRage pattern.
// PHB p.50 — Feral Instinct: advantage on initiative rolls (barbarian level >= 7).
const compiledFeralInstinct = compileRule(feralInstinctRuleDoc);

// ── Input / Output ────────────────────────────────────────────────────────────

export interface RollCombatantInitiativeInput {
  encounterId: string;
  combatantId: string;
  npcInitiativeMod?: number | null;
  rollMode?: 'normal' | 'advantage' | 'disadvantage';
}

export type RollCombatantInitiativeResult =
  | {
      ok: true;
      initiative: {
        d20: number;
        d20All: number[];
        checkMod: number;
        total: number;
        rollMode: 'normal' | 'advantage' | 'disadvantage';
      };
    }
  | { ok: false; code: 'NOT_FOUND'; target: 'encounter' | 'actor' | 'character' }
  | { ok: false; code: 'ENCOUNTER_NOT_ACTIVE' }
  | { ok: false; code: 'NO_ACTOR_INITIATIVE' };

// ── rollCombatantInitiative ───────────────────────────────────────────────────

export async function rollCombatantInitiative(
  input: RollCombatantInitiativeInput,
): Promise<RollCombatantInitiativeResult> {
  const {
    encounterId,
    combatantId,
    npcInitiativeMod,
    rollMode: callerRollMode = 'normal',
  } = input;

  // ── Step 1: Load encounter + active guard ─────────────────────────────────
  // Mirrors perform-ability-check.ts:110-117.
  const [encounterRow] = await db
    .select({ id: encounters.id, status: encounters.status })
    .from(encounters)
    .where(eq(encounters.id, encounterId))
    .limit(1);

  if (!encounterRow) return { ok: false, code: 'NOT_FOUND', target: 'encounter' };
  if (encounterRow.status !== 'active') return { ok: false, code: 'ENCOUNTER_NOT_ACTIVE' };

  // ── Step 2: Load combatant (kind, characterId) scoped to encounterId ──────
  // Mirrors perform-ability-check.ts:120-135.
  const [combatant] = await db
    .select({
      id: encounterCombatants.id,
      kind: encounterCombatants.kind,
      characterId: encounterCombatants.characterId,
    })
    .from(encounterCombatants)
    .where(
      and(
        eq(encounterCombatants.id, combatantId),
        eq(encounterCombatants.encounterId, encounterId),
      ),
    )
    .limit(1);

  if (!combatant) return { ok: false, code: 'NOT_FOUND', target: 'actor' };

  let checkMod: number;
  let resolvedRollMode: 'normal' | 'advantage' | 'disadvantage' = callerRollMode;

  // ── Step 3: NPC arm ───────────────────────────────────────────────────────
  // REQ-GATHER-01: NPC without npcInitiativeMod → NO_ACTOR_INITIATIVE.
  // NPC with npcInitiativeMod → checkMod = mod, rollMode = callerRollMode (no registry gather).
  if (combatant.kind === 'npc') {
    if (npcInitiativeMod === null || npcInitiativeMod === undefined) {
      return { ok: false, code: 'NO_ACTOR_INITIATIVE' };
    }
    checkMod = npcInitiativeMod;
    // resolvedRollMode stays as callerRollMode (NPC has no registry gather).
  } else {
    // ── Step 4: PC arm (the SINGLE ctx-build site, REQ-HYGIENE-06 / design D4) ─

    if (!combatant.characterId) {
      return { ok: false, code: 'NOT_FOUND', target: 'character' };
    }

    const characterId = combatant.characterId;

    // Load character row.
    const [characterRow] = await db
      .select()
      .from(characters)
      .where(eq(characters.id, characterId))
      .limit(1);

    if (!characterRow) return { ok: false, code: 'NOT_FOUND', target: 'character' };

    const charData = (characterRow.data as Record<string, unknown>) ?? {};
    const inventory = (characterRow.inventory as InventoryItem[]) ?? [];
    const charId = characterId as EntityId;

    // Compute character sheet (mirrors resolve-actor-check.ts pattern).
    // Cast charData fields as never — mirrors resolve-actor-check.ts:139-160.
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

    // DEX modifier (REQ-GATHER-02: initiative checkMod = DEX mod, no proficiency).
    // PHB p.189: "roll initiative by making a Dexterity check".
    // PHB p.177: no proficiency bonus on initiative (no ProficiencyMod for 'initiative' stat).
    // Design D5: resolveStat('initiative', dexMod) with NO 6th proficiency arg.
    const dexScore = sheet.abilityScores.dex?.score ?? 10;
    const dexMod = abilityModifier(dexScore);

    // Load modifier catalog + derive inventory mods + persisted modifiers.
    const modifierCatalog = await loadModifierDefinitions();
    const inventoryMods = deriveCharacterModifiers(inventory, charId, modifierCatalog);

    // Build registry and register inventory + persisted mods.
    const registry = createInMemoryRegistry();
    for (const m of inventoryMods) registry.register(m);

    // Build ctx for initiative: NO check/save fields — initiative is pre-combat.
    // REQ-GATHER-05: ctx = { self: { id, conditions: [] } }. No conditions relevant for initiative.
    const ctx: EvaluationContext = {
      self: { id: charId, conditions: [] },
      activeConditions: [],
    };

    const persistedMods = await loadPersistedModifiers(characterId, ctx);
    for (const m of persistedMods) registry.register(m);

    // resolveStat('initiative', dexMod, ctx, registry) — NO 6th proficiency arg (design D5).
    const resolved = resolveStat(charId, 'initiative', dexMod, ctx, registry);
    checkMod = resolved.value;

    // ── Step 5: Compute barbarianLevel (REQ-GATHER-04: uses c.slug NOT c.classSlug) ─
    const rawClasses =
      (charData['classes'] as Array<{ slug: string; level: number }> | undefined) ?? [];
    const barbarianLevel = rawClasses
      .filter((c) => c.slug === 'barbarian')
      .reduce((sum, c) => sum + c.level, 0);

    // ── Step 6: Feral Instinct registration-time gate (REQ-GATHER-03) ─────────
    // Only register if barbarianLevel >= 7 AND caller left rollMode at default 'normal'.
    // Caller-explicit rollMode wins (callerRollMode !== 'normal' → skip gather).
    // PHB p.50: "By 7th level" — the level check is here, not in the rule doc predicate.
    if (barbarianLevel >= 7 && callerRollMode === 'normal') {
      const feralInstances = compiledFeralInstinct.build({ barbarianId: charId });
      for (const i of feralInstances.filter((i) => i.def.kind === 'advantage')) {
        registry.register(i);
      }
    }

    // ── Step 7: Query registry + resolveRollMode ───────────────────────────────
    // trigger:'on-initiative' matches ONLY 'on-initiative' and 'always' instances.
    // Does NOT match 'on-check' (rage STR advantage) → REQ-LEAK-02.
    // Feral Instinct (trigger:'on-initiative') is NOT gathered by 'on-check' queries → REQ-LEAK-01.
    const gatherMods = registry.query({
      trigger: 'on-initiative',
      self: charId,
      ctx,
    });
    const rollModeResult = resolveRollMode(gatherMods, ctx);

    // Upgrade-only-from-normal (mirrors perform-ability-check.ts:200-205).
    if (rollModeResult.mode !== 'normal' && callerRollMode === 'normal') {
      resolvedRollMode = rollModeResult.mode as 'advantage' | 'disadvantage';
    }
  }

  // ── Step 8: Caller rollMode override wins (REQ-ROUTE-05, caller-wins) ──────
  // If callerRollMode was explicitly set (not the default 'normal'), it overrides.
  // This is already baked in: for NPCs resolvedRollMode = callerRollMode, and for PCs
  // when callerRollMode !== 'normal' the gather step is skipped (step 6 guard).
  // Final resolvedRollMode is ready.

  // ── Step 9: Roll the initiative ───────────────────────────────────────────
  const roll = rollInitiative(checkMod, resolvedRollMode, cryptoRng);

  // ── Step 10: PATCH encounter_combatants.initiative = roll.total ───────────
  // REQ-PERSIST-01: write the ordered total to the existing integer column (no migration).
  // DM-authoritative overwrite — re-rolling updates the sort order (design D7).
  await db
    .update(encounterCombatants)
    .set({ initiative: roll.total })
    .where(eq(encounterCombatants.id, combatantId));

  // ── Step 11: Return result ────────────────────────────────────────────────
  return {
    ok: true,
    initiative: {
      d20: roll.d20,
      d20All: roll.d20All,
      checkMod: roll.checkMod,
      total: roll.total,
      rollMode: roll.rollMode,
    },
  };
}
