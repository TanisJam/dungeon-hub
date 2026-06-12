/**
 * feralInstinctRuleDoc — DSL authoring of Feral Instinct (Barbarian).
 *
 * PHB p.50 — Feral Instinct (Barbarian):
 *   "By 7th level, your instincts are so honed that you have advantage on
 *    initiative rolls."
 *
 * Scope (advantage half only):
 *   This rule doc encodes only the advantage-on-initiative half of Feral Instinct.
 *   The surprise exemption clause (PHB p.50: "if you are surprised at the beginning of
 *   combat ... you can act normally on your first turn, but only if you enter your rage
 *   before doing anything else") was OUT OF SCOPE (REQ-OOS-01) until engine-surprise-round1
 *   (B10 S3). That SDD now enforces the carve-out via `isSurpriseExempt` (domain predicate,
 *   packages/domain/src/engine/conditions/surprised.ts) + activate-rage.ts (IO layer).
 *   REQ-OOS-01 is RESOLVED — the enforcement lives outside this rule doc.
 *
 * Implementation notes:
 *   - NO predicate on the emit. The barbarianLevel >= 7 gate is a registration-time
 *     guard in roll-combatant-initiative.ts (dangerSense/barbarianLevel >= 2 precedent).
 *   - rollType: 'initiative' (distinct from 'check') provides isolation (REQ-TRIGGER-02):
 *     a {trigger:'on-initiative'} query DOES NOT gather 'on-check' instances (rage, etc.),
 *     and a {trigger:'on-check'} query DOES NOT gather this emit.
 *   - trigger: 'on-initiative' MUST be in BOTH types.ts Trigger union AND schema.ts Zod
 *     enum (dual-location rule, REQ-TRIGGER-01). Without the Zod literal, parseRule
 *     rejects this doc.
 *
 * 1 emit:
 *   AdvantageMod — grant/initiative, axis:self, trigger:'on-initiative', NO predicate.
 *
 * Params:
 *   barbarianId — EntityId of the barbarian character.
 *
 * T-V-01 RESOLVED: PHB page physically verified as p.50 at apply time per apply constraint.
 * REQ-RULEDOC-01..03, REQ-TRIGGER-01..02.
 */
import type { RuleDoc } from '../authoring/types.js';

export const feralInstinctRuleDoc: RuleDoc = {
  id: 'feral-instinct',
  // PHB p.50 — physically verified at apply time (T-V-01 resolved; see apply constraint).
  source: 'PHB p.50',
  ruleText: 'You have advantage on initiative rolls.',
  params: [{ name: 'barbarianId', type: 'EntityId' }],
  emits: [
    // ── EMIT 1: AdvantageMod — grant/initiative (PHB p.50) ───────────────────
    // PHB p.50: "advantage on initiative rolls."
    // trigger:'on-initiative' is the isolation mechanism (REQ-TRIGGER-02):
    //   - {trigger:'on-initiative'} queries DO NOT match 'on-check' instances (rage, guidance).
    //   - {trigger:'on-check'} queries DO NOT match this emit (Feral Instinct never leaks into checks).
    // NO predicate: the barbarianLevel >= 7 gate is registration-time in roll-combatant-initiative.ts.
    {
      def: {
        kind: 'advantage',
        mode: 'grant',
        rollType: 'initiative',
      },
      scope: {
        owner: '{barbarianId}',
        target: { axis: 'self' },
        trigger: 'on-initiative',
      },
      label: 'Feral Instinct',
      idTemplate: 'feral-instinct-{barbarianId}',
    },
  ],
  testCases: [],
};
