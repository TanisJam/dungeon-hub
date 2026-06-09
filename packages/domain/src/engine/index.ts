/**
 * Public API barrel for the Resolution Engine (Composable Modifier System — Slice 1).
 *
 * Import from this barrel for all engine functionality.
 * Internal module paths (predicate/evaluate.ts, etc.) are considered private
 * implementation details — do NOT import them directly outside of engine/.
 *
 * Design ref: sdd/resolution-engine — T8.1 public API surface.
 */

// ── Core types ────────────────────────────────────────────────────────────────

export type {
  // Branded IDs
  EntityId,
  ModifierDefId,
  // Modifier union + all kinds
  Modifier,
  NumMod,
  AdvantageMod,
  ChoiceMod,
  ConcentrationMod,
  ReactionMod,
  UsageMod,
  ReplaceMod,
  GmRulingMod,
  NoopMod,
  ProficiencyMod,
  // engine-resist-immunity: 11th modifier kind (REQ-RI-06 / ADR-1)
  ResistMod,
  // Supporting types
  DurationSpec,
  EndCondition,
  StatKey,
  Trigger,
  StackCategory,
  RollType,
  DiceExpr,
  ValueSource,
  EntityRef,
  ConditionRef,
  DomainRef,
  ResetTrigger,
  EventKind,
  ReactionEffect,
  Ability,
} from './types.js';

export {
  // Type guards
  isNumMod,
  isAdvantageMod,
  isChoiceMod,
  isConcentrationMod,
  isReactionMod,
  isUsageMod,
  isReplaceMod,
  isGmRulingMod,
  isNoopMod,
  isProficiencyMod,
  // engine-resist-immunity: ResistMod type guard (REQ-RI-06 / ADR-1)
  isResistMod,
} from './types.js';

// ── Provenance types ──────────────────────────────────────────────────────────

export type { Source, Breakdown, Resolved } from './provenance.js';

// ── Evaluation context ────────────────────────────────────────────────────────

export type {
  EvaluationContext,
  WeaponInUse,
  ActionInFlight,
} from './context.js';

export { attackerDistanceFt } from './context.js';

// ── Predicate AST + evaluator ─────────────────────────────────────────────────

export type { Predicate, WorldQuery } from './predicate/types.js';
export { isPredicate } from './predicate/types.js';

// AST builder helpers
export {
  and,
  or,
  not,
  query,
  attackerWithin,
  weaponKind,
  hasCondition,
  canSee,
  spellLevelAtMost,
  // Slice 2b — Sneak Attack conditional on-hit rider leaves
  hasRollMode,
  runtimeDecision,
  hasWeaponProperty,
  // Slice 3a — always-true predicate for unconditional grants (Stunned advantage, ADR-6 R2)
  alwaysTrue,
  // engine-combatant-effects Slice A — caster-sourced effect predicate (REQ-CEF-02)
  hasEffectFromSelf,
  // engine-barbarian-dsl-2 — usesAbility leaf (REQ-PRED-01, PHB p.48)
  usesAbility,
} from './predicate/ast.js';

// Evaluator
export { evaluatePredicate, PredicateError } from './predicate/evaluate.js';
export type { PredicateMissingCtxFieldError } from './predicate/evaluate.js';

// ── Registry ──────────────────────────────────────────────────────────────────

export type {
  ModifierRegistry,
  ModifierInstance,
  ModifierInstanceId,
  TargetScope,
  RegistryQueryInput,
} from './registry/types.js';

export { createInMemoryRegistry } from './registry/query.js';

// ── Stacking ──────────────────────────────────────────────────────────────────

export { STACKING_STRATEGIES } from './stacking/categories.js';
export { applyStacking } from './stacking/apply.js';

// ── Resolution functions ──────────────────────────────────────────────────────

export { resolveStat } from './resolve/stat.js';
export { resolveRollMode } from './resolve/roll-mode.js';
export type { RollModeResult } from './resolve/roll-mode.js';

// ── Resist/Immune primitive (engine-resist-immunity — REQ-RI-01..06) ─────────

export {
  applyDamageWithResist,
  STANDARD_DAMAGE_TYPES,
} from '../encounter/apply-damage-with-resist.js';
export type {
  ApplyDamageWithResistInput,
  ApplyDamageWithResistResult,
} from '../encounter/apply-damage-with-resist.js';

// ── Dice roller (engine-attack-apply-damage) ──────────────────────────────────

export { rollDamageBreakdown } from './dice/roll.js';
export type { RngFn, RollResult, PerDieEntry } from './dice/roll.js';

// ── Saving throw ─────────────────────────────────────────────────────────────

// Slice 3a — rollSavingThrow pure function
export { rollSavingThrow } from './save/roll-saving-throw.js';
export type { RollSavingThrowResult } from './save/roll-saving-throw.js';

// Slice 3b-ii — Stunning Strike ki save DC (PHB p.78)
export { computeKiSaveDc } from './save/compute-ki-save-dc.js';

// Divine Smite damage helper (engine-divine-smite — PHB p.85)
export { computeDivineSmiteDice } from './damage/compute-divine-smite-dice.js';

// ── Spell helpers (engine-spell-cast-suspend — Front #4 Slice 0) ─────────────

// Magic Missile roller (ADR-7 — pure, RNG-injected, auto-hit, force damage)
export { rollMagicMissile } from './spell/magic-missile.js';
export type { RollMagicMissileInput, RollMagicMissileResult } from './spell/magic-missile.js';

// Counterspell outcome resolver (engine-counterspell — Front #4 Slice 1 — PHB p.281)
export { resolveCounterspell } from './spell/counterspell.js';
export type {
  ResolveCounterspellInput,
  ResolveCounterspellResult,
  CounterspellCheck,
} from './spell/counterspell.js';

// ── Action pipeline ───────────────────────────────────────────────────────────

export type { AttackPhase, SpellPhase } from './pipeline/phases.js';
export { advancePhase } from './pipeline/state-machine.js';
export type { PipelineSignal, AdvanceResult } from './pipeline/state-machine.js';

// Pipeline events (CastEvent + AttackEvent — REQ-ERB-TYPES-01)
export type { CastEvent, AttackEvent } from './pipeline/events.js';

export { resolveWeaponAttack } from './attack/resolve-weapon-attack.js';
export type { WeaponAttackInput, WeaponAttackResult } from './attack/resolve-weapon-attack.js';

// Extra Attack + per-turn budget predicates (engine-action-economy — REQ-AE-08, REQ-AE-02/03)
export { extraAttacksPerAction, isActionAvailable, isBonusActionAvailable } from './attack/extra-attacks.js';
export type { ClassWithLevel } from './attack/extra-attacks.js';

export { rollToHit } from './attack/roll-to-hit.js';
export type { RollToHitResult, RollMode } from './attack/roll-to-hit.js';

// Shield reaction window predicate (engine-reaction-bus — REQ-ERB-TYPES-01)
export { isShieldableHit } from './attack/shieldable-hit.js';
export type { ShieldableHitParams } from './attack/shieldable-hit.js';

// ── Form-switching subsystem ──────────────────────────────────────────────────

export { applyFormSwitch } from './form-switching/substitute.js';
export type {
  FormSwitchInput,
  FormSwitchResult,
  FormSwitchResolved,
  FormSwitchGmRuling,
  StatBag,
} from './form-switching/substitute.js';

// ── Conditions ────────────────────────────────────────────────────────────────

export { PRONE_CONDITION_DEF } from './conditions/prone.js';
export type { ConditionDefinition } from './conditions/prone.js';

// Slice 3a — Stunned + Incapacitated condition definitions
export { STUNNED_CONDITION_DEF } from './conditions/stunned.js';
export { INCAPACITATED_CONDITION_DEF } from './conditions/incapacitated.js';
// engine-incapacitated-gating — action-economy gate predicate (PHB p.290)
export { isIncapacitated } from './conditions/incapacitated.js';

// conditions-catalog Slice 1 — Blinded, Invisible, Poisoned condition definitions
export { BLINDED_CONDITION_DEF } from './conditions/blinded.js';
export { INVISIBLE_CONDITION_DEF } from './conditions/invisible.js';
export { POISONED_CONDITION_DEF } from './conditions/poisoned.js';

// engine-resist-immunity — Petrified condition def + immunity predicate (REQ-RI-09..17)
export { PETRIFIED_CONDITION_DEF } from './conditions/petrified.js';
export { isImmuneToCondition } from './conditions/condition-immunity.js';

// engine-rage — isRaging predicate (REQ-RAGE-06, PHB p.48)
export { isRaging } from './conditions/rage.js';

// ── Authoring DSL ─────────────────────────────────────────────────────────────

export { parseRule } from './authoring/parse.js';
export type { ParseResult, ParseOk, ParseFail, ParseIssue } from './authoring/parse.js';

export { compileRule, EscapeHatchNotImplemented } from './authoring/compile.js';

export { generateTestStub } from './authoring/testgen.js';

export type { RuleDoc, RuleEmit, RuleParams, CompiledRule } from './authoring/types.js';

// ── Character validation (final gate) ────────────────────────────────────────

export { validateCharacterFinal } from './validate/character-final.js';
export type {
  CharacterFinalResult,
  CharacterFinalIssue,
  ProficiencyAlreadyGrantedIssue,
} from './validate/character-final.js';

// ── Rule builders ─────────────────────────────────────────────────────────────

export { buildBlessModifiers } from './rules/bless.js';
export { buildOnHitDamageRider } from './rules/on-hit-damage-rider.js';
export { buildSneakAttackRider } from './rules/sneak-attack.js';
export { buildHexRider } from './rules/hex.js';

export { buildProneModifiers } from './rules/prone.js';
export type {
  ConditionResolver,
  BuildProneResult,
  ConditionNotFoundIssue,
} from './rules/prone.js';

// Slice 3a — Stunned rule builder (lights up attackers-of production path)
export { buildStunnedModifiers } from './rules/stunned.js';
export type { BuildStunnedResult } from './rules/stunned.js';

// conditions-catalog Slice 1 — Blinded, Invisible, Poisoned rule builders
export { buildBlindedModifiers } from './rules/blinded.js';
export type { BuildBlindedResult } from './rules/blinded.js';

// engine-resist-immunity — Petrified rule builder (REQ-RI-10..14 / ADR-5)
export { buildPetrifiedModifiers } from './rules/petrified.js';
export type { BuildPetrifiedResult } from './rules/petrified.js';

// engine-rage — DSL-authored rage rule (REQ-CHAR-01..04, PHB p.48)
export { rageRuleDoc } from './rules-authored/rage.js';

// engine-barbarian-dsl-2 — Reckless Attack + Danger Sense (PHB p.48)
export { recklessAttackRuleDoc } from './rules-authored/reckless-attack.js';
export { dangerSenseRuleDoc } from './rules-authored/danger-sense.js';

export { buildInvisibleModifiers } from './rules/invisible.js';
export type { BuildInvisibleResult } from './rules/invisible.js';

export { buildPoisonedModifiers } from './rules/poisoned.js';
export type { BuildPoisonedResult } from './rules/poisoned.js';

export { buildCounterspellReaction } from './rules/counterspell.js';
export type {
  SpellSlotResolver,
  SlotPool,
  BuildCounterspellResult,
  CounterspellFireResult,
  SlotTierInsufficientIssue,
  ResolverNotInjectedIssue as CounterspellResolverNotInjectedIssue,
} from './rules/counterspell.js';

export { buildWildShapeModifiers } from './rules/wild-shape.js';
export type {
  BeastStatResolver,
  BeastStatBlock,
  BuildWildShapeResult,
  ResolverNotInjectedIssue as WildShapeResolverNotInjectedIssue,
} from './rules/wild-shape.js';

// ── Authored rule builders (Slice 2 — DSL pipeline) ──────────────────────────

export { buildSoldierAthleticsModifiers } from './rules/soldier-athletics.js';
export { buildResilientConModifiers } from './rules/resilient-con.js';
export { buildCloakOfProtectionModifiers } from './rules/cloak-of-protection.js';
export { buildGuidanceModifiers } from './rules/guidance.js';
export { buildFrightenedModifiers } from './rules/frightened.js';

// ── Authored rule documents (Slice 6 — engine-catalog) ───────────────────────

export { cloakOfProtectionRuleDoc } from './rules-authored/cloak-of-protection.js';
export { blessRuleDoc } from './rules-authored/bless.js';

// ── Concentration rule helper (engine-concentration-authority — PHB p.203) ────

export { decideConcentration } from './concentration/decide.js';
export type {
  ConcentrationStore,
  ConcentrationEntry,
  ConcentrationCandidate,
  ConcentrationDecision,
} from './concentration/decide.js';

// engine-concentration-break-damage — DC formula (REQ-CB-02, PHB p.203)
export { computeConcentrationSaveDc } from './concentration/compute-concentration-save-dc.js';

// ── Duration evaluator (engine-timeline-duration — Slice: Composable Modifier System 1) ──

export { evaluateDuration, convertToRounds } from './duration/evaluate.js';

// ── Inventory adapter (Slice 4) ───────────────────────────────────────────────

export { deriveInventoryModifiers } from './adapter/derive-inventory-modifiers.js';
export type { ItemModifierMap } from './adapter/derive-inventory-modifiers.js';

// ── ASI adapter (engine-ability-scores) ───────────────────────────────────────

export { deriveAbilityScoreModifiers } from './adapter/derive-ability-score-modifiers.js';
export type { AbilityScoreModifierInput } from './adapter/derive-ability-score-modifiers.js';

// ── AC adapter (engine-ac-parity) ─────────────────────────────────────────────

export { deriveArmorClassModifiers } from './adapter/derive-armor-class-modifiers.js';
export type { ArmorClassModifierInput } from './adapter/derive-armor-class-modifiers.js';

// ── Saving throw adapter (engine-saving-throw-parity) ─────────────────────────

export { deriveSavingThrowProficiencies } from './adapter/derive-saving-throw-proficiencies.js';

// ── Skill proficiency adapter (engine-skill-parity) ───────────────────────────

export { deriveSkillProficiencies } from './adapter/derive-skill-proficiencies.js';
export type { SkillProficiencyInput } from './adapter/derive-skill-proficiencies.js';
