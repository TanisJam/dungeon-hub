/**
 * Class feature collection for level-up mutations.
 *
 * REQ-CLU-FTR-PARSE-FEATURE-REFS: collects features at a specific class level.
 * REQ-CLU-FTR-POPULATE-MUTATIONS: output shape matches LevelUpMutations.featuresUnlocked.
 * Per CLAUDE.md §10: 5etools data has bugs — skip silently (no throw, no 5xx).
 */

import type { ClassCompendiumData } from './types.js';
import { parseFeatureRef } from '../../compendium/parse-feature-ref.js';

export interface ClassFeatureEntry {
  classSlug: string;
  level: number;
  featureSlug: string;
  featureName: string;
}

/**
 * Converts a feature name to a URL-safe kebab-case slug.
 * e.g. "Action Surge" → "action-surge"
 */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Collects all class features granted at the given level from classData.
 *
 * - Handles both string entries ("Action Surge|Fighter|PHB|2") and
 *   object entries ({ classFeature: "Action Surge|Fighter|PHB|2" }).
 * - Skips malformed entries silently (5etools data may have bugs).
 * - Returns empty array when no features exist at the given level.
 *
 * DOES NOT throw. DOES NOT log (domain has no IO — see design §"Logging on skip").
 */
export function collectClassFeaturesAtLevel(
  classData: ClassCompendiumData,
  level: number,
): ClassFeatureEntry[] {
  const out: ClassFeatureEntry[] = [];

  for (const entry of classData.classFeatures ?? []) {
    const raw = typeof entry === 'string' ? entry : entry.classFeature;
    if (!raw) continue;

    const parsed = parseFeatureRef(raw);
    if (parsed === null) continue;         // malformed — silent skip per CLAUDE.md §10
    if (parsed.level !== level) continue;

    out.push({
      classSlug: parsed.classSlug.toLowerCase(),
      level: parsed.level,
      featureSlug: slugify(parsed.name),
      featureName: parsed.name,
    });
  }

  return out;
}
