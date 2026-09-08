'use server';

// Cross-category search for the Biblioteca landing (docs/ROADMAP.md §1 item 4).
//
// There is no aggregate search endpoint on the API, and this change must not add one
// (the deployed API is manually rolled out and currently months behind `main` — anything
// built here has to work against endpoints that are already live). Instead this fans out
// one GET /compendium/{category}?q= request per category, in parallel, and folds the
// per-category outcome (including failures) into one typed envelope the client can render
// without ever discarding a category's failure silently.
//
// Clones the auth/session pattern from `./[category]/actions.ts:searchCompendium`, but that
// action swallows every failure into an empty `{ rows: [], total: 0 }` — fine for a single
// category (the caller already knows nothing happened), wrong here where the caller needs to
// tell "no matches" apart from "couldn't reach this category" across 8 independent calls.

import { createClient } from '@/lib/supabase/server';
import { api } from '@/lib/api';
import { getErrorMessage } from '@/lib/error-message';
import { CATEGORY_CONFIG } from './[category]/_config/registry';
import type { CompendiumCategory } from './_components/types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Result cap per category: the Biblioteca search sheet only ever shows a preview per
// category (with a "ver todos" link into the full category browse for the rest), so
// there is no reason to pull more than a handful of rows per category per keystroke —
// especially fanned out ×8 over a home-lab tunnel. A single broad query (e.g. "a")
// would otherwise pull hundreds of rows per category for nothing.
const CATEGORY_RESULT_LIMIT = 5;

export interface CategorySearchResult {
  category: CompendiumCategory;
  /** Raw list-hit rows — same shape CompendiumList renders via config.RowView. */
  rows: unknown[];
  /** Total matches in this category (may exceed rows.length — see CATEGORY_RESULT_LIMIT). */
  total: number;
  /** false when this category's request failed — rows/total are then always empty/0. */
  ok: boolean;
  /** Spanish, user-facing failure reason. Only set when ok is false. */
  errorMessage?: string;
}

/**
 * searchAllCategories — fans out one name search per compendium category (REQ-BIB-SEARCH-01).
 * Scope is always {campaign} here — the Biblioteca landing never has a {world} scope
 * (that XOR only applies to the /codex player view — see ./[category]/actions.ts).
 *
 * Partial failure is the expected case, not an edge case: the API runs behind a home-lab
 * tunnel, so some categories can fail while others succeed. Every category always gets an
 * entry in the returned array — ok:false entries carry a Spanish error message instead of
 * being dropped, so the caller can render "got X, couldn't reach Y" rather than a blank list.
 */
export async function searchAllCategories(
  campaignId: string,
  q: string,
): Promise<CategorySearchResult[]> {
  const trimmed = q.trim();
  if (!UUID_RE.test(campaignId) || trimmed.length === 0) return [];

  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return [];
  const token = session.access_token;

  const categories = Object.keys(CATEGORY_CONFIG) as CompendiumCategory[];

  // Promise.all is safe here (not allSettled): each mapped promise already catches its
  // own failure below and resolves to an ok:false entry, so none of them ever reject.
  return Promise.all(
    categories.map(async (category): Promise<CategorySearchResult> => {
      const config = CATEGORY_CONFIG[category];
      const params = new URLSearchParams({
        campaign: campaignId,
        q: trimmed,
        limit: String(CATEGORY_RESULT_LIMIT),
        offset: '0',
      });

      try {
        const res = await api.get<{ data: unknown[]; total: number }>(
          `/compendium/${config.endpoint}?${params.toString()}`,
          token,
        );
        return { category, rows: res.data, total: res.total, ok: true };
      } catch (err) {
        return {
          category,
          rows: [],
          total: 0,
          ok: false,
          errorMessage: getErrorMessage(err, `No se pudo buscar en ${config.label.toLowerCase()}`),
        };
      }
    }),
  );
}
