'use server';

// Codex-scoped Server Actions for the character knowledge browser.
//
// These actions are SEPARATE from the global compendium actions
// (/app/compendium/[category]/actions.ts). The global actions use ?campaign=;
// these use the character's worldId via ?world= (ADR-2, CCB design).
//
// Do NOT import or modify the global compendium actions — Approach A isolation
// guarantees zero regression risk on /compendium. (ADR-4, CCB design)
//
// REQ-CCB-WEB-02 (spec character-codex-browser)

import { createClient } from '@/lib/supabase/server';
import { api } from '@/lib/api';
import { CODEX_CATEGORY_CONFIG, type CodexKind } from './_config/registry';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface CodexSearchResult<T = unknown> {
  rows: T[];
  total: number;
  knownCount: number;
  effectiveView: 'dm' | 'player';
}

/**
 * searchCodexCategory — search the character's knowledge list for a given kind.
 * Calls GET /characters/:id/knowledge/:kind?q=&limit=50&offset=.
 *
 * REQ-CCB-WEB-02: list page Server Action for debounced name search.
 */
export async function searchCodexCategory(
  charId: string,
  kind: CodexKind,
  q: string,
  offset = 0,
): Promise<CodexSearchResult> {
  if (!UUID_RE.test(charId)) return { rows: [], total: 0, knownCount: 0, effectiveView: 'player' };
  if (!(kind in CODEX_CATEGORY_CONFIG)) return { rows: [], total: 0, knownCount: 0, effectiveView: 'player' };

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { rows: [], total: 0, knownCount: 0, effectiveView: 'player' };

  const trimmed = q.trim();

  type Envelope = { rows: unknown[]; total: number; knownCount: number; effectiveView: 'dm' | 'player' };
  try {
    const params = new URLSearchParams({
      limit: '50',
      offset: String(offset),
    });
    if (trimmed.length > 0) params.set('q', trimmed);

    const res = await api.get<Envelope>(
      `/characters/${charId}/knowledge/${kind}?${params.toString()}`,
      session.access_token,
    );
    return { rows: res.rows, total: res.total, knownCount: res.knownCount, effectiveView: res.effectiveView };
  } catch {
    return { rows: [], total: 0, knownCount: 0, effectiveView: 'player' };
  }
}

/**
 * getCodexDetail — fetch a full compendium entry scoped to the character's world.
 * Calls GET /compendium/:category/:slug?world=<worldId>&source=<source>.
 *
 * ADR-2 (CCB design): uses ?world= instead of ?campaign=. Character has worldId
 * directly; no extra campaign lookup needed on the SSR path.
 *
 * REQ-CCB-WEB-02: detail sheet Server Action (row tap → DetailSheet).
 */
export async function getCodexDetail(
  category: string,
  worldId: string,
  slug: string,
  source: string,
): Promise<unknown | null> {
  if (!UUID_RE.test(worldId)) return null;
  if (!slug || !source) return null;

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;

  try {
    const params = new URLSearchParams({ world: worldId, source });
    const row = await api.get<unknown>(
      `/compendium/${encodeURIComponent(category)}/${encodeURIComponent(slug)}?${params.toString()}`,
      session.access_token,
    );
    return row;
  } catch {
    return null;
  }
}
