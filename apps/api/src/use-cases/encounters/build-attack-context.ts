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
import { characters, encounterCombatantConditions, encounterCombatantEffects } from '../../infra/db/schema.js';
import {
  createInMemoryRegistry,
  buildSneakAttackRider,
  buildHexRider,
  buildStunnedModifiers,
  STUNNED_CONDITION_DEF,
  buildBlindedModifiers,
  BLINDED_CONDITION_DEF,
  buildInvisibleModifiers,
  INVISIBLE_CONDITION_DEF,
  buildPoisonedModifiers,
  POISONED_CONDITION_DEF,
  buildPetrifiedModifiers,
  PETRIFIED_CONDITION_DEF,
  compileRule,
  rageRuleDoc,
  recklessAttackRuleDoc,
  type ModifierRegistry,
  type EvaluationContext,
} from '@dungeon-hub/domain/engine';
import { selectAttackAbilityKind } from '@dungeon-hub/domain/character/weapon';
import type { AppliedClass } from '@dungeon-hub/domain/character/class';
import { isWeaponProficient } from '@dungeon-hub/domain/character/inventory';
import { computeCharacterSheet } from '@dungeon-hub/domain/character/sheet';
import { abilityModifier } from '@dungeon-hub/domain/character/multiclass';
import { computeSpellSlots } from '@dungeon-hub/domain/character/spellcasting';
import type { SpellSlots } from '@dungeon-hub/domain/character/spellcasting';
import type { EntityId } from '@dungeon-hub/domain/engine';
import { deriveCharacterModifiers } from '../characters/derive-character-modifiers.js';
import { loadPersistedModifiers } from '../characters/load-persisted-modifiers.js';
import { loadModifierDefinitions } from '../characters/load-modifier-definitions.js';
import { loadItemDataDetailMany } from '../characters/load-item-data.js';
import type { InventoryItem } from '@dungeon-hub/domain/character/inventory';

// ── Module-scope compiled rules ────────────────────────────────────────────────

// Compiled once at module scope — pure/no-IO. .build() called per request (ADR-3).
// PHB p.48 — rageRuleDoc encodes the full Rage modifier set (7 emits).
const compiledRage = compileRule(rageRuleDoc);

// PHB p.48 — recklessAttackRuleDoc: grant (self STR melee) + impose (attackers-of).
// Registered when attacker has 'RecklessAttacking' condition (REQ-RECKLESS-01/02).
const compiledReckless = compileRule(recklessAttackRuleDoc);

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
      /**
       * Paladin class level (0 if not a Paladin).
       * PHB p.85: Divine Smite is available "Starting at 2nd level".
       * engine-divine-smite — ADR-5.
       */
      paladinLevel: number;
      /**
       * Max spell slots per level (9-tuple from computeSpellSlots).
       * Server-derived — no client trust for slot ceiling. engine-divine-smite — ADR-5.
       */
      attackerSlotsMax: SpellSlots;
      /**
       * Spell slots already used per level (9-tuple, index 0 = level 1).
       * Read-tolerance: absent in legacy rows → defaults to all-zeros (CLAUDE.md §11).
       * engine-divine-smite — ADR-5.
       */
      attackerSlotsUsed: readonly number[];
      /** Weapon stats for resolveWeaponAttack. */
      weapon: {
        kind: 'melee' | 'ranged';
        properties: string[];
        magicBonus: number;
        damageDice: string;
        damageType: string;
      };
      /**
       * Attacker's class array (slug + level).
       * engine-action-economy: used by extraAttacksPerAction to compute the Attack action
       * allowance (REQ-AE-08, PHB p.198). Exposed here to avoid a second DB query.
       */
      classes: AppliedClass[];
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

  // ── Step 10c: Load active effects on the TARGET (REQ-CEF-05) ────────────────
  // Target-only: hasEffectFromSelf reads only the target's effects. Read-tolerant —
  // zero-row targets → empty array → predicate returns false (CLAUDE.md §11).
  // source_combatant_id is a COMBATANT UUID — compare against attackerCombatantId,
  // NOT against charId (which is the CHARACTER EntityId — a distinct namespace).
  // ADR-3 identity-space warning: DO NOT confuse attackerId (combatant UUID) with charId.
  const effectRows = await db
    .select({
      effectName: encounterCombatantEffects.effectName,
      sourceCombatantId: encounterCombatantEffects.sourceCombatantId,
    })
    .from(encounterCombatantEffects)
    .where(eq(encounterCombatantEffects.combatantId, targetId));

  const targetCombatantEffects = effectRows.map((r) => ({
    effectName: r.effectName,
    sourceCombatantId: r.sourceCombatantId,
  }));

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
    // attackerCombatantId: the COMBATANT UUID (encounter_combatants.id).
    // ⚠️ This is NOT charId (character EntityId) — different namespaces. ADR-3.
    attackerCombatantId: attackerId,
    ...(encounterRound !== undefined && encounterRound !== null
      ? { encounterRound }
      : {}),
    ...(runtimeDecisions !== undefined ? { runtimeDecisions } : {}),
    ...(targetCombatantEffects.length > 0 ? { targetCombatantEffects } : {}),
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

  // ── Step 11b-Hex: Hex on-hit necrotic rider (PHB p.251) ──────────────────────
  // Unconditional registration — hasEffectFromSelf('Hex') predicate gates firing.
  // Hex is a spell-on-target, not a class feature → no caster-class guard.
  // ctx.attackerCombatantId + ctx.targetCombatantEffects (Slice A threading) are
  // populated above (L283 + L288) before the ON_HIT phase queries the registry.
  for (const m of buildHexRider(charId, targetId as EntityId)) {
    registry.register(m);
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

  // ── Blinded target: outgoing attackers-of grant + attacker self-impose ────────
  // PHB p.290: "Attack rolls against the [Blinded] creature have advantage."
  //            "The creature's attack rolls have disadvantage."
  // Outgoing mods bind to targetId (attackers-of axis).
  // Attacker self-impose binds to charId (self axis).
  if (targetConditions.some((c) => c.name === 'Blinded')) {
    const blindedTargetResult = buildBlindedModifiers(
      targetId as import('@dungeon-hub/domain/engine').EntityId,
      (name) => {
        if (name === 'Blinded') return BLINDED_CONDITION_DEF;
        return null;
      },
    );
    if (blindedTargetResult.ok) {
      for (const m of blindedTargetResult.instances) {
        registry.register(m);
      }
    }
  }
  if (attackerConditions.some((c) => c.name === 'Blinded')) {
    const blindedAttackerResult = buildBlindedModifiers(
      charId,
      (name) => {
        if (name === 'Blinded') return BLINDED_CONDITION_DEF;
        return null;
      },
    );
    if (blindedAttackerResult.ok) {
      for (const m of blindedAttackerResult.instances) {
        registry.register(m);
      }
    }
  }

  // ── Invisible target: outgoing attackers-of impose + attacker self-grant ───────
  // PHB p.291: "Attack rolls against the [Invisible] creature have disadvantage."
  //            "The creature's attack rolls have advantage."
  // Outgoing mods bind to targetId; attacker self-grant binds to charId.
  if (targetConditions.some((c) => c.name === 'Invisible')) {
    const invisibleTargetResult = buildInvisibleModifiers(
      targetId as import('@dungeon-hub/domain/engine').EntityId,
      (name) => {
        if (name === 'Invisible') return INVISIBLE_CONDITION_DEF;
        return null;
      },
    );
    if (invisibleTargetResult.ok) {
      for (const m of invisibleTargetResult.instances) {
        registry.register(m);
      }
    }
  }
  if (attackerConditions.some((c) => c.name === 'Invisible')) {
    const invisibleAttackerResult = buildInvisibleModifiers(
      charId,
      (name) => {
        if (name === 'Invisible') return INVISIBLE_CONDITION_DEF;
        return null;
      },
    );
    if (invisibleAttackerResult.ok) {
      for (const m of invisibleAttackerResult.instances) {
        registry.register(m);
      }
    }
  }

  // ── Poisoned attacker: self-impose on attacks + ability checks ────────────────
  // PHB p.292: "A poisoned creature has disadvantage on attack rolls and ability checks."
  // Self mods only — no outgoing effect on target. Bind to charId (self axis).
  if (attackerConditions.some((c) => c.name === 'Poisoned')) {
    const poisonedResult = buildPoisonedModifiers(
      charId,
      (name) => {
        if (name === 'Poisoned') return POISONED_CONDITION_DEF;
        return null;
      },
    );
    if (poisonedResult.ok) {
      for (const m of poisonedResult.instances) {
        registry.register(m);
      }
    }
  }

  // ── Petrified target: outgoing attackers-of advantage grant ──────────────────
  // PHB p.291: "Attack rolls against the creature have advantage."
  // UNCONDITIONAL (alwaysTrue predicate) — mirrors Stunned branch above.
  // instances from buildPetrifiedModifiers register the advantage grant in the
  // registry so resolveRollMode sees it (attacker-centric registry path).
  // resistMods are NOT registered here — they are consumed by resolveResistance
  // via loadTargetResistMods (helper path — ADR-5 split return).
  if (targetConditions.some((c) => c.name === 'Petrified')) {
    const petrifiedResult = buildPetrifiedModifiers(
      targetId as import('@dungeon-hub/domain/engine').EntityId,
      (name) => {
        if (name === 'Petrified') return PETRIFIED_CONDITION_DEF;
        return null;
      },
    );
    if (petrifiedResult.ok) {
      for (const m of petrifiedResult.instances) {
        registry.register(m);
      }
    }
  }

  // ── Raging attacker: STR-check + STR-save advantage + melee-STR damage bonus ──
  // PHB p.48: "You have advantage on Strength checks and Strength saving throws."
  //           "+[rage damage] to melee weapon attacks using Strength."
  // instances[] → 2× self AdvantageMod (STR-check + STR-save) → registry (pre-roll).
  // numMod → rage damage bonus; STR-usage now gated via usesAbility:str predicate (Batch 2).
  // ADR-5 resolved: attackUsesStr guard removed; predicate path gates at evaluation time.
  // Deferred to after Step 12 because strMod/dexMod are needed for abilityUsed threading.
  const attackerIsRaging = attackerConditions.some((c) => c.name === 'Raging');
  const attackerIsReckless = attackerConditions.some((c) => c.name === 'RecklessAttacking');

  // ── Step 12: Resolve ability mods ─────────────────────────────────────────────
  const strScore = sheet.abilityScores.str?.score ?? 10;
  const dexScore = sheet.abilityScores.dex?.score ?? 10;
  const wisScore = sheet.abilityScores.wis?.score ?? 10;
  const strMod = abilityModifier(strScore);
  const dexMod = abilityModifier(dexScore);
  const wisMod = abilityModifier(wisScore);

  // ── Step 12a: Thread abilityUsed into ctx.weaponInUse (REQ-CTX-01) ──────────
  // selectAttackAbilityKind is the single source of truth for the finesse/thrown rule.
  // Must run AFTER strMod/dexMod (Step 12). Result is threaded into ctx.weaponInUse
  // via conditional object spread (exactOptionalPropertyTypes — never assign undefined).
  // The usesAbility WorldQuery predicate evaluator reads this field.
  // PHB p.147/194 — finesse: player picks; Slice B uses dexMod > strMod as favorable default.
  const weaponKindForAbility = (weaponDetail.type === 'R' ? 'ranged' : 'melee') as 'melee' | 'ranged';
  const abilityKind = selectAttackAbilityKind(strMod, dexMod, weaponKindForAbility, normalizedProperties);
  // exactOptionalPropertyTypes: use object spread to add abilityUsed; omit never undefined.
  ctx.weaponInUse = { ...ctx.weaponInUse!, abilityUsed: abilityKind };

  // ── Step 12b: Monk-specific context (Slice 3b-ii — ADR-1) ────────────────────
  // monkLevel: mirrors rogueLevel pattern (L243-245). 0 for non-Monks.
  // PHB p.78: ki pool max = Monk level (for L≥2; handled by MONK_KI_POINTS registry).
  const monkLevel = ((charData['classes'] as AppliedClass[] | undefined) ?? [])
    .filter((c) => c.slug === 'monk')
    .reduce((sum, c) => sum + c.level, 0);

  // kiUsedBefore: from already-loaded charData — NO new DB query.
  const classResourcesUsed = charData['classResourcesUsed'] as Record<string, number> | undefined;
  const kiUsedBefore: number = classResourcesUsed?.['monk:ki-points'] ?? 0;

  // ── Step 12c: Paladin-specific context (engine-divine-smite — ADR-5) ─────────
  // paladinLevel: mirrors monkLevel pattern. 0 for non-Paladins.
  // PHB p.85: Divine Smite available "Starting at 2nd level".
  const paladinLevel = ((charData['classes'] as AppliedClass[] | undefined) ?? [])
    .filter((c) => c.slug === 'paladin')
    .reduce((sum, c) => sum + c.level, 0);

  // attackerSlotsMax: derived from computeSpellSlots (pure, no IO — classes already loaded).
  // Server-side ceiling — no client trust for the slot ceiling (ADR-5, CLAUDE.md §1.2).
  const attackerSlotsMax: SpellSlots = computeSpellSlots(
    (charData['classes'] as AppliedClass[]) ?? [],
  ).slots;

  // attackerSlotsUsed: from already-loaded charData — NO new DB query.
  // Read-tolerance: absent in legacy rows → default to all-zeros (CLAUDE.md §11).
  const attackerSlotsUsed: readonly number[] =
    (charData['spellSlotsUsed'] as number[] | undefined) ?? [0, 0, 0, 0, 0, 0, 0, 0, 0];

  // ── Step 12d: Raging attacker modifier registration (engine-rage) ─────────────
  // Deferred here because strMod/dexMod are required for abilityUsed threading (Step 12a).
  // REQ-RAGE-04: STR-check + STR-save advantage self mods.
  // REQ-RAGE-05: rage damage bonus on melee-STR attacks.
  // REQ-RAGE-RETROFIT-01: STR-usage gate is now predicate-time (usesAbility:str on emit 6)
  //   instead of registration-time. The imperative attackUsesStr guard is DELETED.
  //   NumMod is registered UNCONDITIONALLY — the predicate on emit 6 blocks it for finesse-DEX.
  //   RAGE-R4 still passes via the predicate path (verified in T5.4).
  if (attackerIsRaging) {
    const barbarianLevel = ((charData['classes'] as AppliedClass[] | undefined) ?? [])
      .filter((c) => c.slug === 'barbarian')
      .reduce((sum, c) => sum + c.level, 0);

    // Level → rage bonus table (PHB p.48): +2 L1-8, +3 L9-15, +4 L16+.
    const level = barbarianLevel > 0 ? barbarianLevel : 1;
    const bonus = level >= 16 ? 4 : level >= 9 ? 3 : 2;

    // Build compiled rage instances. rageCount:1 is a documented dummy — UsageMod
    // evaluator not yet wired (Batch 2). compiledRage is module-scope (ADR-3).
    const rageInstances = compiledRage.build({ ragerId: charId as import('@dungeon-hub/domain/engine').EntityId, rageBonus: bonus, rageCount: 1 });

    // Register 2× self AdvantageMods (STR-check + STR-save). See ADR-6 comment:
    // STR-save advantage for forced-check path is handled separately in performForcedCheck.
    // Registering here makes them available for resolveRollMode on STR checks (PHB p.48).
    for (const i of rageInstances.filter((i) => i.def.kind === 'advantage')) {
      registry.register(i);
    }

    // Rage damage NumMod: register UNCONDITIONALLY.
    // PHB p.48: "+[rage bonus] to melee weapon attacks using Strength."
    // The usesAbility:str predicate on emit 6 gates at evaluation time — no registration guard.
    // ctx.weaponInUse.abilityUsed is now populated (Step 12a), so the predicate can evaluate.
    // kind==='resist' and kind==='usage' instances are NOT registered in the attack registry.
    for (const i of rageInstances.filter((i) => i.def.kind === 'num' && i.def.stat === 'damage')) {
      registry.register(i);
    }
  }

  // ── Step 12e: Reckless Attack registration (REQ-RECKLESS-01/02, PHB p.48) ─────
  // Register when attacker has 'RecklessAttacking' condition (CAS-inserted in perform-apply).
  // grant (self, STR melee) + impose (attackers-of, any ability) — no ctx.weaponInUse check here;
  // usesAbility:str predicate on the grant emit gates correctly at resolution time.
  // compiledReckless is module-scope (ADR-3 pattern — compiled once, .build() per request).
  if (attackerIsReckless) {
    const recklessInstances = compiledReckless.build({ recklessId: charId as import('@dungeon-hub/domain/engine').EntityId });
    for (const i of recklessInstances) {
      registry.register(i);
    }
  }

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
    paladinLevel,
    attackerSlotsMax,
    attackerSlotsUsed,
    weapon,
    // engine-action-economy: classes exposed for extraAttacksPerAction (REQ-AE-08).
    classes: (charData['classes'] as AppliedClass[] | undefined) ?? [],
  };
}
