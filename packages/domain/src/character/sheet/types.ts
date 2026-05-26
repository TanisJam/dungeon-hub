import type { AbilityKey, AbilityScores } from '../stats/types.js';
import type { AppliedClass } from '../class/types.js';
import type { AppliedFeat } from '../feat/types.js';
import type { AppliedBackground } from '../background/types.js';
import type { AppliedAsi, BreathWeaponData, BreathWeaponShape, BreathWeaponSavingThrow, RaceInnateSpell, RaceInnateSpellFrequency } from '../race/types.js';
import type { InventoryItem } from '../inventory/types.js';
import type { EncumbranceView } from '../inventory/encumbrance.js';

/**
 * A descriptive racial trait surfaced on the sheet's "Rasgos raciales" card.
 * Mechanical projections (speed, languages, darkvision, weapon profs, racial
 * spells) are NOT represented here — they have dedicated sheet fields.
 * Decision #628 defines the blocklist. Decision #630 locks the 5 defaults.
 */
export interface RacialTrait {
  /** Trait name as it appears in the 5etools source (English, raw). */
  name: string;
  /**
   * Full text body. Multi-paragraph content is joined with '\n\n'.
   * Inline 5etools formatting tokens (e.g. `{@spell fire bolt}`) are
   * preserved RAW — render-time parsing happens in the web layer.
   */
  text: string;
  /** Whether the trait comes from the base race or the chosen subrace. */
  source: 'race' | 'subrace';
}

export const CURRENCY_KEYS = ['cp', 'sp', 'ep', 'gp', 'pp'] as const;
export type CurrencyKey = (typeof CURRENCY_KEYS)[number];
export type Currency = Record<CurrencyKey, number>;

export const EMPTY_CURRENCY: Currency = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };

/** Mapeo standard skill → ability (PHB p.174). */
export const SKILL_TO_ABILITY: Readonly<Record<string, AbilityKey>> = Object.freeze({
  acrobatics: 'dex',
  'animal handling': 'wis',
  arcana: 'int',
  athletics: 'str',
  deception: 'cha',
  history: 'int',
  insight: 'wis',
  intimidation: 'cha',
  investigation: 'int',
  medicine: 'wis',
  nature: 'int',
  perception: 'wis',
  performance: 'cha',
  persuasion: 'cha',
  religion: 'int',
  'sleight of hand': 'dex',
  stealth: 'dex',
  survival: 'wis',
});

export const ALL_SKILLS = Object.keys(SKILL_TO_ABILITY).sort();

/**
 * Computed racial innate/known spell entry for the character sheet.
 * Derived from `RaceSheetData.additionalSpellsNormalized` + `CharacterSnapshot.raceCantrip`.
 * Decisions #602, #603, #605, #606. PHB p.17, 23, 24, 37, 42-43.
 */
export interface RacialSpellView {
  /** Resolved spell slug — never '__choose__'. For player-choice entries, set from raceCantrip. */
  slug: string;
  source: string;
  /** Character level at which it becomes available — gating not applied here (renderer decides). */
  characterLevelAvailable: 1 | 3 | 5;
  frequency: RaceInnateSpellFrequency;
  ability: 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
  /** Spell upcast forced level (Tiefling `hellish rebuke#2`). */
  castLevel?: number | null;
  /** True when this entry originated from a player choice (High Elf). UI marks it as such. */
  isPlayerChoice: boolean;
}

// Re-export for convenience (consumed by compute.ts and by API/web layers)
export type { RaceInnateSpell, RaceInnateSpellFrequency };

/**
 * Estado del personaje que necesita el sheet calculator. Es el shape
 * persistido en `characters.data` (parcial) más data del compendio para race.
 */
export interface CharacterSnapshot {
  name: string;
  baseStats?: AbilityScores;
  asisApplied?: AppliedAsi[];
  classes?: AppliedClass[];
  background?: AppliedBackground | null;
  feats?: AppliedFeat[];
  race?: { slug: string; source: string } | null;
  subrace?: { slug: string; source: string } | null;
  inventory?: InventoryItem[];
  currency?: Currency;
  /** ASIs aplicados via level-up (4/8/12/16/19). Independiente de los raciales. */
  levelUpAsis?: AppliedAsi[];
  /** Nivel de exhaustion (0-6, PHB p.291). Default 0. */
  exhaustion?: number;
  /** Picks de class features (TCE OCF, fighting styles, invocations, maneuvers) por classSlug. */
  classFeatures?: Record<string, Record<string, Array<{ slug: string; source: string }>>>;
  /**
   * Limited-use class resources consumed (R-07). Keyed by class-prefixed slug
   * (`fighter:second-wind`, `monk:ki-points`). Max + recovery trigger derived
   * from the registry — only the `used` counter persists.
   * Origin: SDD `rules-audit-class-features` (#815).
   */
  classResourcesUsed?: Record<string, number>;
  /** Selección persistida de spells por clase. */
  spells?: Record<string, { cantrips: Array<{ slug: string; source: string }>; known: Array<{ slug: string; source: string }>; prepared: Array<{ slug: string; source: string }> }>;
  /** Idiomas elegidos por el jugador para slots `any*` del linaje (raza + subrace). */
  raceLanguageChoices?: string[];
  /** Skills picked at race step for `skillProficiencies:[{any:N}]` blocks (Variant Human, Half-Elf). */
  raceSkillChoices?: string[];
  /** Slug of the feat granted by the race (Variant Human / Custom Lineage). Marker for wizard re-edit. */
  raceFeatSlug?: string | null;
  /** Wizard cantrip chosen for High Elf race step. Decision #606. Null when not yet chosen. */
  raceCantrip?: { slug: string; source: string } | null;
  /**
   * Regular spell slots used per level (SP-05). Length 9, index 0 = level 1.
   * Absent for pre-SP-05 characters — defaults to [0×9] in computeCharacterSheet.
   */
  spellSlotsUsed?: readonly number[];
  /**
   * Warlock pact slots used (SP-05). Scalar (single slot level per warlock level).
   * Absent for pre-SP-05 characters — defaults to 0 in computeCharacterSheet.
   */
  warlockSlotsUsed?: number;
}

/**
 * Computed darkvision for the character sheet. PHB p.17, 24.
 * Decisions: #577 (merge rule — subrace overrides race), #578 (field shape).
 */
export interface DarkvisionView {
  /** Radius in feet. PHB 2014: 60 or 120 only. Type allows others for homebrew. */
  feet: number;
  /** True when feet >= 120. PHB p.24 "Superior Darkvision" labeling (Drow, Duergar, Deep Gnome). */
  isSuperior: boolean;
}

/**
 * Computed breath weapon for the character sheet.
 * Combines subrace.breathWeapon data with CON modifier + proficiency bonus + total level.
 * PHB p.34 — Dragonborn breath weapon rules.
 */
export interface BreathWeaponView {
  /** Carried from subrace data (PHB: acid | cold | fire | lightning | poison). */
  damageType: string;
  shape: BreathWeaponShape;
  /** Display: '5 ft × 30 ft' (line) or '15 ft' (cone). */
  area: string;
  savingThrow: BreathWeaponSavingThrow;
  /** 8 + CON mod + proficiency bonus. PHB p.34. */
  saveDC: number;
  /** Scaled by character total level: 2d6 (1-5), 3d6 (6-10), 4d6 (11-15), 5d6 (16+). PHB p.34. */
  damageDice: string;
}

/**
 * Data de la raza relevante para el sheet (subset del compendio).
 * Lo extrae el caller; el domain validator no toca DB.
 */
export interface RaceSheetData {
  /** En 5etools: number (walk only) o object `{ walk, fly, swim, climb }`. */
  speed?: number | Record<string, number>;
  size?: string[];
  /** "Standard" languages otorgados por la raza, ej: ['common', 'elvish']. */
  languageProficiencies?: Array<Record<string, boolean | number>>;
  /**
   * Reserved for Batch 6 (`race-skill-prof-grant`): fixed grants like Bugbear Stealth.
   * NOT consumed by computeCharacterSheet in this batch.
   */
  skillProficiencies?: Array<Record<string, boolean | number | { from: string[]; count?: number }>>;
  /**
   * Carried from subrace JSONB by loadRaceSheetData. Consumed by computeCharacterSheet
   * to compute BreathWeaponView. Null/absent for non-Dragonborn races.
   */
  breathWeapon?: BreathWeaponData | null;
  /**
   * Effective darkvision in feet after race+subrace merge (subrace wins per decision #577).
   * null when race+subrace explicitly opt out. undefined when race has no darkvision.
   * Consumed by computeCharacterSheet to derive DarkvisionView. PHB p.17.
   */
  darkvision?: number | null;
  /**
   * Effective weapon proficiencies after race+subrace merge (Decision #589).
   * loadRaceSheetData applies: subrace OVERRIDES race when 'weaponProficiencies' in subData.
   * 5etools shape: [{"battleaxe|phb": true}] — source suffix stripped in compute by normalizeProf.
   * null/undefined when no weapon proficiencies (Human, Halfling, Dragonborn, etc.).
   */
  weaponProficiencies?: Array<Record<string, boolean | unknown>> | null;
  /**
   * Effective armor proficiencies after race+subrace merge (Decision #589).
   * loadRaceSheetData applies: subrace OVERRIDES race when 'armorProficiencies' in subData.
   * PHB Mountain Dwarf: light + medium. Dwarf race has none at race level.
   * null/undefined when no armor proficiencies.
   */
  armorProficiencies?: Array<Record<string, boolean | unknown>> | null;
  /**
   * Effective normalized racial spells after race+subrace merge (subrace OVERRIDES race
   * per the in-operator pattern, mirrors Decision #577/#589). Populated by
   * loadRaceSheetData. Consumed by computeCharacterSheet to derive RacialSpellView[].
   * null/undefined when race+subrace grant no innate spells. PHB p.17/23/24/37/42-43.
   */
  additionalSpellsNormalized?: RaceInnateSpell[] | null;
  /**
   * Projected racial traits in source order (race first, subrace appended).
   * Populated by loadRaceSheetData via extractRacialTraits. Consumed by
   * computeCharacterSheet as a pass-through. Required at the projection boundary;
   * defaults to [] when absent (backward compat for pre-Batch-8 snapshots).
   * Batch 8 — race-traits-on-sheet, decision #628, decision #630.
   */
  racialTraits: RacialTrait[];
}

// Re-export for convenience (BreathWeaponData is consumed by compute.ts)
export type { BreathWeaponData, BreathWeaponShape, BreathWeaponSavingThrow };

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

/**
 * Efectos de exhaustion (PHB p.291). Acumulativos: nivel N incluye los
 * efectos 1..N.
 */
export type ExhaustionEffect =
  | 'disadvantage-ability-checks'
  | 'speed-halved'
  | 'disadvantage-attacks-and-saves'
  | 'hp-max-halved'
  | 'speed-zero'
  | 'dead';

export interface ExhaustionView {
  level: number;
  /** Efectos activos para este level. Vacío si level=0. */
  effects: ExhaustionEffect[];
}

export interface SpellSlotsView {
  /** 9 valores correspondientes a 1st..9th level slots (MAX). */
  slots: readonly [number, number, number, number, number, number, number, number, number];
  /** Pact magic separado (Warlock). */
  pactMagic: { slotLevel: number; slotCount: number } | null;
  /**
   * Slots usados por nivel (SP-05). Siempre presente, defaults a [0×9].
   * exactOptionalPropertyTypes: never optional.
   */
  slotsUsed: readonly [number, number, number, number, number, number, number, number, number];
  /**
   * Pact slots usados (SP-05). Siempre presente, defaults a 0.
   * exactOptionalPropertyTypes: never optional.
   */
  pactSlotsUsed: number;
}

export interface SpellSheetRef {
  slug: string;
  source: string;
  name: string;
  /** 0 = cantrip */
  level: number;
  ritual: boolean;
  concentration: boolean;
  componentsM: boolean;
  /** gp cost in gp when material component is costly; null otherwise */
  componentsMCost: number | null;
}

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
  proficiencyBonus: number;
  abilityScores: Record<AbilityKey, AbilityScoreView>;
  savingThrows: SavingThrowView[];
  skills: SkillView[];
  passivePerception: number;
  initiative: number;
  armorClass: {
    value: number;
    formula: string;
  };
  hitPoints: {
    max: number;
    formula: string;
  };
  hitDice: Record<string, number>; // 'd6' → total
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
  /** Null for all non-Dragonborn characters and legacy Dragonborn without an ancestry subrace. */
  breathWeapon: BreathWeaponView | null;
  /** Null when the character has no darkvision (PHB Human, Halfling, Dragonborn). PHB p.17. */
  darkvision: DarkvisionView | null;
  /**
   * Racial innate/known spells. Empty array when race grants none OR when High Elf
   * raceCantrip is not yet chosen (read-path tolerance per CLAUDE.md §11).
   * REQ-D-COMPUTE-01, REQ-D-COMPUTE-02. Batch 6.
   */
  racialSpells: RacialSpellView[];
  /**
   * Descriptive racial traits in source order (race first, then subrace appended).
   * Empty for legacy characters whose race data lacked an `entries` projection at
   * compute time. Defaults to [] when absent (SCEN-RT-12 / REQ-RT-COMPAT-01).
   * Batch 8 — race-traits-on-sheet.
   */
  racialTraits: RacialTrait[];
  spellcasting: SpellcastingView[];
  currency: Currency;
  encumbrance: EncumbranceView;
  attunement: { used: number; max: number };
  spellSlots: SpellSlotsView;
  spellsByClass: ClassSpellSummary[];
  exhaustion: ExhaustionView;
  /** Picks de class features mostrados por classSlug + featureType. */
  classFeatures: Record<string, Record<string, Array<{ slug: string; source: string }>>>;
  /**
   * Per-class limited-use resources (R-07). Empty when no canonical resources
   * apply at the character's classes/levels. See `ClassResource` type.
   * Origin: SDD `rules-audit-class-features` (#815).
   */
  classResources: Record<string, import('../class-resources/types.js').ClassResource>;
}
