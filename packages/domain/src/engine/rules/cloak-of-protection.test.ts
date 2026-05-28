/**
 * Tests for buildCloakOfProtectionModifiers — Cloak of Protection magic item.
 *
 * // DMG 159 (Magic Items — Cloak of Protection): "+1 bonus to AC and saving throws
 * // while you wear this cloak."
 *
 * REQ-RULE-CLOAK-01: authored via DSL pipeline (parseRule → compileRule).
 *
 * Scenarios:
 *   (a) Single cloak → AC = base+1, breakdown has {source:'Cloak of Protection', amount:1, type:'item'}
 *   (b) Two cloaks → item keep-highest → AC = base+1 (NOT base+2)
 *   (c) Saving throw: single cloak also grants +1 to saving throws (flat 'saving-throw' → all saves)
 *   (d) Round-trip: instances survive JSON serialize + reload
 */

// RED SENTINEL — builder does not exist yet; this import will fail = RED
import { buildCloakOfProtectionModifiers } from './cloak-of-protection.js';
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

const CHAR_ID = eid('paladin-1');
const BASE_AC = 15;

// ── Scenario (a): Single cloak — +1 AC ───────────────────────────────────────

describe('buildCloakOfProtectionModifiers — +1 AC and saving throws (DMG 159)', () => {
  it('(a) single cloak: AC = base+1, breakdown includes {source:Cloak of Protection, amount:1, type:item}', () => {
    // DMG 159: "+1 bonus to AC and saving throws while you wear this cloak."
    // Item-category mod (category:'item') for AC.
    const registry = createInMemoryRegistry();
    const instances = buildCloakOfProtectionModifiers(CHAR_ID, 'cloak-1');
    instances.forEach((inst) => registry.register(inst));

    const ctx = makeCtx(CHAR_ID);
    const result = resolveStat(CHAR_ID, 'ac', BASE_AC, ctx, registry);

    const cloakSource = result.breakdown.find((s) => s.label === 'Cloak of Protection');
    expect(cloakSource, 'Cloak of Protection should appear in AC breakdown').toBeDefined();
    expect(cloakSource!.amount).toBe(1);
    expect(cloakSource!.type).toBe('item');
    expect(result.value).toBe(BASE_AC + 1);
  });

  it('(b) two cloaks: item keep-highest → AC = base+1 (NOT base+2)', () => {
    // DMG 159: item-category stacking (keep-highest per REQ-RESOLVE-01).
    // Two +1 item bonuses to AC → only one applies (keep-highest within category).
    const registry = createInMemoryRegistry();
    const cloak1 = buildCloakOfProtectionModifiers(CHAR_ID, 'cloak-inst-1');
    const cloak2 = buildCloakOfProtectionModifiers(CHAR_ID, 'cloak-inst-2');
    cloak1.forEach((inst) => registry.register(inst));
    cloak2.forEach((inst) => registry.register(inst));

    const ctx = makeCtx(CHAR_ID);
    const result = resolveStat(CHAR_ID, 'ac', BASE_AC, ctx, registry);

    // Item stacking: keep-highest. Both cloaks give +1 item AC → only one applies.
    expect(result.value).toBe(BASE_AC + 1); // NOT base + 2

    // Only one item source should appear in the breakdown (keep-highest eliminates one)
    const itemSources = result.breakdown.filter((s) => s.type === 'item' && s.label === 'Cloak of Protection');
    expect(itemSources).toHaveLength(1);
    expect(itemSources[0]!.amount).toBe(1);
  });

  it('(c) single cloak also grants +1 to saving throw (flat saving-throw — all saves)', () => {
    // DMG 159: "+1 bonus to AC and saving throws" — flat 'saving-throw' applies to all saves.
    // The flat 'saving-throw' num mod applies when resolving any per-ability save (T2.6 all-saves rule).
    const registry = createInMemoryRegistry();
    const instances = buildCloakOfProtectionModifiers(CHAR_ID, 'cloak-save-test');
    instances.forEach((inst) => registry.register(inst));

    const ctx = makeCtx(CHAR_ID);
    // Resolve a flat saving-throw (e.g. for a general save)
    const result = resolveStat(CHAR_ID, 'saving-throw', 0, ctx, registry);

    const cloakSource = result.breakdown.find((s) => s.label === 'Cloak of Protection');
    expect(cloakSource, 'Cloak of Protection should appear in saving-throw breakdown').toBeDefined();
    expect(cloakSource!.amount).toBe(1);
    expect(cloakSource!.type).toBe('item');
    expect(result.value).toBe(1);
  });

  it('(d) round-trip: Cloak instances survive JSON serialize + reload', () => {
    // REQ-RULE-CLOAK-01: round-trip serialization of compiled instances.
    const instances = buildCloakOfProtectionModifiers(CHAR_ID, 'cloak-rt');

    const serialized = JSON.stringify(instances);
    const reloaded: ModifierInstance[] = JSON.parse(serialized) as ModifierInstance[];

    const freshRegistry = createInMemoryRegistry();
    reloaded.forEach((inst) => freshRegistry.register(inst));

    const ctx = makeCtx(CHAR_ID);
    const result = resolveStat(CHAR_ID, 'ac', BASE_AC, ctx, freshRegistry);

    const cloakSource = result.breakdown.find((s) => s.label === 'Cloak of Protection');
    expect(cloakSource, 'Cloak of Protection should survive round-trip').toBeDefined();
    expect(cloakSource!.amount).toBe(1);
    expect(result.value).toBe(BASE_AC + 1);
  });
});
