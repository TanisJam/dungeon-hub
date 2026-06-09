/**
 * recklessAttackRuleDoc — DSL authoring of Reckless Attack (Barbarian).
 *
 * PHB p.48 — Reckless Attack (Barbarian):
 *   "When you make your first attack on your turn, you can decide to attack recklessly.
 *    Doing so gives you advantage on melee weapon attack rolls using Strength during
 *    this turn, but attack rolls against you have advantage until the start of your
 *    next turn."
 *
 * 2 emits:
 *   1. AdvantageMod — grant/attack, axis:self
 *      Predicate: AND[hasCondition:RecklessAttacking, usesAbility:str, weaponKind:melee]
 *      PHB p.48: "advantage on melee weapon attack rolls using Strength"
 *
 *   2. AdvantageMod — impose/attack, axis:attackers-of ids:['{recklessId}']
 *      Predicate: hasCondition:RecklessAttacking (NO usesAbility — ALL attacks against barbarian)
 *      PHB p.48: "attack rolls against you have advantage until the start of your next turn"
 *      Duration: turnAnchor (anchorCombatantId:'{recklessId}', boundary:'start', turnsRemaining:1)
 *      Accepted divergence DIV-01: boundary:'start' is conservative-active this batch
 *      (impose persists to turn-end instead of strict start-of-next-turn).
 *      Player-disadvantageous; follow-up SDD engine-boundary-start-evaluation.
 *
 * Params:
 *   recklessId — EntityId of the declaring barbarian
 *
 * REQ-RECKLESS-01, REQ-RECKLESS-02.
 */
import type { RuleDoc } from '../authoring/types.js';

export const recklessAttackRuleDoc: RuleDoc = {
  id: 'reckless-attack',
  source: 'PHB p.48',
  ruleText:
    'When you make your first attack on your turn, you can decide to attack recklessly. ' +
    'Doing so gives you advantage on melee weapon attack rolls using Strength during this turn, ' +
    'but attack rolls against you have advantage until the start of your next turn.',
  params: [
    // PHB p.48: the barbarian declaring reckless attack
    { name: 'recklessId', type: 'EntityId' },
  ],
  emits: [
    // ── EMIT 1: AdvantageMod — grant on own STR melee attacks (PHB p.48) ───────
    // PHB p.48: "advantage on melee weapon attack rolls using Strength during this turn"
    // Predicate: AND[hasCondition:RecklessAttacking, usesAbility:str, weaponKind:melee]
    // axis:'self' — grant applies to the barbarian's own attack rolls
    {
      def: {
        kind: 'advantage',
        mode: 'grant',
        rollType: 'attack',
      },
      scope: {
        owner: '{recklessId}',
        target: { axis: 'self' },
        trigger: 'on-attack-roll',
      },
      predicate: {
        op: 'and',
        nodes: [
          { op: 'query', q: { kind: 'hasCondition', entity: 'self', condition: 'RecklessAttacking' } },
          { op: 'query', q: { kind: 'usesAbility', ability: 'str' } },
          { op: 'query', q: { kind: 'weaponKind', is: 'melee' } },
        ],
      },
      label: 'Reckless Attack',
      idTemplate: 'reckless-grant-{recklessId}',
    },
    // ── EMIT 2: AdvantageMod — impose on attackers-of the barbarian (PHB p.48) ─
    // PHB p.48: "attack rolls against you have advantage until the start of your next turn"
    // ALL attacks against the barbarian (ANY ability, any weapon) — NOT usesAbility-gated.
    // axis:'attackers-of' ids:['{recklessId}'] — impose applies to ALL who attack the barbarian.
    // Accepted divergence DIV-01: boundary:'start' is conservative-active.
    {
      def: {
        kind: 'advantage',
        mode: 'impose',
        rollType: 'attack',
      },
      scope: {
        owner: '{recklessId}',
        target: { axis: 'attackers-of', ids: ['{recklessId}'] },
        trigger: 'on-attack-roll',
      },
      predicate: {
        op: 'query',
        q: { kind: 'hasCondition', entity: 'self', condition: 'RecklessAttacking' },
      },
      label: 'Reckless Attack (exposed)',
      idTemplate: 'reckless-impose-{recklessId}',
    },
  ],
  testCases: [],
};
