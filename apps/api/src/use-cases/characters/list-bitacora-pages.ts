/**
 * Use-case: list bitácora pages for a character.
 *
 * Supports optional ?tag= filter (uses GIN-indexed array containment).
 * Supports optional ?refKey= + ?refKind= filter to narrow by entity reference
 * (used by the monster-detail "this monster's pages" view — REQ-BP-API-02 §CRITICAL-2 fix).
 * Returns { pages, total }.
 *
 * Each page includes a derived `sharedAt` field (ADR-8, REQ-SHARE-10):
 * the createdAt of the earliest non-sealed guild_contributions row back-linking
 * to the page. null when the page has never been shared (or all shares sealed).
 *
 * REQ-BP-API-02, bitacora-personal SDD design #1975 §ADR-3.
 * REQ-SHARE-10 ADR-8: derived sharedAt for "Compartido" indicator.
 */

import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../infra/db/client.js';
import { bitacoraPages } from '../../infra/db/schema.js';
import type { BitacoraPageRow } from './create-bitacora-page.js';

export interface ListBitacoraPageFilter {
  characterId: string;
  tag?: string | undefined;
  /** Filter pages whose refs[] contains an entry with this refKey */
  refKey?: string | undefined;
  /** Filter pages whose refs[] contains an entry with this kind (default: 'monster') */
  refKind?: string | undefined;
}

export interface ListBitacoraPageResult {
  pages: BitacoraPageRow[];
  total: number;
}

export async function listBitacoraPages(
  filter: ListBitacoraPageFilter,
): Promise<ListBitacoraPageResult> {
  const conditions = [eq(bitacoraPages.characterId, filter.characterId)];

  if (filter.tag) {
    // GIN-indexed: array containment
    conditions.push(sql`${bitacoraPages.tags} @> ARRAY[${filter.tag}]::text[]`);
  }

  if (filter.refKey) {
    // JSONB containment: refs @> '[{"kind":"monster","refKey":"<slug>"}]'
    // Uses the jsonb @> operator (containment) which works on the JSONB column.
    // refKind defaults to 'monster' (only supported kind this wave per ADR-1).
    const kind = filter.refKind ?? 'monster';
    conditions.push(
      sql`${bitacoraPages.refs} @> ${JSON.stringify([{ kind, refKey: filter.refKey }])}::jsonb`,
    );
  }

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
    .where(and(...conditions))
    .orderBy(sql`${bitacoraPages.createdAt} DESC`);

  const pages = rows.map((row) => ({
    ...row,
    sharedAt: row.sharedAt ?? null,
  })) as unknown as BitacoraPageRow[];

  return {
    pages,
    total: pages.length,
  };
}
