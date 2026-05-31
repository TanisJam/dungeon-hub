/**
 * Core types for the Resolution Engine (Composable Modifier System — Slice 1).
 *
 * Design: JSONB-serializable discriminated union. No class instances, no
 * functions on data — all values are plain JSON so round-trip serialization
 * (JSON.stringify / JSON.parse) is lossless. See engram sdd/resolution-engine/design.
 */

// ── Opaque ID types (branded strings) ────────────────────────────────────────

export type EntityId = string & { readonly _brand: 'EntityId' };
export type ModifierDefId = string & { readonly _brand: 'ModifierDefId' };
export type ModifierInstanceId = string & { readonly _brand: 'ModifierInstanceId' };

/** Typed reference into the domain compendium (e.g. 'spell:bless', 'condition:prone'). */
export interface DomainRef {
  kind: 'spell' | 'condition' | 'item' | 'feature';
  id: string;
}

/** Lightweight pointer to an entity in the encounter. */
export interface EntityRef {
  id: EntityId;
  conditions: ConditionRef[];
  /** Ability scores, present when the engine needs them (optional in predicate ctx). */
  abilities?: Record<Ability, number>;
}

export type ConditionRef = { name: string };

// ── Abilities ─────────────────────────────────────────────────────────────────

export type Ability = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';

// ── StatKey ───────────────────────────────────────────────────────────────────

/**
 * Addressable stats in the resolution engine.
 * Skill keys use the `skill.<name>` dotted form to avoid collision with ability scores.
 *
 * `saving-throw` — flat key for all-saves effects (Bless +1d4, Cloak of Protection +1).
 * `saving-throw.${Ability}` — per-ability key for targeted proficiencies (Resilient (Con) → 'saving-throw.con').
 *   PHB 179: saving throws are per-ability. PHB 168: Resilient grants proficiency in ONE ability's saves.
 */
export type StatKey =
  | Ability
  | 'ac'
  | 'hp'
  | 'speed'
  | 'initiative'
  | 'attack-roll'
  | 'saving-throw'
  | `saving-throw.${Ability}`
  | 'damage'
  | `skill.${string}`;

// ── Roll types ────────────────────────────────────────────────────────────────

export type RollType = 'attack' | 'save' | 'check' | 'damage' | 'initiative';

// ── Dice expression ───────────────────────────────────────────────────────────

/** Plain string dice expression, e.g. "1d4", "2d6+3". Kept as string for JSON safety. */
export type DiceExpr = string;

// ── Value source for ReplaceMod ───────────────────────────────────────────────

/**
 * Describes where a replacement value comes from.
 *   - 'beast-stat': resolve from an injected BeastStatResolver
 *   - 'fixed': a literal number
 */
export type ValueSource = { from: 'beast-stat'; beastId: string } | { from: 'fixed'; value: number };

// ── StackCategory ──────────────────────────────────────────────────────────────

/**
 * Stacking category for numeric modifiers (5e bonus-type system).
 * Within a category → keep-highest (except untyped which all-stacks).
 * Between categories → all apply.
 */
export type StackCategory = 'untyped' | 'item' | 'status' | 'circumstance';

// ── Trigger ───────────────────────────────────────────────────────────────────

export type Trigger =
  | 'always'
  | 'on-attack-roll'
  | 'on-save'
  | 'on-cast'
  | 'on-attacked'
  | 'on-hit'
  | 'on-damage'
  /** REQ-ERB-TYPES-02: reaction fires when this entity is the TARGET of an incoming attack. */
  | 'on-incoming-attack'
  /** REQ-RB-01 (engine-spell-cast-suspend): reaction fires when this entity is TARGETED by an incoming spell (e.g. Magic Missile). PHB p.275 — Shield timing. */
  | 'on-incoming-spell';

// ── ResetTrigger ──────────────────────────────────────────────────────────────

export type ResetTrigger = 'short-rest' | 'long-rest' | 'dawn' | 'turn-start';

// ── EndCondition ──────────────────────────────────────────────────────────────

export type EndCondition =
  | 'concentration-ends'
  | 'hp-reaches-zero'
  | 'duration-expires'
  | 'turn-ends'
  | 'short-rest'
  | 'long-rest';

// ── DurationSpec ──────────────────────────────────────────────────────────────

export interface DurationSpec {
  unit: 'round' | 'minute' | 'hour';
  amount: number;
  endsOn?: EndCondition[];
  /**
   * Concentration token — links all modifier instances emitted by the same
   * concentration spell cast. When concentration ends, all instances sharing
   * this token are removed via registry.removeByConcentrationToken(token).
   *
   * This formalizes what Phase 3 left as a loose cast in query.ts.
   * Required for Bless (and any future concentration spell).
   */
  concentrationToken?: string;
}

// ── Reaction effects ──────────────────────────────────────────────────────────

export type EventKind = 'cast' | 'attacked' | 'damaged';

/**
 * ReactionEffect — what happens when a reaction fires.
 *
 * counter: cancel the triggering cast (Counterspell — PHB p.228).
 * ac-bonus: grant a numeric AC bonus to the reacting entity for this attack
 *   (Shield +5 AC — PHB p.275, additive circumstance mod, transient).
 * negate-spell-damage: zero out incoming spell damage to the reacting entity
 *   (Shield vs Magic Missile — PHB p.275: "you take no damage from magic missile").
 *   This is trigger-dependent: fires on 'on-incoming-spell', NOT on 'on-incoming-attack'.
 *   Distinct from 'counter' (which cancels the whole spell for ALL targets).
 *
 * REQ-ERB-TYPES-03: ac-bonus variant added (ADR-2, engine-reaction-bus). Additive —
 *   counter arm unchanged; existing exhaustive switches remain valid.
 * ADR-4 (engine-spell-cast-suspend): negate-spell-damage third arm added. Additive —
 *   counter + ac-bonus arms untouched; exhaustive switches must add a third case.
 */
export type ReactionEffect =
  | { kind: 'counter'; autoIfSlotGe: number }
  | { kind: 'ac-bonus'; value: number }
  | { kind: 'negate-spell-damage' };

// ── Modifier discriminated union (10 kinds, closed) ───────────────────────────

/**
 * NumMod — numeric bonus/penalty on a stat.
 * Bless: kind='num', op='add', value='1d4', stat='attack-roll', category='untyped'.
 */
export type NumMod = {
  kind: 'num';
  op: 'add';
  value: DiceExpr | number;
  stat: StatKey;
  category: StackCategory;
};

/**
 * AdvantageMod — advantage or disadvantage on a roll type.
 * Prone: kind='advantage', mode='impose', rollType='attack'.
 */
export type AdvantageMod = {
  kind: 'advantage';
  mode: 'grant' | 'impose';
  rollType: RollType;
};

/**
 * ChoiceMod — runtime selection of targets or stats.
 * Bless target selection: kind='choice', selects='targets', count=3.
 */
export type ChoiceMod = {
  kind: 'choice';
  selects: 'targets' | 'stat';
  count: number;
  from?: DomainRef;
};

/**
 * ConcentrationMod — marks a modifier group as concentration-gated.
 * Emits a list of ModifierDefIds that are removed when concentration ends.
 */
export type ConcentrationMod = {
  kind: 'concentration';
  emits: ModifierDefId[];
};

/**
 * ReactionMod — fires on an event (e.g. Counterspell on 'cast').
 */
export type ReactionMod = {
  kind: 'reaction';
  on: EventKind;
  predicate: import('./predicate/types.js').Predicate;
  effect: ReactionEffect;
};

/**
 * UsageMod — consumable resource (spell slots, etc.).
 */
export type UsageMod = {
  kind: 'usage';
  pool: 'tiered';
  resetOn: ResetTrigger;
};

/**
 * ReplaceMod — substitutes a stat value (Wild Shape physical stats).
 * retain: list of stats to keep from self (INT/WIS/CHA).
 * policy: 'max-self-beast' for skill/save resolution.
 */
export type ReplaceMod = {
  kind: 'replace';
  stat: StatKey;
  with: ValueSource;
  retain?: StatKey[];
  policy?: 'max-self-beast';
};

/**
 * GmRulingMod — defers to DM discretion (Wild Shape equipment).
 * Returns a non-numeric result; the engine surfaces it as a GMRuling entry.
 */
export type GmRulingMod = {
  kind: 'gmRuling';
  prompt: string;
  mechanical?: Modifier[];
};

/**
 * NoopMod — identity modifier; used for exhaustiveness checks and stubs.
 */
export type NoopMod = { kind: 'noop' };

/**
 * ProficiencyMod — grants proficiency or expertise in a skill, save, or tool.
 *
 * `domain` is a closed enum of six categories (PHB proficiency types).
 * `ref` is a FREE string — homebrew skills / custom tools pass without list validation.
 * `level` defaults to 'proficient' when absent; 'expertise' doubles the bonus.
 *
 * // TODO #513: `ref` validation against catalog is deferred until DB-injected resolver.
 */
export type ProficiencyMod = {
  kind: 'proficiency';
  domain: 'skill' | 'save' | 'tool' | 'language' | 'weapon' | 'armor';
  ref: string;
  level?: 'proficient' | 'expertise';
};

/**
 * ResistMod — typed damage resistance or immunity.
 *
 * Encodes the post-roll number transform from PHB p.197 ("Damage Resistance
 * and Immunity"). One kind, two modes:
 *   half   — resistance: finalDamage = Math.floor(rolledDamage / 2)
 *   immune — immunity:   finalDamage = 0
 *
 * damageType: specific damage type string (e.g. 'fire', 'poison') OR the
 *   special literal 'all' which matches any incoming damage type.
 *   PHB p.197: "resistance to a damage type"; PHB p.291: Petrified has
 *   resistance to all damage (damageType: 'all').
 *
 * Resolution phase: AFTER all other modifiers, BEFORE HP loss (ADR-3).
 * Trigger label: 'on-damage' (informative only; ResistMods are NOT
 * resolved via the attacker-centric registry query path — they are
 * resolved by the applyDamageWithResist pure helper).
 *
 * // TODO #513: immunity map and resistance pools → DB-injected resolver.
 */
export type ResistMod = {
  kind: 'resist';
  /** Specific damage type (e.g. 'fire', 'slashing') or 'all' (matches any type). */
  damageType: string | 'all';
  /** 'half' = resistance (floor halve once); 'immune' = immunity (zero). */
  mode: 'half' | 'immune';
};

/** Closed union of all 11 modifier kinds in this slice. */
export type Modifier =
  | NumMod
  | AdvantageMod
  | ChoiceMod
  | ConcentrationMod
  | ReactionMod
  | UsageMod
  | ReplaceMod
  | GmRulingMod
  | NoopMod
  | ProficiencyMod
  | ResistMod;

// ── Type guards ───────────────────────────────────────────────────────────────

export function isNumMod(m: Modifier): m is NumMod {
  return m.kind === 'num';
}

export function isAdvantageMod(m: Modifier): m is AdvantageMod {
  return m.kind === 'advantage';
}

export function isChoiceMod(m: Modifier): m is ChoiceMod {
  return m.kind === 'choice';
}

export function isConcentrationMod(m: Modifier): m is ConcentrationMod {
  return m.kind === 'concentration';
}

export function isReactionMod(m: Modifier): m is ReactionMod {
  return m.kind === 'reaction';
}

export function isUsageMod(m: Modifier): m is UsageMod {
  return m.kind === 'usage';
}

export function isReplaceMod(m: Modifier): m is ReplaceMod {
  return m.kind === 'replace';
}

export function isGmRulingMod(m: Modifier): m is GmRulingMod {
  return m.kind === 'gmRuling';
}

export function isNoopMod(m: Modifier): m is NoopMod {
  return m.kind === 'noop';
}

export function isProficiencyMod(m: Modifier): m is ProficiencyMod {
  return m.kind === 'proficiency';
}

export function isResistMod(m: Modifier): m is ResistMod {
  return m.kind === 'resist';
}
