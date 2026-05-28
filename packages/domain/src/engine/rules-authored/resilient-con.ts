/**
 * Resilient (Constitution) feat — Con save proficiency rule document.
 *
 * // PHB 168 (Feats — Resilient): "Choose one ability score. You gain proficiency
 * // in saving throws using the chosen ability."
 * // SCOPE: Only the save-proficiency grant (the +1 CON ASI is a separate
 * // composition and is explicitly OUT OF SCOPE for this rule).
 *
 * REQ-RULE-RESILIENT-01.
 *
 * NOTE: The "already proficient" dedup (PHB: proficiency granted only if not already
 * proficient) is implemented as a READ-TIME / final-validation check in
 * engine/validate/character-final.ts, NOT baked into the modifier itself.
 * The modifier always emits; the dedup gate runs at character-final-validation.
 * This mirrors §11 "cross-step skill dedup" + "validate write, tolerate read".
 */
import type { RuleDoc } from '../authoring/types.js';

/**
 * RuleDoc for the Resilient (Constitution) save proficiency grant.
 *
 * One emit: ProficiencyMod{domain:'save', ref:'con'} scoped to self (axis:'self').
 * Resolves via resolveStat(charId, 'saving-throw.con', ...) — per-ability key (T2.5).
 */
export const resilientConRuleDoc: RuleDoc = {
  id: 'resilient-con',
  source: 'PHB 168',
  ruleText:
    'Choose one ability score. You gain proficiency in saving throws using the chosen ability.',
  params: [{ name: 'charId', type: 'EntityId' }],
  emits: [
    {
      def: {
        kind: 'proficiency',
        domain: 'save',
        ref: 'con', // FREE string (§1.2) — not hardcoded to a closed enum
      },
      scope: {
        owner: '{charId}',
        target: { axis: 'self' },
        trigger: 'always',
      },
      label: 'Resilient (Constitution)',
      idTemplate: '{ruleId}-{charId}',
    },
  ],
  testCases: [],
};
