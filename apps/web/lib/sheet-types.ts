/**
 * Web-side types for the character sheet page.
 * Mirrors the API response from GET /characters/:id/sheet.
 * The domain package is NOT a web dependency — these types are maintained manually.
 *
 * NOTE: domain IS actually a web dependency (package.json). Types here are mirrored
 * manually for explicit control and to avoid pulling the entire domain into client bundles.
 */

export type AbilityKey = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';

/**
 * Web-side mirror of domain ClassResource. R-07 — see
 * `packages/domain/src/character/class-resources/types.ts`.
 */
export interface ClassResourceView {
  slug: string;
  classSlug: string;
  used: number;
  max: number;
  recoveryTrigger: 'short' | 'long' | 'both';
  /**
   * Feature-specific metadata emitted by the domain when the registry def
   * declares an `extraFor` callback. Currently only Bardic Inspiration uses
   * this — see `isBardicInspirationExtra` below.
   */
  extra?: unknown;
}

/** Bardic Inspiration metadata shape — PHB p.54 Bard table. */
export interface BardicInspirationExtra {
  dieSize: 'd6' | 'd8' | 'd10' | 'd12';
}

/** Type guard for Bardic Inspiration extra payload. */
export function isBardicInspirationExtra(x: unknown): x is BardicInspirationExtra {
  if (typeof x !== 'object' || x === null) return false;
  const candidate = (x as { dieSize?: unknown }).dieSize;
  return candidate === 'd6' || candidate === 'd8' || candidate === 'd10' || candidate === 'd12';
}

/**
 * A descriptive racial trait surfaced on the sheet's "Rasgos raciales" card.
 * Mirrors domain RacialTrait. Populated by GET /characters/:id/sheet via
 * loadRaceSheetData + extractRacialTraits. Batch 8 — race-traits-on-sheet.
 */
export interface RacialTrait {
  /** Trait name (English, raw). */
  name: string;
  /**
   * Full text body. Multi-paragraph content joined with '\n\n'.
   * Inline 5etools tokens (e.g. `{@spell fire bolt}`) preserved RAW.
   * Render-time token parsing is a future concern.
   */
  text: string;
  /** Whether from the base race or the chosen subrace. */
  source: 'race' | 'subrace';
}

export type RaceInnateSpellFrequency = 'at-will' | 'daily-1';

/**
 * Computed racial innate/known spell entry for the character sheet.
 * Mirrors domain RacialSpellView. Populated by GET /characters/:id/sheet.
 * PHB p.17, 23, 24, 37, 42-43.
 */
export interface RacialSpellView {
  /** Resolved spell slug — never '__choose__'. */
  slug: string;
  source: string;
  /** Character level at which it becomes available. */
  characterLevelAvailable: 1 | 3 | 5;
  frequency: RaceInnateSpellFrequency;
  ability: AbilityKey;
  /** Spell upcast forced level (Tiefling hellish rebuke#2 → 2). */
  castLevel?: number | null;
  /** True when this originated from a player choice (High Elf). */
  isPlayerChoice: boolean;
}

export interface AbilityScoreView {
  score: number;
  modifier: number;
}

export interface SavingThrowView {
  ability: AbilityKey;
  modifier: number;
  proficient: boolean;
}

export interface SkillView {
  name: string;
  ability: AbilityKey;
  modifier: number;
  proficient: boolean;
  expertise: boolean;
}

export interface SpellcastingView {
  classSlug: string;
  classSource: string;
  ability: AbilityKey;
  saveDC: number;
  attackBonus: number;
}

export interface SpellSlotsView {
  slots: readonly [number, number, number, number, number, number, number, number, number];
  pactMagic: { slotLevel: number; slotCount: number } | null;
  /**
   * Slots used per level (SP-05). Always present, defaults to [0×9].
   * exactOptionalPropertyTypes: never optional.
   */
  slotsUsed: readonly [number, number, number, number, number, number, number, number, number];
  /**
   * Pact slots used (SP-05). Always present, defaults to 0.
   * exactOptionalPropertyTypes: never optional.
   */
  pactSlotsUsed: number;
}

/**
 * Compendium spell reference for a single picked spell.
 * Mirrors domain SpellSheetRef (SP-04). Populated via spellRefsBySlug enrichment.
 */
export interface SpellSheetRef {
  slug: string;
  source: string;
  name: string;
  /** 0 = cantrip */
  level: number;
  ritual: boolean;
  concentration: boolean;
  componentsM: boolean;
  /** gp cost when material component is costly; null otherwise */
  componentsMCost: number | null;
}

/**
 * Spell summary per caster class on the sheet.
 * Mirrors domain ClassSpellSummary (SP-04).
 */
export interface ClassSpellSummary {
  classSlug: string;
  classSource: string;
  cantripsKnown: { count: number; max: number };
  spellsKnown: { count: number; max: number } | null;
  spellsPrepared: { count: number; max: number } | null;
  wizardSpellbookSize?: number;
  /** Always present. Empty arrays when class has no picks or map is absent. */
  spells: { cantrips: SpellSheetRef[]; leveled: SpellSheetRef[] };
}

/**
 * Sheet-level non-blocking warning codes. Single channel for AC + future helpers.
 * Mirrors domain `ArmorClassWarningCode`. Per inventory-foundation design D7.
 */
export type SheetWarningCode = 'INSUFFICIENT_STRENGTH_FOR_ARMOR' | 'STEALTH_DISADVANTAGE';

export type EncumbranceStatus = 'ok' | 'encumbered' | 'heavily-encumbered' | 'over';

/**
 * Encumbrance evaluation surfaced by the sheet (PHB p.176 variant thresholds).
 * Mirrors domain `EncumbranceView`.
 */
export interface EncumbranceView {
  weight: number;
  /** Hard ceiling (STR × 15). Above → 'over'. */
  max: number;
  status: EncumbranceStatus;
  thresholds: {
    encumbered: number; // STR × 5
    heavily: number;    // STR × 10
    max: number;        // STR × 15
  };
  speedPenalty: number;
  /**
   * Weight contributed by coins (PHB p.143: 50 coins = 1 lb).
   * Included in `weight`. Exposed separately for the "Monedas: X lb" sub-hint.
   * Optional for read-path tolerance (pre-sdd/inventory-d4-d6 sheet responses).
   */
  coinWeight?: number;
}

export type CurrencyKey = 'cp' | 'sp' | 'ep' | 'gp' | 'pp';
export type Currency = Record<CurrencyKey, number>;

export interface CharacterSheet {
  identity: {
    name: string;
    totalLevel: number;
    classes: Array<{
      slug: string;
      source: string;
      level: number;
      hitDie: string;
      subclass: { slug: string; source: string } | null;
    }>;
    race: { slug: string; source: string } | null;
    subrace: { slug: string; source: string } | null;
    background: { slug: string; source: string } | null;
  };
  /**
   * Per-class limited-use resources (R-07). Empty when no canonical resources
   * apply at the character's classes/levels. Origin: SDD
   * `rules-audit-class-features` (#815). Optional on the web type for
   * read-path tolerance — pre-SDD sheet fixtures in older tests do not carry it.
   */
  classResources?: Record<string, ClassResourceView>;
  proficiencyBonus: number;
  abilityScores: Record<AbilityKey, AbilityScoreView>;
  savingThrows: SavingThrowView[];
  skills: SkillView[];
  passivePerception: number;
  initiative: number;
  armorClass: { value: number; formula: string };
  hitPoints: { max: number; formula: string };
  hitDice: Record<string, number>;
  speed: { walk: number; fly?: number; swim?: number; climb?: number };
  size: string;
  carryingCapacity: number;
  proficiencies: {
    armor: string[];
    weapons: string[];
    tools: string[];
    languages: string[];
  };
  feats: Array<{ slug: string; source: string }>;
  /**
   * Racial innate/known spells. Empty array when race grants none or High Elf
   * has not yet chosen a cantrip (read-path tolerance). Batch 6 REQ-W-RENDER-01.
   */
  racialSpells: RacialSpellView[];
  /**
   * Descriptive racial traits in source order (race first, subrace appended).
   * Empty for legacy characters predating Batch 8. REQ-RT-RENDER-01.
   */
  racialTraits: RacialTrait[];
  spellcasting: SpellcastingView[];
  spellSlots: SpellSlotsView;
  /**
   * Per-class spell list enriched from compendium (SP-04).
   * Always present when the character has at least one caster class.
   * Empty array for non-casters.
   */
  spellsByClass: ClassSpellSummary[];
  /**
   * Sheet-level non-blocking warnings (e.g. AC STR-min). Defaults to []
   * for legacy reads. Inventory-foundation D7 — single channel.
   * Optional on the web type for read-path tolerance (CLAUDE.md §11):
   * pre-inventory-foundation sheet fixtures may not have this field.
   */
  warnings?: SheetWarningCode[];
  /**
   * Encumbrance view (PHB p.176). Optional on the web type for read-path
   * tolerance — older sheet fixtures predate this field.
   */
  encumbrance?: EncumbranceView;
  /**
   * Character's currency totals (cp/sp/ep/gp/pp).
   * Optional on the web type for read-path tolerance.
   */
  currency?: Currency;
}

export interface InventoryItem {
  instanceId: string;
  itemSlug: string;
  itemSource: string;
  quantity: number;
  state: 'equipped' | 'carried' | 'stowed';
  attuned: boolean;
  customName: string | null;
  notes: string;
  equipHand?: 'main' | 'off' | 'both' | null;
  charges?: number | null;
}

export type CharacterStatus =
  | 'draft'
  | 'active'
  | 'pending_approval'
  | 'retired'
  | 'dead';

export interface SheetResponse {
  character: {
    id: string;
    userId: string;
    worldId: string;
    status: CharacterStatus;
    xp: number;
  };
  sheet: CharacterSheet;
  currentHp: number | null;
  inventory: InventoryItem[];
}
