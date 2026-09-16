/**
 * feed-cursor — total order comparator + opaque keyset cursor codec for the
 * unified guild bitácora feed.
 *
 * feed-keyset-pagination design (decided design, implemented as specified):
 *
 * Total order: `sortAt DESC, sourceRank ASC, id DESC`, where sourceRank is
 * gremio=0, dm=1, evento=2. This is the SAME comparator used for both the
 * in-memory merge sort (aggregate-guild-feed.ts) and the cursor tie-break
 * predicate below, so the two can never drift apart.
 *
 * Cursor: an opaque token the client round-trips without interpreting —
 * base64url of `JSON.stringify({ ts, s, id })`, where `ts` is the ISO
 * `sortAt` of the row, `s` is its FeedSource, and `id` is its row id.
 */

import { and, eq, lt, lte, or, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

export type FeedSource = 'gremio' | 'dm' | 'evento';

/** gremio=0, dm=1, evento=2 (feed-keyset-pagination design). */
export const FEED_SOURCE_RANK: Record<FeedSource, number> = {
  gremio: 0,
  dm: 1,
  evento: 2,
};

export interface FeedCursor {
  ts: string; // ISO sortAt
  s: FeedSource;
  id: string;
}

/**
 * Structural shape shared with FeedItem (aggregate-guild-feed.ts). Kept
 * structural rather than importing FeedItem to avoid a circular import
 * between this module and aggregate-guild-feed.ts.
 */
export interface FeedCursorSource {
  sortAt: string;
  source: FeedSource;
  id: string;
}

/**
 * Total order comparator for the merged feed: `sortAt DESC, sourceRank ASC,
 * id DESC`. Used for BOTH the merge sort and the cursor comparison.
 */
export function compareFeedItems(a: FeedCursorSource, b: FeedCursorSource): number {
  if (a.sortAt !== b.sortAt) return a.sortAt < b.sortAt ? 1 : -1; // DESC
  const rankDiff = FEED_SOURCE_RANK[a.source] - FEED_SOURCE_RANK[b.source]; // ASC
  if (rankDiff !== 0) return rankDiff;
  if (a.id === b.id) return 0;
  return a.id < b.id ? 1 : -1; // DESC
}

export function encodeFeedCursor(item: FeedCursorSource): string {
  const payload: FeedCursor = { ts: item.sortAt, s: item.source, id: item.id };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

const VALID_FEED_SOURCES: ReadonlySet<string> = new Set<FeedSource>(['gremio', 'dm', 'evento']);

/**
 * Decodes an opaque feed cursor token. NEVER throws — returns null for any
 * malformed input (bad base64, bad JSON, missing fields, or an unknown
 * source). A null result is a client error (400 VALIDATION_FAILED at the
 * route), never a 500.
 */
export function decodeFeedCursor(raw: string): FeedCursor | null {
  let json: string;
  try {
    json = Buffer.from(raw, 'base64url').toString('utf8');
  } catch {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null) return null;
  const candidate = parsed as Record<string, unknown>;
  const { ts, s, id } = candidate;

  if (typeof ts !== 'string' || ts.length === 0) return null;
  if (typeof id !== 'string' || id.length === 0) return null;
  if (typeof s !== 'string' || !VALID_FEED_SOURCES.has(s)) return null;

  // `ts` must parse to a real instant — a structurally valid but unparseable
  // (or out-of-range) date string must never reach buildFeedCursorCondition's
  // `new Date(cursor.ts)`, because the pg driver serializes a Date via
  // toISOString(), which throws RangeError on an Invalid Date — a 500 on
  // client input, exactly what this decoder exists to rule out.
  const parsedTs = new Date(ts);
  if (Number.isNaN(parsedTs.getTime())) return null;
  // Exact round-trip, not just "parseable": encodeFeedCursor always writes
  // toISOString() output, and cursors are opaque tokens the client only ever
  // round-trips back to us (never authors by hand) — so a legitimate cursor's
  // `ts` is always already in that exact canonical form. Requiring the match
  // rejects any hand-crafted timestamp spelling (missing milliseconds, an
  // explicit +00:00 offset, etc.) without rejecting anything we ourselves
  // ever issue.
  if (parsedTs.toISOString() !== ts) return null;

  return { ts, s: s as FeedSource, id };
}

/**
 * Builds the per-source keyset predicate for one source's query, given the
 * decoded cursor and that source's rank relative to the cursor row's own
 * source rank:
 *
 *   r === rc → col < ts OR (col = ts AND id < cursorId)
 *   r  >  rc → col <= ts
 *   r  <  rc → col < ts
 *
 * Returns undefined when no cursor is supplied — nothing to AND into the
 * query, and the legacy offset path never calls this.
 */
export function buildFeedCursorCondition(
  cursor: FeedCursor | null | undefined,
  sourceRank: number,
  column: AnyPgColumn,
  idColumn: AnyPgColumn,
): SQL | undefined {
  if (!cursor) return undefined;
  const ts = new Date(cursor.ts);
  const rc = FEED_SOURCE_RANK[cursor.s];

  if (sourceRank === rc) {
    return or(lt(column, ts), and(eq(column, ts), lt(idColumn, cursor.id)));
  }
  if (sourceRank > rc) {
    return lte(column, ts);
  }
  return lt(column, ts);
}
