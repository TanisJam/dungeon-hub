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

// ── Action pipeline ───────────────────────────────────────────────────────────

export type { AttackPhase, SpellPhase } from './pipeline/phases.js';
export { advancePhase } from './pipeline/state-machine.js';
export type { PipelineSignal, AdvanceResult } from './pipeline/state-machine.js';

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

export { buildProneModifiers } from './rules/prone.js';
export type {
  ConditionResolver,
  BuildProneResult,
  ConditionNotFoundIssue,
} from './rules/prone.js';

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

// ── Inventory adapter (Slice 4) ───────────────────────────────────────────────

export { deriveInventoryModifiers } from './adapter/derive-inventory-modifiers.js';
export type { ItemModifierMap } from './adapter/derive-inventory-modifiers.js';
