/**
 * Cloak of Protection magic item — rule document.
 *
 * // DMG 159 (Magic Items — Cloak of Protection): "+1 bonus to AC and saving throws
 * // while you wear this cloak."
 *
 * REQ-RULE-CLOAK-01.
 *
 * Two emits:
 *   1. NumMod{kind:'num', op:'add', value:1, stat:'ac', category:'item'}
 *   2. NumMod{kind:'num', op:'add', value:1, stat:'saving-throw', category:'item'}
 *
 * The 'saving-throw' flat stat applies to ALL saving throws via the all-saves semantic
 * (T2.6 rule: flat 'saving-throw' num mod is included when resolving any 'saving-throw.X' key).
 * The 'item' category causes keep-highest stacking — two cloaks → only one AC/save bonus applies.
 */
import type { RuleDoc } from '../authoring/types.js';

/**
 * RuleDoc for the Cloak of Protection.
 *
 * Params:
 *   charId  — the character wearing the cloak
 *   itemId  — unique instance ID for this cloak (distinguishes two copies of the item)
 */
export const cloakOfProtectionRuleDoc: RuleDoc = {
  id: 'cloak-of-protection',
  source: 'DMG 159',
  ruleText: '+1 bonus to AC and saving throws while you wear this cloak.',
  params: [
    { name: 'charId', type: 'EntityId' },
    { name: 'itemId', type: 'string' },
  ],
  emits: [
    // Emit 1: +1 AC (item category — keep-highest stacking)
    {
      def: {
        kind: 'num',
        op: 'add',
        value: 1,
        stat: 'ac',
        category: 'item',
      },
      scope: {
        owner: '{charId}',
        target: { axis: 'self' },
        trigger: 'always',
      },
      label: 'Cloak of Protection',
      idTemplate: '{ruleId}-ac-{charId}-{itemId}',
    },
    // Emit 2: +1 saving throws (flat 'saving-throw' → all saves via T2.6 all-saves rule)
    {
      def: {
        kind: 'num',
        op: 'add',
        value: 1,
        stat: 'saving-throw',
        category: 'item',
      },
      scope: {
        owner: '{charId}',
        target: { axis: 'self' },
        trigger: 'always',
      },
      label: 'Cloak of Protection',
      idTemplate: '{ruleId}-save-{charId}-{itemId}',
    },
  ],
  testCases: [],
};
