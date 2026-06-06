/**
 * Use-case: update a bitácora page (partial update).
 *
 * Merges provided fields with existing row, validates merged document,
 * then persists. Bumps updatedAt.
 *
 * REQ-BP-API-04, bitacora-personal SDD design #1975 §ADR-3.
 */

import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../infra/db/client.js';
import { bitacoraPages } from '../../infra/db/schema.js';
import { validateBitacoraPage } from '@dungeon-hub/domain/character/bitacora';
import type { BitacoraPageRow } from './create-bitacora-page.js';

export interface UpdateBitacoraPageInput {
  pageId: string;
  characterId: string;
  title?: string | null | undefined;
  body?: string | undefined;
  tags?: string[] | undefined;
  refs?: Array<{ kind: string; refKey: string; refSource: string }> | undefined;
}

export type UpdateBitacoraPageResult =
  | { ok: true; page: BitacoraPageRow }
  | { ok: false; notFound: true }
  | { ok: false; issues: Array<{ code: string; message: string; path?: string }> };

export async function updateBitacoraPage(
  input: UpdateBitacoraPageInput,
): Promise<UpdateBitacoraPageResult> {
  // Load existing page
  const existing = await db
    .select()
    .from(bitacoraPages)
    .where(
      and(eq(bitacoraPages.id, input.pageId), eq(bitacoraPages.characterId, input.characterId)),
    )
    .limit(1);

  if (!existing[0]) {
    return { ok: false, notFound: true };
  }

  const current = existing[0] as unknown as BitacoraPageRow;

  // Merge partial fields
  const merged = {
    title: 'title' in input ? input.title : current.title,
    body: input.body ?? current.body,
    tags: input.tags ?? current.tags,
    refs: (input.refs ?? (current.refs as Array<{ kind: string; refKey: string; refSource: string }>)),
  };

  // Domain validation on merged document
  const validation = validateBitacoraPage(merged);
  if (!validation.ok) {
    return { ok: false, issues: validation.issues };
  }

  // Persist — bump updatedAt
  const rows = await db
    .update(bitacoraPages)
    .set({
      title: merged.title,
      body: merged.body,
      tags: merged.tags,
      refs: merged.refs,
      updatedAt: sql`now()`,
    })
    .where(
      and(eq(bitacoraPages.id, input.pageId), eq(bitacoraPages.characterId, input.characterId)),
    )
    .returning();

  const row = rows[0];
  if (!row) {
    return { ok: false, notFound: true };
  }

  return { ok: true, page: row as unknown as BitacoraPageRow };
}
