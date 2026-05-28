/**
 * Soldier (background) — Athletics proficiency rule document.
 *
 * // PHB 140 (Backgrounds — Soldier): "Skill Proficiencies: Athletics, Intimidation."
 *
 * This is the YAML-equivalent RuleDoc authored as a plain TypeScript object.
 * The rule is passed through parseRule → compileRule (the DSL pipeline) to
 * produce the ModifierInstance[] builder. This is the Slice 2 exemplar —
 * the first proof that the authoring pipeline produces working rules.
 *
 * REQ-RULE-SOLDIER-01.
 */
import type { RuleDoc } from '../authoring/types.js';

/**
 * RuleDoc for the Soldier background Athletics proficiency grant.
 *
 * RuleDoc is the typed output of parseRule (the authored form, validated by Zod).
 * We construct it directly here since we are in the domain layer and the YAML
 * file would be parsed at the use-case/IO layer in production.
 */
export const soldierAthleticsRuleDoc: RuleDoc = {
  id: 'soldier-athletics',
  source: 'PHB 140',
  ruleText: 'Skill Proficiencies: Athletics, Intimidation.',
  params: [{ name: 'charId', type: 'EntityId' }],
  emits: [
    {
      def: {
        kind: 'proficiency',
        domain: 'skill',
        ref: 'athletics', // FREE string (§1.2) — no hardcoded enum
      },
      scope: {
        owner: '{charId}',
        target: { axis: 'self' },
        trigger: 'always',
      },
      label: 'Soldier (background)',
      idTemplate: '{ruleId}-{charId}',
    },
  ],
  testCases: [],
};
