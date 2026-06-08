/**
 * aggregateGuildFeed — unified guild bitácora feed read use-case.
 *
 * bitacora-gremio W4, ADR-1 (server-side thin union use-case).
 * REQ-GREM-FD-01, REQ-GREM-FD-03.
 *
 * Aggregates three existing stores:
 *   - guild_contributions (gremio source)
 *   - journal_entries (dm source)
 *   - world_events (evento source)
 *
 * Each source is visibility-filtered by ITS OWN existing helper BEFORE merge.
 * The merge step receives only already-authorized rows — guaranteed no leak (ADR-3).
 *
 * Ordering key: FeedItem.sortAt DESC (ADR-5):
 *   - guild_contributions → occurredAt
 *   - world_events       → occurredAt
 *   - journal_entries    → updatedAt (no occurredAt field; recency signal per ADR-5)
 *
 * Pagination: offset-based over the merged slice.
 * nextOffset = offset + limit when any source still has rows; null otherwise.
 */

import { and, arrayContains, desc, eq } from 'drizzle-orm';
import { db } from '../../infra/db/client.js';
import { guildContributions } from '../../infra/db/schema.js';
import { isVisibleTo } from '@dungeon-hub/domain/world/contribution';
import type { WorldAccess } from '../auth/get-world-access.js';
import {
  listJournalEntries,
  filterJournalByAccess,
  type LoadedJournalEntry,
} from '../journal/load-entry.js';
import {
  listWorldEvents,
  filterWorldEventsByAccess,
  type LoadedWorldEvent,
} from './load-world-event.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FeedSource = 'gremio' | 'dm' | 'evento';

export interface FeedItem {
  id: string;
  source: FeedSource;
  title: string | null;
  body: string | null;
  tags: string[];
  sortAt: string; // ISO string — normalized recency key (ADR-5)
  sealedStatus?: 'confirmed' | 'debunked' | null;
  visibility: string;
  refEntityKind?: string | null;
  refEntityId?: string | null;
  authorUserId?: string | null;
  /**
   * Back-link to the source bitácora page when this contribution was created
   * via the personal-share path. null for non-share contributions.
   * Used by feed-card to show "Bitácora" badge (ADR-7, REQ-SHARE-07).
   */
  sourceBitacoraPageId?: string | null;
}

export interface AggregateGuildFeedOptions {
  worldId: string;
  access: WorldAccess;
  userId: string;
  tag?: string;
  source?: FeedSource;
  limit?: number;
  offset?: number;
}

export interface AggregateGuildFeedResult {
  rows: FeedItem[];
  pageCount: number;
  nextOffset: number | null;
}

// ---------------------------------------------------------------------------
// Normalization helpers
// ---------------------------------------------------------------------------

function normalizeContribution(
  row: ReturnType<typeof Object.assign> & {
    id: string;
    worldId: string;
    authorUserId: string;
    contributionType: string;
    body: string;
    title: string | null;
    refEntityKind: string | null;
    refEntityId: string | null;
    sealedStatus: string | null;
    visibility: string;
    occurredAt: Date;
    createdAt: Date;
    tags: string[];
    sourceBitacoraPageId?: string | null;
  },
): FeedItem {
  return {
    id: row.id,
    source: 'gremio',
    // ADR-3 (bitacora-personal-share): carry title from guild_contributions row.
    // Legacy rows have title=NULL (pre-migration), which normalizes to null — no regression.
    title: row.title ?? null,
    body: row.body,
    tags: row.tags ?? [],
    sortAt: row.occurredAt.toISOString(),
    sealedStatus: row.sealedStatus as 'confirmed' | 'debunked' | null,
    visibility: row.visibility,
    refEntityKind: row.refEntityKind,
    refEntityId: row.refEntityId,
    authorUserId: row.authorUserId,
    // ADR-7: thread sourceBitacoraPageId for badge differentiation in feed-card.
    sourceBitacoraPageId: row.sourceBitacoraPageId ?? null,
  };
}

function normalizeJournalEntry(row: LoadedJournalEntry): FeedItem {
  return {
    id: row.id,
    source: 'dm',
    title: row.title,
    body: row.body,
    tags: row.tags ?? [],
    sortAt: row.updatedAt.toISOString(), // journal uses updatedAt (ADR-5 documented divergence)
    visibility: row.visibility,
    authorUserId: row.authorUserId,
  };
}

function normalizeWorldEvent(
  row: Omit<LoadedWorldEvent, 'dmNotes'> & { dmNotes?: string | null },
): FeedItem {
  return {
    id: row.id,
    source: 'evento',
    title: row.title,
    body: row.description ?? null,
    tags: row.tags ?? [],
    sortAt: row.occurredAt.toISOString(),
    visibility: row.visibility,
  };
}

// ---------------------------------------------------------------------------
// Main use-case
// ---------------------------------------------------------------------------

export async function aggregateGuildFeed(
  opts: AggregateGuildFeedOptions,
): Promise<AggregateGuildFeedResult> {
  const { worldId, access, userId, tag, source, offset = 0 } = opts;
  const limit = Math.min(opts.limit ?? 50, 200);

  // Over-fetch enough rows from each source to fill the merged page after sort.
  // Fetch offset+limit+1 rows so we can detect if more rows exist beyond the current page.
  // The +1 sentinel lets us compute nextOffset without a separate COUNT query.
  const fetchLimit = offset + limit + 1;

  const viewerRole: 'gm' | 'player' = access === 'gm' ? 'gm' : 'player';

  // ── guild_contributions ───────────────────────────────────────────────────

  let gcItems: FeedItem[] = [];
  if (!source || source === 'gremio') {
    const gcConditions = [eq(guildContributions.worldId, worldId)];
    if (tag) gcConditions.push(arrayContains(guildContributions.tags, [tag]));

    const gcRows = await db
      .select()
      .from(guildContributions)
      .where(and(...gcConditions))
      .orderBy(desc(guildContributions.occurredAt))
      .limit(fetchLimit);

    // Apply domain visibility filter BEFORE merge (ADR-3 — no leak)
    gcItems = gcRows
      .filter((row) =>
        isVisibleTo(
          {
            visibility: row.visibility as 'personal' | 'guild' | 'canonical',
            authorUserId: row.authorUserId,
            sealedStatus: row.sealedStatus as 'confirmed' | 'debunked' | null,
          },
          { userId, role: viewerRole },
        ),
      )
      .map((row) => normalizeContribution(row as Parameters<typeof normalizeContribution>[0]));
  }

  // ── journal_entries ───────────────────────────────────────────────────────

  let journalItems: FeedItem[] = [];
  if (!source || source === 'dm') {
    const journalList = await listJournalEntries({
      worldId,
      ...(tag ? { tag } : {}),
      limit: fetchLimit,
    });

    // Apply journal access filter BEFORE merge (ADR-3)
    journalItems = filterJournalByAccess(journalList, access).map(normalizeJournalEntry);
  }

  // ── world_events ──────────────────────────────────────────────────────────

  let eventItems: FeedItem[] = [];
  if (!source || source === 'evento') {
    const eventList = await listWorldEvents({
      worldId,
      ...(tag ? { tag } : {}),
      limit: fetchLimit,
    });

    // Apply world event access filter BEFORE merge (ADR-3)
    eventItems = filterWorldEventsByAccess(eventList, access).map(normalizeWorldEvent);
  }

  // ── Merge, sort DESC, paginate ────────────────────────────────────────────

  const merged = [...gcItems, ...journalItems, ...eventItems].sort((a, b) =>
    b.sortAt < a.sortAt ? -1 : b.sortAt > a.sortAt ? 1 : 0,
  );

  // The merged array may contain up to fetchLimit rows (sentinel included).
  // hasMore: if merged has MORE rows than offset+limit, there's a next page.
  const hasMore = merged.length > offset + limit;
  const sliced = merged.slice(offset, offset + limit);
  // pageCount = rows on THIS page (not the aggregate total — semantics clarified REQ-FEED-01)
  const pageCount = sliced.length;
  const nextOffset = hasMore ? offset + limit : null;

  return { rows: sliced, pageCount, nextOffset };
}
