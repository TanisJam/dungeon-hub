'use server';

/**
 * Server Actions for DmGrantPanel — monster typeahead search.
 *
 * Moved from app/characters/[id]/codex/bestiario/actions.ts as part of
 * character-codex-browser Slice 1' (the bespoke bestiario directory was removed).
 *
 * DmGrantPanel imports this action for the "Bestiario" tab typeahead.
 * Kept separate from the scoped codex actions (codex/[kind]/actions.ts)
 * which handle the player-facing knowledge browser (Approach A isolation).
 *
 * REQ-CK-WEB-01 (spec #1626, character-codex)
 * REQ-CCB-MIG-01 (spec character-codex-browser — searchCompendiumMonsters MUST survive)
 */

import { createClient } from '@/lib/supabase/server';
import { api } from '@/lib/api';

export type CompendiumMonsterHit = {
  slug: string;
  source: string;
  name: string;
  cr: string | null;
  type: string | null;
};

/**
 * Debounced monster typeahead for DmGrantPanel BestiarioTab.
 * Maps to GET /compendium/monsters?world=<id>&q=<term>&limit=50.
 *
 * The endpoint requires exactly one of ?campaign= or ?world= (resolveProfile XOR,
 * compendium.ts). Passing neither returns 400 → the catch swallowed it into [],
 * which made the Bestiario typeahead silently dead. Scoped by the character's world.
 *
 * REQ-CK-WEB-01 (spec #1626, character-codex)
 */
export async function searchCompendiumMonsters(
  worldId: string,
  query: string,
): Promise<CompendiumMonsterHit[]> {
  const trimmed = query.trim();
  if (trimmed.length === 0) return [];

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return [];

  type Envelope = { data: CompendiumMonsterHit[]; total: number };
  try {
    const params = new URLSearchParams({ world: worldId, q: trimmed, limit: '50' });
    const res = await api.get<Envelope>(
      `/compendium/monsters?${params.toString()}`,
      session.access_token,
    );
    return res.data;
  } catch {
    return [];
  }
}
