/**
 * Unit tests for deriveSavingThrowProficiencies — adapter that converts
 * class-granted save proficiencies into ProficiencyMod ModifierInstance[]
 * ready for registry.register().
 *
 * Source rules:
 *   PHB p.179 — "Add your proficiency bonus to the modifier for the relevant
 *                ability score if you are proficient in the saving throw."
 *   PHB p.164 — Multiclassing: "When you gain a level in a class other than
 *                your first, you don't gain the class's saving throw proficiencies."
 *
 * §4b guardrail: label MUST use slug/ability form only — NO hardcoded class display names.
 *
 * REQ-DSTP-01, REQ-DSTP-02, REQ-DSTP-03
 */
import { describe, it, expect } from 'vitest';
import { deriveSavingThrowProficiencies } from '../../../src/engine/adapter/derive-saving-throw-proficiencies.js';
import type { EntityId } from '../../../src/engine/types.js';

function eid(s: string): EntityId {
  return s as EntityId;
}

const CHAR_ID = eid('char-test');

// ── REQ-DSTP-01 — Fighter saves → 2 ProficiencyMod instances ──────────────────

describe('deriveSavingThrowProficiencies — Fighter saves (REQ-DSTP-01)', () => {
  it('Fighter: [str, con] → 2 ProficiencyMod instances with domain:save (PHB p.179)', () => {
    // PHB p.72 — Fighter saving throws: Strength and Constitution
    const result = deriveSavingThrowProficiencies(['str', 'con'], CHAR_ID);
    expect(result).toHaveLength(2);

    const strMod = result.find((i) => i.def.kind === 'proficiency' && i.def.domain === 'save' && i.def.ref === 'str');
    const conMod = result.find((i) => i.def.kind === 'proficiency' && i.def.domain === 'save' && i.def.ref === 'con');

    expect(strMod).toBeDefined();
    expect(conMod).toBeDefined();
  });

  it('each instance has correct scope: owner=charId, axis=self, trigger=always', () => {
    // Scope rules per design §2 — save prof is always-active, self-targeting
    const result = deriveSavingThrowProficiencies(['str', 'con'], CHAR_ID);
    for (const inst of result) {
      expect(inst.scope.owner).toBe(CHAR_ID);
      expect(inst.scope.target).toEqual({ axis: 'self' });
      expect(inst.scope.trigger).toBe('always');
    }
  });

  it('each instance id is deterministic: save-prof-str, save-prof-con', () => {
    // REQ-DSTP-01: one id per ability, no collisions
    const result = deriveSavingThrowProficiencies(['str', 'con'], CHAR_ID);
    const ids = result.map((i) => i.id);
    expect(ids).toContain('save-prof-str');
    expect(ids).toContain('save-prof-con');
  });
});

// ── REQ-DSTP-01 — Scenario 1.2: empty input → [] ──────────────────────────────

describe('deriveSavingThrowProficiencies — empty input (REQ-DSTP-01 Scenario 1.2)', () => {
  it('empty array → [] (multiclass secondary class has no saves)', () => {
    // PHB p.164 — secondary class does not grant saves; route passes []
    const result = deriveSavingThrowProficiencies([], CHAR_ID);
    expect(result).toEqual([]);
  });

  it('undefined input treated as [] (tolerate-read guard REQ-TOLREAD-01)', () => {
    // Guard: (primaryClassSavingThrows ?? []).map(...)
    const result = deriveSavingThrowProficiencies(undefined as unknown as string[], CHAR_ID);
    expect(result).toEqual([]);
  });
});

// ── REQ-DSTP-01 — Scenario 1.3: all 6 abilities ───────────────────────────────

describe('deriveSavingThrowProficiencies — all 6 abilities (REQ-DSTP-01 Scenario 1.3)', () => {
  it('6 saves → 6 ProficiencyMod instances', () => {
    const result = deriveSavingThrowProficiencies(['str', 'dex', 'con', 'int', 'wis', 'cha'], CHAR_ID);
    expect(result).toHaveLength(6);
    const refs = result.map((i) => (i.def.kind === 'proficiency' ? i.def.ref : null));
    expect(refs).toContain('str');
    expect(refs).toContain('dex');
    expect(refs).toContain('con');
    expect(refs).toContain('int');
    expect(refs).toContain('wis');
    expect(refs).toContain('cha');
  });
});

// ── REQ-DSTP-02 — label format: "Class save (STR)" slug-only ──────────────────

describe('deriveSavingThrowProficiencies — provenance label §4b guardrail (REQ-DSTP-02)', () => {
  it('label is "Class save (STR)" for str (slug-only, NOT hardcoded display name)', () => {
    // §4b guardrail: NEVER hardcode human display name (e.g. "Fighter")
    // Label format: "Class save (${ability.toUpperCase()})"
    const result = deriveSavingThrowProficiencies(['str'], CHAR_ID);
    const inst = result[0];
    expect(inst).toBeDefined();
    expect(inst!.label).toBe('Class save (STR)');
    // Must NOT contain hardcoded class names
    expect(inst!.label).not.toMatch(/fighter|wizard|cleric|rogue|warlock|barbarian|monk|paladin|ranger|druid|bard|sorcerer/i);
  });

  it('label format for all 6: "Class save (${A.toUpperCase()})" pattern', () => {
    const result = deriveSavingThrowProficiencies(['str', 'dex', 'con', 'int', 'wis', 'cha'], CHAR_ID);
    for (const inst of result) {
      expect(inst.label).toMatch(/^Class save \([A-Z]{3}\)$/);
    }
  });
});
