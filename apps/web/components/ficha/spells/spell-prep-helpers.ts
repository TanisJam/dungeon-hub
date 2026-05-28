/**
 * spell-prep-helpers — pure utilities for the spell preparation editor.
 * Design: sdd/ficha-section-editors — SPELL-PREP-02, SPELL-PREP-05.
 */

interface SpellWithLevel {
  slug: string;
  source: string;
  level: number;
}

/**
 * filterPrepUniverse — derives the set of spells visible in the prep editor.
 *
 * Rules:
 *   1. Cantrips (level === 0) are ALWAYS excluded (SPELL-PREP-05).
 *   2. If `knownUniverseSlugs` is provided (Wizard/EK/AT), only include spells
 *      whose slug is in that set (SPELL-PREP-02 — spellbook subset).
 *   3. If `knownUniverseSlugs` is undefined (Cleric/Druid/Paladin/Artificer),
 *      return all leveled spells (SPELL-PREP-02 — full class list).
 */
export function filterPrepUniverse<T extends SpellWithLevel>(
  availableSpells: T[],
  knownUniverseSlugs: ReadonlySet<string> | undefined,
): T[] {
  // Step 1: exclude cantrips
  const leveled = availableSpells.filter((s) => s.level > 0);

  // Step 2: optionally intersect with spellbook
  if (knownUniverseSlugs === undefined) {
    return leveled;
  }

  return leveled.filter((s) => knownUniverseSlugs.has(s.slug));
}
