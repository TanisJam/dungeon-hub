/**
 * Use-case: create a personal bitácora page.
 *
 * Validates domain rules, then inserts into bitacora_pages.
 * Returns the created page row.
 *
 * Access model: owner-only (caller is the character owner).
 * REQ-BP-API-01, bitacora-personal SDD design #1975 §ADR-3.
 */

import { eq, sql } from 'drizzle-orm';
import { db } from '../../infra/db/client.js';
import { bitacoraPages } from '../../infra/db/schema.js';
import { validateBitacoraPage } from '@dungeon-hub/domain/character/bitacora';

export interface CreateBitacoraPageInput {
  characterId: string;
  worldId: string;
  title?: string | null;
  body: string;
  tags: string[];
  refs: Array<{ kind: string; refKey: string; refSource: string }>;
}

export interface BitacoraPageRow {
  id: string;
  characterId: string;
  worldId: string;
  title: string | null;
  body: string;
  refs: unknown;
  tags: string[];
  visibility: string;
  createdAt: Date;
  updatedAt: Date;
}

export type CreateBitacoraPageResult =
  | { ok: true; page: BitacoraPageRow }
  | { ok: false; issues: Array<{ code: string; message: string; path?: string }> };

export async function createBitacoraPage(
  input: CreateBitacoraPageInput,
): Promise<CreateBitacoraPageResult> {
  // Domain validation (pure, no IO)
  const validation = validateBitacoraPage({
    ...(input.title !== undefined ? { title: input.title } : {}),
    body: input.body,
    tags: input.tags,
    refs: input.refs,
  });

  if (!validation.ok) {
    return { ok: false, issues: validation.issues };
  }

  // Persist
  const rows = await db
    .insert(bitacoraPages)
    .values({
      characterId: input.characterId,
      worldId: input.worldId,
      title: input.title ?? null,
      body: input.body,
      refs: input.refs,
      tags: input.tags,
      visibility: 'personal',
    })
    .returning();

  const row = rows[0];
  if (!row) {
    throw new Error('Insert returned no rows');
  }

  return { ok: true, page: row as unknown as BitacoraPageRow };
}
