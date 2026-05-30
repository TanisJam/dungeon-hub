/**
 * resolveTargetAc — use-case helper that resolves a combatant's Armor Class.
 *
 * Dispatches on combatant kind:
 *   NPC → reads `encounter_combatants.ac` column (NULL → NO_TARGET_AC).
 *   PC  → derives AC server-side using the same leaf loaders as the character-sheet route.
 *
 * Design ref: sdd/engine-to-hit-ac/design — ADR-2.
 *
 * LAYERING: performs IO → lives in use-case layer, NOT domain (PHB: domain is pure).
 * NOT placed inside buildAttackContext (that is intentionally attacker-only).
 *
 * PHB p.14 — Armor Class: "Your Armor Class (AC) represents how well your character
 *   avoids being wounded in battle."
 * PHB p.144 — Armor and Shields: "Without armor, a character's AC equals 10 + Dex modifier."
 *
 * REQ-AC-RESOLVE-01: NPC path — ac column (null → NO_TARGET_AC).
 * REQ-AC-RESOLVE-02: PC path — derived server-side via leaf loaders + deriveArmorClassModifiers.
 * REQ-AC-RESOLVE-03: lives in use-case layer.
 * REQ-AC-RESOLVE-04: null ac returns typed error, never throws.
 */

import { eq } from 'drizzle-orm';
import { db } from '../../infra/db/client.js';
import { characters } from '../../infra/db/schema.js';
import {
  createInMemoryRegistry,
  resolveStat,
  deriveArmorClassModifiers,
  type EvaluationContext,
  type EntityId,
} from '@dungeon-hub/domain/engine';
import type { InventoryItem } from '@dungeon-hub/domain/character/inventory';
import { loadItemDataMany } from '../characters/load-item-data.js';
import { loadModifierDefinitions } from '../characters/load-modifier-definitions.js';
import { loadPersistedModifiers } from '../characters/load-persisted-modifiers.js';
import { deriveCharacterModifiers } from '../characters/derive-character-modifiers.js';

// ── Result union ───────────────────────────────────────────────────────────────

export type ResolveTargetAcResult =
  | { ok: true; ac: number }
  | { ok: false; code: 'NO_TARGET_AC' }            // NPC with null ac (legacy/unset)
  | { ok: false; code: 'NOT_FOUND'; target: 'character' };

// ── resolveTargetAc ────────────────────────────────────────────────────────────

/**
 * Resolves the target combatant's AC.
 *
 * NPC: reads the stored `ac` column. NULL → NO_TARGET_AC (no crash — REQ-AC-RESOLVE-04).
 * PC:  derives AC via the same leaf loaders used by GET /characters/:id/sheet
 *      (loadItemDataMany + loadModifierDefinitions + loadPersistedModifiers +
 *       deriveArmorClassModifiers + resolveStat). Mirrors characters.ts ~lines 909-946.
 *
 * ADR-2: PC path adds ~4 DB queries (char SELECT + item batch + modifier catalog +
 * persisted mods). Accepted for V1 correctness. Cloak of Protection (+1 AC) is
 * captured via loadPersistedModifiers.
 *
 * Shield/reactions are OUT of scope (no reaction bus until a later slice).
 */
export async function resolveTargetAc(target: {
  kind: 'pc' | 'npc';
  characterId: string | null;
  ac: number | null;
}): Promise<ResolveTargetAcResult> {
  // ── NPC path ─────────────────────────────────────────────────────────────────
  if (target.kind === 'npc') {
    if (target.ac === null) {
      // REQ-AC-RESOLVE-04: legacy row with null ac → typed error, no throw.
      return { ok: false, code: 'NO_TARGET_AC' };
    }
    return { ok: true, ac: target.ac };
  }

  // ── PC path ──────────────────────────────────────────────────────────────────
  // Derive AC server-side using the same leaf loaders as the character-sheet route.
  // REQ-AC-RESOLVE-02: 10-step flow from ADR-2.

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

  // Step 2: Build itemLites from loadItemDataMany batch (same key format as route).
  // PHB p.144: armor AC calculation requires knowing equipped armor properties.
  const itemLites: Record<string, import('@dungeon-hub/domain/character/inventory').ItemCompendiumLite> = {};
  if (inventory.length > 0) {
    const weights = await loadItemDataMany(
      inventory.map((it) => ({ slug: it.itemSlug, source: it.itemSource })),
    );
    for (const lite of weights) {
      itemLites[`${lite.slug}|${lite.source}`] = lite;
    }
  }

  // Step 3: Load modifier catalog and derive inventory mods (Cloak of Protection static AC, etc.).
  const modifierCatalog = await loadModifierDefinitions();
  const inventoryMods = deriveCharacterModifiers(inventory, charId, modifierCatalog);

  // Step 4: Build minimal EvaluationContext (no weaponInUse needed for AC resolution).
  const ctx: EvaluationContext = {
    self: { id: charId, conditions: [] },
    activeConditions: [],
  };

  // Step 5: Load persisted modifier_instances (captures Cloak of Protection +1 AC,
  // Bless, and any other persisted mods targeting this character).
  const persistedMods = await loadPersistedModifiers(characterId, ctx);

  // Step 6: Build registry and register inventory + persisted mods.
  const registry = createInMemoryRegistry();
  for (const m of inventoryMods) registry.register(m);
  for (const m of persistedMods) registry.register(m);

  // Step 7: Resolve ability scores (post-registry mods, mirrors route pattern).
  // PHB p.13: modifier = floor((score - 10) / 2).
  // ADR-2 GOTCHA: strScore stays as a SCORE (not mod) for armorStrengthMin comparison.
  const rawBaseStats = charData['baseStats'] as Record<string, number> | undefined;
  const baseFor = (a: string): number => rawBaseStats?.[a] ?? 10;

  const resolvedDexScore = resolveStat(charId, 'dex', baseFor('dex'), ctx, registry).value;
  const resolvedConScore = resolveStat(charId, 'con', baseFor('con'), ctx, registry).value;
  const resolvedWisScore = resolveStat(charId, 'wis', baseFor('wis'), ctx, registry).value;
  const resolvedStrScore = resolveStat(charId, 'str', baseFor('str'), ctx, registry).value;

  const resolvedMods = {
    str: Math.floor((resolvedStrScore - 10) / 2),
    dex: Math.floor((resolvedDexScore - 10) / 2),
    con: Math.floor((resolvedConScore - 10) / 2),
    wis: Math.floor((resolvedWisScore - 10) / 2),
  };

  // Step 8: Build classes for Unarmored Defense detection (Barbarian/Monk, PHB p.48/p.78).
  const rawClasses = (charData['classes'] as Array<{ slug: string; level: number }> | undefined) ?? [];
  const classes = rawClasses.map((c) => ({ classSlug: c.slug, level: c.level }));

  // Step 9: Derive AC NumMods via deriveArmorClassModifiers adapter and register them.
  // ADR-2: pass resolvedStrScore (SCORE, not mod) for armorStrengthMin comparison.
  // PHB p.144: heavy armor imposes disadvantage when STR score < minimum.
  const { mods: acMods } = deriveArmorClassModifiers(
    { inventory, itemLites, classes, resolvedMods, strScore: resolvedStrScore },
    charId,
  );
  for (const m of acMods) registry.register(m);

  // Step 10: Resolve final AC. Base = 0 (same as route — deriveArmorClassModifiers
  // emits all structural AC NumMods including base 10 + DEX).
  // PHB p.14: final AC = base armor + all modifiers.
  const ac = resolveStat(charId, 'ac', 0, ctx, registry).value;

  return { ok: true, ac };
}
