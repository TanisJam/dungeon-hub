/**
 * dangerSenseRuleDoc — DSL authoring of Danger Sense (Barbarian).
 *
 * PHB p.48 — Danger Sense (Barbarian):
 *   "At 2nd level, you gain an uncanny sense of when things nearby aren't as they should be,
 *    giving you an edge when you dodge away from danger. You have advantage on Dexterity saving
 *    throws against effects that you can see, such as traps and spells. To gain this benefit,
 *    you can't be blinded, deafened, or incapacitated."
 *
 * INERT: save-gather not yet wired — follow-up SDD engine-save-advantage-gather.
 * This doc is authored correctly per PHB and compiled in tests, but is NOT registered
 * in buildAttackContext because no save-gather query exists to consume it.
 * Registering would be dead weight (UsageMod precedent from Batch 1).
 *
 * Accepted divergences (both locked):
 *   DIV-02: Runtime-inert — no save-gather in performForcedCheck this batch.
 *   DIV-03: "effects that you can see" — approximated as !Blinded.
 *           The engine models entity visibility (canSee), not effect-source visibility.
 *           Blinded is the best available proxy for "cannot perceive the environment".
 *
 * 1 emit:
 *   AdvantageMod — grant/save, axis:self, trigger:'on-save'
 *   Predicate: AND[ NOT(hasCondition:Blinded), NOT(hasCondition:Deafened), NOT(hasCondition:Incapacitated) ]
 *
 * Params:
 *   barbarianId — EntityId of the barbarian (future: needed when wired to save-gather)
 *
 * REQ-DS-01, SCENARIO-18..20.
 */
import type { RuleDoc } from '../authoring/types.js';

export const dangerSenseRuleDoc: RuleDoc = {
  id: 'danger-sense',
  source: 'PHB p.48',
  ruleText:
    'You have advantage on Dexterity saving throws against effects that you can see, ' +
    "such as traps and spells. To gain this benefit, you can't be blinded, deafened, " +
    'or incapacitated.',
  params: [
    // barbarianId reserved for future save-gather wiring
    { name: 'barbarianId', type: 'EntityId' },
  ],
  emits: [
    // ── EMIT 1: AdvantageMod — grant/save (PHB p.48) ──────────────────────────
    // PHB p.48: "advantage on Dexterity saving throws against effects you can see"
    // DEX-save targeting expressed via rollType:'save' only (DIV-03 — no per-ability save rollType field).
    // "effects you can see" approximated as !Blinded (DIV-03).
    // INERT: save-gather not yet wired — follow-up SDD engine-save-advantage-gather.
    {
      def: {
        kind: 'advantage',
        mode: 'grant',
        rollType: 'save',
      },
      scope: {
        owner: '{barbarianId}',
        target: { axis: 'self' },
        trigger: 'on-save',
      },
      predicate: {
        op: 'and',
        nodes: [
          // PHB p.48: "you can't be blinded" (DIV-03: proxy for "cannot see effects")
          { op: 'not', node: { op: 'query', q: { kind: 'hasCondition', entity: 'self', condition: 'Blinded' } } },
          // PHB p.48: "you can't be ... deafened"
          { op: 'not', node: { op: 'query', q: { kind: 'hasCondition', entity: 'self', condition: 'Deafened' } } },
          // PHB p.48: "you can't be ... incapacitated"
          { op: 'not', node: { op: 'query', q: { kind: 'hasCondition', entity: 'self', condition: 'Incapacitated' } } },
        ],
      },
      label: 'Danger Sense',
      idTemplate: 'danger-sense-{barbarianId}',
    },
  ],
  testCases: [],
};
