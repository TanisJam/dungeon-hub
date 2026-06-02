import { db, type DbOrTx } from '../../infra/db/client.js';
import { characterKnowledge } from '../../infra/db/schema.js';

export interface UpsertCharacterKnowledgeInput {
  /** Database connection or transaction context. */
  tx?: DbOrTx;
  characterId: string;
  worldId: string;
  /** Entry kind: 'bestiary' | 'item' | 'spell' | 'npc' | 'faction' | 'location' | 'lore' */
  kind: 'bestiary' | 'item' | 'spell' | 'npc' | 'faction' | 'location' | 'lore';
  /** Compendium slug (e.g. 'goblin', 'longsword'). */
  refKey: string;
  /** Compendium source (e.g. 'mm', 'PHB'). */
  refSource: string;
  /** How this knowledge was acquired: 'dm-grant' | 'encounter'. */
  source: string;
  /** User who granted. NULL for system-generated rows (auto-unlock). */
  grantedByUserId?: string | null;
}

/**
 * Idempotent knowledge upsert.
 *
 * Inserts a character_knowledge row. If a row with the same
 * (characterId, kind, refKey, refSource) already exists, the INSERT is
 * silently ignored (ON CONFLICT DO NOTHING).
 *
 * REQ-CK-DB-01, REQ-CK-API-01 (spec #1626)
 */
export async function upsertCharacterKnowledge(
  input: UpsertCharacterKnowledgeInput,
): Promise<void> {
  const conn = input.tx ?? db;

  await conn
    .insert(characterKnowledge)
    .values({
      characterId: input.characterId,
      worldId: input.worldId,
      kind: input.kind,
      refKey: input.refKey,
      refSource: input.refSource,
      source: input.source,
      grantedByUserId: input.grantedByUserId ?? null,
    })
    .onConflictDoNothing();
}
