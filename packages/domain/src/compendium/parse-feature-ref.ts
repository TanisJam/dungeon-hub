/**
 * 5etools class feature string parser.
 *
 * REQ-CLU-FTR-PARSE-FEATURE-REFS: strict pipe-split, no trim, null on any malformed entry.
 * Per CLAUDE.md §10: treat as upstream input, not as truth. Defensive parse — never throw.
 *
 * 5etools format:
 *   "FeatureName|Class|ClassSource|Level"
 *   "FeatureName|Class|ClassSource|Level|FeatureSource"
 *
 * Some entries are objects: { classFeature: "...", ... } — callers extract the string first.
 */

export interface ParsedFeatureRef {
  /** Raw feature name from the ref, e.g. "Action Surge". */
  name: string;
  /** Class identifier exactly as in the ref, e.g. "Fighter". */
  classSlug: string;
  /** Class source, e.g. "PHB". */
  classSource: string;
  /** Level 1..20. */
  level: number;
  /** Feature source — defaults to classSource when segment 4 is absent. */
  featureSource: string;
}

/**
 * Parse a 5etools class feature ref string.
 *
 * Returns null when:
 * - parts.length < 4
 * - name is empty
 * - classSlug is empty
 * - level is not a finite integer in [1, 20]
 * - any leading/trailing whitespace on any segment (strict — no trim)
 *
 * Callers MUST warn-and-skip on null; do NOT throw.
 */
export function parseFeatureRef(ref: string): ParsedFeatureRef | null {
  if (!ref) return null;

  const parts = ref.split('|');
  if (parts.length < 4) return null;

  const name = parts[0]!;
  const classSlug = parts[1]!;
  const classSource = parts[2]!;
  const levelStr = parts[3]!;
  const featureSource = parts[4] ?? classSource;

  // Strict: name, classSlug, and levelStr must be non-empty.
  // classSource may be empty (5etools quirk: some entries use "Name|Class||Level").
  if (!name || !classSlug || !levelStr) return null;

  // Strict: no leading/trailing whitespace on any segment
  if (
    name !== name.trim() ||
    classSlug !== classSlug.trim() ||
    classSource !== classSource.trim() ||
    levelStr !== levelStr.trim() ||
    featureSource !== featureSource.trim()
  ) {
    return null;
  }

  // Level must be a finite integer in [1, 20]
  const level = Number(levelStr);
  if (!Number.isFinite(level) || !Number.isInteger(level) || level < 1 || level > 20) {
    return null;
  }

  return { name, classSlug, classSource, level, featureSource };
}
