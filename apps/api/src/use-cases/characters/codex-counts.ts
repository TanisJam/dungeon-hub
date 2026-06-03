import { and, count, eq } from 'drizzle-orm';
import { db } from '../../infra/db/client.js';
import { characterKnowledge, compendiumMonsters } from '../../infra/db/schema.js';

export interface CodexCounts {
  monsters: { known: number; total: number };
}

/**
 * Returns per-kind known/total counts for the character codex grid.
 *
 * Access check (owner-or-GM) is performed by the route BEFORE calling this
 * function — this function performs no auth checks itself.
 *
 * DB kind mapping:
 *   monsters → character_knowledge.kind = 'bestiary'
 *
 * REQ-CCB-API-02 (spec character-codex-browser).
 *
 * NOTE: Spec REQ-CCB-API-02 originally specified parallel SSR reuse of the
 * knowledge envelope as the grid-counts mechanism. The design (ADR-1) selected
 * a dedicated lightweight counts endpoint instead — one access check, one round-
 * trip, naturally extensible as more kinds land in later slices.
 */
export async function getCodexCounts(characterId: string): Promise<CodexCounts> {
  // Total monsters in compendium (unfiltered)
  const [totalRow] = await db
    .select({ value: count() })
    .from(compendiumMonsters);

  const total = totalRow?.value ?? 0;

  // Known monsters for this character (DB kind = 'bestiary')
  const [knownRow] = await db
    .select({ value: count() })
    .from(characterKnowledge)
    .where(
      and(
        eq(characterKnowledge.characterId, characterId),
        eq(characterKnowledge.kind, 'bestiary'),
      ),
    );

  const known = knownRow?.value ?? 0;

  return {
    monsters: { known, total },
  };
}
