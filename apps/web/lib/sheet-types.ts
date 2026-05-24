/**
 * Web-side types for the character sheet page.
 * Mirrors the API response from GET /characters/:id/sheet.
 * The domain package is NOT a web dependency — these types are maintained manually.
 */

export type AbilityKey = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';

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
  spellcasting: SpellcastingView[];
  spellSlots: SpellSlotsView;
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
    campaignId: string;
    status: CharacterStatus;
    xp: number;
  };
  sheet: CharacterSheet;
  currentHp: number | null;
  inventory: InventoryItem[];
}
