/**
 * derive-skill-proficiencies — skill proficiencies from all three PHB sources → ProficiencyMod[] adapter.
 *
 * Pure domain helper. No IO, no registry access.
 *
 * Converts the three character-snapshot skill proficiency sources into
 * ProficiencyMod ModifierInstance[] ready for registry.register().
 *
 * Sources (PHB p.173-174):
 *   - classes[*].skillChoices   — class-granted skill proficiencies
 *   - backgroundSkills          — background-granted skill proficiencies
 *   - raceSkillChoices          — race-granted skill proficiency choices
 *                                 (Variant Human PHB p.31, Half-Elf PHB p.39)
 *
 * Dedup: a Set<string> deduplicates across all three sources before emitting.
 * PHB p.173 — "Your proficiency bonus can't be added to a single die roll
 * or other number more than once." The engine does NOT deduplicate registered
 * ProficiencyMods — this adapter MUST own the dedup invariant.
 *
 * Label (ADR-4): source-agnostic "Skill proficiency (<ref>)" because after
 * Set-merge the original source is lost. This satisfies §4b guardrail (slug-only,
 * no human class/race/background display name). No current consumer reads the
 * breakdown label for skills.
 *
 * REQ-DSP-01, REQ-DSP-02, REQ-DSP-03, REQ-DSP-04, REQ-DSP-05,
 * REQ-DEDUP-01, REQ-TOLREAD-01
 */

import type { EntityId } from '../types.js';
import type { ModifierInstance, ModifierInstanceId } from '../registry/types.js';

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Input: the three skill-proficiency sources from a CharacterSnapshot.
 * All fields are optional to support tolerate-read for legacy rows.
 */
export interface SkillProficiencyInput {
  /** Per-class granted skill proficiencies (PHB p.95, 107, etc.). */
  classes?: Array<{ skillChoices?: string[] }>;
  /** Background-granted skill proficiencies (PHB p.125-141). */
  backgroundSkills?: string[];
  /** Race-granted skill proficiency choices (PHB p.31 Variant Human, p.39 Half-Elf). */
  raceSkillChoices?: string[];
}

/**
 * Derives ProficiencyMod instances from all three skill proficiency sources,
 * deduplicating via Set<string> before emitting.
 *
 * PHB p.173: proficiency bonus added exactly once per skill regardless of source count.
 * Set dedup mirrors the legacy compute.ts:398-401 strategy identically.
 *
 * @param input - The three optional skill proficiency sources from CharacterSnapshot.
 * @param charId - EntityId of the owning character.
 * @returns Array of ModifierInstances ready for registry.register().
 *   Empty/missing input fields → []. Refs are lowercased, spaces preserved
 *   (e.g. 'animal handling') to match SKILL_TO_ABILITY keys and stat.ts:162
 *   plain-equality matching for 'skill.<ref>'.
 */
export function deriveSkillProficiencies(
  input: SkillProficiencyInput,
  charId: EntityId,
): ModifierInstance[] {
  // Dedup Set — mirrors compute.ts:398-401 exactly.
  // lowercase ONLY, NO space-stripping (space-keyed refs: 'animal handling', 'sleight of hand').
  // stat.ts:162: `stat === \`skill.${def.ref}\`` — plain string equality, spaces must be preserved.
  const set = new Set<string>();
  for (const c of input.classes ?? []) {
    for (const s of c.skillChoices ?? []) {
      set.add(s.toLowerCase());
    }
  }
  for (const s of input.backgroundSkills ?? []) {
    set.add(s.toLowerCase());
  }
  for (const s of input.raceSkillChoices ?? []) {
    set.add(s.toLowerCase());
  }

  // Emit ONE ProficiencyMod per unique skill ref.
  return Array.from(set).map((ref) => ({
    id: `skill-prof-${ref}` as ModifierInstanceId,
    def: {
      kind: 'proficiency' as const,
      domain: 'skill' as const,
      ref,
      // level omitted → defaults to 'proficient' (stat.ts:176). No expertise (REQ-DSP-03).
    },
    scope: {
      owner: charId,
      target: { axis: 'self' as const },
      trigger: 'always' as const,
    },
    // ADR-4: source-agnostic slug label — Set-merge loses provenance.
    // §4b guardrail: no hardcoded human class/race/background display name.
    label: `Skill proficiency (${ref})`,
  }));
}
