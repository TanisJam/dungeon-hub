import type { CharacterFeatContext, AppliedFeat } from '@dungeon-hub/domain/character/feat';
import { classGrantsSpellcasting } from '@dungeon-hub/domain/character/feat';
import { computeEffectiveScores } from '@dungeon-hub/domain/character/multiclass';
import type { AppliedAsi } from '@dungeon-hub/domain/character/race';
import type { AbilityScores } from '@dungeon-hub/domain/character/stats';
import type { AppliedClass } from '@dungeon-hub/domain/character/class';

export interface BuildFeatContextInput {
  baseStats: AbilityScores;
  /**
   * Race ASIs to include in effective scores.
   * At race step these come from the SAME validateRaceSelection call.
   * At level-up step these come from character.data.asisApplied.
   */
  racialAsis: AppliedAsi[];
  /** Existing feats taken at level-up — their ASIs flow into effectiveScores too. */
  existingFeats: AppliedFeat[];
  /** Picked classes. Empty array at race step (no class picked yet). */
  classes: AppliedClass[];
  /** Current race for race-prereq feats. Null when race hasn't been saved yet. */
  race: { slug: string; source?: string } | null;
}

/**
 * Builds a CharacterFeatContext for validateFeatSelection.
 *
 * Used by:
 *   - PUT /characters/:id/race (race-step feat grant — race context, no class yet)
 *   - POST /characters/:id/feats (level-up feat — full class context)
 *
 * Note: per decision #547, the bypass of variantRules.feats=false for race-step
 * grants is handled by the caller (validateRaceSelection / finishWithSkillsAndFeats),
 * NOT here. This function is context-neutral.
 */
export function buildFeatContext(input: BuildFeatContextInput): CharacterFeatContext {
  // Feat ASIs contribute to effective scores for prereq evaluation.
  const featAsis: AppliedAsi[] = input.existingFeats.flatMap((f) =>
    f.asisApplied.map((a) => ({ ability: a.ability, bonus: a.bonus, source: 'feat' as const })),
  );
  const effectiveScores = computeEffectiveScores(input.baseStats, [
    ...input.racialAsis,
    ...featAsis,
  ]);

  return {
    effectiveScores,
    race: input.race ? { slug: input.race.slug } : null,
    armorProficiencies: input.classes.flatMap((c) => c.armorProficiencies),
    weaponProficiencies: input.classes.flatMap((c) => c.weaponProficiencies),
    hasSpellcasting: input.classes.some((c) => classGrantsSpellcasting(c.slug)),
    existingFeats: input.existingFeats.map((f) => ({ slug: f.slug, source: f.source })),
  };
}
