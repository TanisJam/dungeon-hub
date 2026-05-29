/**
 * Unit tests for evaluateDuration and convertToRounds.
 *
 * REQ-DUR-CONV-01 — canonical round conversions (PHB p.181)
 * REQ-DUR-EVAL-01 — no-duration → permanent (always active)
 * REQ-DUR-EVAL-02 — round/minute/hour expiry (PHB p.203, PHB p.181)
 * REQ-DUR-EVAL-03 — encounterRound absent → conservative fallback active
 * REQ-DUR-EVAL-04 — concentration-ends defers to DELETE-token path
 * REQ-DUR-REST-01 — short/long-rest endsOn defers to DELETE-on-event path
 * REQ-DUR-TOLERATE-01 — startRound absent → conservative fallback active
 * REQ-DUR-CONC-01  — concentration + round-based are additive (not competing)
 *
 * Design ref: sdd/engine-timeline-duration/design ADR-2, ADR-7.
 * Strict TDD: each branch has a RED test before the GREEN impl that passes it.
 */

import { describe, it, expect } from 'vitest';
import { evaluateDuration, convertToRounds } from './evaluate.js';
import type { ModifierInstance, ModifierInstanceId } from '../registry/types.js';
import type { EvaluationContext } from '../context.js';
import type { DurationSpec, Trigger } from '../types.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeInstance(overrides: Partial<ModifierInstance> = {}): ModifierInstance {
  return {
    id: 'test-instance' as ModifierInstanceId,
    def: { kind: 'noop' },
    scope: {
      owner: 'owner-id' as ModifierInstance['scope']['owner'],
      target: { axis: 'self' },
      trigger: 'always' as Trigger,
    },
    ...overrides,
  };
}

function makeCtx(overrides: Partial<EvaluationContext> = {}): EvaluationContext {
  return {
    self: { id: 'char-id' as EvaluationContext['self']['id'], conditions: [] },
    activeConditions: [],
    ...overrides,
  };
}

function makeDuration(overrides: Partial<DurationSpec> = {}): DurationSpec {
  return { unit: 'minute', amount: 1, ...overrides };
}

// ── convertToRounds ───────────────────────────────────────────────────────────

describe('convertToRounds (REQ-DUR-CONV-01)', () => {
  it('Scenario 1.1 — 1 minute = 10 rounds (PHB p.181)', () => {
    // PHB p.181: 1 minute = 10 rounds (60 seconds / 6 seconds per round)
    expect(convertToRounds({ unit: 'minute', amount: 1 })).toBe(10);
  });

  it('Scenario 1.2 — 1 hour = 600 rounds (PHB p.181)', () => {
    // PHB p.181: 1 hour = 600 rounds (3600 seconds / 6 seconds per round)
    expect(convertToRounds({ unit: 'hour', amount: 1 })).toBe(600);
  });

  it('Scenario 1.3 — round unit passes through', () => {
    // round unit: factor = 1; 3 rounds = 3 rounds
    expect(convertToRounds({ unit: 'round', amount: 3 })).toBe(3);
  });
});

// ── evaluateDuration: no-duration → permanent ─────────────────────────────────

describe('evaluateDuration — no-duration → permanent (REQ-DUR-EVAL-01)', () => {
  it('Scenario 2.1 — instance with no duration field is always active', () => {
    // REQ-DUR-EVAL-01: modifiers without a DurationSpec are permanent.
    // No PHB ref — architectural: these are removed only via explicit DELETE.
    const inst = makeInstance(); // no duration field
    const ctx = makeCtx();
    expect(evaluateDuration(inst, ctx)).toBe(true);
  });
});

// ── evaluateDuration: concentration-ends defers ───────────────────────────────

describe('evaluateDuration — concentration-ends defers (REQ-DUR-EVAL-04)', () => {
  it('Scenario 2.5 — concentration-ends endsOn → evaluator returns true (defers to DELETE path)', () => {
    // REQ-DUR-EVAL-04: concentration removal is via token DELETE, not evaluateDuration.
    // PHB p.203-204 — concentration.
    const inst = makeInstance({
      duration: makeDuration({ endsOn: ['concentration-ends'] }),
    });
    const ctx = makeCtx();
    expect(evaluateDuration(inst, ctx)).toBe(true);
  });
});

// ── evaluateDuration: short-rest / long-rest defer ────────────────────────────

describe('evaluateDuration — short/long-rest defers (REQ-DUR-REST-01)', () => {
  it('Scenario 4.2a — short-rest endsOn → evaluator returns true (event-triggered)', () => {
    // REQ-DUR-REST-01: short-rest removal is via DELETE on rest route, not evaluateDuration.
    // PHB p.186 — short rest.
    const inst = makeInstance({
      duration: makeDuration({ endsOn: ['short-rest'] }),
    });
    const ctx = makeCtx();
    expect(evaluateDuration(inst, ctx)).toBe(true);
  });

  it('Scenario 4.2b — long-rest endsOn → evaluator returns true (event-triggered)', () => {
    // REQ-DUR-REST-01: long-rest removal is via DELETE on rest route, not evaluateDuration.
    // PHB p.186 — long rest.
    const inst = makeInstance({
      duration: makeDuration({ endsOn: ['long-rest'] }),
    });
    const ctx = makeCtx();
    expect(evaluateDuration(inst, ctx)).toBe(true);
  });
});

// ── evaluateDuration: encounterRound absent → fallback active ─────────────────

describe('evaluateDuration — encounterRound absent → fallback (REQ-DUR-EVAL-03)', () => {
  it('Scenario 2.4 — round-based duration with no encounterRound → active (conservative fallback)', () => {
    // REQ-DUR-EVAL-03: outside tracked encounter → treat as active.
    // Documented design: modifiers cast outside encounters never expire by round.
    const inst = makeInstance({
      duration: makeDuration({ unit: 'minute', amount: 1 }),
      startRound: 1,
    });
    const ctx = makeCtx(); // no encounterRound
    expect(evaluateDuration(inst, ctx)).toBe(true);
  });
});

// ── evaluateDuration: startRound absent → fallback active ────────────────────

describe('evaluateDuration — startRound absent → fallback (REQ-DUR-TOLERATE-01)', () => {
  it('Scenario 8.1 — duration present but startRound absent → active (non-encounter cast)', () => {
    // REQ-DUR-TOLERATE-01: legacy rows + non-encounter casts have NULL start_round.
    // Without a cast reference point, we cannot compute elapsed rounds → active.
    const inst = makeInstance({
      duration: makeDuration({ unit: 'minute', amount: 1 }),
      // no startRound
    });
    const ctx = makeCtx({ encounterRound: 5 });
    expect(evaluateDuration(inst, ctx)).toBe(true);
  });
});

// ── evaluateDuration: bless_expires_after_10_rounds (architecture gate) ───────

describe('evaluateDuration — bless_expires_after_10_rounds (REQ-DUR-EVAL-02)', () => {
  it('Scenario 2.2a — Bless active at R+0 (elapsed 0 < 10)', () => {
    // Bless duration: 1 minute = 10 rounds (PHB p.181, PHB p.203).
    // Cast at startRound=5; at encounterRound=5 → elapsed=0 → active.
    const R = 5;
    const inst = makeInstance({
      duration: makeDuration({ unit: 'minute', amount: 1 }),
      startRound: R,
    });
    expect(evaluateDuration(inst, makeCtx({ encounterRound: R }))).toBe(true);
  });

  it('Scenario 2.2b — Bless active at R+9 (elapsed 9 < 10)', () => {
    // PHB p.181: 1 minute = 10 rounds. Round 9 is last active round.
    const R = 5;
    const inst = makeInstance({
      duration: makeDuration({ unit: 'minute', amount: 1 }),
      startRound: R,
    });
    expect(evaluateDuration(inst, makeCtx({ encounterRound: R + 9 }))).toBe(true);
  });

  it('Scenario 2.2c — Bless EXPIRED at R+10 (elapsed 10 >= 10)', () => {
    // PHB p.181: 1 minute = 10 rounds. At round 10 elapsed → expired.
    // Boundary: elapsed < convertToRounds → active; elapsed >= → expired.
    // This is the key architecture-validating gate for the bless-never-expires bug fix.
    const R = 5;
    const inst = makeInstance({
      duration: makeDuration({ unit: 'minute', amount: 1 }),
      startRound: R,
    });
    expect(evaluateDuration(inst, makeCtx({ encounterRound: R + 10 }))).toBe(false);
  });
});

// ── evaluateDuration: round-unit exact boundary ───────────────────────────────

describe('evaluateDuration — round-unit exact boundary (REQ-DUR-EVAL-02, Scenario 2.3)', () => {
  it('Scenario 2.3a — round duration: active when elapsed < amount', () => {
    // duration { unit: 'round', amount: 3 }, startRound=5 → active while elapsed<3
    // At encounterRound=7: elapsed=2 < 3 → active.
    const inst = makeInstance({
      duration: { unit: 'round', amount: 3 },
      startRound: 5,
    });
    expect(evaluateDuration(inst, makeCtx({ encounterRound: 7 }))).toBe(true);
  });

  it('Scenario 2.3b — round duration: expired when elapsed >= amount', () => {
    // At encounterRound=8: elapsed=3 >= 3 → expired.
    const inst = makeInstance({
      duration: { unit: 'round', amount: 3 },
      startRound: 5,
    });
    expect(evaluateDuration(inst, makeCtx({ encounterRound: 8 }))).toBe(false);
  });
});

// ── evaluateDuration: concentration + round-based additive ────────────────────

describe('evaluateDuration — concentration + round-based additive (REQ-DUR-CONC-01)', () => {
  it('Scenario 3.2 — concentration-ends + round duration: evaluator returns true (concentration path defers)', () => {
    // REQ-DUR-CONC-01: a modifier MAY carry both concentrationToken AND a round-based duration.
    // evaluateDuration defers when endsOn includes concentration-ends (sees concentration-ends
    // before the round calculation branch). The DELETE-token path owns actual removal.
    // PHB p.203-204 — concentration; PHB p.181 — time conversions.
    const inst = makeInstance({
      duration: {
        unit: 'minute',
        amount: 1,
        endsOn: ['concentration-ends'],
        concentrationToken: 'tok-1',
      },
      startRound: 0,
    });
    // encounterRound=10 would normally expire (elapsed=10>=10), but concentration-ends
    // short-circuits → evaluator returns true; DELETE path removes it when needed.
    expect(evaluateDuration(inst, makeCtx({ encounterRound: 10 }))).toBe(true);
  });
});
