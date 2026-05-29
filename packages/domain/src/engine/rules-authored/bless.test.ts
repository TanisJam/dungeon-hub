/**
 * Tests for blessRuleDoc — engine/rules-authored/bless.ts
 *
 * REQ-AE-10: concentrationToken substitution in DurationSpec.
 *   // PHB 219 — Bless: "Up to three creatures... +1d4 to attack rolls and saving throws.
 *   // Concentration, 1 minute."
 *   // PHB 203–204 — Concentration: spells that require concentration end when concentration breaks.
 *
 * REQ-AE-11: blessRuleDoc behavioral equivalence vs legacy buildBlessModifiers.
 *   Refactor safety net: compiled blessRuleDoc must produce byte-identical instances
 *   to the legacy builder for the same inputs.
 */
import { describe, it, expect } from 'vitest';
import { parseRule } from '../authoring/parse.js';
import { compileRule } from '../authoring/compile.js';
import { blessRuleDoc } from './bless.js';
import { buildBlessModifiers } from '../rules/bless.js';

// ── T1: REQ-AE-10 — concentrationToken substitution ─────────────────────────

describe('blessRuleDoc — concentrationToken substitution (REQ-AE-10)', () => {
  it('parseRule returns ok:true for blessRuleDoc', () => {
    // PHB 219 — Bless. parseRule validates the DSL schema.
    const result = parseRule(blessRuleDoc);
    expect(result.ok).toBe(true);
  });

  it('compileRule.build substitutes concentrationToken on every instance', () => {
    // PHB 203–204 — Concentration: each instance must carry the caller-supplied token.
    // PHB 219 — Bless: +1d4 attack-roll and saving-throw per target.
    const parseResult = parseRule(blessRuleDoc);
    if (!parseResult.ok) throw new Error('parseRule failed: ' + JSON.stringify(parseResult.issues));

    const compiled = compileRule(parseResult.rule);
    const instances = compiled.build({
      casterId: 'c1',
      targetIds: ['t1'],
      concentrationToken: 'tok-test',
    });

    // Every instance must have the substituted token, NOT the literal placeholder.
    for (const inst of instances) {
      expect(inst.duration?.concentrationToken).toBe('tok-test');
      expect(inst.duration?.concentrationToken).not.toBe('{concentrationToken}');
    }
  });
});

// ── T2: REQ-AE-11 — behavioral equivalence vs legacy builder ─────────────────

describe('blessRuleDoc — behavioral equivalence vs buildBlessModifiers (REQ-AE-11)', () => {
  it('compiled blessRuleDoc output deeply equals buildBlessModifiers output for one target', () => {
    // PHB 219 — Bless. Refactor safety: same stat, value, axis, duration, id shape.
    const parseResult = parseRule(blessRuleDoc);
    if (!parseResult.ok) throw new Error('parseRule failed: ' + JSON.stringify(parseResult.issues));

    const compiled = compileRule(parseResult.rule);
    const newInstances = compiled.build({
      casterId: 'c1',
      targetIds: ['t1'],
      concentrationToken: 'tok-eq',
    });

    const legacyInstances = buildBlessModifiers('c1' as any, ['t1'] as any, 'tok-eq');

    // Must produce the same number of instances (2 per target).
    expect(newInstances).toHaveLength(legacyInstances.length);

    // Deep equality: same id, stat, value, axis, duration fields, label.
    expect(newInstances).toEqual(legacyInstances);
  });
});
