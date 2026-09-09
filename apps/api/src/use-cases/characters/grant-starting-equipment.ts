/**
 * grant-starting-equipment use-case (ADR-5, REQ-SEQUIP-04, REQ-SEQUIP-05).
 *
 * Loads class + background JSONB from compendium, calls the domain parser +
 * resolver, then writes inventory + currency + startingEquipmentGranted in a
 * single atomic UPDATE.
 *
 * Idempotency: if character.data.startingEquipmentGranted is already true,
 * returns { ok: true } without writing anything (REQ-SEQUIP-05).
 *
 * ctx used for addItemToInventory is minimal (strScore=10, no profs) — same
 * pattern as the DM grant/item endpoint (characters.ts:1487). Creation-time
 * grants bypass proficiency warnings.
 */

import { eq } from 'drizzle-orm';
import {
  parseClassStartingEquipment,
  parseBackgroundStartingEquipment,
  resolveStartingGrant,
  type ClassStartingEquipment,
  type BackgroundStartingEquipment,
  type EquipmentSelections,
} from '@dungeon-hub/domain/character/starting-equipment';
import {
  addItemToInventory,
  type InventoryItem,
  type ItemCompendiumLite,
} from '@dungeon-hub/domain/character/inventory';
import { db } from '../../infra/db/client.js';
import { characters, compendiumClasses, compendiumBackgrounds } from '../../infra/db/schema.js';
import { loadItemDataMany } from './load-item-data.js';
import { and } from 'drizzle-orm';

// ─── Result Types ─────────────────────────────────────────────────────────────

export type GrantStartingEquipmentIssue =
  | { code: 'CHARACTER_NOT_FOUND'; characterId: string }
  | { code: 'CLASS_DATA_MISSING'; characterId: string }
  | { code: 'CLASS_COMPENDIUM_NOT_FOUND'; classSlug: string; classSource: string }
  | { code: 'BACKGROUND_COMPENDIUM_NOT_FOUND'; backgroundSlug: string; backgroundSource: string }
  | { code: 'ITEM_NOT_FOUND'; slug: string; source: string }
  | { code: 'GOLD_VALUE_NEGATIVE'; got: number }
  | { code: string; [key: string]: unknown };

export type GrantStartingEquipmentResult =
  | { ok: true }
  | { ok: false; issues: GrantStartingEquipmentIssue[] };

// ─── Use-case ─────────────────────────────────────────────────────────────────

/**
 * Grant starting equipment to a character.
 *
 * @param characterId  - UUID of the character to grant equipment to
 * @param selections   - Player's selections (read from character.data.equipmentSelections
 *                       by the caller; also accepted inline for the POST body path)
 */
export async function grantStartingEquipment(
  characterId: string,
  selections: EquipmentSelections,
): Promise<GrantStartingEquipmentResult> {
  // 1. Load character
  const charRows = await db
    .select()
    .from(characters)
    .where(eq(characters.id, characterId))
    .limit(1);

  const character = charRows[0];
  if (!character) {
    return { ok: false, issues: [{ code: 'CHARACTER_NOT_FOUND', characterId }] };
  }

  const charData = (character.data as Record<string, unknown> | null) ?? {};

  // 2. Idempotency guard (REQ-SEQUIP-05)
  if (charData['startingEquipmentGranted'] === true) {
    return { ok: true };
  }

  // 3. Load class starting equipment JSONB
  const classEntry = (charData['classes'] as Array<{ slug: string; source: string }> | undefined)?.[0];
  if (!classEntry) {
    return { ok: false, issues: [{ code: 'CLASS_DATA_MISSING', characterId }] };
  }

  const classRows = await db
    .select({ data: compendiumClasses.data })
    .from(compendiumClasses)
    .where(
      and(
        eq(compendiumClasses.slug, classEntry.slug),
        eq(compendiumClasses.source, classEntry.source),
      ),
    )
    .limit(1);

  const classRow = classRows[0];
  if (!classRow) {
    return {
      ok: false,
      issues: [{ code: 'CLASS_COMPENDIUM_NOT_FOUND', classSlug: classEntry.slug, classSource: classEntry.source }],
    };
  }

  const classJsonb = classRow.data as Record<string, unknown>;
  const classStartingEquipment = classJsonb['startingEquipment'] as ClassStartingEquipment | undefined;
  // If no startingEquipment in JSONB, treat as empty — some classes may not have it
  const parsedClass = classStartingEquipment
    ? parseClassStartingEquipment(classStartingEquipment)
    : { fixedItems: [], choiceRows: [], goldAlternative: null };

  // 4. Load background starting equipment JSONB
  const bgEntry = (charData['background'] as { slug: string; source: string } | undefined);
  let parsedBackground = { fixedItems: [] as ReturnType<typeof parseBackgroundStartingEquipment>['fixedItems'], choiceRows: [] as ReturnType<typeof parseBackgroundStartingEquipment>['choiceRows'], currency: 0, specialItems: [] as string[] };

  if (bgEntry) {
    const bgRows = await db
      .select({ data: compendiumBackgrounds.data })
      .from(compendiumBackgrounds)
      .where(
        and(
          eq(compendiumBackgrounds.slug, bgEntry.slug),
          eq(compendiumBackgrounds.source, bgEntry.source),
        ),
      )
      .limit(1);

    const bgRow = bgRows[0];
    if (!bgRow) {
      return {
        ok: false,
        issues: [{ code: 'BACKGROUND_COMPENDIUM_NOT_FOUND', backgroundSlug: bgEntry.slug, backgroundSource: bgEntry.source }],
      };
    }

    const bgJsonb = bgRow.data as Record<string, unknown>;
    const bgStartingEquipment = bgJsonb['startingEquipment'] as BackgroundStartingEquipment | undefined;
    if (bgStartingEquipment) {
      parsedBackground = parseBackgroundStartingEquipment(bgStartingEquipment);
    }
  }

  // 5. Resolve grant (pure domain call)
  const resolved = resolveStartingGrant(parsedClass, parsedBackground, selections);
  if (!resolved.ok) {
    return { ok: false, issues: resolved.issues };
  }

  const { items: grantSpecs, currency: grantCurrency } = resolved;

  // 6. Build inventory via addItemToInventory for each GrantSpec
  const existingInventory = (character.inventory as InventoryItem[] | null) ?? [];
  const ctx = { strScore: 10, armorProficiencies: [] as string[], weaponProficiencies: [] as string[] };

  // Pre-load all item data in one batch (existing + new grants)
  const allRefs = [
    ...existingInventory.map((it) => ({ slug: it.itemSlug, source: it.itemSource })),
    ...grantSpecs.map((g) => ({ slug: g.slug, source: g.source })),
  ];

  const dedupedRefs = Array.from(
    new Map(allRefs.map((r) => [`${r.slug}|${r.source}`, r])).values(),
  );

  const allItemData = await loadItemDataMany(dedupedRefs);
  const itemDataMap = new Map<string, ItemCompendiumLite>(
    allItemData.map((d) => [`${d.slug}|${d.source}`, d]),
  );

  let inventoryAfter = existingInventory;
  for (const grant of grantSpecs) {
    const key = `${grant.slug}|${grant.source}`;
    const itemData = itemDataMap.get(key);
    if (!itemData) {
      // Item not found in compendium — skip gracefully (defensive; verified slugs exist in Batch 0)
      continue;
    }

    const result = addItemToInventory({
      inventory: inventoryAfter,
      itemData,
      input: {
        quantity: grant.quantity,
        state: 'carried',
        attuned: false,
      },
      weights: allItemData,
      ctx,
    });

    if (result.ok) {
      inventoryAfter = result.inventory;
    }
    // Non-ok (e.g. encumbrance warning) is silently swallowed — creation-time bypass
  }

  // 7. Merge currency additively into existing data.currency (ADR-5)
  const existingCurrency = (charData['currency'] as Record<string, number> | undefined) ?? {};
  const mergedCurrency: Record<string, number> = { ...existingCurrency };
  for (const [coin, amount] of Object.entries(grantCurrency)) {
    mergedCurrency[coin] = (mergedCurrency[coin] ?? 0) + (amount as number);
  }

  // 8. Atomic single UPDATE: inventory + data.currency + data.startingEquipmentGranted
  await db
    .update(characters)
    .set({
      inventory: inventoryAfter,
      data: {
        ...charData,
        currency: mergedCurrency,
        startingEquipmentGranted: true,
      },
      updatedAt: new Date(),
    })
    .where(eq(characters.id, characterId));

  return { ok: true };
}
