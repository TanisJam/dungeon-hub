/**
 * Tests for the step-graph pure module.
 *
 * REQ-CLU-GRAPH-STEP-TYPE: StepId union covers all 7 steps.
 * REQ-CLU-GRAPH-STEP-NODE-TYPE: STEP_GRAPH constant + predicates.
 * REQ-CLU-GRAPH-BUILD-ACTIVE-STEPS: buildActiveSteps filters correctly per FlowState+FlowCtx.
 * REQ-CLU-GRAPH-PREV-FROM-REVIEW: prevStep from 'review' lands on last active step.
 * REQ-CLU-GRAPH-TOTAL-STEPS-DERIVED: totalActiveSteps matches buildActiveSteps length.
 *
 * Pure Vitest — no @testing-library/react, no React imports.
 */
import { describe, it, expect } from 'vitest';
import {
  buildActiveSteps,
  nextStep,
  prevStep,
  totalActiveSteps,
  currentStepIndex,
  isComplete,
} from './_step-graph';
import type { FlowState, FlowCtx } from './_step-graph';

// ── Helpers ────────────────────────────────────────────────────────────────

function makeState(overrides: Partial<FlowState> = {}): FlowState {
  return {
    step: 'mode',
    mode: null,
    selectedClass: null,
    hpMethod: 'average',
    asiFeat: null,
    asiDeltas: {},
    subclass: null,
    spellPicks: null,
    ...overrides,
  };
}

function makeCtx(overrides: Partial<FlowCtx> = {}): FlowCtx {
  return {
    subclassUnlockLevelByClass: {},
    alreadyHasSubclassByClass: {},
    spellDeltaByClass: {},
    isAsiLevelByClass: {},
    hitDieByClass: {},
    toLevelByClass: {},
    ...overrides,
  };
}

// ── buildActiveSteps ─────────────────────────────────────────────────────────

describe('buildActiveSteps', () => {
  it('default (no class selected): mode→class→hp→review only', () => {
    const state = makeState({ step: 'mode' });
    const ctx = makeCtx();
    expect(buildActiveSteps(state, ctx)).toEqual(['mode', 'class', 'hp', 'review']);
  });

  it('Cleric same-class L0→L1 (unlock=1, no subclass): adds subclass', () => {
    // PHB p.58: Cleric Divine Domain at L1 (unlock level = 1)
    const state = makeState({
      step: 'class',
      mode: 'same-class',
      selectedClass: { slug: 'cleric', source: 'PHB' },
    });
    const ctx = makeCtx({
      subclassUnlockLevelByClass: { cleric: 1 },
      alreadyHasSubclassByClass: { cleric: false },
      toLevelByClass: { cleric: 1 },
    });
    expect(buildActiveSteps(state, ctx)).toEqual(['mode', 'class', 'hp', 'subclass', 'review']);
  });

  it('Cleric same-class L1→L2 (already has subclass): no conditional steps', () => {
    const state = makeState({
      step: 'class',
      mode: 'same-class',
      selectedClass: { slug: 'cleric', source: 'PHB' },
    });
    const ctx = makeCtx({
      subclassUnlockLevelByClass: { cleric: 1 },
      alreadyHasSubclassByClass: { cleric: true },  // already has it
      spellDeltaByClass: { cleric: { cantripsDelta: 0, spellsDelta: 0, isWizardSpellbook: false } },
      isAsiLevelByClass: { cleric: false },
      toLevelByClass: { cleric: 2 },
    });
    expect(buildActiveSteps(state, ctx)).toEqual(['mode', 'class', 'hp', 'review']);
  });

  it('Cleric same-class L3→L4 (prepared caster with cantripsDelta=1): adds spells', () => {
    // PHB p.58: Cleric gains a cantrip at L4 — cantrip pick is a level-up choice
    const state = makeState({
      step: 'class',
      mode: 'same-class',
      selectedClass: { slug: 'cleric', source: 'PHB' },
    });
    const ctx = makeCtx({
      subclassUnlockLevelByClass: { cleric: 1 },
      alreadyHasSubclassByClass: { cleric: true },
      spellDeltaByClass: { cleric: { cantripsDelta: 1, spellsDelta: 0, isWizardSpellbook: false } },
      isAsiLevelByClass: { cleric: false },
      toLevelByClass: { cleric: 4 },
    });
    expect(buildActiveSteps(state, ctx)).toEqual(['mode', 'class', 'hp', 'spells', 'review']);
  });

  it('Wizard same-class L1→L2 (unlock=2, no subclass, isWizardSpellbook=true): subclass + spells', () => {
    // PHB p.114: Wizard Arcane Tradition at L2 (unlock=2)
    const state = makeState({
      step: 'class',
      mode: 'same-class',
      selectedClass: { slug: 'wizard', source: 'PHB' },
    });
    const ctx = makeCtx({
      subclassUnlockLevelByClass: { wizard: 2 },
      alreadyHasSubclassByClass: { wizard: false },
      spellDeltaByClass: { wizard: { cantripsDelta: 0, spellsDelta: 2, isWizardSpellbook: true } },
      isAsiLevelByClass: { wizard: false },
      toLevelByClass: { wizard: 2 },
    });
    expect(buildActiveSteps(state, ctx)).toEqual(['mode', 'class', 'hp', 'subclass', 'spells', 'review']);
  });

  it('Fighter same-class L3→L4 (isAsiLevel=true, no subclass needed): adds asi-feat', () => {
    // PHB p.72: Fighter L4 = Ability Score Improvement
    const state = makeState({
      step: 'class',
      mode: 'same-class',
      selectedClass: { slug: 'fighter', source: 'PHB' },
    });
    const ctx = makeCtx({
      subclassUnlockLevelByClass: { fighter: 3 },
      alreadyHasSubclassByClass: { fighter: true },  // already has Champion or similar
      spellDeltaByClass: {},
      isAsiLevelByClass: { fighter: true },
      toLevelByClass: { fighter: 4 },
    });
    expect(buildActiveSteps(state, ctx)).toEqual(['mode', 'class', 'hp', 'asi-feat', 'review']);
  });

  it('Bard same-class L3→L4 (spellsDelta=1, cantripsDelta=1): adds spells only', () => {
    // PHB p.53: Bard L4 = +1 cantrip + +1 known spell
    const state = makeState({
      step: 'class',
      mode: 'same-class',
      selectedClass: { slug: 'bard', source: 'PHB' },
    });
    const ctx = makeCtx({
      subclassUnlockLevelByClass: { bard: 3 },
      alreadyHasSubclassByClass: { bard: true },
      spellDeltaByClass: { bard: { cantripsDelta: 1, spellsDelta: 1, isWizardSpellbook: false } },
      isAsiLevelByClass: { bard: false },
      toLevelByClass: { bard: 4 },
    });
    expect(buildActiveSteps(state, ctx)).toEqual(['mode', 'class', 'hp', 'spells', 'review']);
  });

  it('new-class (mode=new-class, Cleric unlock=1): NO subclass step (new-class scope per design)', () => {
    // Design decision: new-class path skips subclass step for THIS SDD.
    // Subclass for L1-unlock classes in new-class is handled by multiclass validation (requires subclassData).
    const state = makeState({
      step: 'class',
      mode: 'new-class',
      selectedClass: { slug: 'cleric', source: 'PHB' },
    });
    const ctx = makeCtx({
      subclassUnlockLevelByClass: { cleric: 1 },
      alreadyHasSubclassByClass: { cleric: false },
      toLevelByClass: { cleric: 1 },
    });
    // new-class skips subclass + spells steps (design: out of scope for new-class path in this SDD)
    expect(buildActiveSteps(state, ctx)).toEqual(['mode', 'class', 'hp', 'review']);
  });
});

// ── prevStep from 'review' ──────────────────────────────────────────────────

describe('prevStep — from review', () => {
  it('Wizard L1→L2 (subclass + spells active): review → spells', () => {
    const state = makeState({
      step: 'review',
      mode: 'same-class',
      selectedClass: { slug: 'wizard', source: 'PHB' },
    });
    const ctx = makeCtx({
      subclassUnlockLevelByClass: { wizard: 2 },
      alreadyHasSubclassByClass: { wizard: false },
      spellDeltaByClass: { wizard: { cantripsDelta: 0, spellsDelta: 2, isWizardSpellbook: true } },
      isAsiLevelByClass: { wizard: false },
      toLevelByClass: { wizard: 2 },
    });
    expect(prevStep(state, ctx)).toBe('spells');
  });

  it('Cleric L1→L2 (no conditional steps): review → hp', () => {
    const state = makeState({
      step: 'review',
      mode: 'same-class',
      selectedClass: { slug: 'cleric', source: 'PHB' },
    });
    const ctx = makeCtx({
      subclassUnlockLevelByClass: { cleric: 1 },
      alreadyHasSubclassByClass: { cleric: true },
      spellDeltaByClass: { cleric: { cantripsDelta: 0, spellsDelta: 0, isWizardSpellbook: false } },
      isAsiLevelByClass: { cleric: false },
      toLevelByClass: { cleric: 2 },
    });
    expect(prevStep(state, ctx)).toBe('hp');
  });

  it('Fighter L3→L4 (ASI level): review → asi-feat', () => {
    const state = makeState({
      step: 'review',
      mode: 'same-class',
      selectedClass: { slug: 'fighter', source: 'PHB' },
    });
    const ctx = makeCtx({
      subclassUnlockLevelByClass: { fighter: 3 },
      alreadyHasSubclassByClass: { fighter: true },
      isAsiLevelByClass: { fighter: true },
      toLevelByClass: { fighter: 4 },
    });
    expect(prevStep(state, ctx)).toBe('asi-feat');
  });
});

// ── nextStep ────────────────────────────────────────────────────────────────

describe('nextStep', () => {
  it('new-class (no subclass/spells steps): class → hp', () => {
    const state = makeState({
      step: 'class',
      mode: 'new-class',
      selectedClass: { slug: 'fighter', source: 'PHB' },
    });
    const ctx = makeCtx();
    expect(nextStep(state, ctx)).toBe('hp');
  });

  it('returns null from review (last step)', () => {
    const state = makeState({ step: 'review' });
    const ctx = makeCtx();
    expect(nextStep(state, ctx)).toBeNull();
  });
});

// ── totalActiveSteps ────────────────────────────────────────────────────────

describe('totalActiveSteps', () => {
  it('matches buildActiveSteps length', () => {
    const state = makeState({
      step: 'hp',
      mode: 'same-class',
      selectedClass: { slug: 'wizard', source: 'PHB' },
    });
    const ctx = makeCtx({
      subclassUnlockLevelByClass: { wizard: 2 },
      alreadyHasSubclassByClass: { wizard: false },
      spellDeltaByClass: { wizard: { cantripsDelta: 0, spellsDelta: 2, isWizardSpellbook: true } },
      toLevelByClass: { wizard: 2 },
    });
    expect(totalActiveSteps(state, ctx)).toBe(buildActiveSteps(state, ctx).length);
  });
});

// ── currentStepIndex ────────────────────────────────────────────────────────

describe('currentStepIndex', () => {
  it('review on a 6-step Wizard path → index 6 (1-based)', () => {
    const state = makeState({
      step: 'review',
      mode: 'same-class',
      selectedClass: { slug: 'wizard', source: 'PHB' },
    });
    const ctx = makeCtx({
      subclassUnlockLevelByClass: { wizard: 2 },
      alreadyHasSubclassByClass: { wizard: false },
      spellDeltaByClass: { wizard: { cantripsDelta: 0, spellsDelta: 2, isWizardSpellbook: true } },
      toLevelByClass: { wizard: 2 },
    });
    // activeSteps = ['mode','class','hp','subclass','spells','review'] → 6 steps, review is index 6
    expect(currentStepIndex(state, ctx)).toBe(6);
  });

  it('hp on a 4-step simple path → index 3 (1-based)', () => {
    const state = makeState({ step: 'hp', mode: 'new-class', selectedClass: { slug: 'fighter', source: 'PHB' } });
    const ctx = makeCtx();
    // activeSteps = ['mode','class','hp','review'] → hp is index 3
    expect(currentStepIndex(state, ctx)).toBe(3);
  });
});

// ── isComplete ──────────────────────────────────────────────────────────────

describe('isComplete', () => {
  it('returns true on review step', () => {
    const state = makeState({ step: 'review' });
    const ctx = makeCtx();
    expect(isComplete(state, ctx)).toBe(true);
  });

  it('returns false on any non-review step', () => {
    const ctx = makeCtx();
    for (const step of ['mode', 'class', 'hp', 'subclass', 'asi-feat', 'spells'] as const) {
      expect(isComplete(makeState({ step }), ctx)).toBe(false);
    }
  });
});
