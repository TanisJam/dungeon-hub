/**
 * Parity gate corpus — engine skill resolution (Gate A: engine===legacy).
 *
 * Gate A asserts engine.modifier === legacyMod (reproduced inline) for each archetype.
 * Legacy block compute.ts:394-417 still present while Gate A runs.
 * Gate B (Commit 3): comparative form replaced with captured literal values.
 *
 * 9 archetypes:
 *   1. Non-proficient WIS 18 Perception → mod=+4, prof=false
 *   2. Class Stealth Rogue DEX 16 PB 2 → mod=+5, prof=true
 *   3. Background Athletics Fighter STR 16 PB 2 → mod=+5, prof=true
 *   4. Race skill Persuasion Half-Elf CHA 14 PB 2 → mod=+4, prof=true
 *   5. Dedup class+background Athletics STR 14 PB 2 → mod=+4 ONCE (single pb)
 *   6. WIS 18 no-Perception-prof PB 2 → mod=+4 (same as 1, different fixture)
 *   7. All five ability groups: STR/DEX/INT/WIS/CHA with space-keyed skill included
 *   8. Forward-compat NumMod on skill.athletics STR 14 prof PB 2 NumMod+3 → mod=+7
 *   9. Tolerate-read: raceSkillChoices=undefined, background=undefined → class skills only
 *
 * REQ-GATE-01, REQ-GATE-02, REQ-GATE-03, REQ-SKILL-NUMMOD-01
 */
import { describe, it, expect } from 'vitest';
import { createInMemoryRegistry } from '../registry/query.js';
import { resolveStat } from '../resolve/stat.js';
import { deriveSkillProficiencies } from '../adapter/derive-skill-proficiencies.js';
import type { EntityId } from '../types.js';
import type { EvaluationContext } from '../context.js';
import type { ModifierInstance, ModifierInstanceId } from '../registry/types.js';

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

/** PHB p.13 — ability modifier formula */
function abilityMod(score: number): number {
  return Math.floor((score - 10) / 2);
}

/**
 * Legacy formula reproduced inline (mirrors compute.ts:403-413):
 *   mod = abilityMod(score) + (proficientSet.has(name) ? pb : 0)
 * Used for Gate A comparisons. When legacy block is deleted in Commit 2,
 * these comparisons become the captured literal values for Gate B.
 */
function legacyMod(score: number, proficient: boolean, pb: number): number {
  return abilityMod(score) + (proficient ? pb : 0);
}

interface SkillSetup {
  charId: EntityId;
  input: Parameters<typeof deriveSkillProficiencies>[0];
  pb: number;
  extraSetup?: (registry: ReturnType<typeof createInMemoryRegistry>) => void;
}

function resolveSkill(
  { charId, input, pb, extraSetup }: SkillSetup,
  skillName: string,
  abilityScore: number,
): { value: number; proficient: boolean } {
  const registry = createInMemoryRegistry();
  const ctx = makeCtx(charId);

  const skillProfMods = deriveSkillProficiencies(input, charId);
  for (const m of skillProfMods) registry.register(m);

  extraSetup?.(registry);

  const proficientSet = new Set(skillProfMods.map((m) => (m.def as { ref: string }).ref));
  const base = abilityMod(abilityScore);
  const resolved = resolveStat(charId, `skill.${skillName}`, base, ctx, registry, pb);

  return { value: resolved.value, proficient: proficientSet.has(skillName) };
}

// ── Archetype 1 — Non-proficient WIS 18 Perception ───────────────────────────

describe('Archetype 1 — Non-proficient WIS 18 Perception (REQ-GATE-01 Scenario 9.1)', () => {
  // PHB p.173 — no proficiency = ability mod only
  // PHB p.13 — WIS 18: mod = floor((18-10)/2) = +4
  const setup: SkillSetup = {
    charId: eid('arch-1'),
    input: { classes: [], backgroundSkills: [], raceSkillChoices: [] },
    pb: 2,
  };
  const result = resolveSkill(setup, 'perception', 18);

  it('modifier = +4 (WIS mod only, no pb — engine===legacy)', () => {
    // Gate A: engine === legacy
    expect(result.value).toBe(legacyMod(18, false, 2)); // +4
  });

  it('proficient = false (no proficiency source)', () => {
    expect(result.proficient).toBe(false);
  });

  it('passive perception = 10 + engine perception modifier = 14 (REQ-GATE-03)', () => {
    // PHB p.177 — Passive Perception = 10 + Wisdom (Perception) modifier
    const passivePerception = 10 + result.value;
    expect(passivePerception).toBe(10 + legacyMod(18, false, 2)); // 14
  });
});

// ── Archetype 2 — Class skill: Rogue Stealth (DEX 16, PB 2) ─────────────────

describe('Archetype 2 — Class skill Rogue Stealth DEX 16 PB 2 (REQ-GATE-01 Scenario 9.2)', () => {
  // PHB p.96 — Rogue skill proficiencies include Stealth
  // PHB p.174 — proficient: abilityMod + proficiencyBonus
  const setup: SkillSetup = {
    charId: eid('arch-2'),
    input: { classes: [{ skillChoices: ['stealth', 'perception'] }] },
    pb: 2,
  };
  const result = resolveSkill(setup, 'stealth', 16);

  it('modifier = +5 (DEX mod +3 + PB +2 — engine===legacy)', () => {
    expect(result.value).toBe(legacyMod(16, true, 2)); // +5
  });

  it('proficient = true', () => {
    expect(result.proficient).toBe(true);
  });

  it('passive perception = 10 + engine perception modifier (REQ-GATE-03)', () => {
    // Rogue with Perception proficient: WIS assumed 10 (mod 0) + PB 2 = 2 → passive = 12
    const perceptionResult = resolveSkill(setup, 'perception', 10);
    const passivePerception = 10 + perceptionResult.value;
    expect(passivePerception).toBe(10 + legacyMod(10, true, 2)); // 14 (10 + 2)
  });
});

// ── Archetype 3 — Background skill: Soldier Athletics (STR 16, PB 2) ─────────

describe('Archetype 3 — Background Athletics Fighter STR 16 PB 2 (REQ-GATE-01 Scenario 9.3)', () => {
  // PHB p.138 — Soldier background grants Athletics and Intimidation proficiencies
  const setup: SkillSetup = {
    charId: eid('arch-3'),
    input: { backgroundSkills: ['athletics', 'intimidation'] },
    pb: 2,
  };
  const result = resolveSkill(setup, 'athletics', 16);

  it('modifier = +5 (STR mod +3 + PB +2 — engine===legacy)', () => {
    expect(result.value).toBe(legacyMod(16, true, 2)); // +5
  });

  it('proficient = true', () => {
    expect(result.proficient).toBe(true);
  });
});

// ── Archetype 4 — Race skill: Half-Elf Persuasion (CHA 14, PB 2) ─────────────

describe('Archetype 4 — Race skill Half-Elf Persuasion CHA 14 PB 2 (REQ-GATE-01 Scenario 9.4)', () => {
  // PHB p.39 — Half-Elf: two skill proficiencies of choice
  const setup: SkillSetup = {
    charId: eid('arch-4'),
    input: { raceSkillChoices: ['persuasion', 'insight'] },
    pb: 2,
  };
  const result = resolveSkill(setup, 'persuasion', 14);

  it('modifier = +4 (CHA mod +2 + PB +2 — engine===legacy)', () => {
    expect(result.value).toBe(legacyMod(14, true, 2)); // +4
  });

  it('proficient = true', () => {
    expect(result.proficient).toBe(true);
  });
});

// ── Archetype 5 — Dedup: class AND background both grant Athletics ─────────────

describe('Archetype 5 — Dedup class+background Athletics STR 14 PB 2 (REQ-GATE-01 Scenario 9.5)', () => {
  // PHB p.173 — proficiency bonus CANNOT be added more than once.
  // This archetype asserts IDENTICAL behavior in engine and legacy (NOT a divergence).
  // Both engine and legacy use Set-dedup — engine resolves to abilityMod + pb ONCE.
  const setup: SkillSetup = {
    charId: eid('arch-5'),
    input: {
      classes: [{ skillChoices: ['athletics'] }],
      backgroundSkills: ['athletics', 'survival'],
    },
    pb: 2,
  };
  const skillProfMods = deriveSkillProficiencies(setup.input, eid('arch-5'));

  it('adapter emits exactly 1 ProficiencyMod for athletics (not 2)', () => {
    const athleticsInstances = skillProfMods.filter(
      (m) => (m.def as { ref: string }).ref === 'athletics',
    );
    expect(athleticsInstances).toHaveLength(1);
  });

  it('modifier = +4 (STR mod +2 + PB +2 ONCE — engine===legacy)', () => {
    const result = resolveSkill(setup, 'athletics', 14);
    expect(result.value).toBe(legacyMod(14, true, 2)); // +4, NOT +6 (2*pb would be wrong)
  });

  it('proficient = true', () => {
    const result = resolveSkill(setup, 'athletics', 14);
    expect(result.proficient).toBe(true);
  });
});

// ── Archetype 6 — High-ability, no proficiency: WIS 18 Perception ─────────────

describe('Archetype 6 — WIS 18 no Perception proficiency PB 2 (REQ-GATE-01 Scenario 9.6)', () => {
  // PHB p.173 — without proficiency, only ability modifier applies
  // (Different fixture from archetype 1 — verifies the no-prof path with explicit non-empty proficientSet)
  const setup: SkillSetup = {
    charId: eid('arch-6'),
    input: {
      // Perception is NOT in skillChoices — only Stealth
      classes: [{ skillChoices: ['stealth'] }],
    },
    pb: 2,
  };
  const result = resolveSkill(setup, 'perception', 18);

  it('modifier = +4 (WIS mod only, no pb — engine===legacy)', () => {
    expect(result.value).toBe(legacyMod(18, false, 2)); // +4
  });

  it('proficient = false', () => {
    expect(result.proficient).toBe(false);
  });
});

// ── Archetype 7 — All five ability groups + space-keyed skill ──────────────────

describe('Archetype 7 — All five ability groups, mixed prof/no-prof (REQ-GATE-01 Scenario 9.7)', () => {
  // PHB p.173-179 — skills by ability group (normative mapping)
  // Includes 'animal handling' (WIS, space-keyed) to verify stat.ts:162 plain-string equality.
  // stat.ts:162: stat === `skill.${def.ref}` — spaces PRESERVED in ref (NOT stripped).
  const setup: SkillSetup = {
    charId: eid('arch-7'),
    input: {
      classes: [{ skillChoices: ['athletics', 'stealth', 'arcana'] }],
      backgroundSkills: ['animal handling'], // WIS, space-keyed — PHB p.173 Animal Handling entry
    },
    pb: 2,
  };

  it('STR: Athletics proficient — STR 16 → +5 (engine===legacy)', () => {
    const result = resolveSkill(setup, 'athletics', 16);
    expect(result.value).toBe(legacyMod(16, true, 2)); // +5
    expect(result.proficient).toBe(true);
  });

  it('DEX: Stealth proficient — DEX 14 → +4 (engine===legacy)', () => {
    const result = resolveSkill(setup, 'stealth', 14);
    expect(result.value).toBe(legacyMod(14, true, 2)); // +4
    expect(result.proficient).toBe(true);
  });

  it('INT: Arcana proficient — INT 12 → +3 (engine===legacy)', () => {
    const result = resolveSkill(setup, 'arcana', 12);
    expect(result.value).toBe(legacyMod(12, true, 2)); // +3
    expect(result.proficient).toBe(true);
  });

  it('WIS: Animal Handling proficient (space-keyed ref!) — WIS 12 → +3 (engine===legacy)', () => {
    // Space-keyed skill: 'animal handling' — ref contains a space.
    // stat.ts:162 resolves via plain equality `skill.animal handling` — works correctly.
    // PHB p.178 — Animal Handling is a Wisdom skill.
    const result = resolveSkill(setup, 'animal handling', 12);
    expect(result.value).toBe(legacyMod(12, true, 2)); // +3
    expect(result.proficient).toBe(true);
  });

  it('CHA: Deception not proficient — CHA 10 → 0 (engine===legacy)', () => {
    const result = resolveSkill(setup, 'deception', 10);
    expect(result.value).toBe(legacyMod(10, false, 2)); // 0
    expect(result.proficient).toBe(false);
  });
});

// ── Archetype 8 — Forward-compat NumMod on skill.athletics ───────────────────

describe('Archetype 8 — Forward-compat NumMod on skill.athletics (REQ-SKILL-NUMMOD-01)', () => {
  // Engine design: resolveStat accumulates all NumMods for matching stat key.
  // REQ-SKILL-NUMMOD-01: NumMod{stat:'skill.athletics'} applies additively.
  // No PHB rule governs item bonuses directly; forward-compat test for composition path.
  const charId = eid('arch-8');
  const numMod: ModifierInstance = {
    id: 'test-nummod-athletics' as ModifierInstanceId,
    def: {
      kind: 'num' as const,
      op: 'add' as const,
      value: 3,
      stat: 'skill.athletics' as const,
      category: 'untyped' as const,
    },
    scope: {
      owner: charId,
      target: { axis: 'self' as const },
      trigger: 'always' as const,
    },
    label: 'Test NumMod (athletics)',
  };

  const setup: SkillSetup = {
    charId,
    input: { classes: [{ skillChoices: ['athletics'] }] },
    pb: 2,
    extraSetup: (registry) => registry.register(numMod),
  };
  const result = resolveSkill(setup, 'athletics', 14);

  it('modifier = +7 (STR mod +2 + PB +2 + NumMod +3 — forward-compat)', () => {
    // STR 14: mod = +2. Proficient: +2 pb. NumMod: +3. Total: +7.
    expect(result.value).toBe(7);
  });

  it('proficient = true', () => {
    expect(result.proficient).toBe(true);
  });
});

// ── Archetype 9 — Tolerate-read: missing raceSkillChoices and background ──────

describe('Archetype 9 — Tolerate-read: missing raceSkillChoices + background (REQ-TOLREAD-01)', () => {
  // CLAUDE.md §11 (read-path tolerance) — legacy rows predating raceSkillChoices/background
  // fields must load without crash. Missing fields treated as [] (REQ-TOLREAD-01).
  const setup: SkillSetup = {
    charId: eid('arch-9'),
    input: {
      classes: [{ skillChoices: ['stealth', 'athletics'] }],
      // backgroundSkills absent → treated as []
      // raceSkillChoices absent → treated as []
    },
    pb: 2,
  };

  it('class skills are still proficient (no crash from missing fields)', () => {
    const stealth = resolveSkill(setup, 'stealth', 14);
    expect(stealth.value).toBe(legacyMod(14, true, 2)); // +4
    expect(stealth.proficient).toBe(true);

    const athletics = resolveSkill(setup, 'athletics', 16);
    expect(athletics.value).toBe(legacyMod(16, true, 2)); // +5
    expect(athletics.proficient).toBe(true);
  });

  it('non-proficient skill without sources → abilityMod only (engine===legacy)', () => {
    // No raceSkillChoices, no background → only class skills proficient
    const perception = resolveSkill(setup, 'perception', 12);
    expect(perception.value).toBe(legacyMod(12, false, 2)); // +1
    expect(perception.proficient).toBe(false);
  });

  it('passive perception from engine perception modifier (REQ-GATE-03)', () => {
    // PHB p.177 — passivePerception = 10 + WIS (Perception) check modifier
    // Perception not proficient: WIS 12 (mod +1) → passivePerception = 11
    const perception = resolveSkill(setup, 'perception', 12);
    const passivePerception = 10 + perception.value;
    expect(passivePerception).toBe(10 + legacyMod(12, false, 2)); // 11
  });
});
