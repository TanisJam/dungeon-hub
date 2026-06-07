import { and, count, eq } from 'drizzle-orm';
import { db } from '../../infra/db/client.js';
import { characterKnowledge, compendiumMonsters, factions, npcs, pois } from '../../infra/db/schema.js';

export interface CodexCounts {
  monsters: { known: number; total: number };
  /** NPC counts — uuid-bridge-npc Wave 5a (REQ-UBN-COUNTS). */
  npc: { known: number; total: number };
  /** Faction counts — uuid-bridge-factions-pois Wave 5b (REQ-UBFP-COUNTS). */
  faction: { known: number; total: number };
  /** Location (POI) counts — uuid-bridge-factions-pois Wave 5b (REQ-UBFP-COUNTS). */
  location: { known: number; total: number };
}

/**
 * Returns per-kind known/total counts for the character codex grid.
 *
 * Access check (owner-or-GM) is performed by the route BEFORE calling this
 * function — this function performs no auth checks itself.
 *
 * DB kind mapping:
 *   monsters → character_knowledge.kind = 'bestiary'
 *   npc      → character_knowledge.kind = 'npc' (uuid-bridge-npc Wave 5a)
 *
 * worldId is required for NPC counts (total = world NPC count via DB query).
 *
 * REQ-CCB-API-02 (spec character-codex-browser).
 * REQ-UBN-COUNTS (spec uuid-bridge-npc #2002).
 *
 * NOTE: Spec REQ-CCB-API-02 originally specified parallel SSR reuse of the
 * knowledge envelope as the grid-counts mechanism. The design (ADR-1) selected
 * a dedicated lightweight counts endpoint instead — one access check, one round-
 * trip, naturally extensible as more kinds land in later slices.
 */
export async function getCodexCounts(characterId: string, worldId: string): Promise<CodexCounts> {
  // ── Monsters ────────────────────────────────────────────────────────────────

  // Total monsters in compendium (unfiltered)
  const [totalMonstersRow] = await db
    .select({ value: count() })
    .from(compendiumMonsters);

  const totalMonsters = totalMonstersRow?.value ?? 0;

  // Known monsters for this character (DB kind = 'bestiary')
  const [knownMonstersRow] = await db
    .select({ value: count() })
    .from(characterKnowledge)
    .where(
      and(
        eq(characterKnowledge.characterId, characterId),
        eq(characterKnowledge.kind, 'bestiary'),
      ),
    );

  const knownMonsters = knownMonstersRow?.value ?? 0;

  // ── NPCs (uuid-bridge-npc Wave 5a) ──────────────────────────────────────────

  // Total NPCs in this world
  const [totalNpcsRow] = await db
    .select({ value: count() })
    .from(npcs)
    .where(eq(npcs.worldId, worldId));

  const totalNpcs = totalNpcsRow?.value ?? 0;

  // Known NPCs for this character (DB kind = 'npc')
  const [knownNpcsRow] = await db
    .select({ value: count() })
    .from(characterKnowledge)
    .where(
      and(
        eq(characterKnowledge.characterId, characterId),
        eq(characterKnowledge.kind, 'npc'),
      ),
    );

  const knownNpcs = knownNpcsRow?.value ?? 0;

  // ── Factions (uuid-bridge-factions-pois Wave 5b) ────────────────────────────

  // Total factions in this world
  const [totalFactionsRow] = await db
    .select({ value: count() })
    .from(factions)
    .where(eq(factions.worldId, worldId));

  const totalFactions = totalFactionsRow?.value ?? 0;

  // Known factions for this character (DB kind = 'faction')
  const [knownFactionsRow] = await db
    .select({ value: count() })
    .from(characterKnowledge)
    .where(
      and(
        eq(characterKnowledge.characterId, characterId),
        eq(characterKnowledge.kind, 'faction'),
      ),
    );

  const knownFactions = knownFactionsRow?.value ?? 0;

  // ── Locations / POIs (uuid-bridge-factions-pois Wave 5b) ────────────────────

  // Total POIs in this world
  const [totalPoisRow] = await db
    .select({ value: count() })
    .from(pois)
    .where(eq(pois.worldId, worldId));

  const totalPois = totalPoisRow?.value ?? 0;

  // Known locations for this character (DB kind = 'location')
  const [knownLocationsRow] = await db
    .select({ value: count() })
    .from(characterKnowledge)
    .where(
      and(
        eq(characterKnowledge.characterId, characterId),
        eq(characterKnowledge.kind, 'location'),
      ),
    );

  const knownLocations = knownLocationsRow?.value ?? 0;

  return {
    monsters: { known: knownMonsters, total: totalMonsters },
    npc: { known: knownNpcs, total: totalNpcs },
    faction: { known: knownFactions, total: totalFactions },
    location: { known: knownLocations, total: totalPois },
  };
}
