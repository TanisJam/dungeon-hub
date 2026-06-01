/**
 * Parsers for 5etools `startingEquipment.defaultData` and background
 * `startingEquipment` arrays into render-ready models.
 *
 * REQ-SEQUIP-01: parseClassStartingEquipment — class defaultData → ParsedClassEquipment
 * REQ-SEQUIP-02: parseBackgroundStartingEquipment — background equipment → ParsedBackgroundEquipment
 *
 * PHB citations:
 * - Class equipment choices: PHB p.46–120 (per-class Equipment sidebars)
 * - Fighter: PHB p.70
 * - Wizard: PHB p.112
 * - Cleric: PHB p.57
 * - goldAlternative: PHB p.143
 * - Background equipment: PHB p.125–141
 * - Acolyte: PHB p.127
 *
 * XPHB exclusion: uppercase slot keys (A, B) appear in 5etools XPHB rows.
 * These MUST be ignored — only lowercase a, b, c, _ are PHB slots.
 */

import { parseItemRef, slugify } from '../../compendium/slugify.js';
import type {
  BackgroundStartingEquipment,
  ClassStartingEquipment,
  EquipmentType,
  ItemRef,
} from './shape.js';

// ─── Parsed Ref Types ─────────────────────────────────────────────────────────

/**
 * A resolved item ref from a slug-bearing ItemRef variant.
 * The resolver uses slug + source to look up the item. displayName is kept
 * for rendering only (ADR-7 — NEVER used for slug resolution).
 */
export interface ParsedItemGrant {
  slug: string;
  source: string;
  quantity: number;
  /** Render override from 5etools `displayName` field. Not used for slug. */
  displayName?: string;
}

/**
 * A category ref — resolved by a picker hitting GET /compendium/items?category=…
 */
export interface ParsedCategoryRef {
  equipmentType: EquipmentType;
  quantity: number;
}

/**
 * A "special" item with no slug — displayed read-only, never granted (ADR-7).
 * quantity is omitted when not present (exactOptionalPropertyTypes: true).
 */
export interface ParsedSpecialRef {
  special: string;
  quantity?: number | undefined;
}

/** Union of all ref types that can appear in a parsed option's refs array. */
export type ParsedRef = ParsedItemGrant | ParsedCategoryRef | ParsedSpecialRef;

/**
 * A single parsed option within a choice row.
 * slot: 'a' | 'b' | 'c'
 */
export interface ParsedOption {
  slot: 'a' | 'b' | 'c';
  refs: ParsedRef[];
}

/**
 * A fully parsed choice row — always has at least one option.
 */
export interface ParsedChoiceRow {
  options: ParsedOption[];
}

// ─── Parsed Model Types ───────────────────────────────────────────────────────

/**
 * Render-ready model produced by parseClassStartingEquipment.
 */
export interface ParsedClassEquipment {
  /** Items always granted (from _ slots across all rows). */
  fixedItems: ParsedRef[];
  /** Rows with player choices (a/b/c options). Pure-_ rows are NOT included here. */
  choiceRows: ParsedChoiceRow[];
  /**
   * Parsed gold alternative — present when the class offers a gold-for-equipment
   * option (PHB p.143). The dice expression is extracted from the {@dice …} wrapper.
   * null when the class provides no gold alternative.
   */
  goldAlternative: { dice: string } | null;
}

/**
 * Render-ready model produced by parseBackgroundStartingEquipment.
 */
export interface ParsedBackgroundEquipment {
  /** Fixed items from _ slots (always granted). */
  fixedItems: ParsedRef[];
  /** Choice rows with a/b options (where present). */
  choiceRows: ParsedChoiceRow[];
  /**
   * Total copper from all containsValue entries.
   * 0 if no containsValue refs present.
   * 1500 cp = 15 gp (Acolyte pouch, PHB p.127).
   */
  currency: number;
  /**
   * Display-only special items (no slug, no inventory grant).
   * Includes all { special } refs encountered across all rows.
   */
  specialItems: string[];
}

// ─── Internal Helpers ─────────────────────────────────────────────────────────

/** PHB choice slot keys — lowercase only. Uppercase = XPHB, ignored. */
const PHB_CHOICE_SLOTS = ['a', 'b', 'c'] as const;
type PhbChoiceSlot = (typeof PHB_CHOICE_SLOTS)[number];

/**
 * Parse a single ItemRef into a ParsedRef.
 * Returns null for refs that should be silently skipped (none currently — all
 * variants produce output; special refs produce ParsedSpecialRef).
 */
function parseRef(ref: ItemRef): { parsed: ParsedRef; cpValue: number } {
  // Plain string: "name|SOURCE"
  if (typeof ref === 'string') {
    const { slug, source } = parseItemRef(ref);
    return { parsed: { slug, source, quantity: 1 }, cpValue: 0 };
  }

  // Special item — no slug, display only (ADR-7)
  // exactOptionalPropertyTypes: only include quantity when it's actually defined
  if ('special' in ref) {
    const special: ParsedSpecialRef =
      ref.quantity !== undefined
        ? { special: ref.special, quantity: ref.quantity }
        : { special: ref.special };
    return { parsed: special, cpValue: 0 };
  }

  // Category ref with optional quantity
  if ('equipmentType' in ref) {
    return {
      parsed: { equipmentType: ref.equipmentType, quantity: (ref as { equipmentType: EquipmentType; quantity?: number }).quantity ?? 1 },
      cpValue: 0,
    };
  }

  // item + containsValue — pouch is also granted as an item
  if ('containsValue' in ref) {
    const { slug, source } = parseItemRef(ref.item);
    return { parsed: { slug, source, quantity: 1 }, cpValue: ref.containsValue };
  }

  // item + displayName (ADR-7: use item for slug, keep displayName for render)
  if ('displayName' in ref) {
    const { slug, source } = parseItemRef(ref.item);
    return { parsed: { slug, source, quantity: 1, displayName: ref.displayName }, cpValue: 0 };
  }

  // item + quantity
  if ('quantity' in ref) {
    const { slug, source } = parseItemRef(ref.item);
    return { parsed: { slug, source, quantity: ref.quantity }, cpValue: 0 };
  }

  // Fallback — plain item ref object with just 'item'
  // (shouldn't happen per the union, but be defensive)
  const { slug, source } = parseItemRef((ref as { item: string }).item);
  return { parsed: { slug, source, quantity: 1 }, cpValue: 0 };
}

/**
 * Parse an array of ItemRef values into ParsedRef array + accumulated cp.
 */
function parseRefs(refs: readonly ItemRef[]): { parsed: ParsedRef[]; totalCp: number } {
  let totalCp = 0;
  const parsed: ParsedRef[] = [];
  for (const ref of refs) {
    const { parsed: p, cpValue } = parseRef(ref);
    parsed.push(p);
    totalCp += cpValue;
  }
  return { parsed, totalCp };
}

/**
 * Extract the dice expression from a 5etools {@dice …} wrapper.
 *
 * The actual format (verified from class-fighter.json) is:
 *   "{@dice 5d4 × 10|5d4 × 10|Starting Gold}"
 *
 * The canonical dice expr is the FIRST pipe-segment after "@dice ".
 * We extract it as-is: "5d4 × 10".
 */
function parseGoldAlternative(raw: string | undefined): { dice: string } | null {
  if (!raw) return null;
  // Match {@dice <expr>...} — capture everything after "@dice " up to first | or }
  const match = raw.match(/\{@dice ([^|}]+)/);
  if (!match || !match[1]) return null;
  return { dice: match[1].trim() };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Parse a class's `startingEquipment` object into a render-ready model.
 *
 * REQ-SEQUIP-01 (PHB p.46–120):
 * - _ slots → fixedItems (always granted)
 * - a/b/c slots → choiceRows (player picks one per row)
 * - Rows with only a _ slot and no a/b/c → items go to fixedItems only (no choiceRow entry)
 * - Uppercase slot keys (XPHB) are ignored
 * - goldAlternative {@dice XdY × Z} → parsed to { dice: "XdY × Z" }
 */
export function parseClassStartingEquipment(
  classEquipment: ClassStartingEquipment,
): ParsedClassEquipment {
  const fixedItems: ParsedRef[] = [];
  const choiceRows: ParsedChoiceRow[] = [];

  for (const row of classEquipment.defaultData) {
    // Collect fixed items from _ slot
    if (row._ && row._.length > 0) {
      const { parsed } = parseRefs(row._);
      fixedItems.push(...parsed);
    }

    // Collect choice options from lowercase a/b/c slots only
    const options: ParsedOption[] = [];
    for (const slot of PHB_CHOICE_SLOTS) {
      const slotRefs = row[slot];
      if (slotRefs && slotRefs.length > 0) {
        const { parsed } = parseRefs(slotRefs);
        options.push({ slot, refs: parsed });
      }
    }

    // Only create a choiceRow if there are actual choices (a/b/c)
    if (options.length > 0) {
      choiceRows.push({ options });
    }
  }

  return {
    fixedItems,
    choiceRows,
    goldAlternative: parseGoldAlternative(classEquipment.goldAlternative),
  };
}

/**
 * Parse a background's `startingEquipment` array into a render-ready model.
 *
 * REQ-SEQUIP-02 (PHB p.125–141):
 * - _ slots → fixedItems
 * - a/b slots → choiceRows
 * - { containsValue: N } → currency (copper) accumulated; item still granted
 * - { special } refs → specialItems (never slugified or granted)
 */
export function parseBackgroundStartingEquipment(
  startingEquipment: BackgroundStartingEquipment,
): ParsedBackgroundEquipment {
  const fixedItems: ParsedRef[] = [];
  const choiceRows: ParsedChoiceRow[] = [];
  let currency = 0;
  const specialItems: string[] = [];

  for (const row of startingEquipment) {
    // Process _ (fixed) items
    if (row._ && row._.length > 0) {
      for (const ref of row._) {
        // Track currency separately
        if (typeof ref !== 'string' && 'containsValue' in ref) {
          currency += ref.containsValue;
          // The pouch item is still granted as a fixed item
          const { slug, source } = parseItemRef(ref.item);
          fixedItems.push({ slug, source, quantity: 1 });
          continue;
        }
        // Special items go to specialItems array only (ADR-7)
        if (typeof ref !== 'string' && 'special' in ref) {
          specialItems.push(ref.special);
          continue;
        }
        const { parsed } = parseRef(ref);
        fixedItems.push(parsed);
      }
    }

    // Process choice slots a/b/c
    const options: ParsedOption[] = [];
    for (const slot of PHB_CHOICE_SLOTS) {
      const slotRefs = row[slot];
      if (slotRefs && slotRefs.length > 0) {
        const slotParsed: ParsedRef[] = [];
        for (const ref of slotRefs) {
          // Special items within choice options — exactOptionalPropertyTypes safe
          if (typeof ref !== 'string' && 'special' in ref) {
            const specialRef: ParsedSpecialRef =
              ref.quantity !== undefined
                ? { special: ref.special, quantity: ref.quantity }
                : { special: ref.special };
            slotParsed.push(specialRef);
            continue;
          }
          if (typeof ref !== 'string' && 'containsValue' in ref) {
            currency += ref.containsValue;
            const { slug, source } = parseItemRef(ref.item);
            slotParsed.push({ slug, source, quantity: 1 });
            continue;
          }
          const { parsed } = parseRef(ref);
          slotParsed.push(parsed);
        }
        if (slotParsed.length > 0) {
          options.push({ slot, refs: slotParsed });
        }
      }
    }

    if (options.length > 0) {
      choiceRows.push({ options });
    }
  }

  return { fixedItems, choiceRows, currency, specialItems };
}
