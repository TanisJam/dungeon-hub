/**
 * Integration tests: bitácora page share route + use-case
 *
 * REQ-SHARE-01..09, ADR-3/5/6/7/8.
 *
 * Tests written FIRST (RED) per strict TDD.
 *
 * Covers:
 *   1. Happy path: owner shares → 200, correct guild_contributions row inserted
 *   2. Idempotency (non-sealed): re-share → 200 alreadyShared:true, NO 2nd row
 *   3. Sealed-then-reshare: existing row sealed → fresh INSERT, new id returned
 *   4. Append-only: existing contribution NOT mutated on idempotency re-share
 *   5. Anti-metagaming isolation: sibling page NOT visible in feed after share
 *   6. Non-owner → 403
 *   7. Missing page → 404
 *   8. normalizeContribution regression: legacy row (title=NULL) renders without crash
 *   9. sharedAt EXISTS subquery: page detail includes sharedAt after share
 *
 * Pattern: mirrors bitacora-pages.test.ts (in-process Fastify + real Postgres).
 * bitacora-personal-share SDD spec #2035, design #2036.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';
import { createWorldWithGm } from '../helpers/create-world-with-gm.js';
import { addWorldMember } from '../helpers/add-world-member.js';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

describe('bitácora share route (REQ-SHARE-01..09)', () => {
  let gm: TestUser;
  let player: TestUser;
  let outsider: TestUser;
  let worldId: string;
  let characterId: string;

  beforeAll(async () => {
    const app = await getTestApp();

    gm = await createTestUser();
    player = await createTestUser();
    outsider = await createTestUser();

    ({ worldId } = await createWorldWithGm(gm.id));
    await addWorldMember(worldId, player.id, 'player');

    // Create a character for the player
    const charRes = await app.inject({
      method: 'POST',
      url: '/api/v1/characters',
      headers: { authorization: `Bearer ${player.accessToken}` },
      payload: { worldId, name: 'Share Test Character' },
    });
    expect(charRes.statusCode).toBe(201);
    characterId = charRes.json<{ id: string }>().id;
  });

  afterAll(async () => {
    if (gm) await deleteTestUser(gm.id);
    if (player) await deleteTestUser(player.id);
    if (outsider) await deleteTestUser(outsider.id);
    await closeTestApp();
  });

  // ---------------------------------------------------------------------------
  // Helper: create a bitácora page via the API
  // ---------------------------------------------------------------------------

  async function createPage(
    accessToken: string,
    payload: { title?: string | null; body?: string; tags?: string[] } = {},
  ): Promise<{ id: string; title: string | null; body: string; tags: string[] }> {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${characterId}/bitacora/pages`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        body: payload.body ?? 'Test page body',
        tags: payload.tags ?? ['monsters'],
        refs: [],
        ...(payload.title !== undefined ? { title: payload.title } : {}),
      },
    });
    expect(res.statusCode).toBe(200);
    return res.json<{ page: { id: string; title: string | null; body: string; tags: string[] } }>().page;
  }

  // Helper: share a page
  async function sharePage(accessToken: string, pageId: string) {
    const app = await getTestApp();
    return app.inject({
      method: 'POST',
      url: `/api/v1/characters/${characterId}/bitacora/pages/${pageId}/share`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {},
    });
  }

  // ---------------------------------------------------------------------------
  // Test 1: Happy path
  // ---------------------------------------------------------------------------

  it('(1) owner shares titled page → 200, contribution row with correct fields (REQ-SHARE-01)', async () => {
    const page = await createPage(player.accessToken, {
      title: 'El Dragón Rojo',
      body: 'Lo vimos al norte.',
      tags: ['monsters'],
    });

    const res = await sharePage(player.accessToken, page.id);

    expect(res.statusCode).toBe(200);
    const data = res.json<{ contributionId: string; alreadyShared: boolean }>();
    expect(typeof data.contributionId).toBe('string');
    expect(data.alreadyShared).toBe(false);

    // Verify the guild_contributions row exists with correct fields
    const { db } = await import('../../src/infra/db/client.js');
    const { guildContributions } = await import('../../src/infra/db/schema.js');
    const { eq } = await import('drizzle-orm');

    const rows = await db
      .select()
      .from(guildContributions)
      .where(eq(guildContributions.id, data.contributionId));

    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.title).toBe('El Dragón Rojo');
    expect(row.body).toBe('Lo vimos al norte.');
    expect(row.tags).toEqual(['monsters']);
    expect(row.visibility).toBe('guild');
    expect(row.contributionType).toBe('nota');
    expect(row.sourceBitacoraPageId).toBe(page.id);
    expect(row.worldId).toBe(worldId);
    expect(row.authorUserId).toBe(player.id);
    expect(row.refEntityKind).toBeNull();
    expect(row.refEntityId).toBeNull();
    // occurredAt ≈ now
    const occurredMs = row.occurredAt.getTime();
    expect(Date.now() - occurredMs).toBeLessThan(30_000);
  });

  // ---------------------------------------------------------------------------
  // Test 2: Idempotency (non-sealed) — re-share is a no-op
  // ---------------------------------------------------------------------------

  it('(2) re-share same page (non-sealed) → 200 alreadyShared:true, no 2nd row (REQ-SHARE-03)', async () => {
    const page = await createPage(player.accessToken, { body: 'Idempotency test page' });

    const res1 = await sharePage(player.accessToken, page.id);
    expect(res1.statusCode).toBe(200);
    const data1 = res1.json<{ contributionId: string; alreadyShared: boolean }>();
    expect(data1.alreadyShared).toBe(false);

    const res2 = await sharePage(player.accessToken, page.id);
    expect(res2.statusCode).toBe(200);
    const data2 = res2.json<{ contributionId: string; alreadyShared: boolean }>();
    expect(data2.alreadyShared).toBe(true);
    expect(data2.contributionId).toBe(data1.contributionId);

    // No duplicate row inserted
    const { db } = await import('../../src/infra/db/client.js');
    const { guildContributions } = await import('../../src/infra/db/schema.js');
    const { eq } = await import('drizzle-orm');

    const rows = await db
      .select()
      .from(guildContributions)
      .where(eq(guildContributions.sourceBitacoraPageId, page.id));

    expect(rows).toHaveLength(1);
  });

  // ---------------------------------------------------------------------------
  // Test 3: Sealed-then-reshare — sealed copy does NOT block a fresh share
  // ---------------------------------------------------------------------------

  it('(3) sealed existing copy does NOT block re-share → fresh INSERT, new id (REQ-SHARE-03)', async () => {
    const app = await getTestApp();
    const page = await createPage(player.accessToken, { body: 'Sealed-then-reshare test page' });

    // First share
    const res1 = await sharePage(player.accessToken, page.id);
    expect(res1.statusCode).toBe(200);
    const data1 = res1.json<{ contributionId: string; alreadyShared: boolean }>();

    // GM seals the contribution
    const sealRes = await app.inject({
      method: 'POST',
      url: `/api/v1/contributions/${data1.contributionId}/seal`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
      payload: { sealedStatus: 'confirmed' },
    });
    // Seal may return 200 or 204; either is fine — just confirm it doesn't error
    expect([200, 204]).toContain(sealRes.statusCode);

    // Re-share after seal → fresh INSERT (sealed row doesn't count for dedup)
    const res2 = await sharePage(player.accessToken, page.id);
    expect(res2.statusCode).toBe(200);
    const data2 = res2.json<{ contributionId: string; alreadyShared: boolean }>();
    expect(data2.alreadyShared).toBe(false);
    expect(data2.contributionId).not.toBe(data1.contributionId);
  });

  // ---------------------------------------------------------------------------
  // Test 4: Append-only invariant — existing row NOT mutated on idempotency
  // ---------------------------------------------------------------------------

  it('(4) idempotency re-share does NOT mutate the existing contribution (REQ-SHARE-04)', async () => {
    const page = await createPage(player.accessToken, {
      title: 'Append-only page',
      body: 'Original body.',
      tags: ['lore'],
    });

    const res1 = await sharePage(player.accessToken, page.id);
    const data1 = res1.json<{ contributionId: string }>();

    // Re-share (no-op)
    await sharePage(player.accessToken, page.id);

    // Contribution should have the original values unchanged
    const { db } = await import('../../src/infra/db/client.js');
    const { guildContributions } = await import('../../src/infra/db/schema.js');
    const { eq } = await import('drizzle-orm');

    const rows = await db
      .select()
      .from(guildContributions)
      .where(eq(guildContributions.id, data1.contributionId));

    expect(rows).toHaveLength(1);
    expect(rows[0]!.body).toBe('Original body.');
    expect(rows[0]!.title).toBe('Append-only page');
    expect(rows[0]!.tags).toEqual(['lore']);
  });

  // ---------------------------------------------------------------------------
  // Test 5: Anti-metagaming isolation — sibling page NOT visible via feed
  // ---------------------------------------------------------------------------

  it('(5) sibling page P2 does NOT appear in guild feed after sharing P1 (REQ-SHARE-05)', async () => {
    const app = await getTestApp();

    const p1 = await createPage(player.accessToken, { body: `Anti-meta P1 ${Date.now()}` });
    const p2 = await createPage(player.accessToken, { body: `Anti-meta P2 ${Date.now()}` });

    // Share only P1
    const shareRes = await sharePage(player.accessToken, p1.id);
    const shareData = shareRes.json<{ contributionId: string }>();

    // Get the feed as GM
    const feedRes = await app.inject({
      method: 'GET',
      url: `/api/v1/worlds/${worldId}/cronica-feed`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
    });
    expect(feedRes.statusCode).toBe(200);
    const feedData = feedRes.json<{ rows: Array<{ id: string }> }>();

    // P1's contribution should be in the feed
    const sharedIds = feedData.rows.map((r) => r.id);
    expect(sharedIds).toContain(shareData.contributionId);

    // Verify P2 itself (personal page) is NOT in the feed (only its guild copy would be)
    // The feed returns guild_contributions rows by ID — P2's page ID should not appear
    // as a contribution id (it was never shared)
    const { db } = await import('../../src/infra/db/client.js');
    const { guildContributions } = await import('../../src/infra/db/schema.js');
    const { eq } = await import('drizzle-orm');

    const p2ContribRows = await db
      .select()
      .from(guildContributions)
      .where(eq(guildContributions.sourceBitacoraPageId, p2.id));

    expect(p2ContribRows).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------
  // Test 6: Non-owner → 403
  // ---------------------------------------------------------------------------

  it('(6) non-owner (outsider) share → 403 FORBIDDEN (REQ-SHARE-09)', async () => {
    const page = await createPage(player.accessToken, { body: 'Auth test page' });
    const res = await sharePage(outsider.accessToken, page.id);
    expect(res.statusCode).toBe(403);
  });

  // ---------------------------------------------------------------------------
  // Test 7: Missing page → 404
  // ---------------------------------------------------------------------------

  it('(7) missing page id → 404 NOT_FOUND (REQ-SHARE-09)', async () => {
    const app = await getTestApp();
    const fakePageId = '00000000-0000-0000-0000-000000000001';
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${characterId}/bitacora/pages/${fakePageId}/share`,
      headers: { authorization: `Bearer ${player.accessToken}` },
      payload: {},
    });
    expect(res.statusCode).toBe(404);
  });

  // ---------------------------------------------------------------------------
  // Test 8: normalizeContribution regression — legacy row (title=NULL)
  // ---------------------------------------------------------------------------

  it('(8) legacy contribution (title=NULL) in feed does NOT crash (REQ-SHARE-02 regression)', async () => {
    const app = await getTestApp();

    // Create a guild contribution WITHOUT title (legacy path via contributions API)
    const contribRes = await app.inject({
      method: 'POST',
      url: `/api/v1/worlds/${worldId}/contributions`,
      headers: { authorization: `Bearer ${player.accessToken}` },
      payload: {
        contributionType: 'nota',
        body: `Legacy contribution no title ${Date.now()}`,
        visibility: 'guild',
        tags: ['lore'],
      },
    });
    expect(contribRes.statusCode).toBe(200);

    // Fetch the feed filtered to gremio source only — guarantees the row is in the result
    // regardless of how many journal/event entries are in the shared test DB.
    // limit=200 (max) ensures even a busy CI world won't paginate the contribution off the page.
    const feedRes = await app.inject({
      method: 'GET',
      url: `/api/v1/worlds/${worldId}/cronica-feed?source=gremio&limit=200`,
      headers: { authorization: `Bearer ${player.accessToken}` },
    });
    expect(feedRes.statusCode).toBe(200);
    const feedData = feedRes.json<{ rows: Array<{ id: string; title: string | null }> }>();

    // Find the legacy contribution in the feed and assert title is null (not crash)
    // POST /worlds/:worldId/contributions returns the flat created row (not { contribution: { id } })
    const legacyRow = feedData.rows.find((r) => r.id === contribRes.json<{ id: string }>().id);
    expect(legacyRow).toBeDefined();
    expect(legacyRow!.title).toBeNull();
    // The feed itself must return successfully with no crash (status 200 is the key assertion)
  });

  // ---------------------------------------------------------------------------
  // Test 9: sharedAt derived field on page get/list after share
  // ---------------------------------------------------------------------------

  it('(9) page detail includes sharedAt (truthy) after being shared (ADR-8)', async () => {
    const app = await getTestApp();
    const page = await createPage(player.accessToken, { body: 'sharedAt test page' });

    // Before share: sharedAt should be null
    const beforeRes = await app.inject({
      method: 'GET',
      url: `/api/v1/characters/${characterId}/bitacora/pages/${page.id}`,
      headers: { authorization: `Bearer ${player.accessToken}` },
    });
    expect(beforeRes.statusCode).toBe(200);
    const beforePage = beforeRes.json<{ page: { sharedAt?: string | null } }>().page;
    expect(beforePage.sharedAt ?? null).toBeNull();

    // Share the page
    await sharePage(player.accessToken, page.id);

    // After share: sharedAt should be a non-null ISO string
    const afterRes = await app.inject({
      method: 'GET',
      url: `/api/v1/characters/${characterId}/bitacora/pages/${page.id}`,
      headers: { authorization: `Bearer ${player.accessToken}` },
    });
    expect(afterRes.statusCode).toBe(200);
    const afterPage = afterRes.json<{ page: { sharedAt?: string | null } }>().page;
    expect(afterPage.sharedAt).toBeTruthy();
    expect(typeof afterPage.sharedAt).toBe('string');
  });
});
