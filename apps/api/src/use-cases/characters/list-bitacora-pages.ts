/**
 * Use-case: list bitácora pages for a character.
 *
 * Supports optional ?tag= filter (uses Drizzle arrayContains or raw SQL).
 * Returns { pages, total }.
 *
 * REQ-BP-API-02, bitacora-personal SDD design #1975 §ADR-3.
 */

import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../infra/db/client.js';
import { bitacoraPages } from '../../infra/db/schema.js';
import type { BitacoraPageRow } from './create-bitacora-page.js';

export interface ListBitacoraPageFilter {
  characterId: string;
  tag?: string | undefined;
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
    // GIN-indexed: ANY(tags) = $1
    conditions.push(sql`${bitacoraPages.tags} @> ARRAY[${filter.tag}]::text[]`);
  }

  const rows = await db
    .select()
    .from(bitacoraPages)
    .where(and(...conditions))
    .orderBy(sql`${bitacoraPages.createdAt} DESC`);

  return {
    pages: rows as unknown as BitacoraPageRow[],
    total: rows.length,
  };
}
