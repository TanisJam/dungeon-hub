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
    const feed = feedRes.json() as { rows: Array<{ source: string }>; total: number };

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
    const feed = feedRes.json() as { rows: Array<{ tags: string[] }>; total: number };
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

  it('empty state: world with no entries → { rows: [], total: 0, nextOffset: null }', async () => {
    // Create a fresh world with just the DM (no entries)
    const emptyDm = await createTestUser();
    const { worldId: emptyWorldId } = await createWorldWithGm(emptyDm.id);

    try {
      const feedRes = await getFeed(emptyDm.accessToken, {}, emptyWorldId);
      expect(feedRes.statusCode).toBe(200);
      const feed = feedRes.json() as { rows: unknown[]; total: number; nextOffset: unknown };
      expect(feed.rows).toEqual([]);
      expect(feed.total).toBe(0);
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
