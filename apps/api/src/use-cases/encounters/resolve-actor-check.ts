/**
 * resolveActorCheck — use-case helper that resolves a combatant's ability check modifier.
 *
 * Actor polarity: the ROLLING ACTOR's check modifier (opposite polarity from resolveTargetSave
 * which resolves the TARGET's save modifier).
 *
 * Dispatches on combatant kind:
 *   NPC → uses caller-supplied `npcCheckMod` (null/undefined → NO_ACTOR_CHECK).
 *   PC  → derives check modifier server-side using the same leaf loaders as the character-sheet route.
 *
 * Design ref: sdd/engine-ability-check-surface/design — D9 (resolveActorCheck shape).
 *
 * ADR-2 CONTINUED: mirrors resolve-target-save.ts PATTERN — do NOT extract a shared helper.
 * The duplication is ~6 loader lines, acceptable per the accepted-duplication stance.
 *
 * BARE VS SKILL CHECKS (PHB p.174-175):
 *   - Bare ability check (no skill): stat key = ability (e.g. 'str'). NO proficiency bonus.
 *   - Skill check: stat key = 'skill.${skill}'. Proficiency bonus applied IF proficient.
 *     deriveSkillProficiencies is registered when skill is provided so the proficiency channel fires.
 *     Governing ability = SKILL_TO_ABILITY[skill] — set in ctx.check.ability (REQ-SKILL-01).
 *
 * REQ-GATHER-01..04: NPC arm, PC bare ability, PC skill (proficient/non-proficient), classes.slug shape.
 * REQ-CTX-02: resolveActorCheck spreads check:{ ability } into EvaluationContext.
 *
 * LAYERING: performs IO → lives in use-case layer, NOT domain (domain is pure).
 *
 * PHB p.174 — Ability Checks:
 *   "To make an ability check, roll a d20 and add the relevant ability modifier."
 *   "If the total equals or exceeds the Difficulty Class (DC), the ability check is a success."
 * PHB p.175 — Skill Checks:
 *   "Each skill is associated with an ability score...
 *    Occasionally a check uses one ability score and one skill."
 */

import { eq } from 'drizzle-orm';
import { db } from '../../infra/db/client.js';
import { characters } from '../../infra/db/schema.js';
import {
  createInMemoryRegistry,
  resolveStat,
  deriveSkillProficiencies,
  type EvaluationContext,
  type EntityId,
  type ModifierRegistry,
} from '@dungeon-hub/domain/engine';
import type { InventoryItem } from '@dungeon-hub/domain/character/inventory';
import { computeCharacterSheet } from '@dungeon-hub/domain/character/sheet';
import { abilityModifier } from '@dungeon-hub/domain/character/multiclass';
import { SKILL_TO_ABILITY } from '@dungeon-hub/domain/character/sheet';
import { loadModifierDefinitions } from '../characters/load-modifier-definitions.js';
import { loadPersistedModifiers } from '../characters/load-persisted-modifiers.js';
import { deriveCharacterModifiers } from '../characters/derive-character-modifiers.js';

// ── Types ──────────────────────────────────────────────────────────────────────

export type Ability = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';

// ── Result union ───────────────────────────────────────────────────────────────

export type ResolveActorCheckResult =
  | {
      ok: true;
      checkMod: number;
      // ── Gather payload (PC path only; mirrors resolve-target-save.ts FORK-1 pattern) ──
      // Present ONLY on the PC branch. NPC branch omits this field entirely
      // (exactOptionalPropertyTypes: never assign gather: undefined).
      // Caller narrows by: checkResult.gather !== undefined
      gather?: {
        charId: EntityId;           // branded character EntityId (== registry owner)
        ctx: EvaluationContext;     // built ctx (check.ability + self.conditions populated)
        registry: ModifierRegistry; // inventory + persisted + skillProf mods already registered
        barbarianLevel: number;     // summed barbarian class level from charData.classes (0 if none)
      };
    }
  | { ok: true; checkMod: number }                     // NPC branch — no gather (unchanged shape)
  | { ok: false; code: 'NO_ACTOR_CHECK' }              // NPC with null npcCheckMod
  | { ok: false; code: 'NOT_FOUND'; target: 'character' };

// ── resolveActorCheck ──────────────────────────────────────────────────────────

/**
 * Resolves the actor combatant's ability check modifier for the given ability.
 *
 * NPC: uses the caller-supplied npcCheckMod. null/undefined → NO_ACTOR_CHECK (no crash).
 * PC:  derives check modifier via the same leaf loaders used by GET /characters/:id/sheet.
 *
 * @param actor           - Combatant data: kind, characterId, ability to resolve, optional skill.
 * @param npcCheckMod     - Caller-supplied NPC check modifier (null/undefined → NO_ACTOR_CHECK).
 * @param selfConditions  - Actor's current conditions, used to populate ctx.self.conditions on the
 *                          PC path. Default [] preserves all existing callers.
 */
export async function resolveActorCheck(
  actor: {
    kind: 'pc' | 'npc';
    characterId: string | null;
    ability: Ability;
    skill?: string;
  },
  npcCheckMod: number | null | undefined,
  selfConditions: { name: string }[] = [],
): Promise<ResolveActorCheckResult> {
  // ── NPC path ─────────────────────────────────────────────────────────────────
  if (actor.kind === 'npc') {
    if (npcCheckMod === null || npcCheckMod === undefined) {
      // REQ-GATHER-01: NPC actor with absent npcCheckMod → NO_ACTOR_CHECK.
      return { ok: false, code: 'NO_ACTOR_CHECK' };
    }
    return { ok: true, checkMod: npcCheckMod };
  }

  // ── PC path ──────────────────────────────────────────────────────────────────
  if (!actor.characterId) {
    return { ok: false, code: 'NOT_FOUND', target: 'character' };
  }

  const characterId = actor.characterId;

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
  const rawBaseStats = (charData['baseStats'] as Record<string, number> | undefined) ?? {};
  const rawClasses = (charData['classes'] as Array<{ slug: string; level: number }> | undefined) ?? [];

  void rawBaseStats; // used via characterInput below

  // Mirror resolve-target-save.ts pattern: cast all charData fields as never.
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

  // Step 3: Derive ability modifier for the governing ability.
  // REQ-GATHER-02: bare ability check = ability modifier only (no proficiency — PHB p.174).
  // REQ-GATHER-03: skill check = ability modifier + proficiency if proficient (PHB p.175).
  // The governing ability is `actor.ability` in both cases (caller-supplied or SKILL_TO_ABILITY derived).
  const abilityScore = sheet.abilityScores[actor.ability]?.score ?? 10;
  const abilityMod = abilityModifier(abilityScore);

  // Step 4: Load modifier catalog and derive inventory mods.
  const modifierCatalog = await loadModifierDefinitions();
  const inventoryMods = deriveCharacterModifiers(inventory, charId, modifierCatalog);

  // Step 5: Build EvaluationContext.
  // REQ-CTX-02: spread check:{ ability } where ability is the GOVERNING ability.
  // For skill checks, actor.ability IS the governing ability (caller set from SKILL_TO_ABILITY).
  // selfConditions populates ctx.self.conditions so rage/check predicates can evaluate at query time.
  const ctx: EvaluationContext = {
    self: { id: charId, conditions: selfConditions },
    activeConditions: selfConditions,
    check: { ability: actor.ability },
  };

  // Step 6: Load persisted modifier_instances.
  const persistedMods = await loadPersistedModifiers(characterId, ctx);

  // Step 7: Build registry and register mods.
  const registry = createInMemoryRegistry();
  for (const m of inventoryMods) registry.register(m);
  for (const m of persistedMods) registry.register(m);

  // Step 8: Register skill proficiency mods ONLY when a skill check is requested.
  // REQ-GATHER-03: skill check registers deriveSkillProficiencies so proficiency channel fires.
  // REQ-GATHER-02: bare ability check MUST NOT register skill proficiencies (no PB added).
  if (actor.skill !== undefined) {
    const rawClassesForSkill = (charData['classes'] as Array<{ skillChoices?: string[] }> | undefined) ?? [];
    const rawBackgroundSkills = (charData['background'] as { skills?: string[] } | undefined)?.skills ?? [];
    const rawRaceSkillChoices = (charData['raceSkillChoices'] as string[] | undefined) ?? [];
    const skillProfMods = deriveSkillProficiencies(
      { classes: rawClassesForSkill, backgroundSkills: rawBackgroundSkills, raceSkillChoices: rawRaceSkillChoices },
      charId,
    );
    for (const m of skillProfMods) registry.register(m);
  }

  // Step 9: Resolve the check modifier.
  // Stat key: skill ? 'skill.${skill}' : ability (REQ-GATHER-02/03).
  // 6th arg (proficiencyBonus) passed so the proficiency channel can apply for skill checks.
  // For bare checks, the proficiency channel is absent (no ProficiencyMod registered) so the
  // 6th arg has no effect (resolveStat only uses it if a ProficiencyMod exists for that stat).
  const statKey = actor.skill !== undefined ? (`skill.${actor.skill}` as const) : actor.ability;
  const resolved = resolveStat(
    charId,
    statKey,
    abilityMod,
    ctx,
    registry,
    sheet.proficiencyBonus,
  );

  // Derive barbarianLevel for parity with resolve-target-save.ts gather payload (D9).
  // REQ-GATHER-04: uses c.slug (NOT c.classSlug) — matches charData shape in resolve-target-save.ts:214.
  const barbarianLevel = rawClasses
    .filter((c) => c.slug === 'barbarian')
    .reduce((sum, c) => sum + c.level, 0);

  // Return PC arm with gather payload (mirrors FORK-1 resolve-target-save.ts pattern).
  return {
    ok: true,
    checkMod: resolved.value,
    gather: {
      charId,
      ctx,
      registry,
      barbarianLevel,
    },
  };
}
