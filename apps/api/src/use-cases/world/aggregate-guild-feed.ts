/**
 * aggregateGuildFeed — unified guild bitácora feed read use-case.
 *
 * bitacora-gremio W4, ADR-1 (server-side thin union use-case).
 * REQ-GREM-FD-01, REQ-GREM-FD-03.
 * feed-keyset-pagination: adds keyset (cursor) pagination alongside the
 * legacy offset path (kept for the manual-deploy window — see ADR notes below).
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
 * Pagination — TWO paths, both supported simultaneously during the deploy window
 * (web deploys automatically on merge to main; the API deploys manually):
 *
 *   - `offset` (legacy, @deprecated): offset-based over the merged slice, using
 *     only `sortAt` for ordering (no total order — ties fall back to array
 *     insertion order). Kept BEHAVIOURALLY UNTOUCHED so the currently-live web
 *     app keeps working against the new API during the window.
 *   - `cursor` (feed-keyset-pagination): keyset pagination over the total order
 *     `sortAt DESC, sourceRank ASC, id DESC` (see feed-cursor.ts). Correct under
 *     concurrent writes — no skips/duplicates when rows are inserted (or, for
 *     journal entries, edited) between pages.
 *
 * When `cursor` is provided it wins and the offset branch is not used. `nextCursor`
 * is ALWAYS returned (both paths) so a client can migrate from offset to cursor
 * paging by switching which field it reads.
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
import { resolveFeedEntityNames } from './resolve-feed-entity-names.js';
import {
  buildFeedCursorCondition,
  compareFeedItems,
  decodeFeedCursor,
  encodeFeedCursor,
  FEED_SOURCE_RANK,
  type FeedCursor,
  type FeedSource,
} from './feed-cursor.js';

// Re-exported for existing callers (e.g. the cronica-feed route) — feed-cursor.ts
// is the canonical source of truth for FeedSource, decodeFeedCursor and encodeFeedCursor.
export type { FeedSource } from './feed-cursor.js';
export { decodeFeedCursor, encodeFeedCursor };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
  /**
   * Entity source — book identifier for bestiary (e.g. 'MM', 'PHB') or 'world' for
   * UUID kinds (npc/faction/location). Null for legacy rows without a ref.
   * guild-feed-linked-entity-refs REQ-GFLE-04, design ADR-7.
   */
  refEntitySource?: string | null;
  /**
   * Sanitized display name resolved by resolveFeedEntityNames.
   * Null when the entity cannot be resolved (deleted/unknown).
   * NEVER contains dmNotes or parentHexStatus — ADR-6.
   * guild-feed-linked-entity-refs REQ-GFLE-05, design ADR-4.
   */
  refEntityName?: string | null;
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
  /**
   * @deprecated Retained only for the manual-API-deploy window (feed-keyset-pagination).
   * Prefer `cursor`. Ignored when `cursor` is provided.
   */
  offset?: number;
  /**
   * feed-keyset-pagination: opaque cursor token from a previous page's
   * `nextCursor` (see encodeFeedCursor/decodeFeedCursor in feed-cursor.ts).
   * When present, wins over `offset` and the legacy offset branch is skipped.
   */
  cursor?: string;
}

export interface AggregateGuildFeedResult {
  rows: FeedItem[];
  pageCount: number;
  /**
   * @deprecated Retained only for the manual-API-deploy window (feed-keyset-pagination).
   * Prefer `nextCursor`.
   */
  nextOffset: number | null;
  /** feed-keyset-pagination: opaque cursor for the next page. Always populated (both paths). */
  nextCursor: string | null;
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
    refEntitySource?: string | null;
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
    // guild-feed-linked-entity-refs: carry refEntitySource for monster disambiguation (ADR-7).
    // Legacy rows have refEntitySource=NULL — graceful read-path tolerance.
    refEntitySource: row.refEntitySource ?? null,
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

  // feed-keyset-pagination: `cursor` wins over `offset` when present. A malformed
  // cursor decodes to null and falls back to the legacy offset branch below —
  // the route is expected to reject a malformed cursor with 400 before this is
  // ever reached, but this keeps the use-case itself total.
  const decodedCursor: FeedCursor | null = opts.cursor ? decodeFeedCursor(opts.cursor) : null;

  const viewerRole: 'gm' | 'player' = access === 'gm' ? 'gm' : 'player';

  let gcItems: FeedItem[] = [];
  let journalItems: FeedItem[] = [];
  let eventItems: FeedItem[] = [];
  let hasMore: boolean;
  let sliced: FeedItem[];
  let nextOffset: number | null;

  if (decodedCursor) {
    // ── Keyset (cursor) path — feed-keyset-pagination ─────────────────────
    // Each source fetches exactly limit+1 rows, ordered by its own timestamp
    // column DESC, id DESC, restricted by the per-source cursor predicate
    // (feed-cursor.ts). Merging with the shared total-order comparator and
    // slicing to `limit` is what makes this correct with no over-fetching.
    const fetchLimit = limit + 1;

    // ── guild_contributions ─────────────────────────────────────────────
    if (!source || source === 'gremio') {
      const gcConditions = [eq(guildContributions.worldId, worldId)];
      if (tag) gcConditions.push(arrayContains(guildContributions.tags, [tag]));
      const cursorCondition = buildFeedCursorCondition(
        decodedCursor,
        FEED_SOURCE_RANK.gremio,
        guildContributions.occurredAt,
        guildContributions.id,
      );
      if (cursorCondition) gcConditions.push(cursorCondition);

      const gcRows = await db
        .select()
        .from(guildContributions)
        .where(and(...gcConditions))
        .orderBy(desc(guildContributions.occurredAt), desc(guildContributions.id))
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

    // ── journal_entries ─────────────────────────────────────────────────
    if (!source || source === 'dm') {
      const journalList = await listJournalEntries({
        worldId,
        ...(tag ? { tag } : {}),
        limit: fetchLimit,
        cursor: decodedCursor,
      });

      // Apply journal access filter BEFORE merge (ADR-3)
      journalItems = filterJournalByAccess(journalList, access).map(normalizeJournalEntry);
    }

    // ── world_events ────────────────────────────────────────────────────
    if (!source || source === 'evento') {
      const eventList = await listWorldEvents({
        worldId,
        ...(tag ? { tag } : {}),
        limit: fetchLimit,
        cursor: decodedCursor,
      });

      // Apply world event access filter BEFORE merge (ADR-3)
      eventItems = filterWorldEventsByAccess(eventList, access).map(normalizeWorldEvent);
    }

    // ── Merge with the shared total-order comparator, paginate ───────────
    const merged = [...gcItems, ...journalItems, ...eventItems].sort(compareFeedItems);
    hasMore = merged.length > limit;
    sliced = merged.slice(0, limit);
    // Offset semantics don't apply to the keyset path — the cursor is the source of truth.
    nextOffset = null;
  } else {
    // ── Legacy offset path — BEHAVIOURALLY UNTOUCHED (deploy-window compat) ─

    // Over-fetch enough rows from each source to fill the merged page after sort.
    // Fetch offset+limit+1 rows so we can detect if more rows exist beyond the current page.
    // The +1 sentinel lets us compute nextOffset without a separate COUNT query.
    const fetchLimit = offset + limit + 1;

    // ── guild_contributions ───────────────────────────────────────────────────

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
    hasMore = merged.length > offset + limit;
    sliced = merged.slice(offset, offset + limit);
    nextOffset = hasMore ? offset + limit : null;
  }

  // pageCount = rows on THIS page (not the aggregate total — semantics clarified REQ-FEED-01)
  const pageCount = sliced.length;
  // feed-keyset-pagination: ALWAYS populate nextCursor (both paths) from the
  // actual last row of this page, so a client can migrate from offset to
  // cursor paging by switching which field it reads.
  const nextCursor = hasMore && sliced.length > 0 ? encodeFeedCursor(sliced[sliced.length - 1]!) : null;

  // ── Entity name resolution (guild-feed-linked-entity-refs) ────────────────
  // Resolve (refEntityKind, refEntityId, refEntitySource) → sanitized name for the sliced page.
  // Only resolve sliced rows (bounded N), not the full fetched set.
  // ADR-4: batch resolver — one query per kind, not per-item. ADR-6: dmNotes/parentHexStatus stripped.
  const refsToResolve = sliced
    .filter((item) => item.refEntityKind && item.refEntityId && item.refEntitySource)
    .map((item) => ({
      kind: item.refEntityKind!,
      id: item.refEntityId!,
      source: item.refEntitySource!,
    }));

  let nameMap = new Map<string, string | null>();
  if (refsToResolve.length > 0) {
    nameMap = await resolveFeedEntityNames(worldId, refsToResolve);
  }

  // Attach refEntityName to each sliced FeedItem
  const rows = sliced.map((item) => {
    if (item.refEntityKind && item.refEntityId && item.refEntitySource) {
      const key = `${item.refEntityKind}|${item.refEntityId}|${item.refEntitySource}`;
      return { ...item, refEntityName: nameMap.get(key) ?? null };
    }
    return { ...item, refEntityName: null };
  });

  return { rows, pageCount, nextOffset, nextCursor };
}
