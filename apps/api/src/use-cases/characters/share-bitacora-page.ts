/**
 * Use-case: share a personal bitácora page to the guild feed.
 *
 * Owner-only: caller must be the page owner (BITACORA_OWNER_REQUIRED → 403).
 * Idempotency: returns the existing contribution if a non-sealed copy already
 * exists for this page (no-op, NOT an error — REQ-SHARE-03 ADR-5).
 * Append-only: INSERT only, never PATCH/DELETE of existing rows (REQ-SHARE-04).
 *
 * A sealed/debunked copy does NOT block a fresh share (REQ-SHARE-03 scenario 2).
 *
 * bitacora-personal-share SDD spec #2035 REQ-SHARE-01..06/REQ-SHARE-09 ADR-5.
 */

import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../../infra/db/client.js';
import { bitacoraPages, guildContributions } from '../../infra/db/schema.js';
import { buildSharedContribution } from '@dungeon-hub/domain/character/bitacora';

export type ShareBitacoraPageResult =
  | { ok: true; contributionId: string; alreadyShared: boolean }
  | { ok: false; notFound: true }
  | { ok: false; forbidden: true };

export interface ShareBitacoraPageInput {
  characterId: string;
  pageId: string;
  userId: string;
}

export async function shareBitacoraPage(
  input: ShareBitacoraPageInput,
): Promise<ShareBitacoraPageResult> {
  const { characterId, pageId, userId } = input;

  // Load the page (scoped to characterId — prevents cross-character leakage)
  const pageRows = await db
    .select()
    .from(bitacoraPages)
    .where(and(eq(bitacoraPages.id, pageId), eq(bitacoraPages.characterId, characterId)))
    .limit(1);

  const page = pageRows[0];
  if (!page) {
    return { ok: false, notFound: true };
  }

  // Owner-only authz: compare authorUserId (from characters table via character lookup)
  // The page is owned by the character's owner. We verify via a join to characters.
  // The character was already scoped by characterId. Check that character.userId === userId.
  const { characters } = await import('../../infra/db/schema.js');
  const charRows = await db
    .select({ userId: characters.userId })
    .from(characters)
    .where(eq(characters.id, characterId))
    .limit(1);

  const char = charRows[0];
  if (!char || char.userId !== userId) {
    return { ok: false, forbidden: true };
  }

  // Dedup: check for an existing non-sealed contribution for this page
  // (sealed rows do not count — re-share after seal is allowed)
  const existingRows = await db
    .select({ id: guildContributions.id })
    .from(guildContributions)
    .where(
      and(
        eq(guildContributions.sourceBitacoraPageId, pageId),
        isNull(guildContributions.sealedStatus),
      ),
    )
    .limit(1);

  const existing = existingRows[0];
  if (existing) {
    // Idempotency no-op — return existing contribution
    return { ok: true, contributionId: existing.id, alreadyShared: true };
  }

  // Build the insert payload from the pure domain mapper
  const payload = buildSharedContribution({
    id: page.id,
    title: page.title ?? null,
    body: page.body,
    tags: page.tags ?? [],
    worldId: page.worldId,
    authorUserId: userId,
  });

  // INSERT (append-only — never PATCH or DELETE)
  const newRows = await db
    .insert(guildContributions)
    .values({
      worldId: page.worldId,
      authorUserId: userId,
      contributionType: payload.contributionType,
      body: payload.body,
      tags: payload.tags,
      title: payload.title,
      sourceBitacoraPageId: payload.sourceBitacoraPageId,
      refEntityKind: payload.refEntityKind,
      refEntityId: payload.refEntityId,
      visibility: payload.visibility,
    })
    .returning({ id: guildContributions.id });

  const newRow = newRows[0];
  if (!newRow) {
    throw new Error('shareBitacoraPage: INSERT returned no rows');
  }

  return { ok: true, contributionId: newRow.id, alreadyShared: false };
}
