/**
 * Tests for buildSoldierAthleticsModifiers — Soldier background Athletics proficiency.
 *
 * // PHB 140 (Backgrounds — Soldier): "Skill Proficiencies: Athletics, Intimidation."
 * // This rule authors the Athletics proficiency grant as the Slice 2 exemplar.
 *
 * REQ-RULE-SOLDIER-01: authored via DSL pipeline (parseRule → compileRule).
 *
 * Scenarios:
 *   1. Athletics proficiency in breakdown — {source:'Soldier (background)', amount:pb, type:'untyped'}
 *   2. Round-trip — JSON.stringify/parse preserves the proficiency breakdown
 */

// RED SENTINEL — builder does not exist yet; this import will fail = RED
import { buildSoldierAthleticsModifiers } from './soldier-athletics.js';
import { describe, it, expect } from 'vitest';
import { createInMemoryRegistry } from '../registry/query.js';
import { resolveStat } from '../resolve/stat.js';
import type { EntityId } from '../types.js';
import type { ModifierInstance } from '../registry/types.js';
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

const CHAR_ID = eid('fighter-1');

// ── Scenario 1: Athletics proficiency in breakdown ────────────────────────────

describe('buildSoldierAthleticsModifiers — Athletics proficiency (PHB 140)', () => {
  it('(1) breakdown includes Soldier proficiency source when resolving skill.athletics', () => {
    // PHB 140: Soldier background grants Skill Proficiency: Athletics.
    // A ProficiencyMod{domain:'skill', ref:'athletics'} should produce a Source
    // in the breakdown with source='Soldier (background)', amount=pb, type='untyped'.
    const proficiencyBonus = 2;
    const registry = createInMemoryRegistry();
    const instances = buildSoldierAthleticsModifiers(CHAR_ID);
    instances.forEach((inst) => registry.register(inst));

    const ctx = makeCtx(CHAR_ID);
    const result = resolveStat(CHAR_ID, 'skill.athletics', 0, ctx, registry, proficiencyBonus);

    const soldierSource = result.breakdown.find((s) => s.label === 'Soldier (background)');
    expect(soldierSource, 'Soldier proficiency should appear in skill.athletics breakdown').toBeDefined();
    expect(soldierSource!.amount).toBe(proficiencyBonus);
    expect(soldierSource!.type).toBe('untyped');
    expect(result.value).toBe(proficiencyBonus);
  });

  it('(2) round-trip: Soldier instance survives JSON serialize + reload', () => {
    // REQ-RULE-SOLDIER-01: round-trip serialization of compiled instances.
    const proficiencyBonus = 3;
    const instances = buildSoldierAthleticsModifiers(CHAR_ID);

    // Serialize + reload
    const serialized = JSON.stringify(instances);
    const reloaded: ModifierInstance[] = JSON.parse(serialized) as ModifierInstance[];

    const freshRegistry = createInMemoryRegistry();
    reloaded.forEach((inst) => freshRegistry.register(inst));

    const ctx = makeCtx(CHAR_ID);
    const result = resolveStat(CHAR_ID, 'skill.athletics', 0, ctx, freshRegistry, proficiencyBonus);

    const soldierSource = result.breakdown.find((s) => s.label === 'Soldier (background)');
    expect(soldierSource, 'Soldier proficiency should survive round-trip').toBeDefined();
    expect(soldierSource!.amount).toBe(proficiencyBonus);
    expect(result.value).toBe(proficiencyBonus);
  });
});
