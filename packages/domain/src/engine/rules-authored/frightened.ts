/**
 * Frightened condition — disadvantage on attacks and ability checks rule document.
 *
 * // PHB 290 (Appendix A — Frightened): "A frightened creature has disadvantage
 * // on ability checks and attack rolls while the source of its fear is within
 * // its line of sight."
 * // FLAG: "can't willingly move closer to the source of its fear" is movement
 * // logic — OUT OF SCOPE. Only the roll-disadvantage half is encoded here.
 *
 * REQ-RULE-FRIGHTENED-01.
 *
 * Two emits:
 *   1. AdvantageMod{kind:'advantage', mode:'impose', rollType:'attack'}
 *      + predicate{op:'query', q:{kind:'canSee', entity:'self', of:'caster'}}
 *   2. AdvantageMod{kind:'advantage', mode:'impose', rollType:'check'}
 *      + predicate (same)
 *
 * The predicate reuses the EXISTING `canSee` WorldQuery leaf — no new primitive.
 * The `caster` in this context is the fear source (the entity causing Frightened).
 * The engine's canSee evaluator uses ctx.currentAction.id as the casterId, and
 * ctx.visibility.selfCanSee to resolve visibility (see predicate/evaluate.ts).
 */
import type { RuleDoc } from '../authoring/types.js';

/**
 * RuleDoc for the Frightened condition.
 *
 * Params:
 *   charId       — the frightened character
 *   fearSourceId — the entity causing the Frightened condition (the "fear source")
 */
export const frightenedRuleDoc: RuleDoc = {
  id: 'frightened',
  source: 'PHB 290',
  ruleText:
    'A frightened creature has disadvantage on ability checks and attack rolls while the source of its fear is within its line of sight.',
  params: [
    { name: 'charId', type: 'EntityId' },
    { name: 'fearSourceId', type: 'EntityId' },
  ],
  emits: [
    // Emit 1: disadvantage on attack rolls (while fear source visible)
    {
      def: {
        kind: 'advantage',
        mode: 'impose',
        rollType: 'attack',
      },
      scope: {
        owner: '{charId}',
        target: { axis: 'self' },
        trigger: 'always',
      },
      predicate: {
        op: 'query',
        q: { kind: 'canSee', entity: 'self', of: 'caster' },
      },
      label: 'Frightened',
      idTemplate: '{ruleId}-attack-{charId}',
    },
    // Emit 2: disadvantage on ability checks (while fear source visible)
    {
      def: {
        kind: 'advantage',
        mode: 'impose',
        rollType: 'check',
      },
      scope: {
        owner: '{charId}',
        target: { axis: 'self' },
        trigger: 'always',
      },
      predicate: {
        op: 'query',
        q: { kind: 'canSee', entity: 'self', of: 'caster' },
      },
      label: 'Frightened',
      idTemplate: '{ruleId}-check-{charId}',
    },
  ],
  testCases: [],
};
