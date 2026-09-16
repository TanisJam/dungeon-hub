import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';
import { createWorldWithGm } from '../helpers/create-world-with-gm.js';
import { addWorldMember } from '../helpers/add-world-member.js';

/**
 * cronica-feed — unified guild feed aggregation + VISIBILITY LEAK test.
 *
 * Strict TDD: these tests are written FIRST (RED) before implementation.
 * bitacora-gremio W4:
 *   REQ-GREM-FD-01: unified feed aggregates 3 sources
 *   REQ-GREM-FD-03: ?tag= filters all sources
 *   ADR-3: per-source visibility BEFORE merge — MANDATORY visibility leak test
 *
 * CRITICAL: Player B MUST NOT see Player A's personal contributions OR dm-only
 * journal entries via GET /cronica-feed (the visibility-leak test).
 */
describe('cronica-feed — unified feed + visibility leak (REQ-GREM-FD-01, ADR-3)', () => {
  let dm: TestUser;
  let playerA: TestUser;
  let playerB: TestUser;
  let worldId: string;

  beforeAll(async () => {
    dm = await createTestUser();
    playerA = await createTestUser();
    playerB = await createTestUser();
    ({ worldId } = await createWorldWithGm(dm.id));
    await addWorldMember(worldId, playerA.id, 'player');
    await addWorldMember(worldId, playerB.id, 'player');
  });

  afterAll(async () => {
    if (dm) await deleteTestUser(dm.id);
    if (playerA) await deleteTestUser(playerA.id);
    if (playerB) await deleteTestUser(playerB.id);
    await closeTestApp();
  });

  async function getFeed(token: string, params: Record<string, string> = {}, wid = worldId) {
    const app = await getTestApp();
    const qs = new URLSearchParams(params).toString();
    return app.inject({
      method: 'GET',
      url: `/api/v1/worlds/${wid}/cronica-feed${qs ? `?${qs}` : ''}`,
      headers: { authorization: `Bearer ${token}` },
    });
  }

  async function createContribution(token: string, payload: Record<string, unknown>) {
    const app = await getTestApp();
    return app.inject({
      method: 'POST',
      url: `/api/v1/worlds/${worldId}/contributions`,
      headers: { authorization: `Bearer ${token}` },
      payload,
    });
  }

  async function createJournalEntry(token: string, payload: Record<string, unknown>) {
    const app = await getTestApp();
    return app.inject({
      method: 'POST',
      url: `/api/v1/worlds/${worldId}/journal-entries`,
      headers: { authorization: `Bearer ${token}` },
      payload,
    });
  }

  async function createWorldEvent(token: string, payload: Record<string, unknown>) {
    const app = await getTestApp();
    return app.inject({
      method: 'POST',
      url: `/api/v1/worlds/${worldId}/world-events`,
      headers: { authorization: `Bearer ${token}` },
      payload,
    });
  }

  // ── MANDATORY: VISIBILITY LEAK TEST ────────────────────────────────────────

  it('VISIBILITY LEAK: Player B must NOT see Player A personal contribution or dm-only journal entry (ADR-3)', async () => {
    // Player A creates a PERSONAL contribution (only player A should see it)
    const personalContribRes = await createContribution(playerA.accessToken, {
      contributionType: 'nota',
      body: `PlayerA personal — leak test ${Date.now()}`,
      visibility: 'personal',
      tags: [],
    });
    expect(personalContribRes.statusCode).toBe(200);
    const personalContrib = personalContribRes.json();

    // DM creates a dm-only journal entry (only GM should see it)
    const dmOnlyJournalRes = await createJournalEntry(dm.accessToken, {
      title: `DM-only journal entry — leak test ${Date.now()}`,
      body: 'Secret DM note',
      visibility: 'dm-only',
      tags: [],
    });
    expect(dmOnlyJournalRes.statusCode).toBe(201);
    const dmOnlyJournal = dmOnlyJournalRes.json();

    // Player B requests the cronica-feed — MUST NOT see either
    const feedRes = await getFeed(playerB.accessToken);
    expect(feedRes.statusCode).toBe(200);
    const feed = feedRes.json() as { rows: Array<{ id: string; source: string; visibility?: string }> };

    const rowIds = feed.rows.map((r) => r.id);
    expect(rowIds).not.toContain(personalContrib.id);
    expect(rowIds).not.toContain(dmOnlyJournal.id);
  });

  // ── Unified feed renders 3 sources ─────────────────────────────────────────

  it('feed renders entries from all 3 sources (REQ-GREM-FD-01 scenario 1)', async () => {
    // Guild contribution (visible to all)
    await createContribution(playerA.accessToken, {
      contributionType: 'sighting',
      body: `Guild sighting ${Date.now()}`,
      visibility: 'guild',
      tags: [],
    });

    // Public journal entry (DM creates, visible to all)
    await createJournalEntry(dm.accessToken, {
      title: `Public journal ${Date.now()}`,
      body: 'DM public note',
      visibility: 'public',
      tags: [],
    });

    // World event (DM creates, public by default)
    await createWorldEvent(dm.accessToken, {
      title: `World event ${Date.now()}`,
      occurredAt: new Date().toISOString(),
      visibility: 'public',
    });

    const feedRes = await getFeed(dm.accessToken);
    expect(feedRes.statusCode).toBe(200);
    const feed = feedRes.json() as { rows: Array<{ source: string }>; pageCount: number };

    const sources = new Set(feed.rows.map((r) => r.source));
    expect(sources.has('gremio')).toBe(true);
    expect(sources.has('dm')).toBe(true);
    expect(sources.has('evento')).toBe(true);
  });

  // ── ?tag= filter ─────────────────────────────────────────────────────────────

  it('feed?tag=lore returns only lore-tagged entries (REQ-GREM-FD-03)', async () => {
    // Create a lore-tagged guild contribution
    await createContribution(playerA.accessToken, {
      contributionType: 'nota',
      body: `Lore contribution ${Date.now()}`,
      visibility: 'guild',
      tags: ['lore'],
    });

    const feedRes = await getFeed(playerA.accessToken, { tag: 'lore' });
    expect(feedRes.statusCode).toBe(200);
    const feed = feedRes.json() as { rows: Array<{ tags: string[] }>; pageCount: number };
    for (const row of feed.rows) {
      expect(row.tags).toContain('lore');
    }
  });

  // ── ?source= facet ─────────────────────────────────────────────────────────

  it('feed?source=evento returns only world_events rows', async () => {
    await createWorldEvent(dm.accessToken, {
      title: `Facet evento test ${Date.now()}`,
      occurredAt: new Date().toISOString(),
      visibility: 'public',
    });

    const feedRes = await getFeed(dm.accessToken, { source: 'evento' });
    expect(feedRes.statusCode).toBe(200);
    const feed = feedRes.json() as { rows: Array<{ source: string }> };
    for (const row of feed.rows) {
      expect(row.source).toBe('evento');
    }
  });

  it('feed?source=dm returns only journal_entries rows', async () => {
    await createJournalEntry(dm.accessToken, {
      title: `Facet dm test ${Date.now()}`,
      visibility: 'public',
      tags: [],
    });

    const feedRes = await getFeed(dm.accessToken, { source: 'dm' });
    expect(feedRes.statusCode).toBe(200);
    const feed = feedRes.json() as { rows: Array<{ source: string }> };
    for (const row of feed.rows) {
      expect(row.source).toBe('dm');
    }
  });

  it('feed?source=gremio returns only guild_contributions rows', async () => {
    await createContribution(playerA.accessToken, {
      contributionType: 'nota',
      body: `Gremio facet test ${Date.now()}`,
      visibility: 'guild',
      tags: [],
    });

    const feedRes = await getFeed(playerA.accessToken, { source: 'gremio' });
    expect(feedRes.statusCode).toBe(200);
    const feed = feedRes.json() as { rows: Array<{ source: string }> };
    for (const row of feed.rows) {
      expect(row.source).toBe('gremio');
    }
  });

  // ── Empty state ─────────────────────────────────────────────────────────────

  it('empty state: world with no entries → { rows: [], pageCount: 0, nextOffset: null }', async () => {
    // Create a fresh world with just the DM (no entries)
    const emptyDm = await createTestUser();
    const { worldId: emptyWorldId } = await createWorldWithGm(emptyDm.id);

    try {
      const feedRes = await getFeed(emptyDm.accessToken, {}, emptyWorldId);
      expect(feedRes.statusCode).toBe(200);
      const feed = feedRes.json() as { rows: unknown[]; pageCount: number; nextOffset: unknown };
      expect(feed.rows).toEqual([]);
      expect(feed.pageCount).toBe(0);
      expect(feed.nextOffset).toBeNull();
    } finally {
      await deleteTestUser(emptyDm.id);
    }
  });

  // ── Pagination ──────────────────────────────────────────────────────────────

  it('pagination: offset + limit returns correct slice', async () => {
    // Create a few guild contributions for pagination
    for (let i = 0; i < 3; i++) {
      await createContribution(playerA.accessToken, {
        contributionType: 'nota',
        body: `Pagination test contribution ${i} ${Date.now()}`,
        visibility: 'guild',
        tags: [],
      });
    }

    // Get first page (limit 1)
    const page1 = await getFeed(playerA.accessToken, { limit: '1', offset: '0', source: 'gremio' });
    expect(page1.statusCode).toBe(200);
    const p1json = page1.json() as { rows: unknown[]; nextOffset: unknown };
    expect(p1json.rows).toHaveLength(1);
    // nextOffset should be 1 (not null) because there are more entries
    expect(p1json.nextOffset).toBe(1);
  });

  // ── 403 for non-members ─────────────────────────────────────────────────────

  it('GET /cronica-feed → 403 for non-world-member', async () => {
    const outsider = await createTestUser();
    try {
      const feedRes = await getFeed(outsider.accessToken);
      expect(feedRes.statusCode).toBe(403);
    } finally {
      await deleteTestUser(outsider.id);
    }
  });
});

/**
 * cronica-feed — keyset (cursor) pagination.
 *
 * feed-keyset-pagination: replaces offset-based pagination over the merged
 * feed with keyset pagination over the total order `sortAt DESC, sourceRank
 * ASC, id DESC` (feed-cursor.ts), while keeping the legacy `offset` path
 * working (behaviourally untouched) for the manual-API-deploy window.
 *
 * Strict TDD: written FIRST (RED) before the implementation existed.
 *
 * Each test creates its OWN fresh world so accumulated cross-test data never
 * pollutes a round-trip/full-set comparison. Some fixtures are inserted
 * directly via drizzle (bypassing the HTTP write paths) to control exact
 * timestamps for the tie-break tests — journal_entries.updatedAt in
 * particular is never client-settable through the API.
 */
describe('cronica-feed — keyset cursor pagination (feed-keyset-pagination)', () => {
  let dm: TestUser;
  let playerA: TestUser;
  let playerB: TestUser;

  beforeAll(async () => {
    dm = await createTestUser();
    playerA = await createTestUser();
    playerB = await createTestUser();
  });

  afterAll(async () => {
    if (dm) await deleteTestUser(dm.id);
    if (playerA) await deleteTestUser(playerA.id);
    if (playerB) await deleteTestUser(playerB.id);
    await closeTestApp();
  });

  /** Fresh, isolated world per test: dm as GM, playerA/playerB as members. */
  async function freshWorld(): Promise<string> {
    const { worldId } = await createWorldWithGm(dm.id);
    await addWorldMember(worldId, playerA.id, 'player');
    await addWorldMember(worldId, playerB.id, 'player');
    return worldId;
  }

  async function getFeed(token: string, worldId: string, params: Record<string, string> = {}) {
    const app = await getTestApp();
    const qs = new URLSearchParams(params).toString();
    return app.inject({
      method: 'GET',
      url: `/api/v1/worlds/${worldId}/cronica-feed${qs ? `?${qs}` : ''}`,
      headers: { authorization: `Bearer ${token}` },
    });
  }

  async function insertContribution(
    worldId: string,
    authorUserId: string,
    opts: {
      body: string;
      occurredAt: Date;
      visibility?: 'personal' | 'guild' | 'canonical';
      tags?: string[];
    },
  ) {
    const { db } = await import('../../src/infra/db/client.js');
    const { guildContributions } = await import('../../src/infra/db/schema.js');
    const [row] = await db
      .insert(guildContributions)
      .values({
        worldId,
        authorUserId,
        contributionType: 'nota',
        body: opts.body,
        visibility: opts.visibility ?? 'guild',
        tags: opts.tags ?? [],
        occurredAt: opts.occurredAt,
      })
      .returning();
    if (!row) throw new Error('insertContribution: insert returned no row');
    return row;
  }

  async function insertJournalEntry(
    worldId: string,
    authorUserId: string,
    opts: {
      title: string;
      updatedAt: Date;
      visibility?: 'public' | 'dm-only';
      tags?: string[];
    },
  ) {
    const { db } = await import('../../src/infra/db/client.js');
    const { journalEntries } = await import('../../src/infra/db/schema.js');
    const [row] = await db
      .insert(journalEntries)
      .values({
        worldId,
        authorUserId,
        title: opts.title,
        visibility: opts.visibility ?? 'public',
        tags: opts.tags ?? [],
        updatedAt: opts.updatedAt,
      })
      .returning();
    if (!row) throw new Error('insertJournalEntry: insert returned no row');
    return row;
  }

  async function insertWorldEvent(
    worldId: string,
    opts: {
      title: string;
      occurredAt: Date;
      visibility?: 'public' | 'dm-only';
      tags?: string[];
    },
  ) {
    const { db } = await import('../../src/infra/db/client.js');
    const { worldEvents } = await import('../../src/infra/db/schema.js');
    const [row] = await db
      .insert(worldEvents)
      .values({
        worldId,
        title: opts.title,
        visibility: opts.visibility ?? 'public',
        tags: opts.tags ?? [],
        occurredAt: opts.occurredAt,
      })
      .returning();
    if (!row) throw new Error('insertWorldEvent: insert returned no row');
    return row;
  }

  // ── 1. Round-trip ────────────────────────────────────────────────────────

  it('round-trip: paging the whole feed with cursors yields every row exactly once, no dupes, no gaps', async () => {
    const worldId = await freshWorld();
    const base = Date.now();
    const ids: string[] = [];

    for (let i = 0; i < 3; i++) {
      const row = await insertContribution(worldId, playerA.id, {
        body: `RT gremio ${i}`,
        occurredAt: new Date(base - i * 60_000),
      });
      ids.push(row.id);
    }
    for (let i = 0; i < 3; i++) {
      const row = await insertJournalEntry(worldId, dm.id, {
        title: `RT journal ${i}`,
        updatedAt: new Date(base - 500 - i * 60_000),
      });
      ids.push(row.id);
    }
    for (let i = 0; i < 2; i++) {
      const row = await insertWorldEvent(worldId, {
        title: `RT event ${i}`,
        occurredAt: new Date(base - 1_000 - i * 60_000),
      });
      ids.push(row.id);
    }

    // The full unpaginated set (one page, limit large enough for all 8 rows).
    const fullRes = await getFeed(dm.accessToken, worldId, { limit: '100' });
    expect(fullRes.statusCode).toBe(200);
    const full = fullRes.json() as { rows: Array<{ id: string }> };
    expect(full.rows.map((r) => r.id).sort()).toEqual([...ids].sort());

    // Paged with cursors, limit=3, until nextCursor is null.
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let guard = 0; guard < 10; guard++) {
      const params: Record<string, string> = { limit: '3' };
      if (cursor) params.cursor = cursor;
      const res = await getFeed(dm.accessToken, worldId, params);
      expect(res.statusCode).toBe(200);
      const page = res.json() as { rows: Array<{ id: string }>; nextCursor: string | null };
      seen.push(...page.rows.map((r) => r.id));
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }

    expect(seen.sort()).toEqual([...ids].sort());
    expect(new Set(seen).size).toBe(seen.length); // no duplicates
  });

  // ── 2. Stability under insert (THE test that justifies this change) ───────

  it('stability under insert: cursor page 2 has no dupes/skips after an insert; the legacy offset path duplicates', async () => {
    const worldId = await freshWorld();
    const base = Date.now();

    const c1 = await insertContribution(worldId, playerA.id, {
      body: 'Stab C1',
      occurredAt: new Date(base - 60_000),
    });
    const c2 = await insertContribution(worldId, playerA.id, {
      body: 'Stab C2',
      occurredAt: new Date(base - 120_000),
    });
    const c3 = await insertContribution(worldId, playerA.id, {
      body: 'Stab C3',
      occurredAt: new Date(base - 180_000),
    });

    // Page 1, both styles, taken BEFORE the insert.
    const cursorPage1 = await getFeed(dm.accessToken, worldId, { limit: '2', source: 'gremio' });
    expect(cursorPage1.statusCode).toBe(200);
    const cp1 = cursorPage1.json() as {
      rows: Array<{ id: string }>;
      nextCursor: string | null;
    };
    expect(cp1.rows.map((r) => r.id)).toEqual([c1.id, c2.id]);
    expect(typeof cp1.nextCursor).toBe('string');

    const offsetPage1 = await getFeed(dm.accessToken, worldId, {
      limit: '2',
      offset: '0',
      source: 'gremio',
    });
    expect(offsetPage1.statusCode).toBe(200);
    const op1 = offsetPage1.json() as {
      rows: Array<{ id: string }>;
      nextOffset: number | null;
    };
    expect(op1.rows.map((r) => r.id)).toEqual([c1.id, c2.id]);
    expect(op1.nextOffset).toBe(2);

    // A NEW, newer contribution lands between page 1 and page 2 — the normal
    // case for a guild feed that receives writes, not an edge case.
    await insertContribution(worldId, playerA.id, {
      body: 'Stab C0 NEW',
      occurredAt: new Date(base + 60_000),
    });

    // Cursor-based page 2: strictly the rows after c2 in the total order — no
    // dupes (c1/c2 do not reappear), no skips (c3 is present).
    const cursorPage2 = await getFeed(dm.accessToken, worldId, {
      limit: '2',
      source: 'gremio',
      cursor: cp1.nextCursor!,
    });
    expect(cursorPage2.statusCode).toBe(200);
    const cp2 = cursorPage2.json() as { rows: Array<{ id: string }> };
    const cursorPage2Ids = cp2.rows.map((r) => r.id);
    expect(cursorPage2Ids).toEqual([c3.id]);
    expect(cursorPage2Ids).not.toContain(c1.id);
    expect(cursorPage2Ids).not.toContain(c2.id);

    // Offset-based page 2, re-using the now-stale nextOffset=2: the insert
    // shifted every subsequent row down by one, so this DUPLICATES c2 (already
    // shown on page 1). This is exactly the defect feed-keyset-pagination fixes —
    // documented here, not asserted as desirable, but it IS the known-bad legacy
    // behaviour that justifies the change.
    const offsetPage2 = await getFeed(dm.accessToken, worldId, {
      limit: '2',
      offset: String(op1.nextOffset),
      source: 'gremio',
    });
    expect(offsetPage2.statusCode).toBe(200);
    const op2 = offsetPage2.json() as { rows: Array<{ id: string }> };
    expect(op2.rows.map((r) => r.id)).toContain(c2.id);
  });

  // ── 3. Exact-timestamp ties across sources ─────────────────────────────────

  it('exact-timestamp ties across sources: gremio, dm, evento tie-break by sourceRank ascending', async () => {
    const worldId = await freshWorld();
    const tieAt = new Date('2030-01-01T12:00:00.000Z');

    // An anchor row strictly NEWER than the tied trio. A request with no `cursor`
    // always takes the legacy offset branch (by design — see the module doc on
    // aggregateGuildFeed), which has no total-order tiebreak for ties. The anchor
    // is unambiguously first regardless of tiebreak, so page 0 is deterministic;
    // its nextCursor is what puts every following page on the real keyset path,
    // where the tie order is actually guaranteed.
    const anchor = await insertContribution(worldId, dm.id, {
      body: 'Tie anchor (newer than the tie)',
      occurredAt: new Date(tieAt.getTime() + 60_000),
      visibility: 'guild',
    });

    const contrib = await insertContribution(worldId, dm.id, {
      body: 'Tie gremio',
      occurredAt: tieAt,
      visibility: 'guild',
    });
    const journal = await insertJournalEntry(worldId, dm.id, {
      title: 'Tie dm',
      updatedAt: tieAt,
      visibility: 'public',
    });
    const event = await insertWorldEvent(worldId, {
      title: 'Tie evento',
      occurredAt: tieAt,
      visibility: 'public',
    });

    const page0 = await getFeed(dm.accessToken, worldId, { limit: '1' });
    expect(page0.statusCode).toBe(200);
    const p0 = page0.json() as { rows: Array<{ id: string }>; nextCursor: string | null };
    expect(p0.rows.map((r) => r.id)).toEqual([anchor.id]);
    expect(typeof p0.nextCursor).toBe('string');

    const seenOrder: Array<{ id: string; source: string }> = [];
    let cursor: string | undefined = p0.nextCursor!;
    for (let i = 0; i < 3; i++) {
      const res = await getFeed(dm.accessToken, worldId, { limit: '1', cursor: cursor! });
      expect(res.statusCode).toBe(200);
      const page = res.json() as {
        rows: Array<{ id: string; source: string }>;
        nextCursor: string | null;
      };
      expect(page.rows).toHaveLength(1);
      seenOrder.push(page.rows[0]!);
      cursor = page.nextCursor ?? undefined;
    }

    expect(seenOrder.map((r) => r.id)).toEqual([contrib.id, journal.id, event.id]);
    expect(seenOrder.map((r) => r.source)).toEqual(['gremio', 'dm', 'evento']);
  });

  // ── 4. Exact-timestamp ties within one source ──────────────────────────────

  it('exact-timestamp ties within one source: two contributions with an identical occurredAt both come back exactly once (id DESC tiebreak)', async () => {
    const worldId = await freshWorld();
    const tieAt = new Date('2030-02-01T12:00:00.000Z');

    // Same rationale as the cross-source tie test: a `cursor`-less request always
    // takes the legacy offset branch (no total-order tiebreak — see the module doc
    // on aggregateGuildFeed), so an anchor strictly newer than the tie is needed to
    // deterministically reach page 0, and its nextCursor is what puts page 1+ on
    // the real keyset path where the id DESC tiebreak is actually guaranteed.
    const anchor = await insertContribution(worldId, dm.id, {
      body: 'Tie anchor (newer than the tie)',
      occurredAt: new Date(tieAt.getTime() + 60_000),
      visibility: 'guild',
    });
    const rowA = await insertContribution(worldId, dm.id, {
      body: 'Tie same A',
      occurredAt: tieAt,
      visibility: 'guild',
    });
    const rowB = await insertContribution(worldId, dm.id, {
      body: 'Tie same B',
      occurredAt: tieAt,
      visibility: 'guild',
    });
    const [second, first] = [rowA.id, rowB.id].sort(); // ascending → id DESC order is [first, second]

    const page0 = await getFeed(dm.accessToken, worldId, { limit: '1', source: 'gremio' });
    expect(page0.statusCode).toBe(200);
    const p0 = page0.json() as { rows: Array<{ id: string }>; nextCursor: string | null };
    expect(p0.rows.map((r) => r.id)).toEqual([anchor.id]);
    expect(typeof p0.nextCursor).toBe('string');

    const page1 = await getFeed(dm.accessToken, worldId, {
      limit: '1',
      source: 'gremio',
      cursor: p0.nextCursor!,
    });
    expect(page1.statusCode).toBe(200);
    const p1 = page1.json() as { rows: Array<{ id: string }>; nextCursor: string | null };
    expect(p1.rows.map((r) => r.id)).toEqual([first]);
    expect(typeof p1.nextCursor).toBe('string');

    const page2 = await getFeed(dm.accessToken, worldId, {
      limit: '1',
      source: 'gremio',
      cursor: p1.nextCursor!,
    });
    expect(page2.statusCode).toBe(200);
    const p2 = page2.json() as { rows: Array<{ id: string }>; nextCursor: string | null };
    expect(p2.rows.map((r) => r.id)).toEqual([second]);
    expect(p2.nextCursor).toBeNull();
  });

  // ── 5. Malformed cursor → 400, never 500 ───────────────────────────────────

  describe('malformed cursor → 400 VALIDATION_FAILED (FEED_CURSOR_INVALID), never 500', () => {
    const cases: Array<[string, string]> = [
      ['not base64 at all', '!!!not-a-valid-token!!!'],
      [
        'valid base64url of non-JSON text',
        Buffer.from('just some plain text, not json', 'utf8').toString('base64url'),
      ],
      [
        'valid JSON missing id',
        Buffer.from(
          JSON.stringify({ ts: '2024-01-01T00:00:00.000Z', s: 'gremio' }),
          'utf8',
        ).toString('base64url'),
      ],
      [
        'JSON with an unknown source',
        Buffer.from(
          JSON.stringify({ ts: '2024-01-01T00:00:00.000Z', s: 'bogus', id: 'x' }),
          'utf8',
        ).toString('base64url'),
      ],
      [
        'JSON with a ts that is not a parseable date',
        Buffer.from(
          JSON.stringify({ ts: 'not-a-date', s: 'gremio', id: 'x' }),
          'utf8',
        ).toString('base64url'),
      ],
      [
        'JSON with a ts that is a numerically-shaped but invalid instant',
        Buffer.from(
          JSON.stringify({ ts: '2024-13-45T99:99:99Z', s: 'gremio', id: 'x' }),
          'utf8',
        ).toString('base64url'),
      ],
    ];

    it.each(cases)('%s', async (_label, badCursor) => {
      const worldId = await freshWorld();
      const res = await getFeed(dm.accessToken, worldId, { cursor: badCursor });
      expect(res.statusCode).toBe(400);
      const body = res.json() as { error: string; issues: Array<{ code: string; got: string }> };
      expect(body.error).toBe('VALIDATION_FAILED');
      expect(body.issues[0]?.code).toBe('FEED_CURSOR_INVALID');
      expect(body.issues[0]?.got).toBe(badCursor);
    });
  });

  // ── 6. Legacy offset path unchanged ────────────────────────────────────────

  it('legacy offset path (no cursor param) stays behaviourally unchanged and also returns nextCursor', async () => {
    const worldId = await freshWorld();
    const base = Date.now();
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const row = await insertContribution(worldId, playerA.id, {
        body: `Legacy ${i}`,
        occurredAt: new Date(base - i * 60_000),
      });
      ids.push(row.id);
    }

    const page1 = await getFeed(dm.accessToken, worldId, {
      limit: '2',
      offset: '0',
      source: 'gremio',
    });
    expect(page1.statusCode).toBe(200);
    const p1 = page1.json() as {
      rows: Array<{ id: string }>;
      nextOffset: number | null;
      nextCursor: string | null;
    };
    expect(p1.rows.map((r) => r.id)).toEqual([ids[0], ids[1]]);
    expect(p1.nextOffset).toBe(2);
    // feed-keyset-pagination: ALWAYS populated (both paths) — asserted as an actual
    // string, not just "not null", so an absent field can't pass vacuously.
    expect(typeof p1.nextCursor).toBe('string');

    const page2 = await getFeed(dm.accessToken, worldId, {
      limit: '2',
      offset: '2',
      source: 'gremio',
    });
    expect(page2.statusCode).toBe(200);
    const p2 = page2.json() as { rows: Array<{ id: string }>; nextOffset: number | null };
    expect(p2.rows.map((r) => r.id)).toEqual([ids[2]]);
    expect(p2.nextOffset).toBeNull();
  });

  // ── 7. Cursor respects ?tag= and ?source= filters ──────────────────────────

  it('cursor pagination respects ?tag= and ?source= filters across pages — no leakage from outside the filter', async () => {
    const worldId = await freshWorld();
    const base = Date.now();
    const loreIds: string[] = [];

    for (let i = 0; i < 3; i++) {
      const row = await insertContribution(worldId, playerA.id, {
        body: `Lore ${i}`,
        occurredAt: new Date(base - i * 60_000),
        tags: ['lore'],
      });
      loreIds.push(row.id);
    }
    // Noise rows that must NOT leak into a ?tag=lore&source=gremio page.
    await insertContribution(worldId, playerA.id, {
      body: 'No tag',
      occurredAt: new Date(base + 60_000),
      tags: [],
    });
    await insertJournalEntry(worldId, dm.id, {
      title: 'Untagged journal',
      updatedAt: new Date(base - 30_000),
    });
    await insertWorldEvent(worldId, {
      title: 'Untagged event',
      occurredAt: new Date(base - 45_000),
    });

    const seen: string[] = [];
    let cursor: string | undefined;
    for (let guard = 0; guard < 10; guard++) {
      const params: Record<string, string> = { limit: '1', tag: 'lore', source: 'gremio' };
      if (cursor) params.cursor = cursor;
      const res = await getFeed(dm.accessToken, worldId, params);
      expect(res.statusCode).toBe(200);
      const page = res.json() as {
        rows: Array<{ id: string; tags: string[]; source: string }>;
        nextCursor: string | null;
      };
      for (const row of page.rows) {
        expect(row.source).toBe('gremio');
        expect(row.tags).toContain('lore');
      }
      seen.push(...page.rows.map((r) => r.id));
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }

    expect(seen.sort()).toEqual([...loreIds].sort());
  });

  // ── 8. Visibility is not bypassed by the cursor ────────────────────────────

  it('visibility is not bypassed by cursor pagination: a player never receives a row it could not see on page 1', async () => {
    const worldId = await freshWorld();
    const base = Date.now();
    const visibleIds: string[] = [];
    const hiddenIds: string[] = [];

    // Visible ('guild') rows are all NEWER than the hidden ('personal') ones —
    // not interleaved. Each source's per-page fetch window is exactly `limit + 1`
    // raw rows (feed-keyset-pagination design), filtered by visibility AFTER the
    // fetch; densely interleaving visible/hidden rows can shrink a fetch window
    // below `limit` after filtering and is a pre-existing characteristic of the
    // over-fetch heuristic shared with the legacy path (out of scope for this
    // change). Blocking them keeps this test squarely about the property it's
    // actually asserting: a hidden row must never leak through the cursor, on
    // page 1 or any later page.
    for (let i = 0; i < 4; i++) {
      const guild = await insertContribution(worldId, playerA.id, {
        body: `Visible ${i}`,
        occurredAt: new Date(base - i * 20_000),
        visibility: 'guild',
      });
      visibleIds.push(guild.id);
    }
    for (let i = 0; i < 4; i++) {
      const personal = await insertContribution(worldId, playerA.id, {
        body: `Personal ${i}`,
        occurredAt: new Date(base - 100_000 - i * 20_000),
        visibility: 'personal',
      });
      hiddenIds.push(personal.id);
    }

    // playerB (not the author) pages the whole feed with limit=1.
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let guard = 0; guard < 20; guard++) {
      const params: Record<string, string> = { limit: '1' };
      if (cursor) params.cursor = cursor;
      const res = await getFeed(playerB.accessToken, worldId, params);
      expect(res.statusCode).toBe(200);
      const page = res.json() as { rows: Array<{ id: string }>; nextCursor: string | null };
      for (const row of page.rows) {
        expect(hiddenIds).not.toContain(row.id);
      }
      seen.push(...page.rows.map((r) => r.id));
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }

    expect(seen.sort()).toEqual([...visibleIds].sort());
  });
});
