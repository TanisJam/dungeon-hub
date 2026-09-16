import { and, arrayContains, desc, eq } from 'drizzle-orm';
import { db } from '../../infra/db/client.js';
import { journalEntries } from '../../infra/db/schema.js';
import type { WorldAccess } from '../auth/get-world-access.js';
import { buildFeedCursorCondition, FEED_SOURCE_RANK, type FeedCursor } from '../world/feed-cursor.js';

export type JournalVisibility = 'public' | 'dm-only';

export interface LoadedJournalEntry {
  id: string;
  worldId: string;
  title: string;
  body: string | null;
  visibility: JournalVisibility;
  tags: string[];
  authorUserId: string;
  createdAt: Date;
  updatedAt: Date;
}

export async function loadJournalEntry(id: string): Promise<LoadedJournalEntry | null> {
  const rows = await db.select().from(journalEntries).where(eq(journalEntries.id, id)).limit(1);
  return (rows[0] as LoadedJournalEntry | undefined) ?? null;
}

export interface ListJournalOptions {
  worldId: string;
  tag?: string;
  limit?: number;
  offset?: number;
  /**
   * feed-keyset-pagination: opaque cursor, already decoded, restricting the
   * result to rows strictly after it in the shared feed total order. Additive
   * — omitting it (existing callers) keeps the exact pre-existing behaviour.
   */
  cursor?: FeedCursor;
}

export async function listJournalEntries(opts: ListJournalOptions): Promise<LoadedJournalEntry[]> {
  const limit = Math.min(opts.limit ?? 100, 500);
  const offset = opts.offset ?? 0;
  const conditions = [eq(journalEntries.worldId, opts.worldId)];
  if (opts.tag) conditions.push(arrayContains(journalEntries.tags, [opts.tag]));

  if (opts.cursor) {
    // Keyset path (feed-keyset-pagination): add the per-source cursor predicate
    // and order by `updatedAt DESC, id DESC` so the limit+1 window is correct.
    const cursorCondition = buildFeedCursorCondition(
      opts.cursor,
      FEED_SOURCE_RANK.dm,
      journalEntries.updatedAt,
      journalEntries.id,
    );
    if (cursorCondition) conditions.push(cursorCondition);

    const rows = await db
      .select()
      .from(journalEntries)
      .where(and(...conditions))
      .orderBy(desc(journalEntries.updatedAt), desc(journalEntries.id))
      .limit(limit);
    return rows as LoadedJournalEntry[];
  }

  // Legacy offset path — behaviourally untouched.
  const rows = await db
    .select()
    .from(journalEntries)
    .where(and(...conditions))
    .orderBy(desc(journalEntries.updatedAt))
    .limit(limit)
    .offset(offset);
  return rows as LoadedJournalEntry[];
}

/** Filtra dm-only entries para non-GM. (No hay dmNotes field — la entry
 *  entera es o pública o privada.) */
export function filterJournalByAccess(
  list: LoadedJournalEntry[],
  access: WorldAccess,
): LoadedJournalEntry[] {
  if (access === 'gm') return list;
  return list.filter((e) => e.visibility === 'public');
}
