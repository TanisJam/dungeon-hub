/**
 * buildAttackContext — shared context builder for weapon attack use-cases.
 *
 * Extracted from perform-weapon-attack.ts Steps 6-13 (ADR-8):
 * Loads character sheet, weapon compendium data, resolves proficiency, normalizes
 * 5etools property codes, builds EvaluationContext and ModifierRegistry.
 *
 * Both the read-only use-case (perform-weapon-attack.ts) and the mutation use-case
 * (perform-weapon-attack-apply.ts) delegate to this helper to avoid drift.
 *
 * Design ref: sdd/engine-attack-apply-damage/design — ADR-8 (shared ctx helper).
 *
 * IMPORTANT: this function only handles the ATTACKER's character data.
 * Target HP loading is the caller's responsibility (different callers need
 * different target fields).
 */

import { eq, inArray } from 'drizzle-orm';
import { db } from '../../infra/db/client.js';
import { characters, encounterCombatantConditions } from '../../infra/db/schema.js';
import {
  createInMemoryRegistry,
  buildSneakAttackRider,
  buildStunnedModifiers,
  STUNNED_CONDITION_DEF,
  type ModifierRegistry,
  type EvaluationContext,
} from '@dungeon-hub/domain/engine';
import type { AppliedClass } from '@dungeon-hub/domain/character/class';
import { isWeaponProficient } from '@dungeon-hub/domain/character/inventory';
import { computeCharacterSheet } from '@dungeon-hub/domain/character/sheet';
import { abilityModifier } from '@dungeon-hub/domain/character/multiclass';
import type { EntityId } from '@dungeon-hub/domain/engine';
import { deriveCharacterModifiers } from '../characters/derive-character-modifiers.js';
import { loadPersistedModifiers } from '../characters/load-persisted-modifiers.js';
import { loadModifierDefinitions } from '../characters/load-modifier-definitions.js';
import { loadItemDataDetailMany } from '../characters/load-item-data.js';
import type { InventoryItem } from '@dungeon-hub/domain/character/inventory';

// ── Input / Output ─────────────────────────────────────────────────────────────

export interface BuildAttackContextInput {
  /** characterId of the attacker (from encounter_combatants.characterId). */
  characterId: string;
  /** encounter_combatants.id of the attacker. Used to bind ctx.self/ctx.attacker. */
  attackerId: string;
  /** encounter_combatants.id of the target. Used to bind ctx.target. */
  targetId: string;
  /** inventory instanceId of the weapon being used. */
  weaponInstanceId: string;
  /** From the encounters row — for ctx.encounterRound. */
  encounterRound?: number | null;
  /** Caller-asserted per-action runtime decisions. */
  runtimeDecisions?: Record<string, boolean>;
}

export type BuildAttackContextResult =
  | {
      ok: true;
      /** Resolved character EntityId (branded). */
      charId: EntityId;
      /** Attacker's character UUID as a plain string (for SQL WHERE clarity). */
      attackerCharacterId: string;
      /** Built EvaluationContext. */
      ctx: EvaluationContext;
      /** Built ModifierRegistry (with inventory + persisted + sneak attack rider). */
      registry: ModifierRegistry;
      /** Attacker's STR modifier. */
      strMod: number;
      /** Attacker's DEX modifier. */
      dexMod: number;
      /** Attacker's Wisdom modifier (for Monk ki save DC — ADR-1). */
      wisMod: number;
      /** Attacker's proficiency bonus. */
      proficiencyBonus: number;
      /** Whether the attacker is proficient with this weapon. */
      isProficient: boolean;
      /**
       * Monk class level (0 if not a Monk). Used to compute ki pool max.
       * PHB p.78: ki pool size = Monk level.
       * Slice 3b-ii — ADR-1.
       */
      monkLevel: number;
      /**
       * Ki points used before this attack (from classResourcesUsed['monk:ki-points']).
       * Slice 3b-ii — ADR-1. 0 for non-Monks or if no ki has been spent yet.
       */
      kiUsedBefore: number;
      /** Weapon stats for resolveWeaponAttack. */
      weapon: {
        kind: 'melee' | 'ranged';
        properties: string[];
        magicBonus: number;
        damageDice: string;
        damageType: string;
      };
    }
  | { ok: false; code: 'NOT_FOUND'; target: 'character' | 'weapon' }
  | { ok: false; code: 'FORBIDDEN' }; // character userId mismatch (unused by GM callers)

// ── Property code normalization ────────────────────────────────────────────────

/**
 * Maps 5etools single-letter property codes to semantic strings.
 * PHB p.147-149: finesse='F', thrown='T', light='L', etc.
 * Normalized at the use-case boundary — domain predicates use semantic strings.
 */
const PROPERTY_CODE_TO_SEMANTIC: Record<string, string> = {
  F: 'finesse',
  T: 'thrown',
  L: 'light',
  H: 'heavy',
  V: 'versatile',
  '2H': 'two-handed',
  R: 'reach',
  LD: 'loading',
  A: 'ammunition',
  S: 'special',
};

// ── buildAttackContext ─────────────────────────────────────────────────────────

/**
 * Loads and assembles all context needed to call resolveWeaponAttack.
 *
 * Steps (mirrors perform-weapon-attack.ts Steps 6-13):
 *   6. Load character row
 *   7. Compute character sheet
 *   8. Find weapon in inventory
 *   9. Load weapon compendium data
 *   9b. Normalize 5etools property codes
 *   10. Build EvaluationContext
 *   11. Build ModifierRegistry (inventory + persisted + sneak attack)
 *   12. Resolve ability mods
 *   13. Assemble weapon shape for resolveWeaponAttack
 */
export async function buildAttackContext(
  input: BuildAttackContextInput,
): Promise<BuildAttackContextResult> {
  const {
    characterId,
    attackerId,
    targetId,
    weaponInstanceId,
    encounterRound,
    runtimeDecisions,
  } = input;

  // ── Step 6: Load character sheet (proficiencies, ability mods, pb) ───────────
  const [characterRow] = await db
    .select()
    .from(characters)
    .where(eq(characters.id, characterId))
    .limit(1);

  if (!characterRow) return { ok: false, code: 'NOT_FOUND', target: 'character' };

  const charData = (characterRow.data as Record<string, unknown>) ?? {};
  const inventory = (characterRow.inventory as InventoryItem[]) ?? [];

  // ── Step 7: Compute character sheet ──────────────────────────────────────────
  // exactOptionalPropertyTypes: conditional spread for nullable fields.
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
  const charId = characterId as EntityId;

  // ── Step 8: Find weapon in inventory ─────────────────────────────────────────
  const weaponInstance = inventory.find(
    (item) => item.instanceId === weaponInstanceId,
  );
  if (!weaponInstance) return { ok: false, code: 'NOT_FOUND', target: 'weapon' };

  // ── Step 9: Load weapon compendium data ───────────────────────────────────────
  const [weaponDetail] = await loadItemDataDetailMany([
    { slug: weaponInstance.itemSlug, source: weaponInstance.itemSource },
  ]);
  if (!weaponDetail) return { ok: false, code: 'NOT_FOUND', target: 'weapon' };

  // ── Step 9b: Resolve proficiency ─────────────────────────────────────────────
  const isProficient = isWeaponProficient(
    sheet.proficiencies.weapons,
    { name: weaponDetail.name, slug: weaponDetail.slug },
  );

  // ── Step 9c: Normalize 5etools weapon property codes ─────────────────────────
  // 5etools stores single-letter codes; domain predicates match semantic strings.
  const normalizedProperties = (weaponDetail.property ?? []).flatMap((p) => {
    const semantic = PROPERTY_CODE_TO_SEMANTIC[p];
    return semantic !== undefined ? [p, semantic] : [p];
  });

  // ── Step 10: Load active conditions for attacker + target (REQ-CTX-01) ──────────
  // ADR-6: 1 IN-query for both combatants. Zero-row combatants → empty arrays
  // (read-tolerance for legacy combatants without conditions, CLAUDE.md §11).
  const conditionRows = await db
    .select({
      combatantId: encounterCombatantConditions.combatantId,
      conditionName: encounterCombatantConditions.conditionName,
    })
    .from(encounterCombatantConditions)
    .where(inArray(encounterCombatantConditions.combatantId, [attackerId, targetId]));

  const attackerConditions = conditionRows
    .filter((r) => r.combatantId === attackerId)
    .map((r) => ({ name: r.conditionName }));
  const targetConditions = conditionRows
    .filter((r) => r.combatantId === targetId)
    .map((r) => ({ name: r.conditionName }));

  // ── Step 10b: Build EvaluationContext ─────────────────────────────────────────
  // exactOptionalPropertyTypes: conditional spread for all optional ctx fields.
  const ctx: EvaluationContext = {
    self: { id: charId, conditions: attackerConditions },
    activeConditions: [...attackerConditions, ...targetConditions],
    target: { id: targetId as EntityId, conditions: targetConditions },
    attacker: { id: charId, conditions: attackerConditions },
    weaponInUse: {
      kind: weaponDetail.type === 'R' ? 'ranged' : 'melee',
      properties: normalizedProperties,
    },
    ...(encounterRound !== undefined && encounterRound !== null
      ? { encounterRound }
      : {}),
    ...(runtimeDecisions !== undefined ? { runtimeDecisions } : {}),
  };

  // ── Step 11: Build registry ───────────────────────────────────────────────────
  const modifierCatalog = await loadModifierDefinitions();
  const inventoryMods = deriveCharacterModifiers(inventory, charId, modifierCatalog);
  const persistedMods = await loadPersistedModifiers(characterId, ctx);
  const registry = createInMemoryRegistry();
  for (const m of inventoryMods) registry.register(m);
  for (const m of persistedMods) registry.register(m);

  // ── Step 11b: Sneak Attack rider (REQ-SA-DICE-01) ────────────────────────────
  const rogueLevel = ((charData['classes'] as AppliedClass[] | undefined) ?? [])
    .filter((c) => c.slug === 'rogue')
    .reduce((sum, c) => sum + c.level, 0);
  if (rogueLevel > 0) {
    const sneakAttackDice = `${Math.ceil(rogueLevel / 2)}d6`;
    for (const m of buildSneakAttackRider(charId, targetId as EntityId, sneakAttackDice)) {
      registry.register(m);
    }
  }

  // ── Step 11c: Condition modifiers (REQ-CTX-01 — ADR-6) ──────────────────────
  // Register outgoing condition mods for the target so resolveRollMode sees them.
  // PHB p.292: if target is Stunned, ALL attackers get advantage (unconditional).
  // This is the FIRST production wiring of the attackers-of registry path.
  // buildProneModifiers existed but had zero production call sites before this slice.
  if (targetConditions.some((c) => c.name === 'Stunned')) {
    const stunnedResult = buildStunnedModifiers(
      targetId as import('@dungeon-hub/domain/engine').EntityId,
      (name) => {
        if (name === 'Stunned') return STUNNED_CONDITION_DEF;
        return null;
      },
    );
    if (stunnedResult.ok) {
      for (const m of stunnedResult.instances) {
        registry.register(m);
      }
    }
  }

  // ── Step 12: Resolve ability mods ─────────────────────────────────────────────
  const strScore = sheet.abilityScores.str?.score ?? 10;
  const dexScore = sheet.abilityScores.dex?.score ?? 10;
  const wisScore = sheet.abilityScores.wis?.score ?? 10;
  const strMod = abilityModifier(strScore);
  const dexMod = abilityModifier(dexScore);
  const wisMod = abilityModifier(wisScore);

  // ── Step 12b: Monk-specific context (Slice 3b-ii — ADR-1) ────────────────────
  // monkLevel: mirrors rogueLevel pattern (L243-245). 0 for non-Monks.
  // PHB p.78: ki pool max = Monk level (for L≥2; handled by MONK_KI_POINTS registry).
  const monkLevel = ((charData['classes'] as AppliedClass[] | undefined) ?? [])
    .filter((c) => c.slug === 'monk')
    .reduce((sum, c) => sum + c.level, 0);

  // kiUsedBefore: from already-loaded charData — NO new DB query.
  const classResourcesUsed = charData['classResourcesUsed'] as Record<string, number> | undefined;
  const kiUsedBefore: number = classResourcesUsed?.['monk:ki-points'] ?? 0;

  // ── Step 13: Weapon shape for resolveWeaponAttack ────────────────────────────
  const weapon = {
    kind: (weaponDetail.type === 'R' ? 'ranged' : 'melee') as 'melee' | 'ranged',
    properties: normalizedProperties,
    magicBonus: 0, // Slice B: magic bonus deferred per design
    damageDice: weaponDetail.dmg1 ?? '1',
    damageType: weaponDetail.dmgType ?? 'untyped',
  };

  const proficiencyBonus = sheet.proficiencyBonus;

  return {
    ok: true,
    charId,
    attackerCharacterId: characterId,
    ctx,
    registry,
    strMod,
    dexMod,
    wisMod,
    proficiencyBonus,
    isProficient,
    monkLevel,
    kiUsedBefore,
    weapon,
  };
}
