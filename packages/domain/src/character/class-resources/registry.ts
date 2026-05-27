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

/**
 * Bard — Bardic Inspiration (PHB p.53-54).
 *
 * - Unlocks at Bard L1.
 * - Max uses = max(1, CHA modifier) per PHB p.53 ("a number of times equal to
 *   your Charisma modifier (a minimum of once)").
 * - Recovery: long rest at L1-4; short or long rest at L5+ per PHB p.54 Font
 *   of Inspiration.
 * - Die size escalates per Bard table (PHB p.54): d6 L1-4, d8 L5-9, d10 L10-14,
 *   d12 L15-20. Surfaced via `extra: { dieSize }` for UI consumption.
 */
const BARD_BARDIC_INSPIRATION: ClassResourceDef = {
  slug: 'bard:bardic-inspiration',
  classSlug: 'bard',
  maxFor: ({ classLevel, abilityMods }) =>
    classLevel >= 1 ? Math.max(1, abilityMods.cha) : null,
  recoveryTriggerFor: ({ classLevel }) => (classLevel >= 5 ? 'short' : 'long'),
  extraFor: ({ classLevel }) => {
    if (classLevel < 1) return undefined;
    const dieSize =
      classLevel >= 15 ? 'd12' :
      classLevel >= 10 ? 'd10' :
      classLevel >= 5 ? 'd8' :
      'd6';
    return { dieSize };
  },
};

/**
 * Paladin — Lay on Hands (PHB p.84).
 *
 * - Unlocks at Paladin L1.
 * - Pool of HP = paladin level × 5.
 * - Recovery: long rest only.
 * - Pool-shaped: `extra: { shape: 'pool' }` instructs the UI to render an
 *   amount selector (vs. counter-shaped +1/-1 buttons). The API's
 *   `/resources/use` endpoint already accepts an `amount` parameter — only
 *   the Recursos tab UX changes per shape.
 */
const PALADIN_LAY_ON_HANDS: ClassResourceDef = {
  slug: 'paladin:lay-on-hands',
  classSlug: 'paladin',
  maxFor: ({ classLevel }) => (classLevel >= 1 ? classLevel * 5 : null),
  recoveryTriggerFor: () => 'long',
  extraFor: ({ classLevel }) =>
    classLevel >= 1 ? ({ shape: 'pool' } as const) : undefined,
};

/** Fighter — Indomitable (PHB p.72). 1 use L9, 2 L13, 3 L17; long rest only. */
const FIGHTER_INDOMITABLE: ClassResourceDef = {
  slug: 'fighter:indomitable',
  classSlug: 'fighter',
  maxFor: ({ classLevel }) =>
    classLevel >= 17 ? 3 : classLevel >= 13 ? 2 : classLevel >= 9 ? 1 : null,
  recoveryTriggerFor: () => 'long',
};

/** Cleric — Channel Divinity (PHB p.59). 1 L2, 2 L6, 3 L18; short or long rest. */
const CLERIC_CHANNEL_DIVINITY: ClassResourceDef = {
  slug: 'cleric:channel-divinity',
  classSlug: 'cleric',
  maxFor: ({ classLevel }) =>
    classLevel >= 18 ? 3 : classLevel >= 6 ? 2 : classLevel >= 2 ? 1 : null,
  recoveryTriggerFor: () => 'short',
};

/** Paladin — Channel Divinity (PHB p.85). 1 L3, 2 L11; short or long rest. */
const PALADIN_CHANNEL_DIVINITY: ClassResourceDef = {
  slug: 'paladin:channel-divinity',
  classSlug: 'paladin',
  maxFor: ({ classLevel }) =>
    classLevel >= 11 ? 2 : classLevel >= 3 ? 1 : null,
  recoveryTriggerFor: () => 'short',
};

/** Wizard — Arcane Recovery (PHB p.115). 1 use, recovers on long rest. */
const WIZARD_ARCANE_RECOVERY: ClassResourceDef = {
  slug: 'wizard:arcane-recovery',
  classSlug: 'wizard',
  maxFor: ({ classLevel }) => (classLevel >= 1 ? 1 : null),
  recoveryTriggerFor: () => 'long',
};

/** Sorcerer — Sorcery Points (PHB p.101). Max = sorcerer level; long rest; unlocks at L2. */
const SORCERER_SORCERY_POINTS: ClassResourceDef = {
  slug: 'sorcerer:sorcery-points',
  classSlug: 'sorcerer',
  maxFor: ({ classLevel }) => (classLevel >= 2 ? classLevel : null),
  recoveryTriggerFor: () => 'long',
};

/**
 * Druid — Natural Recovery (PHB p.68). Subclass-gated: Circle of the Land only.
 * 1 use, recovers on long rest; the slot-recovery action itself is out of
 * scope for this SDD and will roll into a future polish SDD.
 */
const DRUID_NATURAL_RECOVERY: ClassResourceDef = {
  slug: 'druid:natural-recovery',
  classSlug: 'druid',
  subclassSlug: 'druid--circle-of-the-land',
  maxFor: ({ classLevel }) => (classLevel >= 2 ? 1 : null),
  recoveryTriggerFor: () => 'long',
};

export const CLASS_RESOURCES: readonly ClassResourceDef[] = [
  FIGHTER_SECOND_WIND,
  MONK_KI_POINTS,
  BARD_BARDIC_INSPIRATION,
  PALADIN_LAY_ON_HANDS,
  FIGHTER_INDOMITABLE,
  CLERIC_CHANNEL_DIVINITY,
  PALADIN_CHANNEL_DIVINITY,
  WIZARD_ARCANE_RECOVERY,
  SORCERER_SORCERY_POINTS,
  DRUID_NATURAL_RECOVERY,
];

/**
 * Looks up a `ClassResourceDef` by its class-prefixed slug.
 * Returns `undefined` when no entry matches.
 */
export function classResourceBySlug(slug: string): ClassResourceDef | undefined {
  return CLASS_RESOURCES.find((d) => d.slug === slug);
}
