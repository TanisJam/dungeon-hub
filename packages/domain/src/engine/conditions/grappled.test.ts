/**
 * Tests for GRAPPLED_CONDITION_DEF — Grappled condition definition (PHB p.290).
 *
 * PHB p.290, Appendix A — Grappled:
 *   "A grappled creature's speed becomes 0, and it can't benefit from any bonus to its
 *    speed."
 *   "The condition ends if the grappler is incapacitated (see the condition)."
 *   "The condition also ends if an effect removes the grappled creature from the reach
 *    of the grappler or grappling effect, such as when a creature is hurled away by the
 *    thunderwave spell."
 *
 * PHB p.290: Being grappled says nothing about attack rolls — NO attacker advantage or
 *   disadvantage is imposed on attackers of a grappled creature. Contrast with Prone
 *   (PHB p.292) which explicitly grants advantage to nearby melee attackers.
 *
 * Design ref: sdd/engine-contested-checks/design — D-COND (GRAPPLED_CONDITION_DEF shape).
 * Spec: REQ-COND-01..04.
 *
 * Strict TDD — RED first: this file is written BEFORE grappled.ts exists.
 */

import { describe, expect, it } from 'vitest';
import { GRAPPLED_CONDITION_DEF } from './grappled.js';

describe('GRAPPLED_CONDITION_DEF', () => {
  // ── T2a-RED: name === 'Grappled' ─────────────────────────────────────────────

  it(
    'T2a — name === "Grappled" (REQ-COND-02, PHB p.290)',
    () => {
      // PHB p.290: "Grappled" is the condition name (Appendix A).
      expect(GRAPPLED_CONDITION_DEF.name).toBe('Grappled');
    },
  );

  // ── T2b-RED: selfMod is present with the placeholder shape ──────────────────

  it(
    'T2b — selfMod is present with shape { kind: "advantage", mode: "impose", rollType: "attack" } (REQ-COND-03, placeholder — incapacitated.ts pattern)',
    () => {
      // REQ-COND-03: selfMod MUST be present but is a PLACEHOLDER — speed=0 is not expressible
      // via AdvantageMod shape (TODO #513). Same stance as INCAPACITATED_CONDITION_DEF.selfMod.
      // PHB p.290: "A grappled creature's speed becomes 0" — deferred (no movement subsystem).
      expect(GRAPPLED_CONDITION_DEF.selfMod).toBeDefined();
      expect(GRAPPLED_CONDITION_DEF.selfMod.kind).toBe('advantage');
      expect(GRAPPLED_CONDITION_DEF.selfMod.mode).toBe('impose');
      expect(GRAPPLED_CONDITION_DEF.selfMod.rollType).toBe('attack');
    },
  );

  // ── T2c-RED: outgoing predicates shape — grantPredicate is alwaysTrue, imposePredicate is NOT(alwaysTrue) ─

  it(
    'T2c — outgoingMod.grantPredicate is alwaysTrue() (REQ-COND-04 — grappled grants no advantage to attackers, PHB p.290)',
    () => {
      // PHB p.290: being grappled says nothing about attack rolls against the grappled creature.
      // grantPredicate is alwaysTrue() but the impose predicate is dead (never-fires → no disadvantage),
      // matching the INCAPACITATED precedent (incapacitated.ts:72-74).
      // alwaysTrue() shape: { op: 'and', nodes: [] } (vacuous conjunction)
      const pred = GRAPPLED_CONDITION_DEF.outgoingMod.grantPredicate;
      expect(pred).toEqual({ op: 'and', nodes: [] });
    },
  );

  it(
    'T2c (impose) — outgoingMod.imposePredicate is NOT(alwaysTrue()) — never fires (PHB p.290, no disadvantage on attackers)',
    () => {
      // PHB p.290: being grappled does NOT impose disadvantage on attackers either.
      // imposePredicate = not(alwaysTrue()) = always-false (dead predicate — never fires).
      // Same shape as INCAPACITATED_CONDITION_DEF.outgoingMod.imposePredicate (incapacitated.ts:74).
      const pred = GRAPPLED_CONDITION_DEF.outgoingMod.imposePredicate;
      expect(pred).toEqual({ op: 'not', node: { op: 'and', nodes: [] } });
    },
  );

  // ── T2d-RED: outgoingMod is present ─────────────────────────────────────────

  it(
    'T2d — outgoingMod is present (REQ-COND-04, ConditionDefinition interface requires it)',
    () => {
      // REQ-COND-04: GRAPPLED_CONDITION_DEF must have outgoingMod (ConditionDefinition shape).
      // The outgoingMod is structurally present but its predicates are inert (never fires).
      expect(GRAPPLED_CONDITION_DEF.outgoingMod).toBeDefined();
      expect(GRAPPLED_CONDITION_DEF.outgoingMod.grantPredicate).toBeDefined();
      expect(GRAPPLED_CONDITION_DEF.outgoingMod.imposePredicate).toBeDefined();
    },
  );
});
