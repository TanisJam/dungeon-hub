'use server';

/**
 * Server Actions for DmGrantPanel — monster + NPC typeahead search.
 *
 * Moved from app/characters/[id]/codex/bestiario/actions.ts as part of
 * character-codex-browser Slice 1' (the bespoke bestiario directory was removed).
 *
 * DmGrantPanel imports these actions for the "Bestiario" and "NPC" tab typeaheads.
 * Kept separate from the scoped codex actions (codex/[kind]/actions.ts)
 * which handle the player-facing knowledge browser (Approach A isolation).
 *
 * REQ-CK-WEB-01 (spec #1626, character-codex)
 * REQ-CCB-MIG-01 (spec character-codex-browser — searchCompendiumMonsters MUST survive)
 * REQ-UBN-GRANT (uuid-bridge-npc B-3 — searchWorldNpcs for NPC grant tab)
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

// ---------------------------------------------------------------------------
// NPC typeahead — uuid-bridge-npc Wave 5a (REQ-UBN-GRANT, ADR-3)
// ---------------------------------------------------------------------------

export type WorldNpcHit = {
  id: string;        // UUID — used as refKey in grantKnowledge
  name: string;
  status: 'alive' | 'dead' | 'missing' | 'unknown';
  race: string | null;
  // NO dmNotes — DM grant picker does not render sensitive notes (ADR-6 R6)
};

/**
 * Fetches the full NPC list for the given world ONCE, for client-side filtering.
 *
 * ADR-3 (D2): world NPC lists are small; client-side filter avoids per-keystroke API calls.
 * The endpoint GET /worlds/:worldId/npcs sanitizes dmNotes based on the caller's WorldAccess.
 * The DM caller sees dmNotes in the raw response but the picker UI does not render it.
 *
 * refSource='world' is LOCKED for all NPC grants (ADR-2, uuid-bridge-npc).
 *
 * REQ-UBN-GRANT — NPC tab typeahead for DmGrantPanel.
 */
export async function searchWorldNpcs(worldId: string): Promise<WorldNpcHit[]> {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return [];

  type NpcListEnvelope = { data: Array<{ id: string; name: string; status: string; race: string | null }> };
  try {
    const params = new URLSearchParams({ limit: '200' });
    const res = await api.get<NpcListEnvelope>(
      `/worlds/${worldId}/npcs?${params.toString()}`,
      session.access_token,
    );
    return (res.data ?? []).map((npc) => ({
      id: npc.id,
      name: npc.name,
      status: (npc.status as WorldNpcHit['status']) ?? 'unknown',
      race: npc.race ?? null,
    }));
  } catch {
    return [];
  }
}
