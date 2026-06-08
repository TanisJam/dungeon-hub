/**
 * Use-case: get a single bitácora page by id.
 *
 * Returns null if not found or if the page doesn't belong to the given character
 * (prevents cross-character leakage).
 *
 * Includes a derived `sharedAt` field: the createdAt timestamp of the earliest
 * non-sealed guild_contributions row pointing back to this page (ADR-8).
 * sharedAt is null when the page has never been shared (or all shares were sealed).
 *
 * REQ-BP-API-03, bitacora-personal SDD design #1975 §ADR-3.
 * REQ-SHARE-10 ADR-8: derived sharedAt for "Compartido" indicator.
 */

import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../infra/db/client.js';
import { bitacoraPages } from '../../infra/db/schema.js';
import type { BitacoraPageRow } from './create-bitacora-page.js';

export async function getBitacoraPage(
  pageId: string,
  characterId: string,
): Promise<BitacoraPageRow | null> {
  // Use a subquery to derive sharedAt from guild_contributions.
  // MIN(gc.created_at) WHERE source_bitacora_page_id = page.id AND sealed_status IS NULL
  // Hits idx_gc_source_page (ADR-2 dedup index).
  const rows = await db
    .select({
      id: bitacoraPages.id,
      characterId: bitacoraPages.characterId,
      worldId: bitacoraPages.worldId,
      title: bitacoraPages.title,
      body: bitacoraPages.body,
      refs: bitacoraPages.refs,
      tags: bitacoraPages.tags,
      visibility: bitacoraPages.visibility,
      createdAt: bitacoraPages.createdAt,
      updatedAt: bitacoraPages.updatedAt,
      sharedAt: sql<string | null>`(
        SELECT MIN(gc.created_at)::text
        FROM guild_contributions gc
        WHERE gc.source_bitacora_page_id = "bitacora_pages"."id"
          AND gc.sealed_status IS NULL
      )`.as('shared_at'),
    })
    .from(bitacoraPages)
    .where(and(eq(bitacoraPages.id, pageId), eq(bitacoraPages.characterId, characterId)))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  return {
    ...row,
    sharedAt: row.sharedAt ?? null,
  } as unknown as BitacoraPageRow;
}
