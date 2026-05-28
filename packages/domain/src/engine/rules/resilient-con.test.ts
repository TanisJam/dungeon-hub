/**
 * Tests for buildResilientConModifiers — Resilient (Constitution) feat.
 *
 * // PHB 168 (Feats — Resilient): "Choose one ability score. You gain proficiency
 * // in saving throws using the chosen ability."
 * // SCOPE: Only the save-proficiency grant. The +1 CON ASI is a separate
 * // composition and is explicitly OUT OF SCOPE for this rule.
 *
 * REQ-RULE-RESILIENT-01: authored via DSL pipeline (parseRule → compileRule).
 *
 * Scenarios:
 *   (a) Happy path: breakdown includes Resilient (Constitution) proficiency source
 *       for saving-throw.con resolution (per-ability key, T2.5 fix).
 *   (b) Dedup: when Con save already granted by another source, validateCharacterFinal
 *       returns { ok: false, issues: [{ code: 'PROFICIENCY_ALREADY_GRANTED', domain:'save', ref:'con' }] }
 *   (c) Read-path tolerance: dedup error does NOT prevent resolveStat from returning
 *       a value (§11 validate-write / tolerate-read). The modifier remains in registry.
 */

// RED SENTINEL — builder does not exist yet; this import will fail = RED
import { buildResilientConModifiers } from './resilient-con.js';
// This import will also fail until validateCharacterFinal is created
import { validateCharacterFinal } from '../validate/character-final.js';
import { describe, it, expect } from 'vitest';
import { createInMemoryRegistry } from '../registry/query.js';
import { resolveStat } from '../resolve/stat.js';
import type { EntityId, ProficiencyMod } from '../types.js';
import type { ModifierInstance, ModifierInstanceId } from '../registry/types.js';
import type { EvaluationContext } from '../context.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function eid(s: string): EntityId {
  return s as EntityId;
}

function makeCtx(selfId: EntityId): EvaluationContext {
  return {
    self: { id: selfId, conditions: [] },
    activeConditions: [],
  };
}

const CHAR_ID = eid('fighter-resilient');

// ── Scenario (a): Happy path ──────────────────────────────────────────────────

describe('buildResilientConModifiers — Con save proficiency (PHB 168)', () => {
  it('(a) breakdown includes Resilient (Constitution) source when resolving saving-throw.con', () => {
    // PHB 168: "Choose one ability score. You gain proficiency in saving throws using the chosen ability."
    // Resilient (Constitution) → ProficiencyMod{domain:'save', ref:'con'}
    // Must use per-ability key 'saving-throw.con' per T2.5 (PHB 179 per-ability saves).
    const proficiencyBonus = 3;
    const registry = createInMemoryRegistry();
    const instances = buildResilientConModifiers(CHAR_ID);
    instances.forEach((inst) => registry.register(inst));

    const ctx = makeCtx(CHAR_ID);
    const result = resolveStat(
      CHAR_ID,
      'saving-throw.con',
      0,
      ctx,
      registry,
      proficiencyBonus,
    );

    const resilientSource = result.breakdown.find(
      (s) => s.label === 'Resilient (Constitution)',
    );
    expect(
      resilientSource,
      'Resilient (Constitution) proficiency should appear in saving-throw.con breakdown',
    ).toBeDefined();
    expect(resilientSource!.amount).toBe(proficiencyBonus);
    expect(resilientSource!.type).toBe('untyped');
    expect(result.value).toBe(proficiencyBonus);
  });

  it('(a2) Resilient (Con) does NOT contribute to saving-throw.dex', () => {
    // PHB 168/179: CON-save proficiency is per-ability. Must NOT bleed into DEX saves.
    const proficiencyBonus = 3;
    const registry = createInMemoryRegistry();
    const instances = buildResilientConModifiers(CHAR_ID);
    instances.forEach((inst) => registry.register(inst));

    const ctx = makeCtx(CHAR_ID);
    const result = resolveStat(
      CHAR_ID,
      'saving-throw.dex',
      0,
      ctx,
      registry,
      proficiencyBonus,
    );

    const resilientSource = result.breakdown.find(
      (s) => s.label === 'Resilient (Constitution)',
    );
    expect(
      resilientSource,
      'CON-save proficiency must not appear in DEX-save breakdown',
    ).toBeUndefined();
    expect(result.value).toBe(0);
  });

  // ── Scenario (b): Dedup via validateCharacterFinal ───────────────────────────

  it('(b) validateCharacterFinal returns PROFICIENCY_ALREADY_GRANTED when Con save already granted', () => {
    // §11 / REQ-RULE-RESILIENT-01: dedup is read-time / final-validation, NOT baked into mod.
    // When the character already has Con save proficiency (e.g. from class), and also has
    // Resilient (Con), validateCharacterFinal should flag the duplicate.
    const registry = createInMemoryRegistry();

    // Register Con-save proficiency from class (another source)
    const classProfInstance: ModifierInstance = {
      id: 'cleric-con-save' as ModifierInstanceId,
      def: { kind: 'proficiency', domain: 'save', ref: 'con' } satisfies ProficiencyMod,
      scope: {
        owner: CHAR_ID,
        target: { axis: 'self' },
        trigger: 'always',
      },
      label: 'Cleric (class)',
    };
    registry.register(classProfInstance);

    // Also register Resilient (Con) — this is the duplicate
    const resilientInstances = buildResilientConModifiers(CHAR_ID);
    resilientInstances.forEach((inst) => registry.register(inst));

    // validateCharacterFinal should detect the duplicate (domain:'save', ref:'con')
    const validationResult = validateCharacterFinal(CHAR_ID, registry);
    expect(validationResult.ok).toBe(false);
    if (!validationResult.ok) {
      const dedupIssue = validationResult.issues.find(
        (i) => i.code === 'PROFICIENCY_ALREADY_GRANTED',
      );
      expect(dedupIssue, 'PROFICIENCY_ALREADY_GRANTED issue should be present').toBeDefined();
      if (dedupIssue && dedupIssue.code === 'PROFICIENCY_ALREADY_GRANTED') {
        expect(dedupIssue.domain).toBe('save');
        expect(dedupIssue.ref).toBe('con');
      }
    }
  });

  // ── Scenario (c): Read-path tolerance ────────────────────────────────────────

  it('(c) resolveStat still returns value even with duplicate Con-save proficiency (read-path tolerance)', () => {
    // §11 "validate write, tolerate read": the modifier always registers; the
    // dedup gate runs at character-final-validation, NOT in the modifier itself.
    // resolveStat MUST return a value even when duplicates are present.
    const proficiencyBonus = 2;
    const registry = createInMemoryRegistry();

    // Register BOTH a class Con-save proficiency AND Resilient (Con)
    const classProfInstance: ModifierInstance = {
      id: 'cleric-con-save-c' as ModifierInstanceId,
      def: { kind: 'proficiency', domain: 'save', ref: 'con' } satisfies ProficiencyMod,
      scope: {
        owner: CHAR_ID,
        target: { axis: 'self' },
        trigger: 'always',
      },
      label: 'Cleric (class)',
    };
    registry.register(classProfInstance);

    const resilientInstances = buildResilientConModifiers(CHAR_ID);
    resilientInstances.forEach((inst) => registry.register(inst));

    const ctx = makeCtx(CHAR_ID);
    // resolveStat must not throw — the read path tolerates duplicates
    expect(() =>
      resolveStat(CHAR_ID, 'saving-throw.con', 0, ctx, registry, proficiencyBonus),
    ).not.toThrow();

    const result = resolveStat(CHAR_ID, 'saving-throw.con', 0, ctx, registry, proficiencyBonus);
    // Value is still a number (proficiency bonus contributes; stacking is not deduped at read-time)
    expect(typeof result.value).toBe('number');
    expect(result.value).toBeGreaterThanOrEqual(proficiencyBonus);
  });

  // ── Round-trip ────────────────────────────────────────────────────────────────

  it('(d) round-trip: Resilient (Con) instance survives JSON serialize + reload', () => {
    // REQ-RULE-RESILIENT-01: round-trip serialization of compiled instances.
    const proficiencyBonus = 2;
    const instances = buildResilientConModifiers(CHAR_ID);

    const serialized = JSON.stringify(instances);
    const reloaded: ModifierInstance[] = JSON.parse(serialized) as ModifierInstance[];

    const freshRegistry = createInMemoryRegistry();
    reloaded.forEach((inst) => freshRegistry.register(inst));

    const ctx = makeCtx(CHAR_ID);
    const result = resolveStat(
      CHAR_ID,
      'saving-throw.con',
      0,
      ctx,
      freshRegistry,
      proficiencyBonus,
    );

    const resilientSource = result.breakdown.find(
      (s) => s.label === 'Resilient (Constitution)',
    );
    expect(resilientSource, 'Resilient source should survive round-trip').toBeDefined();
    expect(resilientSource!.amount).toBe(proficiencyBonus);
  });
});
