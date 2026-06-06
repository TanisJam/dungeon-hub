/**
 * Use-case: list bitácora pages for a character.
 *
 * Supports optional ?tag= filter (uses GIN-indexed array containment).
 * Supports optional ?refKey= + ?refKind= filter to narrow by entity reference
 * (used by the monster-detail "this monster's pages" view — REQ-BP-API-02 §CRITICAL-2 fix).
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
    .select()
    .from(bitacoraPages)
    .where(and(...conditions))
    .orderBy(sql`${bitacoraPages.createdAt} DESC`);

  return {
    pages: rows as unknown as BitacoraPageRow[],
    total: rows.length,
  };
}
