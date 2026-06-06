'use server';

import { createClient } from '@/lib/supabase/server';
import { api } from '@/lib/api';
import { CATEGORY_CONFIG } from './_config/registry';
import type { CompendiumCategory } from '@/app/compendium/_components/types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// CompendiumScope — XOR discriminator (codex-rehome ADR-2).
// Exactly one key must be set: either {campaign} for the /compendium browser
// (campaign-scoped) or {world} for the /codex player view (world-scoped).
// The API endpoint already accepts exactly one of ?campaign= or ?world= (XOR).
// ---------------------------------------------------------------------------

export type CompendiumScope =
  | { campaign: string }
  | { world: string };

/**
 * buildScopeParam — validates and builds the scope URLSearchParams entry.
 * Returns null when neither (or both) keys are present.
 */
function buildScopeParam(scope: CompendiumScope): { key: 'campaign' | 'world'; value: string } | null {
  const hasCampaign = 'campaign' in scope && typeof scope.campaign === 'string';
  const hasWorld    = 'world'    in scope && typeof scope.world    === 'string';

  if (hasCampaign && !hasWorld) {
    const id = (scope as { campaign: string }).campaign;
    if (!UUID_RE.test(id)) return null;
    return { key: 'campaign', value: id };
  }
  if (hasWorld && !hasCampaign) {
    const id = (scope as { world: string }).world;
    if (!UUID_RE.test(id)) return null;
    return { key: 'world', value: id };
  }
  // Both or neither — reject
  return null;
}

// ---------------------------------------------------------------------------
// searchCompendium — generic list search, scoped by campaign OR world. ADR-2.
// Clones searchCompendiumItems pattern (apps/web/app/characters/[id]/actions.ts:191).
// ---------------------------------------------------------------------------

export interface SearchResult<T = unknown> {
  rows: T[];
  total: number;
}

/**
 * searchCompendium — search any compendium category by name.
 * Calls GET /compendium/{endpoint}?{campaign|world}={id}&q={q}&limit=50&offset={offset}.
 * REQ-CBROWSE-04: debounced name search, server action.
 * REQ-CBROWSE-05: always passes exactly one scope param so API enforces rulesProfile.
 * codex-rehome ADR-2: scope:{campaign} → /compendium browser; scope:{world} → /codex player.
 */
export async function searchCompendium(
  category: CompendiumCategory,
  scope: CompendiumScope,
  q: string,
  offset = 0,
  filters: Record<string, string> = {},
): Promise<SearchResult> {
  if (!(category in CATEGORY_CONFIG)) return { rows: [], total: 0 };

  const scopeEntry = buildScopeParam(scope);
  if (!scopeEntry) return { rows: [], total: 0 };

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { rows: [], total: 0 };

  const config = CATEGORY_CONFIG[category];
  const trimmed = q.trim();

  type Envelope = { data: unknown[]; total: number };
  try {
    const params = new URLSearchParams({
      [scopeEntry.key]: scopeEntry.value,
      limit: '50',
      offset: String(offset),
    });
    if (trimmed.length > 0) params.set('q', trimmed);
    // Extra per-category filters (e.g. items ?type=). Skip empty values.
    for (const [key, value] of Object.entries(filters)) {
      if (value) params.set(key, value);
    }

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
// CRITICAL: passes BOTH ?{campaign|world}= (scope, required by resolveProfile)
// AND ?source= (disambiguates same-slug rows across sources).
// ---------------------------------------------------------------------------

/**
 * getCompendiumDetail — fetch full compendium row (extracted cols + data JSONB).
 * REQ-CBROWSE-06: detail fetch on row tap.
 * ADR-4: MUST pass both scope param (?campaign= or ?world=) and ?source=.
 * codex-rehome ADR-2: scope:{world} used by /codex/[kind] player detail path.
 */
export async function getCompendiumDetail(
  category: CompendiumCategory,
  scope: CompendiumScope,
  slug: string,
  source: string,
): Promise<unknown | null> {
  if (!(category in CATEGORY_CONFIG)) return null;

  const scopeEntry = buildScopeParam(scope);
  if (!scopeEntry) return null;

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;

  const config = CATEGORY_CONFIG[category];
  try {
    const params = new URLSearchParams({
      [scopeEntry.key]: scopeEntry.value,
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
