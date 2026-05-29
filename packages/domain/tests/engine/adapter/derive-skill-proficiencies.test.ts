/**
 * TDD tests for deriveSkillProficiencies adapter.
 *
 * REQ-DSP-01 through REQ-DSP-05, REQ-DEDUP-01, REQ-TOLREAD-01
 *
 * Scenarios:
 *   1.1 Class skill proficiency
 *   1.2 Background skill proficiency
 *   1.3 Race skill choice proficiency
 *   1.4 All three sources combined
 *   1.5 Empty input → []
 *   1.6 Dedup: class + background same skill → 1 instance
 *   1.7 Dedup: all three sources same skill → 1 instance
 *   1.8 Label format: source-agnostic slug label (ADR-4)
 */
import { describe, it, expect } from 'vitest';
import { deriveSkillProficiencies } from '../../../src/engine/adapter/derive-skill-proficiencies.js';
import type { EntityId } from '../../../src/engine/types.js';

const charId = 'char-test' as EntityId;

describe('deriveSkillProficiencies', () => {
  // ── Scenario 1.1 — Class skill proficiency (REQ-DSP-01) ──────────────────────
  it('1.1: class skillChoices → one ProficiencyMod per skill', () => {
    // PHB p.96 (Rogue skill list includes Stealth, Perception)
    const result = deriveSkillProficiencies(
      { classes: [{ skillChoices: ['stealth', 'perception'] }] },
      charId,
    );
    expect(result).toHaveLength(2);
    const refs = result.map((m) => (m.def as { ref: string }).ref);
    expect(refs).toContain('stealth');
    expect(refs).toContain('perception');
    for (const m of result) {
      expect((m.def as { domain: string }).domain).toBe('skill');
      expect((m.def as { kind: string }).kind).toBe('proficiency');
    }
  });

  // ── Scenario 1.2 — Background skill proficiency (REQ-DSP-02) ─────────────────
  it('1.2: backgroundSkills → one ProficiencyMod per skill', () => {
    // PHB p.138 (Soldier background grants Athletics, Intimidation)
    const result = deriveSkillProficiencies(
      { backgroundSkills: ['athletics', 'survival'] },
      charId,
    );
    expect(result).toHaveLength(2);
    const refs = result.map((m) => (m.def as { ref: string }).ref);
    expect(refs).toContain('athletics');
    expect(refs).toContain('survival');
    for (const m of result) {
      expect((m.def as { domain: string }).domain).toBe('skill');
    }
  });

  // ── Scenario 1.3 — Race skill choice proficiency (REQ-DSP-03) ────────────────
  it('1.3: raceSkillChoices → one ProficiencyMod per skill', () => {
    // PHB p.39 (Half-Elf: two skills of choice)
    const result = deriveSkillProficiencies(
      { raceSkillChoices: ['persuasion'] },
      charId,
    );
    expect(result).toHaveLength(1);
    expect((result[0]!.def as { ref: string }).ref).toBe('persuasion');
    expect((result[0]!.def as { domain: string }).domain).toBe('skill');
  });

  // ── Scenario 1.4 — All three sources combined (REQ-DSP-04) ───────────────────
  it('1.4: class + background + race → 3 unique ProficiencyMods', () => {
    const result = deriveSkillProficiencies(
      {
        classes: [{ skillChoices: ['stealth'] }],
        backgroundSkills: ['athletics'],
        raceSkillChoices: ['perception'],
      },
      charId,
    );
    expect(result).toHaveLength(3);
    const refs = result.map((m) => (m.def as { ref: string }).ref);
    expect(refs).toContain('stealth');
    expect(refs).toContain('athletics');
    expect(refs).toContain('perception');
  });

  // ── Scenario 1.5 — Empty input → [] (REQ-TOLREAD-01) ─────────────────────────
  it('1.5: empty input → empty array', () => {
    const result = deriveSkillProficiencies(
      { classes: [], backgroundSkills: [], raceSkillChoices: [] },
      charId,
    );
    expect(result).toHaveLength(0);
  });

  // ── Scenario 1.6 — Dedup: class AND background same skill (REQ-DEDUP-01) ──────
  it('1.6: class + background both grant Athletics → exactly 1 ProficiencyMod (not 2)', () => {
    // PHB p.173 — proficiency bonus cannot be added more than once
    const result = deriveSkillProficiencies(
      {
        classes: [{ skillChoices: ['athletics'] }],
        backgroundSkills: ['athletics', 'survival'],
      },
      charId,
    );
    expect(result).toHaveLength(2); // athletics + survival, NOT 3
    const athleticsInstances = result.filter(
      (m) => (m.def as { ref: string }).ref === 'athletics',
    );
    expect(athleticsInstances).toHaveLength(1); // deduped to exactly 1
  });

  // ── Scenario 1.7 — Dedup: all three sources same skill (REQ-DEDUP-01) ─────────
  it('1.7: class + background + race all grant Perception → exactly 1 ProficiencyMod', () => {
    // PHB p.173 — proficiency bonus cannot be added more than once
    const result = deriveSkillProficiencies(
      {
        classes: [{ skillChoices: ['perception'] }],
        backgroundSkills: ['perception'],
        raceSkillChoices: ['perception'],
      },
      charId,
    );
    expect(result).toHaveLength(1);
    expect((result[0]!.def as { ref: string }).ref).toBe('perception');
  });

  // ── Scenario 1.8 — Label format (ADR-4: source-agnostic slug label) ───────────
  it('1.8: each ProficiencyMod carries source-agnostic label "Skill proficiency (<ref>)"', () => {
    // ADR-4: Set-merge loses provenance → source-agnostic is MORE honest than guessing.
    // §4b guardrail: slug-only, no human class/race/background display name.
    const result = deriveSkillProficiencies(
      {
        classes: [{ skillChoices: ['stealth'] }],
        backgroundSkills: ['athletics'],
        raceSkillChoices: ['perception'],
      },
      charId,
    );
    const stealthMod = result.find((m) => (m.def as { ref: string }).ref === 'stealth')!;
    const athleticsMod = result.find((m) => (m.def as { ref: string }).ref === 'athletics')!;
    const perceptionMod = result.find((m) => (m.def as { ref: string }).ref === 'perception')!;

    expect(stealthMod.label).toBe('Skill proficiency (stealth)');
    expect(athleticsMod.label).toBe('Skill proficiency (athletics)');
    expect(perceptionMod.label).toBe('Skill proficiency (perception)');
  });

  // ── Tolerate-read: undefined fields (REQ-TOLREAD-01) ─────────────────────────
  it('tolerate-read: undefined classes, backgroundSkills, raceSkillChoices → no crash, []', () => {
    const result = deriveSkillProficiencies({}, charId);
    expect(result).toHaveLength(0);
  });

  it('tolerate-read: class entry missing skillChoices field → treated as []', () => {
    // REQ-TOLREAD-01: Scenario 5.3
    const result = deriveSkillProficiencies(
      { classes: [{ skillChoices: undefined }] },
      charId,
    );
    expect(result).toHaveLength(0);
  });

  // ── entityId propagated (REQ-DSP-05 scope contract) ──────────────────────────
  it('entityId is propagated to scope.owner of each emitted ModifierInstance', () => {
    const result = deriveSkillProficiencies(
      { classes: [{ skillChoices: ['stealth'] }] },
      'my-char' as EntityId,
    );
    expect(result[0]!.scope.owner).toBe('my-char');
  });
});
