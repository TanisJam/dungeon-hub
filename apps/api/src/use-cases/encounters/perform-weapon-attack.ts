/**
 * perform-weapon-attack — Use-case for the engine action pipeline weapon attack route.
 *
 * Slice 1 (engine-action-pipeline SDD): Synchronous, read-only weapon attack resolver.
 * Loads all required data from DB, builds EvaluationContext + registry, calls the
 * pure domain resolveWeaponAttack function, and returns the result. NO DB writes.
 *
 * Design ref: sdd/engine-action-pipeline/design — ADR-9, data flow section.
 *
 * REQ-ATK-READONLY-01: zero DB writes. No HP mutation, no encounter version bump,
 * no encounter_actions row created.
 * REQ-ATK-NULLSAFE-01: returns typed error codes instead of throwing for missing data.
 * REQ-ATK-CTX-01: ctx populated from real encounter/character data.
 */
import { eq, and } from 'drizzle-orm';
import { db } from '../../infra/db/client.js';
import { encounters, encounterCombatants, characters } from '../../infra/db/schema.js';
import {
  resolveWeaponAttack,
  createInMemoryRegistry,
  type WeaponAttackResult,
} from '@dungeon-hub/domain/engine';
import { isWeaponProficient } from '@dungeon-hub/domain/character/inventory';
import { computeCharacterSheet } from '@dungeon-hub/domain/character/sheet';
import { abilityModifier } from '@dungeon-hub/domain/character/multiclass';
import type { EntityId, EvaluationContext } from '@dungeon-hub/domain/engine';
import { deriveCharacterModifiers } from '../characters/derive-character-modifiers.js';
import { loadPersistedModifiers } from '../characters/load-persisted-modifiers.js';
import { loadModifierDefinitions } from '../characters/load-modifier-definitions.js';
import { loadItemDataDetailMany } from '../characters/load-item-data.js';
import type { InventoryItem } from '@dungeon-hub/domain/character/inventory';

// ── Input / Output ─────────────────────────────────────────────────────────────

export interface PerformWeaponAttackInput {
  encounterId: string;
  attackerId: string;        // encounter_combatants.id (NOT character.id)
  targetId: string;          // encounter_combatants.id
  weaponInstanceId: string;  // inventory instance UUID
  activeConditions?: string[];
  /** User ID of the authenticated caller (for ownership + turn guard). */
  callerId: string;
}

export type PerformWeaponAttackResult =
  | { ok: true; toHit: WeaponAttackResult['toHit']; damage: WeaponAttackResult['damage']; rollMode: WeaponAttackResult['rollMode'] }
  | { ok: false; code: 'ENCOUNTER_NOT_ACTIVE' }
  | { ok: false; code: 'NOT_FOUND'; target: 'encounter' | 'attacker' | 'target' | 'weapon' | 'character' }
  | { ok: false; code: 'NOT_YOUR_TURN' }
  | { ok: false; code: 'FORBIDDEN' };

// ── perform-weapon-attack ──────────────────────────────────────────────────────

/**
 * Loads encounter + character + weapon + registry, calls resolveWeaponAttack, returns result.
 *
 * ADR-9 ownership guard: caller must own the attacker character. If attackerCombatant
 * is an NPC (characterId === null), only GM role passes (but full GM check is done at
 * the route layer; here we check ownership or null-characterId).
 *
 * NPC null safety: target.characterId may be null (NPC) — we only need EntityRef{id}
 * for ctx.target, no character load required for the target this slice.
 */
export async function performWeaponAttack(
  input: PerformWeaponAttackInput,
): Promise<PerformWeaponAttackResult> {
  const { encounterId, attackerId, targetId, weaponInstanceId, callerId } = input;

  // ── Step 1: Load encounter ────────────────────────────────────────────────────
  const [encounterRow] = await db
    .select()
    .from(encounters)
    .where(eq(encounters.id, encounterId))
    .limit(1);

  if (!encounterRow) return { ok: false, code: 'NOT_FOUND', target: 'encounter' };
  if (encounterRow.status !== 'active') return { ok: false, code: 'ENCOUNTER_NOT_ACTIVE' };

  // ── Step 2: Load attacker combatant ──────────────────────────────────────────
  const [attackerCombatant] = await db
    .select()
    .from(encounterCombatants)
    .where(and(eq(encounterCombatants.id, attackerId), eq(encounterCombatants.encounterId, encounterId)))
    .limit(1);

  if (!attackerCombatant) return { ok: false, code: 'NOT_FOUND', target: 'attacker' };

  // ── Step 3: Turn guard ────────────────────────────────────────────────────────
  if (encounterRow.currentCombatantId !== attackerId) {
    return { ok: false, code: 'NOT_YOUR_TURN' };
  }

  // ── Step 4: Load target combatant ────────────────────────────────────────────
  const [targetCombatant] = await db
    .select()
    .from(encounterCombatants)
    .where(and(eq(encounterCombatants.id, targetId), eq(encounterCombatants.encounterId, encounterId)))
    .limit(1);

  if (!targetCombatant) return { ok: false, code: 'NOT_FOUND', target: 'target' };

  // ── Step 5: Ownership guard ───────────────────────────────────────────────────
  // NPC combatants have characterId === null — ownership check skipped (GM-only
  // is enforced at route layer via memberRole check; this use-case only handles
  // PC ownership). If characterId is null, the route already blocked with 403.
  if (attackerCombatant.characterId !== null && attackerCombatant.characterId !== undefined) {
    // Load the character to verify ownership
    const [charRow] = await db
      .select({ userId: characters.userId })
      .from(characters)
      .where(eq(characters.id, attackerCombatant.characterId))
      .limit(1);

    if (!charRow) return { ok: false, code: 'NOT_FOUND', target: 'character' };
    if (charRow.userId !== callerId) return { ok: false, code: 'FORBIDDEN' };
  }

  // ── Step 6: Load character sheet (proficiencies, ability mods, pb) ───────────
  // attackerCombatant.characterId is not null at this point (enforced above for PC).
  const characterId = attackerCombatant.characterId!;

  const [characterRow] = await db
    .select()
    .from(characters)
    .where(eq(characters.id, characterId))
    .limit(1);

  if (!characterRow) return { ok: false, code: 'NOT_FOUND', target: 'character' };

  const charData = (characterRow.data as Record<string, unknown>) ?? {};
  const inventory = (characterRow.inventory as InventoryItem[]) ?? [];

  // Build a minimal character shape for computeCharacterSheet.
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

  // ── Step 7: Find weapon in inventory ─────────────────────────────────────────
  const weaponInstance = inventory.find(
    (item) => item.instanceId === weaponInstanceId,
  );
  if (!weaponInstance) return { ok: false, code: 'NOT_FOUND', target: 'weapon' };

  // ── Step 8: Load weapon compendium data ───────────────────────────────────────
  const [weaponDetail] = await loadItemDataDetailMany([
    { slug: weaponInstance.itemSlug, source: weaponInstance.itemSource },
  ]);
  if (!weaponDetail) return { ok: false, code: 'NOT_FOUND', target: 'weapon' };

  // ── Step 9: Resolve proficiency ───────────────────────────────────────────────
  const isProficient = isWeaponProficient(
    sheet.proficiencies.weapons,
    { name: weaponDetail.name, slug: weaponDetail.slug },
  );

  // ── Step 10: Build EvaluationContext ──────────────────────────────────────────
  // exactOptionalPropertyTypes: conditional spread for all optional ctx fields.
  const ctx: EvaluationContext = {
    self: { id: charId, conditions: [] },
    activeConditions: [],
    target: { id: targetId as EntityId, conditions: [] },
    attacker: { id: charId, conditions: [] },
    weaponInUse: {
      kind: weaponDetail.type === 'R' ? 'ranged' : 'melee',
      properties: weaponDetail.property ?? [],
    },
    ...(encounterRow.round !== undefined && encounterRow.round !== null
      ? { encounterRound: encounterRow.round }
      : {}),
  };

  // ── Step 11: Build registry ───────────────────────────────────────────────────
  const modifierCatalog = await loadModifierDefinitions();
  const inventoryMods = deriveCharacterModifiers(inventory, charId, modifierCatalog);
  const persistedMods = await loadPersistedModifiers(characterId, ctx);
  const registry = createInMemoryRegistry();
  for (const m of inventoryMods) registry.register(m);
  for (const m of persistedMods) registry.register(m);

  // ── Step 12: Resolve ability mods ─────────────────────────────────────────────
  // Use sheet-sourced ability scores (may be engine-derived or legacy).
  // sheet.abilityScores contains the final scores including ASI modifiers.
  const strScore = sheet.abilityScores.str?.score ?? 10;
  const dexScore = sheet.abilityScores.dex?.score ?? 10;
  const strMod = abilityModifier(strScore);
  const dexMod = abilityModifier(dexScore);

  // ── Step 13: Call resolveWeaponAttack ─────────────────────────────────────────
  const result = resolveWeaponAttack({
    self: charId,
    ctx,
    registry,
    strMod,
    dexMod,
    proficiencyBonus: sheet.proficiencyBonus,
    isProficient,
    weapon: {
      kind: weaponDetail.type === 'R' ? 'ranged' : 'melee',
      properties: weaponDetail.property ?? [],
      magicBonus: 0, // Slice B: magic bonus deferred per design
      damageDice: weaponDetail.dmg1 ?? '1',
      damageType: weaponDetail.dmgType ?? 'untyped',
    },
  });

  return {
    ok: true,
    toHit: result.toHit,
    damage: result.damage,
    rollMode: result.rollMode,
  };
}
