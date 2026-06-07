/**
 * Bitácora page domain validation.
 *
 * Pure function — no IO, no DB, no fetch.
 * REQ-BP-DOM-01 (spec #1974), ADR-2 (design #1975).
 *
 * Design intent (no PHB rule): anti-metagaming personal journal.
 * Players record lived knowledge. This wave: monster refs only.
 * npc/faction/location refs deferred to UUID bridge #1946.
 *
 * bitacora-personal SDD spec #1974, design #1975.
 */

import { z } from 'zod';
import { isKnowledgeTag } from '../../world/codex/tags.js';

// ---------------------------------------------------------------------------
// Issue codes
// ---------------------------------------------------------------------------

export type BitacoraPageIssueCode =
  | 'BITACORA_PAGE_BODY_REQUIRED'
  | 'BITACORA_PAGE_TAG_INVALID'
  | 'BITACORA_PAGE_TAG_DUPLICATE'
  | 'BITACORA_PAGE_TAG_COUNT_EXCEEDED'
  | 'BITACORA_PAGE_REF_KIND_UNSUPPORTED'
  | 'BITACORA_PAGE_REF_COUNT_EXCEEDED';

export interface BitacoraPageIssue {
  code: BitacoraPageIssueCode;
  message: string;
  path?: string;
}

// ---------------------------------------------------------------------------
// Input type
// ---------------------------------------------------------------------------

export interface BitacoraPageRef {
  kind: string;
  refKey: string;
  refSource: string;
}

export interface BitacoraPageInput {
  title?: string | null | undefined;
  body: string;
  tags: string[];
  refs?: BitacoraPageRef[] | undefined;
}

// ---------------------------------------------------------------------------
// Validation result
// ---------------------------------------------------------------------------

export type BitacoraPageResult =
  | { ok: true }
  | { ok: false; issues: BitacoraPageIssue[] };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum number of tags per page. Design default (design #1975 §ADR-2). */
const MAX_TAGS = 8;

/** Maximum number of refs per page. Design default (design #1975 §ADR-2). */
const MAX_REFS = 10;

/** Maximum title length in characters. Design default (design #1975 §ADR-2). */
const MAX_TITLE = 120;

/** Maximum body length in characters. Design default (design #1975 §ADR-2). */
const MAX_BODY = 10_000;

/**
 * Supported ref kinds for bitácora pages.
 * Wave 1: monster (compendium slug+source pair).
 * Wave 5a (uuid-bridge-npc): npc (UUID refKey, refSource='world').
 * Wave 5b (uuid-bridge-factions-pois): faction + location (UUID refKey, refSource='world').
 * lore remains unsupported until a lore-entity SDD lands.
 */
const SUPPORTED_REF_KINDS = ['monster', 'npc', 'faction', 'location'] as const;

// ---------------------------------------------------------------------------
// Zod schema (structural)
// ---------------------------------------------------------------------------

/** Structural Zod schema — used for input parsing. Domain rules applied in validateBitacoraPage. */
export const BitacoraPageInputSchema = z.object({
  title: z.string().max(MAX_TITLE).optional().nullable(),
  body: z.string().max(MAX_BODY),
  tags: z.array(z.string()).default([]),
  refs: z
    .array(
      z.object({
        kind: z.string(),
        refKey: z.string().min(1),
        refSource: z.string().min(1),
      }),
    )
    .default([]),
});

// ---------------------------------------------------------------------------
// validateBitacoraPage
// ---------------------------------------------------------------------------

/**
 * Validates a bitácora page input.
 *
 * Rules:
 * - body must be non-empty (BITACORA_PAGE_BODY_REQUIRED)
 * - each tag must be a member of KNOWLEDGE_TAGS (BITACORA_PAGE_TAG_INVALID)
 * - tags must be unique (BITACORA_PAGE_TAG_DUPLICATE)
 * - tags count ≤ MAX_TAGS (BITACORA_PAGE_TAG_COUNT_EXCEEDED)
 * - each ref.kind must be 'monster' (BITACORA_PAGE_REF_KIND_UNSUPPORTED)
 * - refs count ≤ MAX_REFS (BITACORA_PAGE_REF_COUNT_EXCEEDED)
 *
 * REQ-BP-DOM-01, ADR-2.
 */
export function validateBitacoraPage(input: BitacoraPageInput): BitacoraPageResult {
  const issues: BitacoraPageIssue[] = [];

  // ── body: required, non-empty ─────────────────────────────────────────────
  if (!input.body || input.body.trim().length === 0) {
    issues.push({
      code: 'BITACORA_PAGE_BODY_REQUIRED',
      message: 'Page body is required and must not be empty.',
      path: 'body',
    });
  }

  // ── tags: vocabulary check + duplicate check + count cap ─────────────────
  const tags = input.tags ?? [];

  if (tags.length > MAX_TAGS) {
    issues.push({
      code: 'BITACORA_PAGE_TAG_COUNT_EXCEEDED',
      message: `A page may have at most ${MAX_TAGS} tags. Got ${tags.length}.`,
      path: 'tags',
    });
  } else {
    // Only check per-tag validity when count is within range
    const seen = new Set<string>();
    for (const tag of tags) {
      if (!isKnowledgeTag(tag)) {
        issues.push({
          code: 'BITACORA_PAGE_TAG_INVALID',
          message: `Tag "${tag}" is not a valid knowledge tag.`,
          path: 'tags',
        });
        // Continue checking remaining tags (collect all errors)
      } else if (seen.has(tag)) {
        issues.push({
          code: 'BITACORA_PAGE_TAG_DUPLICATE',
          message: `Duplicate tag "${tag}".`,
          path: 'tags',
        });
      } else {
        seen.add(tag);
      }
    }
  }

  // ── refs: kind allowlist + count cap ─────────────────────────────────────
  const refs = input.refs ?? [];

  if (refs.length > MAX_REFS) {
    issues.push({
      code: 'BITACORA_PAGE_REF_COUNT_EXCEEDED',
      message: `A page may have at most ${MAX_REFS} refs. Got ${refs.length}.`,
      path: 'refs',
    });
  } else {
    for (const ref of refs) {
      if (!(SUPPORTED_REF_KINDS as readonly string[]).includes(ref.kind)) {
        issues.push({
          code: 'BITACORA_PAGE_REF_KIND_UNSUPPORTED',
          message: `Ref kind "${ref.kind}" is not supported this wave. Only "monster" refs are accepted.`,
          path: 'refs',
        });
      }
    }
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return { ok: true };
}
