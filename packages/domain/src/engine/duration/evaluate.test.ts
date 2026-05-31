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

// ── evaluateDuration: turn-anchor branch (Branch 7) ──────────────────────────
//
// PHB p.189 — durations relative to a creature's turn boundary:
//   "until the end of your next turn", "until the start of your next turn".
// Identity-namespace: anchorCombatantId + currentCombatantId are COMBATANT UUIDs
// (encounter_combatants.id) — NEVER character EntityIds from ctx.self.id.
// Tests intentionally use 'cmb-abc' / 'cmb-xyz' (visibly distinct from 'char-id').

describe('evaluateDuration — turn-anchor branch (REQ-DUR-01, REQ-DUR-02, REQ-DUR-03)', () => {
  it('Scenario 7.1 — expired: turnsRemaining=0, boundary=end, currentCombatantId matches anchor', () => {
    // PHB p.189: "lasts until the end of your next turn" — expired when counter hits 0
    // at the anchor combatant's turn-end boundary.
    // REQ-DUR-01: all four conditions satisfied simultaneously → return false (expired).
    const inst = makeInstance({
      duration: makeDuration({
        turnAnchor: { anchorCombatantId: 'cmb-abc', boundary: 'end' },
      }),
      turnsRemaining: 0,
    });
    const ctx = makeCtx({ currentCombatantId: 'cmb-abc' });
    expect(evaluateDuration(inst, ctx)).toBe(false);
  });

  it('Scenario 7.2 — active: turnsRemaining=1 on anchor combatant\'s turn', () => {
    // PHB p.189: still has remaining turns — not expired yet.
    // REQ-DUR-01: turnsRemaining !== 0 → return true (active).
    const inst = makeInstance({
      duration: makeDuration({
        turnAnchor: { anchorCombatantId: 'cmb-abc', boundary: 'end' },
      }),
      turnsRemaining: 1,
    });
    const ctx = makeCtx({ currentCombatantId: 'cmb-abc' });
    expect(evaluateDuration(inst, ctx)).toBe(true);
  });

  it('Scenario 7.3 — active: not the anchor combatant\'s turn (different combatant)', () => {
    // PHB p.189: expiry is only evaluable on the anchor combatant's turn.
    // REQ-DUR-01: currentCombatantId !== anchorCombatantId → return true (active).
    // Even with turnsRemaining=0, a different combatant's turn cannot expire this effect.
    const inst = makeInstance({
      duration: makeDuration({
        turnAnchor: { anchorCombatantId: 'cmb-abc', boundary: 'end' },
      }),
      turnsRemaining: 0,
    });
    const ctx = makeCtx({ currentCombatantId: 'cmb-xyz' });
    expect(evaluateDuration(inst, ctx)).toBe(true);
  });

  it('Scenario 7.4 — active: currentCombatantId absent (conservative fallback, no error thrown)', () => {
    // REQ-DUR-02: turnAnchor present but currentCombatantId absent → cannot place anchor
    // → return true (active, conservative). Mirrors absent-encounterRound fallback.
    // Read-path tolerance: must NOT error even with turnsRemaining=0.
    const inst = makeInstance({
      duration: makeDuration({
        turnAnchor: { anchorCombatantId: 'cmb-abc', boundary: 'end' },
      }),
      turnsRemaining: 0,
    });
    const ctx = makeCtx(); // no currentCombatantId
    expect(evaluateDuration(inst, ctx)).toBe(true);
  });

  it('Scenario 7.5 — active: boundary=start, conservative-active (no PHB consumer this slice)', () => {
    // REQ-DUR-06, ADR-6: no PHB consumer for boundary=\'start\' in Slice 0.
    // Conservative stub: any \'start\'-boundary turn-anchor is always active until a future
    // slice with a real PHB consumer defines the semantics.
    // PHB p.189 — \'until the start of your next turn\' is declared but deferred.
    const inst = makeInstance({
      duration: makeDuration({
        turnAnchor: { anchorCombatantId: 'cmb-abc', boundary: 'start' },
      }),
      turnsRemaining: 0,
    });
    const ctx = makeCtx({ currentCombatantId: 'cmb-abc' });
    expect(evaluateDuration(inst, ctx)).toBe(true);
  });

  it('Scenario 7.6 — active: turnAnchor present but turnsRemaining absent (strict === 0 check)', () => {
    // REQ-DUR-02, ADR-3: undefined !== 0 — strict === 0 check; missing counter
    // cannot be declared expired → conservative-active.
    // Even on the anchor combatant\'s turn with boundary=\'end\': absent counter → active.
    const inst = makeInstance({
      duration: makeDuration({
        turnAnchor: { anchorCombatantId: 'cmb-abc', boundary: 'end' },
      }),
      // no turnsRemaining
    });
    const ctx = makeCtx({ currentCombatantId: 'cmb-abc' });
    expect(evaluateDuration(inst, ctx)).toBe(true);
  });

  it('Scenario 7.7 — active: \'turn-ends\' EndCondition without turnAnchor → conservative active (no error)', () => {
    // REQ-DUR-07, ADR-5: \'turn-ends\' is declared in EndCondition union but has no evaluated
    // branch. Without a structured turnAnchor descriptor (no anchor identity), it cannot
    // determine WHICH combatant\'s turn ends it → conservative fallback to active.
    // No error must be thrown. This exercises the deferred / declared-but-unevaluated path.
    const inst = makeInstance({
      duration: makeDuration({ endsOn: ['turn-ends'] }),
      // no turnAnchor on duration, no startRound → will hit encounterRound/startRound fallbacks
    });
    expect(evaluateDuration(inst, makeCtx({ encounterRound: 5 }))).toBe(true);
  });
});
