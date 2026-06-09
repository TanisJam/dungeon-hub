/**
 * rageRuleDoc — DSL authoring of the Rage (Barbarian) feature.
 *
 * PHB p.48 — Rage (Barbarian):
 *   "You have advantage on Strength checks and Strength saving throws."
 *   "When you make a melee weapon attack using Strength, you gain a bonus to
 *    the damage roll that increases as you gain levels as a barbarian."
 *     - Level 1–8:  +2
 *     - Level 9–15: +3
 *     - Level 16+:  +4
 *   "You have resistance to bludgeoning, piercing, and slashing damage."
 *   Rages per long rest: 2 (L1-8) / 3 (L9+) / etc. — see PHB p.48 table.
 *
 * Design: Batch 1b runtime cutover. The legacy buildRageModifiers() builder and
 * engine/rules/rage.ts have been DELETED. rageRuleDoc is now the sole runtime source.
 *
 * These are CHARACTERIZATION tests — they document the established behavior of
 * rageRuleDoc itself, not parity against a removed reference implementation.
 *
 * 7 emits total:
 *   1. AdvantageMod — STR check advantage (trigger:always, hasCondition:Raging)
 *   2. AdvantageMod — STR save advantage (trigger:always, hasCondition:Raging)
 *   3. ResistMod — bludgeoning resistance (trigger:on-damage, hasCondition:Raging)
 *   4. ResistMod — piercing resistance
 *   5. ResistMod — slashing resistance
 *   6. NumMod — rage damage bonus (trigger:on-damage, AND[weaponKind:melee+hasCondition:Raging])
 *   7. UsageMod — rages per long rest (shape-only, no evaluator in Batch 1)
 *
 * Params:
 *   ragerId   — EntityId of the raging barbarian
 *   rageBonus — caller-computed damage bonus (+2/+3/+4 per PHB p.48 table)
 *   rageCount — caller-computed rages per long rest (shape-only in Batch 1)
 *
 * Target convention (ADR-4a): ALL self-targeting emits use target:{axis:'self'}.
 * This is the established modern authoring convention (see frightened.ts,
 * cloak-of-protection.ts, resilient-con.ts, soldier-athletics.ts).
 * engine/registry/query.ts:67 resolves axis:'self' as owner===self at query time.
 * For Rage, owner===ragerId always holds — axis:'self' and legacy entities:[ragerId]
 * are RUNTIME-EQUIVALENT (both collapse to {ragerId}).
 *
 * STR-divergence (ADR-5):
 * PHB p.48 restricts advantage to STRENGTH checks/saves. The DSL currently lacks
 * a usesAbility WorldQuery leaf. rageRuleDoc emits UNCONSTRAINED AdvantageMods.
 * The STR fix is OUT OF SCOPE for Batch 1.
 *
 * UsageMod (shape-only, Batch 1):
 * The runtime UsageMod type only has pool:'tiered'. The pool:'count' + count fields
 * are a superset shape — no evaluator is wired. compile.ts casts as Modifier (shield).
 * This mirrors the pool:'tiered' precedent (shape declared, evaluator deferred).
 */
import type { RuleDoc } from '../authoring/types.js';

export const rageRuleDoc: RuleDoc = {
  id: 'rage',
  source: 'PHB p.48',
  ruleText:
    'While raging: advantage on Strength checks and Strength saving throws; ' +
    'bonus to melee weapon damage rolls using Strength (+2/+3/+4 by level); ' +
    'resistance to bludgeoning, piercing, and slashing damage. ' +
    'Rages per long rest: 2/3/4/5/6/unlimited by level. (PHB p.48)',
  params: [
    // PHB p.48: rage affects the raging character
    { name: 'ragerId', type: 'EntityId' },
    // PHB p.48 table: damage bonus +2 (L1-8) / +3 (L9-15) / +4 (L16+); caller-computed
    { name: 'rageBonus', type: 'number' },
    // PHB p.48 table: rages per long rest 2/3/4/5/6/unlimited; caller-computed; shape-only Batch 1
    { name: 'rageCount', type: 'number' },
  ],
  emits: [
    // ── EMIT 1: AdvantageMod — STR check advantage (PHB p.48) ──────────────
    // PHB p.48: "advantage on Strength checks"
    // TODO: usesAbility WorldQuery — advantage should be STR-only (PHB p.48) but predicate
    //       primitive absent; STR-only divergence deferred (ADR-5).
    {
      def: {
        kind: 'advantage',
        mode: 'grant',
        rollType: 'check',
      },
      scope: {
        owner: '{ragerId}',
        target: { axis: 'self' },
        trigger: 'always',
      },
      predicate: {
        op: 'query',
        q: { kind: 'hasCondition', entity: 'self', condition: 'Raging' },
      },
      label: 'Raging',
      idTemplate: 'rage-str-check-{ragerId}',
    },
    // ── EMIT 2: AdvantageMod — STR save advantage (PHB p.48) ───────────────
    // PHB p.48: "advantage on Strength saving throws"
    // TODO: usesAbility WorldQuery — advantage should be STR-only (PHB p.48) but predicate
    //       primitive absent; STR-only divergence deferred (ADR-5).
    {
      def: {
        kind: 'advantage',
        mode: 'grant',
        rollType: 'save',
      },
      scope: {
        owner: '{ragerId}',
        target: { axis: 'self' },
        trigger: 'always',
      },
      predicate: {
        op: 'query',
        q: { kind: 'hasCondition', entity: 'self', condition: 'Raging' },
      },
      label: 'Raging',
      idTemplate: 'rage-str-save-{ragerId}',
    },
    // ── EMIT 3: ResistMod — bludgeoning resistance (PHB p.48) ──────────────
    // PHB p.48: "resistance to bludgeoning, piercing, and slashing damage"
    // trigger:'on-damage' is informative; ResistMods resolved by applyDamageWithResist,
    // NOT the registry query path (types.ts:304-307).
    {
      def: {
        kind: 'resist',
        damageType: 'bludgeoning',
        mode: 'half',
      },
      scope: {
        owner: '{ragerId}',
        target: { axis: 'self' },
        trigger: 'on-damage',
      },
      predicate: {
        op: 'query',
        q: { kind: 'hasCondition', entity: 'self', condition: 'Raging' },
      },
      label: 'Raging',
      idTemplate: 'rage-resist-bludgeoning-{ragerId}',
    },
    // ── EMIT 4: ResistMod — piercing resistance (PHB p.48) ─────────────────
    {
      def: {
        kind: 'resist',
        damageType: 'piercing',
        mode: 'half',
      },
      scope: {
        owner: '{ragerId}',
        target: { axis: 'self' },
        trigger: 'on-damage',
      },
      predicate: {
        op: 'query',
        q: { kind: 'hasCondition', entity: 'self', condition: 'Raging' },
      },
      label: 'Raging',
      idTemplate: 'rage-resist-piercing-{ragerId}',
    },
    // ── EMIT 5: ResistMod — slashing resistance (PHB p.48) ─────────────────
    {
      def: {
        kind: 'resist',
        damageType: 'slashing',
        mode: 'half',
      },
      scope: {
        owner: '{ragerId}',
        target: { axis: 'self' },
        trigger: 'on-damage',
      },
      predicate: {
        op: 'query',
        q: { kind: 'hasCondition', entity: 'self', condition: 'Raging' },
      },
      label: 'Raging',
      idTemplate: 'rage-resist-slashing-{ragerId}',
    },
    // ── EMIT 6: NumMod — rage damage bonus (PHB p.48) ──────────────────────
    // PHB p.48: "+[rageBonus] to melee weapon attack damage rolls using Strength"
    // value:'{rageBonus}' is a template slot → compiles to STRING (compile.ts:67 String(value)).
    // R-COERCE trap: parity assertions must Number()-coerce compiled def.value.
    // AND predicate: weaponKind:melee + hasCondition:Raging + usesAbility:str
    // Batch 2 (REQ-RAGE-RETROFIT-01): usesAbility:str added to emit 6 only.
    // STR-gating moves from registration-time (build-attack-context.ts:548 imperative guard)
    // to predicate-time — the build-attack-context guard is deleted in Commit 4.
    // NOTE: emits 1/2 (advantage on STR checks/saves) do NOT get usesAbility — they resolve
    // via ability-check/forced-check paths where ctx.weaponInUse is absent (fail-closed = silent death).
    {
      def: {
        kind: 'num',
        op: 'add',
        value: '{rageBonus}',
        stat: 'damage',
        category: 'untyped',
      },
      scope: {
        owner: '{ragerId}',
        target: { axis: 'self' },
        trigger: 'on-damage',
      },
      predicate: {
        op: 'and',
        nodes: [
          { op: 'query', q: { kind: 'weaponKind', is: 'melee' } },
          { op: 'query', q: { kind: 'hasCondition', entity: 'self', condition: 'Raging' } },
          { op: 'query', q: { kind: 'usesAbility', ability: 'str' } },
        ],
      },
      label: 'Raging',
      idTemplate: 'rage-damage-{ragerId}',
    },
    // ── EMIT 7: UsageMod — rages per long rest (PHB p.48, shape-only) ───────
    // PHB p.48: rages per long rest (2/3/4/5/6/unlimited by level).
    // count:'{rageCount}' is a template slot → compiles to STRING (R-COERCE trap).
    // shape-only: no evaluator wired in Batch 1 (mirrors pool:'tiered' precedent).
    // R-USAGE-SUPERSET: compiled def carries pool:'count' + count, a superset of the
    // runtime UsageMod type. compile.ts casts as Modifier at build time (shield).
    {
      def: {
        kind: 'usage',
        pool: 'count',
        count: '{rageCount}',
        resetOn: 'long-rest',
      },
      scope: {
        owner: '{ragerId}',
        target: { axis: 'self' },
        trigger: 'always',
      },
      label: 'Raging',
      idTemplate: 'rage-usage-{ragerId}',
    },
  ],
  testCases: [],
};
