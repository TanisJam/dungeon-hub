/**
 * TDD tests for buildRageModifiers — Rage rule encoding.
 *
 * PHB p.48 — Rage (Barbarian):
 *   "You have resistance to bludgeoning, piercing, and slashing damage."
 *   "You have advantage on Strength checks and Strength saving throws."
 *   "When you make a melee weapon attack using Strength, you gain a bonus to
 *    the damage roll that increases as you gain levels as a barbarian."
 *     - Level 1–8:  +2
 *     - Level 9–15: +3
 *     - Level 16+:  +4
 *
 * REQ-RAGE-03 (resistMods), REQ-RAGE-04 (instances), REQ-RAGE-05 (numMod)
 *
 * Design — SPLIT RETURN (ADR-1):
 *   resistMods[] → 3× b/p/s ResistMods (helper path, loadTargetResistMods)
 *   instances[]  → 2× STR self AdvantageMods (registry path, resolveRollMode)
 *   numMod       → bare NumMod for rage damage bonus (use-case wraps with predicate)
 *
 * Strict TDD — RED first.
 */

import { describe, expect, it } from 'vitest';
import { buildRageModifiers } from './rage.js';
import type { EntityId } from '../types.js';

const ragerId = 'char-barbarian-001' as EntityId;

// ── A-2: resistMods channel (REQ-RAGE-03) ────────────────────────────────────

describe('buildRageModifiers — resistMods channel (REQ-RAGE-03, PHB p.48)', () => {
  it('returns ok:true for any barbarian level', () => {
    // buildRageModifiers cannot fail (no resolver, no catalog lookup)
    const result = buildRageModifiers(1, ragerId);
    expect(result.ok).toBe(true);
  });

  it('resistMods[] has exactly 3 entries: bludgeoning/half, piercing/half, slashing/half (PHB p.48)', () => {
    // PHB p.48: "You have resistance to bludgeoning, piercing, and slashing damage."
    const result = buildRageModifiers(1, ragerId);
    if (!result.ok) throw new Error('expected ok:true');

    expect(result.resistMods).toHaveLength(3);
  });

  it('resistMods[] contains {kind:"resist", damageType:"bludgeoning", mode:"half"} (PHB p.48)', () => {
    // PHB p.48: resistance to bludgeoning damage
    const result = buildRageModifiers(1, ragerId);
    if (!result.ok) throw new Error('expected ok:true');

    const bludgeonResist = result.resistMods.find((m) => m.damageType === 'bludgeoning');
    expect(bludgeonResist).toBeDefined();
    expect(bludgeonResist).toEqual({ kind: 'resist', damageType: 'bludgeoning', mode: 'half' });
  });

  it('resistMods[] contains {kind:"resist", damageType:"piercing", mode:"half"} (PHB p.48)', () => {
    // PHB p.48: resistance to piercing damage
    const result = buildRageModifiers(1, ragerId);
    if (!result.ok) throw new Error('expected ok:true');

    const piercingResist = result.resistMods.find((m) => m.damageType === 'piercing');
    expect(piercingResist).toBeDefined();
    expect(piercingResist).toEqual({ kind: 'resist', damageType: 'piercing', mode: 'half' });
  });

  it('resistMods[] contains {kind:"resist", damageType:"slashing", mode:"half"} (PHB p.48)', () => {
    // PHB p.48: resistance to slashing damage
    const result = buildRageModifiers(1, ragerId);
    if (!result.ok) throw new Error('expected ok:true');

    const slashingResist = result.resistMods.find((m) => m.damageType === 'slashing');
    expect(slashingResist).toBeDefined();
    expect(slashingResist).toEqual({ kind: 'resist', damageType: 'slashing', mode: 'half' });
  });

  it('resistMods are level-independent — same 3 mods at L1, L9, L16 (ADR-1)', () => {
    // PHB p.48: physical resistance is not level-gated; level affects only the damage bonus
    const r1 = buildRageModifiers(1, ragerId);
    const r9 = buildRageModifiers(9, ragerId);
    const r16 = buildRageModifiers(16, ragerId);
    if (!r1.ok || !r9.ok || !r16.ok) throw new Error('expected ok:true for all');

    expect(r1.resistMods).toEqual(r9.resistMods);
    expect(r9.resistMods).toEqual(r16.resistMods);
  });
});

// ── A-3: instances channel (REQ-RAGE-04) ─────────────────────────────────────

describe('buildRageModifiers — instances channel (REQ-RAGE-04, PHB p.48)', () => {
  it('instances[] has exactly 2 entries: STR-check + STR-save AdvantageMods (PHB p.48)', () => {
    // PHB p.48: "You have advantage on Strength checks and Strength saving throws."
    const result = buildRageModifiers(1, ragerId);
    if (!result.ok) throw new Error('expected ok:true');

    expect(result.instances).toHaveLength(2);
  });

  it('instances[] contains one rollType="check" AdvantageMod (PHB p.48 — STR checks; engine RollType uses "check")', () => {
    // PHB p.48: advantage on Strength checks
    // NOTE: RollType in the engine uses 'check' for ability checks (types.ts L59)
    const result = buildRageModifiers(1, ragerId);
    if (!result.ok) throw new Error('expected ok:true');

    const checkMod = result.instances.find(
      (m) => 'rollType' in m.def && m.def.rollType === 'check',
    );
    expect(checkMod).toBeDefined();
    expect(checkMod?.def).toMatchObject({ kind: 'advantage', mode: 'grant', rollType: 'check' });
  });

  it('instances[] contains one rollType="save" AdvantageMod (PHB p.48 — STR saves; engine RollType uses "save")', () => {
    // PHB p.48: advantage on Strength saving throws
    // NOTE: RollType in the engine uses 'save' for saving throws (types.ts L59)
    const result = buildRageModifiers(1, ragerId);
    if (!result.ok) throw new Error('expected ok:true');

    const saveMod = result.instances.find(
      (m) => 'rollType' in m.def && m.def.rollType === 'save',
    );
    expect(saveMod).toBeDefined();
    expect(saveMod?.def).toMatchObject({ kind: 'advantage', mode: 'grant', rollType: 'save' });
  });

  it('both instances are scoped to ragerId self-axis (entities:[ragerId])', () => {
    // ADR-1: STR advantage mods are self-axis, bound to the rager's character EntityId
    const result = buildRageModifiers(1, ragerId);
    if (!result.ok) throw new Error('expected ok:true');

    for (const inst of result.instances) {
      expect(inst.scope.owner).toBe(ragerId);
      expect(inst.scope.target).toMatchObject({ axis: 'entities', ids: [ragerId] });
    }
  });

  it('instance IDs follow stable naming convention with ragerId', () => {
    // ADR-1: stable IDs prevent registry duplicates on repeated calls
    const result = buildRageModifiers(1, ragerId);
    if (!result.ok) throw new Error('expected ok:true');

    const ids = result.instances.map((m) => m.id);
    // Both IDs must include the ragerId string for traceability
    for (const id of ids) {
      expect(id).toContain(ragerId);
    }
    // IDs must be distinct
    expect(new Set(ids).size).toBe(2);
  });
});

// ── A-4: numMod channel + level scaling (REQ-RAGE-05) ────────────────────────

describe('buildRageModifiers — numMod channel (REQ-RAGE-05, PHB p.48)', () => {
  it('numMod.stat === "damage" + numMod.op === "add" (PHB p.48 — damage bonus)', () => {
    // PHB p.48: rage adds a bonus to the DAMAGE roll
    const result = buildRageModifiers(1, ragerId);
    if (!result.ok) throw new Error('expected ok:true');

    expect(result.numMod.stat).toBe('damage');
    expect(result.numMod.op).toBe('add');
    expect(result.numMod.kind).toBe('num');
  });

  // Level-scaling table — PHB p.48
  it('Level 1 → numMod.value === 2 (PHB p.48 — L1-8: +2)', () => {
    const result = buildRageModifiers(1, ragerId);
    if (!result.ok) throw new Error('expected ok:true');
    expect(result.numMod.value).toBe(2);
  });

  it('Level 5 → numMod.value === 2 (PHB p.48 — L1-8: +2)', () => {
    const result = buildRageModifiers(5, ragerId);
    if (!result.ok) throw new Error('expected ok:true');
    expect(result.numMod.value).toBe(2);
  });

  it('Level 8 → numMod.value === 2 (PHB p.48 — L1-8: +2, boundary)', () => {
    const result = buildRageModifiers(8, ragerId);
    if (!result.ok) throw new Error('expected ok:true');
    expect(result.numMod.value).toBe(2);
  });

  it('Level 9 → numMod.value === 3 (PHB p.48 — L9-15: +3, boundary)', () => {
    const result = buildRageModifiers(9, ragerId);
    if (!result.ok) throw new Error('expected ok:true');
    expect(result.numMod.value).toBe(3);
  });

  it('Level 15 → numMod.value === 3 (PHB p.48 — L9-15: +3, boundary)', () => {
    const result = buildRageModifiers(15, ragerId);
    if (!result.ok) throw new Error('expected ok:true');
    expect(result.numMod.value).toBe(3);
  });

  it('Level 16 → numMod.value === 4 (PHB p.48 — L16+: +4, boundary)', () => {
    const result = buildRageModifiers(16, ragerId);
    if (!result.ok) throw new Error('expected ok:true');
    expect(result.numMod.value).toBe(4);
  });

  it('Level 20 → numMod.value === 4 (PHB p.48 — L16+: +4)', () => {
    const result = buildRageModifiers(20, ragerId);
    if (!result.ok) throw new Error('expected ok:true');
    expect(result.numMod.value).toBe(4);
  });

  it('numMod is a bare NumMod (NOT wrapped in ModifierInstance — use-case wraps with MELEE+STR predicate, ADR-5)', () => {
    // ADR-5: predicate wiring (MELEE+STR) is NOT domain's job; the use-case
    // (build-attack-context) wraps the numMod into a ModifierInstance.
    const result = buildRageModifiers(1, ragerId);
    if (!result.ok) throw new Error('expected ok:true');

    // NumMod has no 'id', 'scope', or 'predicate' — those are ModifierInstance fields
    expect('id' in result.numMod).toBe(false);
    expect('scope' in result.numMod).toBe(false);
    expect('predicate' in result.numMod).toBe(false);
  });
});
