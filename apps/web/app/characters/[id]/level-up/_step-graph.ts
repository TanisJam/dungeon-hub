/**
 * Step-graph for the level-up flow.
 *
 * Pure module — no React, no state, no IO. Testable with Vitest as a unit.
 *
 * REQ-CLU-GRAPH-STEP-TYPE: StepId union with 7 steps.
 * REQ-CLU-GRAPH-STEP-NODE-TYPE: STEP_GRAPH constant with predicate per step.
 * REQ-CLU-GRAPH-BUILD-ACTIVE-STEPS: buildActiveSteps filters graph per FlowState+FlowCtx.
 * REQ-CLU-GRAPH-PREV-FROM-REVIEW: prevStep navigates to the last active step before 'review'.
 * REQ-CLU-GRAPH-TOTAL-STEPS-DERIVED: totalActiveSteps derived from buildActiveSteps length.
 */

// ── Types ──────────────────────────────────────────────────────────────────────

export type StepId =
  | 'mode'
  | 'class'
  | 'hp'
  | 'subclass'
  | 'asi-feat'
  | 'spells'
  | 'review';

export type Mode = 'same-class' | 'new-class';
export type ClassRef = { slug: string; source: string };
export type HpMethod = 'average' | 'roll';
export type AsiFeatKind = 'asi' | 'feat' | null;

export interface AppliedClassSpellsLite {
  cantrips: ClassRef[];
  known: ClassRef[];
  prepared: ClassRef[];
}

export interface FlowState {
  step: StepId;
  mode: Mode | null;
  selectedClass: ClassRef | null;
  hpMethod: HpMethod;
  asiFeat: AsiFeatKind;
  asiDeltas: Partial<Record<string, number>>;
  /** Subclass picked at the subclass step. null until step completed or skipped. */
  subclass: ClassRef | null;
  /** Spell picks at the spells step. null until step completed or skipped. */
  spellPicks: AppliedClassSpellsLite | null;
}

/**
 * Static, per-page context the predicates need.
 * Computed once on the server in page.tsx and passed in as a prop.
 * Keeps the graph pure.
 */
export interface FlowCtx {
  /** Per owned class: the level at which the class unlocks its subclass. */
  subclassUnlockLevelByClass: Record<string, number>;
  /** Per owned class: whether the character already picked a subclass for it. */
  alreadyHasSubclassByClass: Record<string, boolean>;
  /** Per owned class: from→to spell delta envelope. */
  spellDeltaByClass: Record<string, { cantripsDelta: number; spellsDelta: number; isWizardSpellbook: boolean }>;
  /** Per owned class: is the next level an ASI level. */
  isAsiLevelByClass: Record<string, boolean>;
  /** Per owned class: hit die label, e.g. 'd10'. */
  hitDieByClass: Record<string, string>;
  /** Per owned/leveling class: the target class level after this level-up. */
  toLevelByClass: Record<string, number>;
}

interface StepNode {
  id: StepId;
  isActive: (s: FlowState, ctx: FlowCtx) => boolean;
}

// ── Predicates ────────────────────────────────────────────────────────────────

function needsSubclass(s: FlowState, ctx: FlowCtx): boolean {
  if (!s.selectedClass || !s.mode) return false;
  // new-class path: subclass for L1-unlock classes is handled by the multiclass API;
  // the flow UI does not show a subclass step for new-class (design decision for this SDD).
  if (s.mode === 'new-class') return false;

  const slug = s.selectedClass.slug;
  const unlockLevel = ctx.subclassUnlockLevelByClass[slug];
  if (unlockLevel === undefined) return false;

  const toLevel = ctx.toLevelByClass[slug];
  if (toLevel === undefined) return false;
  if (toLevel < unlockLevel) return false;

  return !ctx.alreadyHasSubclassByClass[slug];
}

function needsAsiFeat(s: FlowState, ctx: FlowCtx): boolean {
  if (!s.selectedClass || s.mode !== 'same-class') return false;
  return ctx.isAsiLevelByClass[s.selectedClass.slug] === true;
}

function needsSpells(s: FlowState, ctx: FlowCtx): boolean {
  if (!s.selectedClass) return false;
  // new-class path: spell initialization for new classes is out of scope for this SDD.
  if (s.mode === 'new-class') return false;

  const slug = s.selectedClass.slug;
  const delta = ctx.spellDeltaByClass[slug];
  if (!delta) return false;

  return delta.cantripsDelta > 0 || delta.spellsDelta > 0 || delta.isWizardSpellbook;
}

// ── Graph ─────────────────────────────────────────────────────────────────────

/** Canonical step order. Predicates filter which steps are active. */
const STEP_GRAPH: ReadonlyArray<StepNode> = [
  { id: 'mode',     isActive: () => true },
  { id: 'class',    isActive: () => true },
  { id: 'hp',       isActive: () => true },
  { id: 'subclass', isActive: needsSubclass },
  { id: 'asi-feat', isActive: needsAsiFeat },
  { id: 'spells',   isActive: needsSpells },
  { id: 'review',   isActive: () => true },
];

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns only the steps whose predicates pass for the given state+ctx.
 * The returned list always starts with 'mode' and ends with 'review'.
 */
export function buildActiveSteps(state: FlowState, ctx: FlowCtx): StepId[] {
  return STEP_GRAPH.filter((node) => node.isActive(state, ctx)).map((node) => node.id);
}

/**
 * Returns the next active step after the current one, or null if at the end.
 */
export function nextStep(state: FlowState, ctx: FlowCtx): StepId | null {
  const active = buildActiveSteps(state, ctx);
  const idx = active.indexOf(state.step);
  if (idx === -1 || idx === active.length - 1) return null;
  return active[idx + 1] ?? null;
}

/**
 * Returns the previous active step before the current one, or null if at the start.
 */
export function prevStep(state: FlowState, ctx: FlowCtx): StepId | null {
  const active = buildActiveSteps(state, ctx);
  const idx = active.indexOf(state.step);
  if (idx <= 0) return null;
  return active[idx - 1] ?? null;
}

/**
 * Total count of active steps (for "{n}/{total}" progress display).
 * REQ-CLU-GRAPH-TOTAL-STEPS-DERIVED: replaces hardcoded const totalSteps = 5.
 */
export function totalActiveSteps(state: FlowState, ctx: FlowCtx): number {
  return buildActiveSteps(state, ctx).length;
}

/**
 * 1-based index of the current step within the active list.
 * Returns 0 if the current step is not in the active list (shouldn't happen).
 */
export function currentStepIndex(state: FlowState, ctx: FlowCtx): number {
  const active = buildActiveSteps(state, ctx);
  const idx = active.indexOf(state.step);
  return idx === -1 ? 0 : idx + 1;
}

/**
 * True when the user is on 'review' step.
 */
export function isComplete(state: FlowState, ctx: FlowCtx): boolean {
  return state.step === 'review';
}
