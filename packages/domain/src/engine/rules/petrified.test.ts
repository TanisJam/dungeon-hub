/**
 * TDD tests for buildPetrifiedModifiers — Petrified rule encoding.
 *
 * REQ-RI-10..11..14 / ADR-5
 *
 * PHB p.291 — Petrified:
 *   "Attack rolls against the creature have advantage."
 *   "The creature automatically fails Strength and Dexterity saving throws."
 *   "The creature has resistance to all damage."
 *   "The creature is immune to poison and disease..."
 *
 * Design — ADR-5 SPLIT RETURN:
 *   instances[]  → attackers-of AdvantageMod grant (registry path — advantage)
 *   resistMods[] → TWO ResistMods (resist-all half + poison immune) (helper path)
 *
 * Strict TDD — RED first.
 */
import { describe, expect, it } from 'vitest';
import { buildPetrifiedModifiers } from './petrified.js';
import type { EntityId } from '../types.js';
import { PETRIFIED_CONDITION_DEF } from '../conditions/petrified.js';
import type { ConditionDefinition } from '../conditions/prone.js';

// ── Resolver stubs ────────────────────────────────────────────────────────────

function makePetrifiedResolver(): (name: string) => ConditionDefinition | null {
  return (name: string) => {
    if (name === 'Petrified') return PETRIFIED_CONDITION_DEF;
    return null;
  };
}

function makeEmptyResolver(): (name: string) => ConditionDefinition | null {
  return () => null;
}

const targetId = 'target-petrified-001' as EntityId;

// ── Tests: ok:true path ───────────────────────────────────────────────────────

describe('buildPetrifiedModifiers — ok:true path (REQ-RI-10..14 / ADR-5)', () => {
  it('returns ok:true when resolver returns PETRIFIED_CONDITION_DEF', () => {
    const result = buildPetrifiedModifiers(targetId, makePetrifiedResolver());
    expect(result.ok).toBe(true);
  });

  // ── instances[] — attackers-of advantage grant ───────────────────────────

  it(
    'instances[] has at least one attackers-of advantage grant (PHB p.291 — attack rolls have advantage)',
    () => {
      // PHB p.291: "Attack rolls against the creature have advantage."
      const result = buildPetrifiedModifiers(targetId, makePetrifiedResolver());
      if (!result.ok) throw new Error('expected ok:true');

      const attackersOfGrant = result.instances.filter(
        (m) =>
          m.scope.target.axis === 'attackers-of' &&
          'mode' in m.def &&
          m.def.mode === 'grant',
      );
      expect(attackersOfGrant.length).toBeGreaterThan(0);
    },
  );

  it('attackers-of grant instance targets the given targetId (ids:[targetId])', () => {
    const result = buildPetrifiedModifiers(targetId, makePetrifiedResolver());
    if (!result.ok) throw new Error('expected ok:true');

    const grantInstance = result.instances.find(
      (m) =>
        m.scope.target.axis === 'attackers-of' &&
        'mode' in m.def &&
        m.def.mode === 'grant',
    );
    expect(grantInstance).toBeDefined();
    if (grantInstance?.scope.target.axis === 'attackers-of') {
      expect(grantInstance.scope.target.ids).toContain(targetId);
    }
  });

  it('attackers-of grant has trigger="on-attack-roll" (PHB p.291 — attack rolls)', () => {
    const result = buildPetrifiedModifiers(targetId, makePetrifiedResolver());
    if (!result.ok) throw new Error('expected ok:true');

    const grantInstance = result.instances.find(
      (m) => m.scope.target.axis === 'attackers-of' && 'mode' in m.def && m.def.mode === 'grant',
    );
    expect(grantInstance?.scope.trigger).toBe('on-attack-roll');
  });

  it('attackers-of grant predicate is alwaysTrue() — unconditional (PHB p.291, mirror Stunned)', () => {
    // PHB p.291: advantage is UNCONDITIONAL — no range/weapon gate (unlike Prone)
    const result = buildPetrifiedModifiers(targetId, makePetrifiedResolver());
    if (!result.ok) throw new Error('expected ok:true');

    const grantInstance = result.instances.find(
      (m) => m.scope.target.axis === 'attackers-of' && 'mode' in m.def && m.def.mode === 'grant',
    );
    // alwaysTrue() = { op: 'and', nodes: [] }
    expect(grantInstance?.predicate).toEqual({ op: 'and', nodes: [] });
  });

  it('instance label is "Petrified"', () => {
    const result = buildPetrifiedModifiers(targetId, makePetrifiedResolver());
    if (!result.ok) throw new Error('expected ok:true');

    const grantInstance = result.instances.find(
      (m) => m.scope.target.axis === 'attackers-of' && 'mode' in m.def && m.def.mode === 'grant',
    );
    expect(grantInstance?.label).toBe('Petrified');
  });

  // ── resistMods[] — the two resist entries ────────────────────────────────

  it(
    'resistMods[] has exactly 2 entries (resist-all half + poison immune) (PHB p.291)',
    () => {
      // PHB p.291: "resistance to all damage" + "immune to poison"
      const result = buildPetrifiedModifiers(targetId, makePetrifiedResolver());
      if (!result.ok) throw new Error('expected ok:true');

      expect(result.resistMods).toHaveLength(2);
    },
  );

  it(
    'resistMods[] contains {kind:"resist", damageType:"all", mode:"half"} (PHB p.291 — resist all damage)',
    () => {
      // PHB p.291: "The creature has resistance to all damage."
      const result = buildPetrifiedModifiers(targetId, makePetrifiedResolver());
      if (!result.ok) throw new Error('expected ok:true');

      const allResist = result.resistMods.find(
        (m) => m.damageType === 'all' && m.mode === 'half',
      );
      expect(allResist).toBeDefined();
      expect(allResist).toEqual({ kind: 'resist', damageType: 'all', mode: 'half' });
    },
  );

  it(
    'resistMods[] contains {kind:"resist", damageType:"poison", mode:"immune"} (PHB p.291 — immune to poison)',
    () => {
      // PHB p.291: "The creature is immune to poison and disease..."
      const result = buildPetrifiedModifiers(targetId, makePetrifiedResolver());
      if (!result.ok) throw new Error('expected ok:true');

      const poisonImmune = result.resistMods.find(
        (m) => m.damageType === 'poison' && m.mode === 'immune',
      );
      expect(poisonImmune).toBeDefined();
      expect(poisonImmune).toEqual({ kind: 'resist', damageType: 'poison', mode: 'immune' });
    },
  );
});

// ── Tests: ok:false path ──────────────────────────────────────────────────────

describe('buildPetrifiedModifiers — ok:false path (CONDITION_NOT_FOUND)', () => {
  it('returns ok:false with CONDITION_NOT_FOUND when resolver returns null', () => {
    const result = buildPetrifiedModifiers(targetId, makeEmptyResolver());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0].code).toBe('CONDITION_NOT_FOUND');
    expect(result.issues[0].expected).toBe('Petrified');
  });
});
