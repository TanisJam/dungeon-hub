/**
 * parseRule — validate unknown YAML input against RuleDocSchema.
 *
 * Design ref: sdd/authoring-dsl/design — Decision 1 (YAML→typed mapping),
 *   Decision 5 (pure boundary), Decision 6 (validation gates + issue codes).
 *
 * PURE FUNCTION: accepts an unknown value (the result of yaml.parse at the
 * use-case/IO layer), returns either { ok: true, rule } or { ok: false, issues }.
 * No IO, no filesystem access — the YAML file is read at the use-case/CLI layer.
 *
 * Issue codes (spec §6 naming convention — single-value mismatches use expected/got;
 * count mismatches use expectedCount/gotCount):
 *   MISSING_PHB_SOURCE    — source field absent or empty
 *   UNKNOWN_PRIMITIVE_KIND — kind not in the 10-kind union
 *   INVALID_STAT_KEY      — stat value not a valid StatKey
 *   INVALID_PREDICATE_AST — malformed predicate node
 */
import { RuleDocSchema } from './schema.js';
import type { RuleDocSchemaOutput } from './schema.js';

// ── Issue types ───────────────────────────────────────────────────────────────

export type ParseIssue =
  | { code: 'MISSING_PHB_SOURCE'; expected: 'source' }
  | { code: 'UNKNOWN_PRIMITIVE_KIND'; expected: string[]; got: string }
  | { code: 'INVALID_STAT_KEY'; expected: 'StatKey'; got: string }
  | { code: 'INVALID_PREDICATE_AST'; expected: string; got: unknown }
  | { code: 'VALIDATION_FAILED'; path: (string | number)[]; message: string };

export type ParseOk = { ok: true; rule: RuleDocSchemaOutput };
export type ParseFail = { ok: false; issues: ParseIssue[] };
export type ParseResult = ParseOk | ParseFail;

// ── Valid primitive kinds (for UNKNOWN_PRIMITIVE_KIND issue) ─────────────────

const VALID_KINDS = [
  'num',
  'advantage',
  'choice',
  'concentration',
  'reaction',
  'usage',
  'replace',
  'gmRuling',
  'noop',
  'proficiency',
] as const;

// ── Helper: detect specific issue categories from Zod errors ─────────────────

function classifyZodErrors(
  error: import('zod').ZodError,
  input: unknown,
): ParseIssue[] {
  const issues: ParseIssue[] = [];
  const seenCodes = new Set<string>();

  for (const zodIssue of error.issues) {
    const pathStr = zodIssue.path.join('.');

    // MISSING_PHB_SOURCE: source field absent or empty
    if (
      pathStr === 'source' &&
      !seenCodes.has('MISSING_PHB_SOURCE')
    ) {
      seenCodes.add('MISSING_PHB_SOURCE');
      issues.push({ code: 'MISSING_PHB_SOURCE', expected: 'source' });
      continue;
    }

    // UNKNOWN_PRIMITIVE_KIND: kind field inside an emit's def is not in the union
    if (
      pathStr.includes('emits') &&
      (pathStr.endsWith('def.kind') || pathStr.endsWith('def') || zodIssue.code === 'invalid_union_discriminator' || zodIssue.code === 'invalid_literal') &&
      !seenCodes.has('UNKNOWN_PRIMITIVE_KIND')
    ) {
      // Try to extract the actual kind value from the input
      let gotKind: unknown = undefined;
      try {
        // Navigate to the emit's def.kind via path
        const pathParts = zodIssue.path;
        let cursor: unknown = input;
        for (const part of pathParts) {
          if (cursor !== null && typeof cursor === 'object') {
            cursor = (cursor as Record<string, unknown>)[String(part)];
          }
        }
        gotKind = cursor;
      } catch {
        // ignore
      }

      // Only flag as UNKNOWN_PRIMITIVE_KIND if we can identify the discriminant issue
      if (typeof gotKind === 'string' && !VALID_KINDS.includes(gotKind as typeof VALID_KINDS[number])) {
        seenCodes.add('UNKNOWN_PRIMITIVE_KIND');
        issues.push({
          code: 'UNKNOWN_PRIMITIVE_KIND',
          expected: [...VALID_KINDS],
          got: gotKind,
        });
        continue;
      }
    }

    // INVALID_STAT_KEY: stat field is not a valid StatKey
    if (
      pathStr.includes('stat') &&
      zodIssue.code !== 'unrecognized_keys' &&
      !seenCodes.has('INVALID_STAT_KEY')
    ) {
      // Verify it's actually a stat field that failed (not some other field named 'stat')
      let gotStat: unknown = undefined;
      try {
        const pathParts = zodIssue.path;
        let cursor: unknown = input;
        for (const part of pathParts) {
          if (cursor !== null && typeof cursor === 'object') {
            cursor = (cursor as Record<string, unknown>)[String(part)];
          }
        }
        gotStat = cursor;
      } catch {
        // ignore
      }

      if (typeof gotStat === 'string') {
        seenCodes.add('INVALID_STAT_KEY');
        issues.push({ code: 'INVALID_STAT_KEY', expected: 'StatKey', got: gotStat });
        continue;
      }
    }

    // INVALID_PREDICATE_AST: predicate field contains an invalid node
    if (
      pathStr.includes('predicate') &&
      !seenCodes.has('INVALID_PREDICATE_AST')
    ) {
      let gotPredicate: unknown = undefined;
      try {
        const pathParts = zodIssue.path.slice(0, -1); // go up to parent
        let cursor: unknown = input;
        for (const part of pathParts) {
          if (cursor !== null && typeof cursor === 'object') {
            cursor = (cursor as Record<string, unknown>)[String(part)];
          }
        }
        gotPredicate = cursor;
      } catch {
        // ignore
      }
      seenCodes.add('INVALID_PREDICATE_AST');
      issues.push({
        code: 'INVALID_PREDICATE_AST',
        expected: 'op ∈ and | or | not | query',
        got: gotPredicate,
      });
      continue;
    }

    // Generic fallback
    issues.push({
      code: 'VALIDATION_FAILED',
      path: zodIssue.path,
      message: zodIssue.message,
    });
  }

  // If we found no source field in the input object at all, add MISSING_PHB_SOURCE
  if (
    !seenCodes.has('MISSING_PHB_SOURCE') &&
    typeof input === 'object' &&
    input !== null &&
    !('source' in input)
  ) {
    issues.push({ code: 'MISSING_PHB_SOURCE', expected: 'source' });
  }

  return issues;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Parse and validate an unknown value as a RuleDoc.
 *
 * PURE: no IO. Call this after yaml.parse at the use-case/CLI layer.
 *
 * @param input — the raw value (typically the result of yaml.parse)
 * @returns ParseResult — ok:true with typed RuleDoc, or ok:false with issue list
 */
export function parseRule(input: unknown): ParseResult {
  const result = RuleDocSchema.safeParse(input);

  if (result.success) {
    return { ok: true, rule: result.data };
  }

  const issues = classifyZodErrors(result.error, input);

  // If no classified issues found (edge case), fall back to generic
  if (issues.length === 0) {
    return {
      ok: false,
      issues: result.error.issues.map((zi) => ({
        code: 'VALIDATION_FAILED' as const,
        path: zi.path,
        message: zi.message,
      })),
    };
  }

  return { ok: false, issues };
}
