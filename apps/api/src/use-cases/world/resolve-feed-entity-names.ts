/**
 * resolveFeedEntityNames — world-level sanitized batch entity resolver.
 *
 * Maps (kind, id, source) triples → sanitized display name (or null if unresolvable).
 * Used by aggregateGuildFeed to attach entity names to feed items.
 *
 * SECURITY CHOKE POINT (ADR-6):
 * - dmNotes is NEVER present in the output (sanitizeNpcForRole/sanitizeFactionForRole strip it).
 * - parentHexStatus is NEVER present in the output (stripParentHexStatus removes it before
 *   sanitizePoiForRole is called).
 * - Always uses 'player' access for all sanitize calls — guild feed is player-facing.
 *   Even a GM viewer gets player-grade names in the feed (shared guild knowledge, not
 *   DM-specific data).
 *
 * BATCH STRATEGY (N+1 guard, ADR-4):
 * - Collect DISTINCT (kind, id, source) triples.
 * - Resolve PER-KIND in ONE query each (not per-item).
 * - Build id→name lookup map, then join with the input refs.
 *
 * Supported kinds:
 *   - 'bestiary'  → query compendiumMonsters by (slug, source); public, no dmNotes.
 *   - 'npc'       → listNpcsInWorld + sanitizeNpcForRole('player'); id→name.
 *   - 'faction'   → listFactionsInWorld + sanitizeFactionForRole('player'); id→name.
 *   - 'location'  → listPoisInWorld + stripParentHexStatus + sanitizePoiForRole('player'); id→name.
 *
 * Unknown kinds return null for each ref with that kind.
 * Unknown entity IDs (deleted/missing) return null for that specific ref.
 *
 * guild-feed-linked-entity-refs SDD spec REQ-GFLE-05/07, design ADR-4/ADR-6.
 */

import { and, eq } from 'drizzle-orm';
import { db } from '../../infra/db/client.js';
import { compendiumMonsters } from '../../infra/db/schema.js';
import { listNpcsInWorld, sanitizeNpcForRole } from './load-npc.js';
import { listFactionsInWorld, sanitizeFactionForRole } from './load-faction.js';
import { listPoisInWorld, stripParentHexStatus, sanitizePoiForRole } from '../map/load-poi.js';

export interface FeedEntityRef {
  kind: string;
  id: string;
  source: string;
}

/**
 * Resolves a set of (kind, id, source) entity references to display names.
 *
 * @param worldId - The world scope for UUID-based kinds (npc/faction/location).
 * @param refs - Array of entity references to resolve (duplicates are deduped).
 * @returns Map keyed by `${kind}|${id}|${source}` → name string or null.
 */
export async function resolveFeedEntityNames(
  worldId: string,
  refs: FeedEntityRef[],
): Promise<Map<string, string | null>> {
  const result = new Map<string, string | null>();

  if (refs.length === 0) return result;

  // Deduplicate refs by composite key
  const seen = new Set<string>();
  const unique: FeedEntityRef[] = [];
  for (const ref of refs) {
    const key = `${ref.kind}|${ref.id}|${ref.source}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(ref);
    }
  }

  // Partition by kind
  const byKind: Record<string, FeedEntityRef[]> = {};
  for (const ref of unique) {
    if (!byKind[ref.kind]) byKind[ref.kind] = [];
    byKind[ref.kind]!.push(ref);
  }

  // ── bestiary ──────────────────────────────────────────────────────────────
  // ONE query for all bestiary refs. Key: (slug, source).
  if (byKind['bestiary']?.length) {
    const bestiaryRefs = byKind['bestiary']!;

    // Build conditions for each (slug, source) pair
    const conditions = bestiaryRefs.map((ref) =>
      and(eq(compendiumMonsters.slug, ref.id), eq(compendiumMonsters.source, ref.source)),
    );

    // Use OR across conditions — for small batches (≤page limit), this is one query
    const { or } = await import('drizzle-orm');
    const rows = await db
      .select({ slug: compendiumMonsters.slug, source: compendiumMonsters.source, name: compendiumMonsters.name })
      .from(compendiumMonsters)
      .where(conditions.length === 1 ? conditions[0] : or(...conditions));

    // Build lookup map: "slug|source" → name
    const monsterLookup = new Map(rows.map((r) => [`${r.slug}|${r.source}`, r.name]));

    for (const ref of bestiaryRefs) {
      const key = `bestiary|${ref.id}|${ref.source}`;
      result.set(key, monsterLookup.get(`${ref.id}|${ref.source}`) ?? null);
    }
  }

  // ── npc ───────────────────────────────────────────────────────────────────
  // ONE query: listNpcsInWorld (fetches all world NPCs), then filter to requested ids.
  // Sanitize with 'player' access → dmNotes stripped.
  if (byKind['npc']?.length) {
    const npcRefs = byKind['npc']!;
    const requestedIds = new Set(npcRefs.map((r) => r.id));

    const allNpcs = await listNpcsInWorld(worldId);
    // Build id→name map using sanitized NPC rows (dmNotes absent for player access)
    const npcLookup = new Map<string, string>();
    for (const npc of allNpcs) {
      if (requestedIds.has(npc.id)) {
        const sanitized = sanitizeNpcForRole(npc, 'player');
        npcLookup.set(npc.id, sanitized.name);
      }
    }

    for (const ref of npcRefs) {
      const key = `npc|${ref.id}|${ref.source}`;
      result.set(key, npcLookup.get(ref.id) ?? null);
    }
  }

  // ── faction ───────────────────────────────────────────────────────────────
  // ONE query: listFactionsInWorld, then filter to requested ids.
  // Sanitize with 'player' access → dmNotes stripped.
  if (byKind['faction']?.length) {
    const factionRefs = byKind['faction']!;
    const requestedIds = new Set(factionRefs.map((r) => r.id));

    const allFactions = await listFactionsInWorld(worldId);
    const factionLookup = new Map<string, string>();
    for (const faction of allFactions) {
      if (requestedIds.has(faction.id)) {
        const sanitized = sanitizeFactionForRole(faction, 'player');
        factionLookup.set(faction.id, sanitized.name);
      }
    }

    for (const ref of factionRefs) {
      const key = `faction|${ref.id}|${ref.source}`;
      result.set(key, factionLookup.get(ref.id) ?? null);
    }
  }

  // ── location (POI) ────────────────────────────────────────────────────────
  // ONE query: listPoisInWorld (with parentHexStatus), then filter to requested ids.
  // MUST apply stripParentHexStatus FIRST, then sanitizePoiForRole ('player') → both
  // parentHexStatus and dmNotes stripped.
  if (byKind['location']?.length) {
    const locationRefs = byKind['location']!;
    const requestedIds = new Set(locationRefs.map((r) => r.id));

    const allPois = await listPoisInWorld({ worldId });
    const poiLookup = new Map<string, string>();
    for (const poi of allPois) {
      if (requestedIds.has(poi.id)) {
        // Step 1: strip parentHexStatus (MUST NOT be on wire for anyone — ADR-6)
        const stripped = stripParentHexStatus(poi);
        // Step 2: sanitize with player access (strips dmNotes)
        const sanitized = sanitizePoiForRole(stripped, 'player');
        poiLookup.set(poi.id, sanitized.name);
      }
    }

    for (const ref of locationRefs) {
      const key = `location|${ref.id}|${ref.source}`;
      result.set(key, poiLookup.get(ref.id) ?? null);
    }
  }

  return result;
}
