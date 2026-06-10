/**
 * resolveTargetSave — use-case helper that resolves a combatant's saving throw modifier.
 *
 * Dispatches on combatant kind:
 *   NPC → uses caller-supplied `npcSaveMod` (NULL → NO_TARGET_SAVE).
 *   PC  → derives save modifier server-side using the same leaf loaders as the character-sheet route.
 *
 * Design ref: sdd/engine-forced-check-3a/design — ADR-2 (gemelo of resolveTargetAc.ts).
 *
 * ADR-2 REVERSAL: The original sdd/engine-forced-check-3a/design ADR-2 declared this file
 * STANDALONE (no shared helper). Per FORK-1 decision #2137 (consumer count went 1→2),
 * the PC-success branch now EXPOSES the already-built EvaluationContext, ModifierRegistry,
 * and derived barbarianLevel as a `gather` payload. performForcedCheck reuses them for the
 * save-advantage gather query (D1 / sdd/engine-save-advantage-gather/design).
 * This is a deliberate reversal of the original ADR-2 stance — do NOT silently re-revert.
 *
 * STANDALONE: does NOT extract a shared helper with resolveTargetAc — accepted tech debt ADR-2.
 * The duplication is ~6 loader lines, acceptable until a future consolidation slice.
 *
 * LAYERING: performs IO → lives in use-case layer, NOT domain (domain is pure).
 *
 * PHB p.179 — Saving Throws:
 *   "To make a saving throw, roll a d20 and add the appropriate ability modifier."
 *   "If the class has saving throw proficiency in that ability, add the proficiency bonus."
 * PHB p.164 — Saving Throws:
 *   "At 1st level, each class gives a character proficiency in two saving throws."
 *   "Only the character's primary class grants save proficiency." (PHB p.164, multi-class rule)
 *
 * REQ-UC-01: NPC path — npcSaveMod (null → NO_TARGET_SAVE).
 * REQ-UC-01: PC path — derived server-side via leaf loaders + deriveSavingThrowProficiencies + resolveStat.
 */

import { eq } from 'drizzle-orm';
import { db } from '../../infra/db/client.js';
import { characters } from '../../infra/db/schema.js';
import {
  createInMemoryRegistry,
  resolveStat,
  deriveSavingThrowProficiencies,
  type EvaluationContext,
  type EntityId,
  type ModifierRegistry,
} from '@dungeon-hub/domain/engine';
import type { InventoryItem } from '@dungeon-hub/domain/character/inventory';
import { computeCharacterSheet } from '@dungeon-hub/domain/character/sheet';
import { abilityModifier } from '@dungeon-hub/domain/character/multiclass';
import { loadModifierDefinitions } from '../characters/load-modifier-definitions.js';
import { loadPersistedModifiers } from '../characters/load-persisted-modifiers.js';
import { deriveCharacterModifiers } from '../characters/derive-character-modifiers.js';

// ── Types ──────────────────────────────────────────────────────────────────────

export type Ability = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';

// ── Result union ───────────────────────────────────────────────────────────────

export type ResolveTargetSaveResult =
  | {
      ok: true;
      saveMod: number;
      // ── Gather payload (PC path only; FORK-1 #2137, reverses ADR-2) ──
      // Present ONLY on the PC branch. NPC branch omits this field entirely
      // (exactOptionalPropertyTypes: never assign gather: undefined).
      // Caller narrows by: saveResult.gather !== undefined
      gather?: {
        charId: EntityId;           // branded character EntityId (== registry owner)
        ctx: EvaluationContext;     // built ctx (self.conditions populated from selfConditions param)
        registry: ModifierRegistry; // inventory + persisted + saveProf mods already registered
        barbarianLevel: number;     // summed barbarian class level from charData.classes (0 if none)
      };
    }
  | { ok: true; saveMod: number }                    // NPC branch — no gather (unchanged shape)
  | { ok: false; code: 'NO_TARGET_SAVE' }            // NPC with null npcSaveMod
  | { ok: false; code: 'NOT_FOUND'; target: 'character' };

// ── resolveTargetSave ──────────────────────────────────────────────────────────

/**
 * Resolves the target combatant's saving throw modifier for the given ability.
 *
 * NPC: uses the caller-supplied npcSaveMod. null/undefined → NO_TARGET_SAVE (no crash).
 * PC:  derives save modifier via the same leaf loaders used by GET /characters/:id/sheet
 *      (loadModifierDefinitions + deriveCharacterModifiers + loadPersistedModifiers +
 *       deriveSavingThrowProficiencies + resolveStat). Mirrors characters.ts:959-976.
 *
 * ADR-2: PC path adds ~4 DB queries (char SELECT + modifier catalog + persisted mods).
 * Cloak of Protection (+1 saves) is captured via loadPersistedModifiers.
 *
 * @param target          - Combatant data: kind, characterId, and ability to resolve.
 * @param npcSaveMod      - Caller-supplied NPC save modifier (null/undefined → NO_TARGET_SAVE).
 * @param selfConditions  - Saver's current conditions, used to populate ctx.self.conditions on the
 *                          PC path (REQ-GATHER-04 / D7). Default [] preserves all existing callers.
 *                          Ignored on NPC path (no gather). Zero extra DB reads — caller reuses
 *                          already-loaded condition rows.
 */
export async function resolveTargetSave(
  target: {
    kind: 'pc' | 'npc';
    characterId: string | null;
    ability: Ability;
  },
  npcSaveMod: number | null | undefined,
  selfConditions: { name: string }[] = [],
): Promise<ResolveTargetSaveResult> {
  // ── NPC path ─────────────────────────────────────────────────────────────────
  if (target.kind === 'npc') {
    if (npcSaveMod === null || npcSaveMod === undefined) {
      // REQ-UC-01: NPC target with absent npcSaveMod → NO_TARGET_SAVE (mirrors NO_TARGET_AC).
      return { ok: false, code: 'NO_TARGET_SAVE' };
    }
    return { ok: true, saveMod: npcSaveMod };
  }

  // ── PC path ──────────────────────────────────────────────────────────────────
  // Derive save modifier server-side using the same leaf loaders as the sheet route.
  // Mirrors characters.ts:959-976 (deriveSavingThrowProficiencies + resolveStat shape).

  if (!target.characterId) {
    return { ok: false, code: 'NOT_FOUND', target: 'character' };
  }

  const characterId = target.characterId;

  // Step 1: Load character row.
  const [characterRow] = await db
    .select()
    .from(characters)
    .where(eq(characters.id, characterId))
    .limit(1);

  if (!characterRow) return { ok: false, code: 'NOT_FOUND', target: 'character' };

  const charData = (characterRow.data as Record<string, unknown>) ?? {};
  const inventory = (characterRow.inventory as InventoryItem[]) ?? [];
  const charId = characterId as EntityId;

  // Step 2: Compute character sheet for ability scores + proficiency bonus.
  // computeCharacterSheet gives us abilityScores[ability].score and proficiencyBonus.
  const rawBaseStats = (charData['baseStats'] as Record<string, number> | undefined) ?? {};
  const rawClasses = (charData['classes'] as Array<{ slug: string; level: number }> | undefined) ?? [];

  // Mirror build-attack-context.ts pattern: cast all charData fields as never.
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

  // Step 3: Derive ability modifier for the given ability.
  // ADR-2: base = engine ability modifier for that ability (post-ASI), NOT raw score.
  // save proficiency channel uses resolveStat with proficiencyBonus as 6th arg.
  const abilityScore = sheet.abilityScores[target.ability]?.score ?? 10;
  const abilityMod = abilityModifier(abilityScore);

  // Step 4: Load modifier catalog and derive inventory mods.
  const modifierCatalog = await loadModifierDefinitions();
  const inventoryMods = deriveCharacterModifiers(inventory, charId, modifierCatalog);

  // Step 5: Build EvaluationContext (minimal — no weaponInUse needed for saves).
  // selfConditions populates ctx.self.conditions so dangerSense/rage predicates
  // can evaluate suppression at query time (REQ-GATHER-03 / D7 / ADR-5).
  const ctx: EvaluationContext = {
    self: { id: charId, conditions: selfConditions },
    activeConditions: selfConditions,
  };

  // Step 6: Load persisted modifier_instances (captures Cloak of Protection +1 saves, Bless, etc.).
  const persistedMods = await loadPersistedModifiers(characterId, ctx);

  // Step 7: Build registry and register mods.
  const registry = createInMemoryRegistry();
  for (const m of inventoryMods) registry.register(m);
  for (const m of persistedMods) registry.register(m);

  // Step 8: Register saving throw proficiency mods.
  // PHB p.164: only primary class (classes[0]) grants save proficiency.
  const rawClassesForSave = (charData['classes'] as Array<{ savingThrows?: string[] }> | undefined) ?? [];
  const primaryClassSaves = rawClassesForSave[0]?.savingThrows ?? [];
  const saveProfMods = deriveSavingThrowProficiencies(primaryClassSaves, charId);
  for (const m of saveProfMods) registry.register(m);

  // Step 9: Resolve the save modifier.
  // stat key = `saving-throw.${ability}` (per characters.ts:968 verified pattern).
  // 6th arg (proficiencyBonus) IS passed — proficiency channel for saves (ADR-2).
  const resolved = resolveStat(
    charId,
    `saving-throw.${target.ability}`,
    abilityMod,
    ctx,
    registry,
    sheet.proficiencyBonus,
  );

  // Derive barbarianLevel for Gate A threshold check (Danger Sense requires L2+, PHB p.48).
  // Uses c.slug (not c.classSlug) — matches charData shape in build-attack-context.ts:542.
  const barbarianLevel = rawClasses
    .filter((c) => c.slug === 'barbarian')
    .reduce((sum, c) => sum + c.level, 0);

  // Return PC arm with gather payload (FORK-1 #2137, reverses ADR-2).
  // REQ-GATHER-01: gather present on PC branch; absent (not undefined) on NPC branch.
  return {
    ok: true,
    saveMod: resolved.value,
    gather: {
      charId,
      ctx,
      registry,
      barbarianLevel,
    },
  };
}
