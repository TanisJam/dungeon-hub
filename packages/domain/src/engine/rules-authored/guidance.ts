/**
 * Guidance cantrip — cross-entity +1d4 ability check rule document.
 *
 * // PHB 248 (Cantrips — Guidance): "You touch one willing creature. Once before the
 * // spell ends, the target can roll a d4 and add the number rolled to one ability
 * // check of its choice. It can roll the die before or after making the ability check."
 * // Concentration, 1 minute.
 *
 * REQ-RULE-GUIDANCE-01.
 *
 * DESIGN (LOCKED): Model the +1d4 as a cross-entity NumMod{value:'1d4'} scoped to the
 * target via axis:'entities'. Trigger:'always'. The stat key is a parameter — the caller
 * specifies which skill/check the target is making, matching PHB "one ability check of
 * its choice" (the choice is resolved at call time, deferred tracking via TODO).
 *
 * The "once per cast / one check of its choice" usage-tracking is OUT OF SCOPE:
 * // TODO: choice-runtime — track which check was chosen + usage state.
 *
 * Concentration token wires the duration/removal (same pattern as Bless).
 */
import type { RuleDoc } from '../authoring/types.js';

/**
 * RuleDoc for the Guidance cantrip.
 *
 * Params:
 *   casterId   — the caster of Guidance
 *   targetId   — the target receiving the bonus
 *   statKey    — the specific ability check stat (e.g. 'skill.athletics', 'str')
 *   token      — concentration token linking all instances to this cast
 */
export const guidanceRuleDoc: RuleDoc = {
  id: 'guidance',
  source: 'PHB 248',
  ruleText:
    'Target can roll a d4 and add the number rolled to one ability check of its choice.',
  params: [
    { name: 'casterId', type: 'EntityId' },
    { name: 'targetId', type: 'EntityId' },
    { name: 'statKey', type: 'string' },
    { name: 'token', type: 'string' },
  ],
  emits: [
    {
      def: {
        kind: 'num',
        op: 'add',
        value: '1d4',
        // stat is a template slot: filled with the specific skill/check at call time.
        // PHB 248: "one ability check of its choice" — the stat is chosen by the target.
        // TODO: choice-runtime — track choice + usage.
        stat: '{statKey}',
        category: 'untyped',
      },
      scope: {
        owner: '{casterId}',
        target: { axis: 'entities', ids: ['{targetId}'] },
        trigger: 'always',
      },
      duration: {
        unit: 'minute',
        amount: 1,
        endsOn: ['concentration-ends'],
        concentrationToken: '{token}',
      },
      label: 'Guidance ({casterId})',
      idTemplate: '{ruleId}-check-{casterId}-{targetId}',
    },
  ],
  testCases: [],
};
