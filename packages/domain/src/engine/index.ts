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

// ── Action pipeline ───────────────────────────────────────────────────────────

export type { AttackPhase, SpellPhase } from './pipeline/phases.js';
export { advancePhase } from './pipeline/state-machine.js';
export type { PipelineSignal, AdvanceResult } from './pipeline/state-machine.js';

export { resolveWeaponAttack } from './attack/resolve-weapon-attack.js';
export type { WeaponAttackInput, WeaponAttackResult } from './attack/resolve-weapon-attack.js';

export { rollToHit } from './attack/roll-to-hit.js';
export type { RollToHitResult, RollMode } from './attack/roll-to-hit.js';

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
