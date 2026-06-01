/**
 * 5etools `startingEquipment.defaultData` shape — Bootstrap artifact (ADR-1).
 *
 * This file is the compiler-enforced documentation of the 5etools starting-equipment
 * data shape.  All domain code that reads `defaultData` imports its types from here.
 * Drift from the 5etools shape fails typecheck immediately.
 *
 * REQ-SEQUIP-00: Bootstrap pass documents the defaultData shape before any batch
 *               that reads it may start.
 *
 * --- DATA VERIFICATION RESULTS (Task 0.4 + 0.5, performed 2026-06-01) ---
 *
 * DB: compendium_items table, Supabase self-hosted on :5433.
 *
 * SLUG VERIFICATION (all PHB source, all present):
 *   chain-mail          ✅
 *   leather-armor       ✅  (NOT "leather" — the full slug is "leather-armor")
 *   longsword           ✅
 *   shortbow            ✅
 *   arrows-20           ✅  (the quantity-in-name gotcha — "arrows (20)" → "arrows-20")
 *   crossbow-bolts-20   ✅  (companion to arrows)
 *   crossbow-bolt       ✅  (single bolt row also exists)
 *   component-pouch     ✅
 *   holy-symbol         ✅
 *   spellbook           ✅
 *   dungeoneers-pack    ✅
 *   explorers-pack      ✅
 *
 * weaponCategory JSONB QUERYABILITY (ADR-4, Risk R5):
 *   Field:  data->>'weaponCategory'
 *   Values: 'martial' | 'simple'  — queryable for all PHB weapon rows.
 *   Requires JSONB predicate (no dedicated column); accepted V1 tradeoff.
 *   Column `type` is a first-class column: type='M' (melee), type='R' (ranged).
 *   Verified working query: WHERE data->>'weaponCategory'='martial' AND type='M'
 *
 * scfType QUERYABILITY (ADR-4, Risk R1 — CONFIRMED SAFE):
 *   Field:   data->>'scfType'
 *   PHB arcane focus rows (crystal, arcane-focus, orb, rod, staff, wand):    scfType = 'arcane'
 *   PHB holy symbol rows (amulet, emblem, holy-symbol, reliquary):            scfType = 'holy'
 *   PHB druidic focus rows (druidic-focus, sprig-of-mistletoe, totem, etc.): scfType = 'druid'
 *   Risk R1 is RESOLVED: scfType is queryable for all PHB focus rows.
 *   TCE/FTD rows carry type='SCF' but NULL scfType — excluded by rules-profile filter anyway.
 *
 * instrumentMusical QUERYABILITY:
 *   Field: type column = 'INS'
 *   PHB rows: bagpipes, drum, dulcimer, flute, horn, lute, lyre,
 *             musical-instrument, pan-flute, shawm, viol  — all present.
 *
 * --- SLUG NORMALISATION RULES ---
 *
 * The `slugify()` function in `packages/domain/src/compendium/slugify.ts` is the
 * canonical formula.  It MUST match `packages/compendium-import/src/normalize.ts`
 * slugify byte-for-byte.  Formula:
 *   1. lowercase  2. NFD + strip accents  3. remove apostrophes
 *   4. non-alphanum → hyphen  5. trim leading/trailing hyphens
 *
 * `parseItemRef("name|SOURCE")` splits on first pipe, slugifies name, uppercases source.
 * ALWAYS use the `item` field for the slug; `displayName` is render-only (ADR-7).
 *
 * --- goldAlternative encoding ---
 *
 * 5etools encodes the gold alternative as:  "{@dice 5d4 × 10}"
 * (or "{@dice 4d4 × 10}" for Wizard, etc.)
 * The roll button calls `rollStartingGold(diceExpr, rng)` where diceExpr = "5d4 × 10".
 * The multiplier is the integer after "×"; dice count and sides are XdY before it.
 *
 * --- containsValue ---
 *
 * `{ item: "pouch|phb", containsValue: 1500 }` means the pouch CONTAINS 1500 copper
 * pieces (= 15 gp).  Route to `currency.cp`, NOT to inventory.  (Acolyte background,
 * PHB p.127.)
 */

// ─── Item Ref Variants ────────────────────────────────────────────────────────

/**
 * A plain string item ref: `"name|SOURCE"` or just `"name"`.
 * Examples:  "chain mail|phb",  "spellbook|PHB",  "arrows (20)|phb"
 *
 * Parsed with `parseItemRef()` from `domain/compendium/slugify.ts`.
 */
export type ItemRefString = string;

/**
 * Item ref with an explicit quantity: `{ item: "name|SOURCE", quantity: N }`.
 * Example: `{ item: "handaxe|phb", quantity: 2 }`
 */
export interface ItemRefQuantity {
  item: string;
  quantity: number;
}

/**
 * Item ref with a display name override.
 * The `item` field holds the canonical ref for slug resolution;
 * `displayName` is rendered in the UI instead of the item name (ADR-7).
 * Example: `{ item: "holy-symbol|phb", displayName: "a gift when you entered the priesthood" }`
 */
export interface ItemRefDisplayName {
  item: string;
  displayName: string;
}

/**
 * Category equipment ref: a slot that lets the player pick any item of a given
 * equipment type from the compendium (resolved via GET /compendium/items?category=…).
 * Example: `{ equipmentType: "weaponMartial" }`
 */
export interface ItemRefEquipmentType {
  equipmentType: EquipmentType;
}

/**
 * Category equipment ref with an explicit quantity.
 * Example: `{ equipmentType: "weaponSimple", quantity: 2 }`
 */
export interface ItemRefEquipmentTypeQuantity {
  equipmentType: EquipmentType;
  quantity: number;
}

/**
 * A "special" item that has no compendium slug — flavour/narrative only.
 * Displayed read-only in the UI; NEVER granted as an inventory item (V1 gap, ADR-7).
 * Examples: vestments, sticks of incense, prayer book, parchment.
 */
export interface ItemRefSpecial {
  special: string;
  quantity?: number;
}

/**
 * An item whose value (in copper) is deposited to `currency.cp` rather than
 * added as an inventory item.  The item itself is still granted if it has a slug.
 * `containsValue` = copper pieces (1500 cp = 15 gp).
 * Example: `{ item: "pouch|phb", containsValue: 1500 }`  (Acolyte, PHB p.127)
 */
export interface ItemRefContainsValue {
  item: string;
  containsValue: number;
}

/**
 * Union of all 7 item-ref variants that appear in 5etools `startingEquipment.defaultData`.
 *
 * Variant discrimination:
 *   - string                  → plain item ref ("name|SOURCE")
 *   - { item, quantity }      → item with count
 *   - { item, displayName }   → item with render label
 *   - { item, containsValue } → item + copper deposit
 *   - { equipmentType }       → category picker ref
 *   - { equipmentType, quantity } → category picker with count
 *   - { special }             → no-slug flavour item (display only)
 */
export type ItemRef =
  | ItemRefString
  | ItemRefQuantity
  | ItemRefDisplayName
  | ItemRefContainsValue
  | ItemRefEquipmentType
  | ItemRefEquipmentTypeQuantity
  | ItemRefSpecial;

// ─── EquipmentType ────────────────────────────────────────────────────────────

/**
 * The 8 equipment-type values that appear in 5etools `{ equipmentType }` refs.
 *
 * These drive the `category` query param on GET /compendium/items.
 * See `EQUIPMENT_TYPE_QUERY_MAP` below for the SQL predicate mapping.
 *
 * PHB sources:
 *   - Weapons: PHB p.149 (weapon categories), p.203 (equipment table)
 *   - Focuses:  PHB p.151 (arcane), p.150 (druidic), p.151 (holy symbol)
 *   - Instruments: PHB p.154
 */
export type EquipmentType =
  | 'weaponMartial'          // any martial weapon (melee or ranged)
  | 'weaponSimple'           // any simple weapon (melee or ranged)
  | 'weaponMartialMelee'     // martial melee weapon only
  | 'weaponSimpleMelee'      // simple melee weapon only
  | 'focusSpellcastingArcane'   // arcane spellcasting focus (PHB p.151)
  | 'focusSpellcastingHoly'     // holy symbol / reliquary (PHB p.151)
  | 'focusSpellcastingDruidic'  // druidic focus (PHB p.150)
  | 'instrumentMusical';        // musical instrument (PHB p.154)

// ─── EquipmentType → Compendium Query Mapping (ADR-4) ─────────────────────────

/**
 * SQL predicate descriptor for a compendium_items query.
 *
 * Applied on top of the rules-profile filter (PHB inclusion / XPHB+FTD exclusion).
 * All predicates operate on the `type` column or the `data` JSONB column.
 */
export interface EquipmentTypeQuerySpec {
  /**
   * SQL condition on the `type` column (first-class column, no JSONB needed).
   * e.g. `type IN ('M','R')` or `type = 'INS'` or `type = 'SCF'`
   */
  typeCondition: string;
  /**
   * Optional JSONB predicate on the `data` column.
   * e.g. `data->>'weaponCategory' = 'martial'`
   *
   * Absent for categories that are fully discriminated by `type` alone.
   */
  jsonbCondition?: string;
}

/**
 * Mapping from `EquipmentType` to SQL query predicates for GET /compendium/items.
 *
 * Implementation notes (ADR-4, verified 2026-06-01):
 *
 * - `weaponCategory` lives in JSONB `data`, NOT a column.
 *   Predicate: `data->>'weaponCategory' = 'martial'|'simple'`
 *   (confirmed against items-base.json:163 and live DB query)
 *
 * - `type` column: 'M' = melee, 'R' = ranged, 'INS' = instrument, 'SCF' = focus.
 *   First-class column; no JSONB needed.
 *
 * - `scfType` JSONB field discriminates focus subtypes: 'arcane'|'holy'|'druid'
 *   (confirmed all PHB focus rows carry the correct scfType — Risk R1 RESOLVED)
 *
 * - No column index on `weaponCategory` JSONB field; V1 accepts this (low
 *   cardinality, paginated endpoint).  TODO: add index in a follow-up.
 *
 * All categories pass through `profileFilterConditions(kind:'items')` which
 * already handles PHB inclusion / XPHB+FTD exclusion — do NOT add source
 * exclusion logic here.
 */
export const EQUIPMENT_TYPE_QUERY_MAP: Record<EquipmentType, EquipmentTypeQuerySpec> = {
  weaponMartial: {
    typeCondition: "type IN ('M','R')",
    jsonbCondition: "data->>'weaponCategory' = 'martial'",
  },
  weaponSimple: {
    typeCondition: "type IN ('M','R')",
    jsonbCondition: "data->>'weaponCategory' = 'simple'",
  },
  weaponMartialMelee: {
    typeCondition: "type = 'M'",
    jsonbCondition: "data->>'weaponCategory' = 'martial'",
  },
  weaponSimpleMelee: {
    typeCondition: "type = 'M'",
    jsonbCondition: "data->>'weaponCategory' = 'simple'",
  },
  focusSpellcastingArcane: {
    typeCondition: "type = 'SCF'",
    jsonbCondition: "data->>'scfType' = 'arcane'",
  },
  focusSpellcastingHoly: {
    typeCondition: "type = 'SCF'",
    jsonbCondition: "data->>'scfType' = 'holy'",
  },
  focusSpellcastingDruidic: {
    typeCondition: "type = 'SCF'",
    jsonbCondition: "data->>'scfType' = 'druid'",
  },
  instrumentMusical: {
    typeCondition: "type = 'INS'",
    // No JSONB condition needed — 'INS' type is exclusive to musical instruments
  },
};

// ─── Choice Row ───────────────────────────────────────────────────────────────

/**
 * A single "row" in `startingEquipment.defaultData`.
 *
 * PHB starting equipment is structured as a list of choice rows.
 * Each row has 1–3 options (slots `a`, `b`, `c`) plus an optional fixed
 * grant (`_` slot, always given regardless of choice).
 *
 * KEY RULES:
 * - Slots `a`, `b`, `c` and `_` are PHB (5etools source "phb" / "PHB").
 * - Uppercase slots `A`, `B` are XPHB (2024 Player's Handbook) — EXCLUDED.
 *   The parser MUST ignore uppercase slot keys.
 * - A row with no `a`/`b`/`c` slots but only `_` = fixed grant (e.g. Wizard spellbook).
 * - A row with `a`/`b` = binary choice (most classes).
 * - A row with `a`/`b`/`c` = ternary choice (e.g. Cleric armor row, PHB p.57).
 *
 * Examples from Fighter (PHB p.70):
 *   Row 0: { a: ["{chain mail|phb}"], b: ["{leather|phb}", "{longbow|phb}", "arrows (20)|phb"] }
 *   Row 1: { a: ["{equipmentType: weaponMartial}", "{shield|phb}"], b: ["{equipmentType: weaponMartial}", "{equipmentType: weaponMartial}"] }
 *   Row 2: { a: ["{light crossbow|phb}", "crossbow bolts (20)|phb"], b: ["{equipmentType: weaponSimple}"] }
 *   Row 3: { _: ["{dungeoneers-pack|phb}"], a: ["{dungeoneers-pack|phb}"] }
 *
 * goldAlternative (Fighter): "{@dice 5d4 × 10}" — parsed as diceExpr "5d4 × 10"
 */
export interface ChoiceRow {
  /** Always-granted items. Rendered read-only. */
  readonly _?: readonly ItemRef[];
  /** Option A (the first / default choice). */
  readonly a?: readonly ItemRef[];
  /** Option B. */
  readonly b?: readonly ItemRef[];
  /** Option C (present in ternary rows, e.g. Cleric armor). */
  readonly c?: readonly ItemRef[];
  // NOTE: uppercase A / B (XPHB) are intentionally NOT typed here — the
  // parser must skip any uppercase key it encounters in real data.
}

// ─── Class Starting Equipment ─────────────────────────────────────────────────

/**
 * The `startingEquipment` object on a 5etools class row.
 *
 * `defaultData` is the array of choice rows the parser reads.
 * `goldAlternative` is present on most martial/half-caster classes; absent on
 * some full casters (Wizard uses "4d4 × 10" in the PHB, PHB p.143).
 *
 * `additionalFromBackground: true` signals that background equipment is also
 * granted — this is always true for PHB classes (the parser handles it).
 */
export interface ClassStartingEquipment {
  /** The choice rows — array of ChoiceRow objects. */
  readonly defaultData: readonly ChoiceRow[];
  /**
   * Gold alternative for the class equipment package.
   * Format: `"{@dice XdY × Z}"` e.g. `"{@dice 5d4 × 10}"` (Fighter, PHB p.143).
   * Parsed to diceExpr `"5d4 × 10"` by stripping the `{@dice …}` wrapper.
   * Absent on classes without a gold option.
   */
  readonly goldAlternative?: string;
  /**
   * Some 5etools rows include a human-readable `default` string array (e.g.
   * ["(a) chain mail or (b) leather armor, longbow, and 20 arrows"]).
   * The parser IGNORES this — `defaultData` is authoritative.
   */
  readonly default?: readonly string[];
  /** True when background equipment is also included (always true for PHB). */
  readonly additionalFromBackground?: boolean;
}

// ─── Background Starting Equipment ───────────────────────────────────────────

/**
 * The `startingEquipment` field on a 5etools background row.
 *
 * Background starting equipment is an ARRAY of choice rows (same ChoiceRow shape
 * as class `defaultData`), NOT wrapped in an object.
 *
 * Examples from Acolyte (PHB p.127):
 *   [
 *     { _: ["holy symbol|phb", { special: "a prayer book or prayer wheel" }, ...] },
 *     { _: [{ item: "pouch|phb", containsValue: 1500 }] }
 *   ]
 *
 * The `containsValue: 1500` = 1500 cp (15 gp) — deposited to currency.cp (ADR-7).
 */
export type BackgroundStartingEquipment = readonly ChoiceRow[];

// ─── Grant Spec (output of resolve phase) ─────────────────────────────────────

/**
 * A single resolved item grant — output of `resolveStartingGrant`.
 * The use-case loads item data (weight, type) from DB by slug and calls
 * `addItemToInventory` per grant.  The resolver itself is pure and DB-free.
 */
export interface GrantSpec {
  /** Slugified item name, e.g. "chain-mail". */
  slug: string;
  /** Source key in uppercase, e.g. "PHB". */
  source: string;
  /** How many of this item to grant (default 1). */
  quantity: number;
}

// ─── Player Selections (persisted to character.data.equipmentSelections) ──────

/**
 * The player's equipment selections — stored in `character.data.equipmentSelections`
 * and round-tripped on wizard back-navigation (REQ-SEQUIP-10, ADR-6).
 *
 * Written by PUT /characters/:id/equipment-selections.
 * Read by POST /characters/:id/seed-equipment (use-case reads from stored state).
 */
export interface EquipmentSelections {
  /** "package" = grant equipment items; "gold" = deposit goldValue to currency. */
  classPath: 'package' | 'gold';
  /**
   * Gold value in gp — present when classPath === 'gold'.
   * Non-negative integer (validated by Zod on submit).
   * Rolled by rollStartingGold() on the client or entered manually.
   */
  goldValue?: number;
  /**
   * Chosen slot key per class choice-row index.
   * Key = row index (0-based); value = 'a' | 'b' | 'c'.
   */
  classRowChoices: Record<number, 'a' | 'b' | 'c'>;
  /**
   * Selected compendium item per class category-ref key.
   * Key = category-ref identifier (e.g. "row1-a-cat0"); value = parsed item ref.
   */
  classCategoryPicks: Record<string, { slug: string; source: string }>;
  /** Chosen slot key per background choice-row index. */
  backgroundRowChoices: Record<number, 'a' | 'b' | 'c'>;
  /** Selected compendium item per background category-ref key. */
  backgroundCategoryPicks: Record<string, { slug: string; source: string }>;
}
