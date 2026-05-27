/**
 * Registry of class-resource definitions.
 *
 * Each entry encodes a PHB-RAW rule (max-uses formula + recovery trigger) for
 * one limited-use class feature. Mirrors the registry-not-compendium pattern
 * established in `domain-reference-data-runtime-source` (#810): max-uses is
 * a rule interpretation, not data — promote to compendium per-row flags only
 * when a real homebrew use-case surfaces.
 *
 * Initial entries (SDD #815): Second Wind + Ki Points. The remaining
 * 7 R-07 features (Sorcery Points, Channel Divinity, Bardic Inspiration,
 * Lay on Hands, Arcane Recovery, Indomitable, Natural Recovery) ship in
 * per-feature follow-up SDDs that extend this array.
 *
 * Origin: SDD `rules-audit-class-features` (engram #815).
 */
import type { ClassResourceDef } from './types.js';

/** Fighter — Second Wind (PHB p.72). 1 use, regained on a short or long rest. */
const FIGHTER_SECOND_WIND: ClassResourceDef = {
  slug: 'fighter:second-wind',
  classSlug: 'fighter',
  maxFor: ({ classLevel }) => (classLevel >= 1 ? 1 : null),
  recoveryTriggerFor: () => 'short',
};

/** Monk — Ki Points (PHB p.78). Equal to monk level, regained on a short or long rest, unlocks at L2. */
const MONK_KI_POINTS: ClassResourceDef = {
  slug: 'monk:ki-points',
  classSlug: 'monk',
  maxFor: ({ classLevel }) => (classLevel >= 2 ? classLevel : null),
  recoveryTriggerFor: () => 'short',
};

export const CLASS_RESOURCES: readonly ClassResourceDef[] = [
  FIGHTER_SECOND_WIND,
  MONK_KI_POINTS,
];

/**
 * Looks up a `ClassResourceDef` by its class-prefixed slug.
 * Returns `undefined` when no entry matches.
 */
export function classResourceBySlug(slug: string): ClassResourceDef | undefined {
  return CLASS_RESOURCES.find((d) => d.slug === slug);
}
