/**
 * Tests for feralInstinctRuleDoc — Feral Instinct (Barbarian level 7).
 *
 * PHB p.50 — Feral Instinct (Barbarian):
 *   "By 7th level, your instincts are so honed that you have advantage on
 *    initiative rolls."
 *
 * Rule encoded:
 *   - Single advantage emit on 'on-initiative' trigger.
 *   - NO predicate — the barbarianLevel >= 7 gate is registration-time (use-case).
 *     This mirrors the dangerSense/barbarianLevel >= 2 registration-time precedent.
 *   - rollType: 'initiative' (distinct from 'check' — REQ-TRIGGER-02 isolation).
 *
 * Strict TDD — RED first: this file is written BEFORE feral-instinct.ts exists.
 * Design ref: sdd/engine-feral-instinct/design — D3 (feralInstinctRuleDoc shape).
 *
 * REQ-RULEDOC-01..03; scenarios FI-U1..U6.
 */

import { describe, expect, it } from 'vitest';
import { feralInstinctRuleDoc } from './feral-instinct.js';
import { parseRule } from '../authoring/parse.js';

describe('feralInstinctRuleDoc', () => {
  // ── FI-U1: emit count ──────────────────────────────────────────────────────

  it('FI-U1 — emit count: feralInstinctRuleDoc has exactly 1 emit (PHB p.50)', () => {
    // PHB p.50: the advantage-on-initiative half only (surprise half deferred per REQ-OOS-01).
    expect(feralInstinctRuleDoc.emits.length).toBe(1);
  });

  // ── FI-U2: emit def shape ──────────────────────────────────────────────────

  it('FI-U2 — emit def: kind=advantage, mode=grant, rollType=initiative (PHB p.50)', () => {
    // PHB p.50: "advantage on initiative rolls" → AdvantageMod grant on initiative rollType.
    const emit = feralInstinctRuleDoc.emits[0]!;
    expect(emit.def.kind).toBe('advantage');
    // TypeScript narrows via discriminant; access mode/rollType directly.
    const def = emit.def as { kind: 'advantage'; mode: string; rollType: string };
    expect(def.mode).toBe('grant');
    expect(def.rollType).toBe('initiative');
  });

  // ── FI-U3: trigger === 'on-initiative' ────────────────────────────────────

  it("FI-U3 — trigger: scope.trigger === 'on-initiative' (REQ-TRIGGER-02 isolation)", () => {
    // Distinct from 'on-check' — prevents Feral Instinct leaking into DEX ability checks.
    // REQ-TRIGGER-02: on-initiative MUST be a distinct trigger from on-check.
    const emit = feralInstinctRuleDoc.emits[0]!;
    expect(emit.scope.trigger).toBe('on-initiative');
  });

  // ── FI-U4: no predicate (gate is registration-time) ───────────────────────

  it('FI-U4 — no predicate: emit.predicate is undefined (gate is registration-time)', () => {
    // The barbarianLevel >= 7 gate is enforced at registration time in the use-case
    // (dangerSense barbarianLevel >= 2 precedent). NOT a query-time predicate.
    // PHB p.50: "By 7th level, your instincts..." — level check is caller-side.
    const emit = feralInstinctRuleDoc.emits[0]!;
    expect(emit.predicate).toBeUndefined();
  });

  // ── FI-U5: parseRule round-trip ────────────────────────────────────────────

  it('FI-U5 — parseRule round-trip: parseRule(feralInstinctRuleDoc) succeeds (REQ-TRIGGER-02 Zod guard)', () => {
    // parseRule validates via RuleDocSchema (Zod). If 'on-initiative' is absent from
    // the Zod trigger enum in authoring/schema.ts, this call returns ok:false.
    // This test is RED until D2 (dual-add) lands the Zod literal.
    const result = parseRule(feralInstinctRuleDoc);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('parseRule failed: ' + JSON.stringify(result.issues));
    expect(result.rule.emits[0]!.scope.trigger).toBe('on-initiative');
  });

  // ── FI-U6: scope.target.axis === 'self' ───────────────────────────────────

  it("FI-U6 — target axis: scope.target.axis === 'self' (REQ-RULEDOC-01)", () => {
    // The advantage affects the barbarian itself (axis: 'self').
    const emit = feralInstinctRuleDoc.emits[0]!;
    expect(emit.scope.target.axis).toBe('self');
  });

  // ── Additional shape assertions ────────────────────────────────────────────

  it('doc shape — id, source, params, idTemplate, label', () => {
    expect(feralInstinctRuleDoc.id).toBe('feral-instinct');
    // PHB p.50 — physically verified (T-V-01 resolved at write time per apply constraint)
    expect(feralInstinctRuleDoc.source).toBe('PHB p.50');
    expect(feralInstinctRuleDoc.params).toHaveLength(1);
    expect(feralInstinctRuleDoc.params[0]!.name).toBe('barbarianId');
    expect(feralInstinctRuleDoc.params[0]!.type).toBe('EntityId');

    const emit = feralInstinctRuleDoc.emits[0]!;
    expect(emit.idTemplate).toBe('feral-instinct-{barbarianId}');
    expect(emit.label).toBe('Feral Instinct');
  });

  it('scope.owner template contains barbarianId param', () => {
    const emit = feralInstinctRuleDoc.emits[0]!;
    expect(emit.scope.owner).toBe('{barbarianId}');
  });
});
