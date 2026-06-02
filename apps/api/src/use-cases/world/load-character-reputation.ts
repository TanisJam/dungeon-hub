import { and, eq } from 'drizzle-orm';
import { db } from '../../infra/db/client.js';
import { characterFactionReputation, characters, factions } from '../../infra/db/schema.js';

export interface ReputationRow {
  characterId: string;
  factionId: string;
  value: number;
}

export type SetReputationResult =
  | { ok: true; reputation: ReputationRow }
  | { ok: false; issues: Array<{ code: string; [k: string]: unknown }> };

export type GetReputationResult =
  | { ok: true; reputation: ReputationRow | null }
  | { ok: false; issues: Array<{ code: string; [k: string]: unknown }> };

/**
 * Upserts the reputation value for a (characterId, factionId) pair.
 *
 * Cross-scope guard: character.worldId MUST equal faction.worldId.
 * Returns REPUTATION_CROSS_WORLD if not (ADR-6).
 *
 * No domain cap: any signed integer is valid (spec REQ-NPC-04).
 */
export async function setReputation(
  characterId: string,
  factionId: string,
  value: number,
): Promise<SetReputationResult> {
  // Load character to get worldId.
  const charRows = await db
    .select({ worldId: characters.worldId })
    .from(characters)
    .where(eq(characters.id, characterId))
    .limit(1);

  if (charRows.length === 0) {
    return { ok: false, issues: [{ code: 'CHARACTER_NOT_FOUND', characterId }] };
  }

  // Load faction to get worldId.
  const facRows = await db
    .select({ worldId: factions.worldId })
    .from(factions)
    .where(eq(factions.id, factionId))
    .limit(1);

  if (facRows.length === 0) {
    return { ok: false, issues: [{ code: 'FACTION_NOT_FOUND', factionId }] };
  }

  const charWorldId = charRows[0]!.worldId;
  const facWorldId = facRows[0]!.worldId;

  // ADR-6: same-world invariant.
  if (charWorldId !== facWorldId) {
    return {
      ok: false,
      issues: [
        {
          code: 'REPUTATION_CROSS_WORLD',
          characterWorldId: charWorldId,
          factionWorldId: facWorldId,
        },
      ],
    };
  }

  // Upsert: insert or update on PK conflict.
  const [row] = await db
    .insert(characterFactionReputation)
    .values({ characterId, factionId, value })
    .onConflictDoUpdate({
      target: [characterFactionReputation.characterId, characterFactionReputation.factionId],
      set: { value },
    })
    .returning();

  return { ok: true, reputation: row as ReputationRow };
}

/**
 * Gets the reputation value for a (characterId, factionId) pair.
 *
 * Returns null reputation row if no entry exists yet (default is 0 semantically
 * but no row is stored until first explicit set).
 */
export async function getReputation(
  characterId: string,
  factionId: string,
): Promise<GetReputationResult> {
  const charRows = await db
    .select({ worldId: characters.worldId })
    .from(characters)
    .where(eq(characters.id, characterId))
    .limit(1);

  if (charRows.length === 0) {
    return { ok: false, issues: [{ code: 'CHARACTER_NOT_FOUND', characterId }] };
  }

  const facRows = await db
    .select({ worldId: factions.worldId })
    .from(factions)
    .where(eq(factions.id, factionId))
    .limit(1);

  if (facRows.length === 0) {
    return { ok: false, issues: [{ code: 'FACTION_NOT_FOUND', factionId }] };
  }

  const rows = await db
    .select()
    .from(characterFactionReputation)
    .where(
      and(
        eq(characterFactionReputation.characterId, characterId),
        eq(characterFactionReputation.factionId, factionId),
      ),
    )
    .limit(1);

  return { ok: true, reputation: (rows[0] as ReputationRow | undefined) ?? null };
}
