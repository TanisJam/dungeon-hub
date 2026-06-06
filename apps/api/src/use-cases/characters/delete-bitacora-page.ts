/**
 * Use-case: delete a bitácora page.
 *
 * Returns { deleted: true } if the page was found and deleted.
 * Returns { deleted: false } if the page does not exist or doesn't belong
 * to the given character (no cross-character leakage).
 *
 * REQ-BP-API-05, bitacora-personal SDD design #1975 §ADR-3.
 */

import { and, eq } from 'drizzle-orm';
import { db } from '../../infra/db/client.js';
import { bitacoraPages } from '../../infra/db/schema.js';

export interface DeleteBitacoraPageResult {
  deleted: boolean;
}

export async function deleteBitacoraPage(
  pageId: string,
  characterId: string,
): Promise<DeleteBitacoraPageResult> {
  const rows = await db
    .delete(bitacoraPages)
    .where(and(eq(bitacoraPages.id, pageId), eq(bitacoraPages.characterId, characterId)))
    .returning({ id: bitacoraPages.id });

  return { deleted: rows.length > 0 };
}
