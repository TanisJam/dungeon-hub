'use server';

import { createClient } from '@/lib/supabase/server';
import { api } from '@/lib/api';
import { CATEGORY_CONFIG } from './_config/registry';
import type { CompendiumCategory } from '@/app/compendium/_components/types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// searchCompendium — generic list search, scoped to campaign. ADR-3.
// Clones searchCompendiumItems pattern (apps/web/app/characters/[id]/actions.ts:191).
// ---------------------------------------------------------------------------

export interface SearchResult<T = unknown> {
  rows: T[];
  total: number;
}

/**
 * searchCompendium — search any compendium category by name.
 * Calls GET /compendium/{endpoint}?campaign={id}&q={q}&limit=50&offset={offset}.
 * REQ-CBROWSE-04: debounced name search, server action.
 * REQ-CBROWSE-05: always passes ?campaign= so API enforces rulesProfile.sources filtering.
 */
export async function searchCompendium(
  category: CompendiumCategory,
  campaignId: string,
  q: string,
  offset = 0,
): Promise<SearchResult> {
  if (!(category in CATEGORY_CONFIG)) return { rows: [], total: 0 };
  if (!UUID_RE.test(campaignId)) return { rows: [], total: 0 };

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { rows: [], total: 0 };

  const config = CATEGORY_CONFIG[category];
  const trimmed = q.trim();

  type Envelope = { data: unknown[]; total: number };
  try {
    const params = new URLSearchParams({
      campaign: campaignId,
      limit: '50',
      offset: String(offset),
    });
    if (trimmed.length > 0) params.set('q', trimmed);

    const res = await api.get<Envelope>(
      `/compendium/${config.endpoint}?${params.toString()}`,
      session.access_token,
    );
    return { rows: res.data, total: res.total };
  } catch {
    return { rows: [], total: 0 };
  }
}

// ---------------------------------------------------------------------------
// getCompendiumDetail — fetch a single entry by slug. ADR-4.
// CRITICAL: passes BOTH ?campaign= (scope, required by resolveProfile) AND ?source=
// (disambiguates same-slug rows across sources).
// ---------------------------------------------------------------------------

/**
 * getCompendiumDetail — fetch full compendium row (extracted cols + data JSONB).
 * REQ-CBROWSE-06: detail fetch on row tap.
 * ADR-4: MUST pass both ?campaign= and ?source= — detail endpoints require scope
 * and source disambiguates same-slug rows from different manuals.
 */
export async function getCompendiumDetail(
  category: CompendiumCategory,
  campaignId: string,
  slug: string,
  source: string,
): Promise<unknown | null> {
  if (!(category in CATEGORY_CONFIG)) return null;
  if (!UUID_RE.test(campaignId)) return null;

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;

  const config = CATEGORY_CONFIG[category];
  try {
    const params = new URLSearchParams({
      campaign: campaignId,
      source,
    });
    const row = await api.get<unknown>(
      `/compendium/${config.endpoint}/${encodeURIComponent(slug)}?${params.toString()}`,
      session.access_token,
    );
    return row;
  } catch {
    return null;
  }
}
