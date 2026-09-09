import { eq } from 'drizzle-orm';
import type { RulesProfile } from '@dungeon-hub/domain/rules-profile';
import { db } from '../../infra/db/client.js';
import { journalEntries, quests } from '../../infra/db/schema.js';
import { listNpcsInWorld, type LoadedNpc } from '../world/load-npc.js';
import { listFactionsInWorld, type LoadedFaction } from '../world/load-faction.js';
import { listHexesInWorld, type LoadedHex } from '../map/load-hex.js';
import { listPoisInWorld, stripParentHexStatus } from '../map/load-poi.js';
import type { LoadedPoi } from '../map/load-poi.js';
import type { LoadedQuest } from '../world/load-quest.js';
import type { LoadedJournalEntry } from '../journal/load-entry.js';

/**
 * Envelope returned by GET /worlds/:worldId/export. Mirrors the character
 * export shape (schemaVersion + exportedAt + payload) — MVP #3.9's other half.
 */
export interface WorldExportEnvelope {
  schemaVersion: 1;
  exportedAt: string; // ISO 8601 UTC
  world: {
    name: string;
    rulesProfile: RulesProfile;
    npcs: LoadedNpc[];
    factions: LoadedFaction[];
    quests: LoadedQuest[];
    hexes: LoadedHex[];
    pois: LoadedPoi[];
    journal: LoadedJournalEntry[];
  };
}

/**
 * Builds the full-backup export envelope for a world.
 *
 * GM-only by construction (the route enforces getWorldAccess === 'gm' before
 * calling this). Because the caller is always the DM, this deliberately
 * includes DM-only rows verbatim: dmNotes on npcs/factions/hexes/pois/quests,
 * and visibility:'dm-only' quests/journal entries. There is no player-facing
 * sanitization here — an export is the DM's own backup of their own content,
 * so nothing needs to be hidden from them.
 *
 * quests and journalEntries are read directly rather than via
 * listQuests()/listJournalEntries() — those use-cases cap at 500 rows for
 * paginated UI lists, but an export must be a complete backup, not a page.
 */
export async function buildWorldExport(
  worldId: string,
  world: { name: string; rulesProfile: RulesProfile },
): Promise<WorldExportEnvelope> {
  const [npcs, factions, hexes, poisWithHexStatus, questRows, journalRows] = await Promise.all([
    listNpcsInWorld(worldId),
    listFactionsInWorld(worldId),
    listHexesInWorld({ worldId }),
    listPoisInWorld({ worldId }),
    db.select().from(quests).where(eq(quests.worldId, worldId)),
    db.select().from(journalEntries).where(eq(journalEntries.worldId, worldId)),
  ]);

  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    world: {
      name: world.name,
      rulesProfile: world.rulesProfile,
      npcs,
      factions,
      quests: questRows as LoadedQuest[],
      hexes,
      // parentHexStatus is an internal join field for player visibility cascade
      // (see load-poi.ts) — strip it before it reaches the export payload.
      pois: poisWithHexStatus.map(stripParentHexStatus),
      journal: journalRows as LoadedJournalEntry[],
    },
  };
}
