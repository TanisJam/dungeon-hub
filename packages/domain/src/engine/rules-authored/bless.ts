/**
 * Bless spell — DSL rule document.
 *
 * // PHB 219 — Bless: "Up to three creatures of your choice that you can see
 * // within range are blessed until the spell ends. Whenever a target makes
 * // an attack roll or a saving throw before the spell ends, the target can
 * // roll a d4 and add the number rolled to the attack roll or saving throw."
 * // Concentration, 1 minute.
 *
 * REQ-AE-10: concentrationToken substitution — {concentrationToken} in
 *   duration.concentrationToken is substituted at build() time via substituteDeep.
 * REQ-AE-11: behavioral equivalence — compiled output matches buildBlessModifiers
 *   (same id, stat, value, axis, duration fields, label).
 *
 * Two emits per target (fan-out via EntityId[] param 'targetIds'):
 *   1. NumMod{kind:'num', op:'add', value:'1d4', stat:'attack-roll', category:'untyped'}
 *   2. NumMod{kind:'num', op:'add', value:'1d4', stat:'saving-throw', category:'untyped'}
 *
 * Both instances:
 *   - scope.owner = casterId (caster owns the modifier, even though target is different)
 *   - scope.target = { axis:'entities', ids:[targetId] }  (cross-entity case)
 *   - duration = { unit:'minute', amount:1, endsOn:['concentration-ends'], concentrationToken }
 *   - label = 'Bless (<casterId>)'
 *   - id = 'bless-attack-<caster>-<target>' / 'bless-save-<caster>-<target>'
 */
import type { RuleDoc } from '../authoring/types.js';

/**
 * RuleDoc for the Bless spell.
 *
 * Params:
 *   casterId           — EntityId of the character casting Bless
 *   targetIds          — EntityId[] of the blessed targets (fan-out: 1 emit per target)
 *   concentrationToken — stable token linking all instances to this concentration slot
 */
export const blessRuleDoc: RuleDoc = {
  id: 'bless',
  source: 'PHB 219',
  ruleText:
    'Up to three creatures of your choice... +1d4 to attack rolls and saving throws. Concentration, 1 minute.',
  params: [
    { name: 'casterId', type: 'EntityId' },
    { name: 'targetIds', type: 'EntityId[]' },
    { name: 'concentrationToken', type: 'string' },
  ],
  emits: [
    // Emit 1: +1d4 attack-roll per target (fan-out via {targetIds})
    {
      def: {
        kind: 'num',
        op: 'add',
        value: '1d4',
        stat: 'attack-roll',
        category: 'untyped',
      },
      scope: {
        owner: '{casterId}',
        target: { axis: 'entities', ids: '{targetIds}' },
        trigger: 'always',
      },
      duration: {
        unit: 'minute',
        amount: 1,
        endsOn: ['concentration-ends'],
        concentrationToken: '{concentrationToken}',
      },
      label: 'Bless ({casterId})',
      idTemplate: 'bless-attack-{casterId}-{targetId}',
    },
    // Emit 2: +1d4 saving-throw per target (fan-out via {targetIds})
    {
      def: {
        kind: 'num',
        op: 'add',
        value: '1d4',
        stat: 'saving-throw',
        category: 'untyped',
      },
      scope: {
        owner: '{casterId}',
        target: { axis: 'entities', ids: '{targetIds}' },
        trigger: 'always',
      },
      duration: {
        unit: 'minute',
        amount: 1,
        endsOn: ['concentration-ends'],
        concentrationToken: '{concentrationToken}',
      },
      label: 'Bless ({casterId})',
      idTemplate: 'bless-save-{casterId}-{targetId}',
    },
  ],
  testCases: [],
};
