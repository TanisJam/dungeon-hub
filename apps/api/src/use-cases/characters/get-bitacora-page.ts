/**
 * Use-case: get a single bitácora page by id.
 *
 * Returns null if not found or if the page doesn't belong to the given character
 * (prevents cross-character leakage).
 *
 * REQ-BP-API-03, bitacora-personal SDD design #1975 §ADR-3.
 */

import { and, eq } from 'drizzle-orm';
import { db } from '../../infra/db/client.js';
import { bitacoraPages } from '../../infra/db/schema.js';
import type { BitacoraPageRow } from './create-bitacora-page.js';

export async function getBitacoraPage(
  pageId: string,
  characterId: string,
): Promise<BitacoraPageRow | null> {
  const rows = await db
    .select()
    .from(bitacoraPages)
    .where(and(eq(bitacoraPages.id, pageId), eq(bitacoraPages.characterId, characterId)))
    .limit(1);

  return (rows[0] as unknown as BitacoraPageRow | undefined) ?? null;
}
