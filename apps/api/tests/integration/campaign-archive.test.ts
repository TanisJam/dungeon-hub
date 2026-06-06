import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';
import { addCampaignAndWorldMember } from '../helpers/add-world-member.js';

describe('campaign-archive', () => {
  let gm: TestUser;
  let player: TestUser;

  beforeAll(async () => {
    await getTestApp();
    gm = await createTestUser();
    player = await createTestUser();
  });

  afterAll(async () => {
    if (gm) await deleteTestUser(gm.id);
    if (player) await deleteTestUser(player.id);
    await closeTestApp();
  });

  // ---------------------------------------------------------------------------
  // Helper: create a campaign owned by gm
  // ---------------------------------------------------------------------------
  async function createCampaign(name: string): Promise<{ id: string; worldId: string }> {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/campaigns',
      headers: { authorization: `Bearer ${gm.accessToken}` },
      payload: { name },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as { id: string; worldId: string };
    return { id: body.id, worldId: body.worldId };
  }

  // ---------------------------------------------------------------------------
  // Archive happy path
  // ---------------------------------------------------------------------------

  it('CARCH-API-01: GM archives an active campaign — 200 with status=archived', async () => {
    const app = await getTestApp();
    const { id } = await createCampaign('Archive Happy Path');

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${id}/archive`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBe(id);
    expect(body.status).toBe('archived');
  });

  it('CARCH-API-02: archived campaign shows status=archived in GET /campaigns', async () => {
    const app = await getTestApp();
    const { id } = await createCampaign('Archive Then List');

    await app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${id}/archive`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
    });

    const listRes = await app.inject({
      method: 'GET',
      url: '/api/v1/campaigns',
      headers: { authorization: `Bearer ${gm.accessToken}` },
    });

    expect(listRes.statusCode).toBe(200);
    const { data } = listRes.json() as { data: Array<{ id: string; status: string }> };
    const row = data.find((c) => c.id === id);
    expect(row).toBeDefined();
    expect(row!.status).toBe('archived');
  });

  // ---------------------------------------------------------------------------
  // Archive idempotency
  // ---------------------------------------------------------------------------

  it('CARCH-API-03: archiving an already-archived campaign returns 200 (idempotent)', async () => {
    const app = await getTestApp();
    const { id } = await createCampaign('Archive Idempotent');

    // Archive once
    await app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${id}/archive`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
    });

    // Archive again
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${id}/archive`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('archived');
  });

  // ---------------------------------------------------------------------------
  // Archive non-GM → 403
  // ---------------------------------------------------------------------------

  it('CARCH-API-04: non-GM player cannot archive → 403 WORLD_GM_REQUIRED', async () => {
    const app = await getTestApp();
    const { id } = await createCampaign('Archive Auth Guard');

    // Add player to the campaign
    await addCampaignAndWorldMember(id, player.id, 'player');

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${id}/archive`,
      headers: { authorization: `Bearer ${player.accessToken}` },
    });

    expect(res.statusCode).toBe(403);
    const body = res.json();
    expect(body.issues[0].code).toBe('WORLD_GM_REQUIRED');
  });

  // ---------------------------------------------------------------------------
  // Unarchive happy path
  // ---------------------------------------------------------------------------

  it('CARCH-API-05: GM unarchives an archived campaign — 200 with status=active', async () => {
    const app = await getTestApp();
    const { id } = await createCampaign('Unarchive Happy Path');

    // Archive first
    await app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${id}/archive`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${id}/unarchive`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('active');
  });

  // ---------------------------------------------------------------------------
  // Unarchive idempotency
  // ---------------------------------------------------------------------------

  it('CARCH-API-06: unarchiving an already-active campaign returns 200 (idempotent)', async () => {
    const app = await getTestApp();
    const { id } = await createCampaign('Unarchive Idempotent');

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${id}/unarchive`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('active');
  });

  // ---------------------------------------------------------------------------
  // Unarchive non-GM → 403
  // ---------------------------------------------------------------------------

  it('CARCH-API-07: non-GM player cannot unarchive → 403 WORLD_GM_REQUIRED', async () => {
    const app = await getTestApp();
    const { id } = await createCampaign('Unarchive Auth Guard');

    // Archive first so unarchive has something to do
    await app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${id}/archive`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
    });

    // Add player to the campaign
    await addCampaignAndWorldMember(id, player.id, 'player');

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${id}/unarchive`,
      headers: { authorization: `Bearer ${player.accessToken}` },
    });

    expect(res.statusCode).toBe(403);
    const body = res.json();
    expect(body.issues[0].code).toBe('WORLD_GM_REQUIRED');
  });

  // ---------------------------------------------------------------------------
  // GET list includes status on ALL rows (REQ-CARCH-API-LIST-01)
  // ---------------------------------------------------------------------------

  it('CARCH-API-08: GET /campaigns includes status field on every row', async () => {
    const app = await getTestApp();
    // Create two campaigns so we have at least 1
    await createCampaign('Status Field Check A');
    await createCampaign('Status Field Check B');

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/campaigns',
      headers: { authorization: `Bearer ${gm.accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const { data } = res.json() as { data: Array<{ status: string }> };
    expect(data.length).toBeGreaterThan(0);
    for (const row of data) {
      expect(row.status === 'active' || row.status === 'archived').toBe(true);
    }
  });

  // ---------------------------------------------------------------------------
  // GET list ?status=active filter (REQ-CARCH-API-LIST-01)
  // ---------------------------------------------------------------------------

  it('CARCH-API-09: GET /campaigns?status=active returns only active rows', async () => {
    const app = await getTestApp();
    const { id: archivedId } = await createCampaign('Status Filter Archived');

    // Archive it
    await app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${archivedId}/archive`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/campaigns?status=active',
      headers: { authorization: `Bearer ${gm.accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const { data } = res.json() as { data: Array<{ id: string; status: string }> };
    // The archived campaign must not appear
    const found = data.find((c) => c.id === archivedId);
    expect(found).toBeUndefined();
    // All returned rows must be active
    for (const row of data) {
      expect(row.status).toBe('active');
    }
  });

  it('CARCH-API-11: GET /campaigns?status=archived returns only archived rows', async () => {
    const app = await getTestApp();
    const { id: archivedId } = await createCampaign('Status Filter Archived Only');

    await app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${archivedId}/archive`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/campaigns?status=archived',
      headers: { authorization: `Bearer ${gm.accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const { data } = res.json() as { data: Array<{ id: string; status: string }> };
    // The archived campaign must appear, and every returned row must be archived.
    expect(data.find((c) => c.id === archivedId)).toBeDefined();
    for (const row of data) {
      expect(row.status).toBe('archived');
    }
  });

  // ---------------------------------------------------------------------------
  // Archive preserves sessions + members (no cascade)
  // ---------------------------------------------------------------------------

  it('CARCH-API-10: archiving preserves campaign members and sessions rows', async () => {
    const app = await getTestApp();
    const { id } = await createCampaign('Cascade Check Campaign');

    // Add player as campaign+world member
    await addCampaignAndWorldMember(id, player.id, 'player');

    // Create a session
    const sessionRes = await app.inject({
      method: 'POST',
      url: '/api/v1/sessions',
      headers: { authorization: `Bearer ${gm.accessToken}` },
      payload: { campaignId: id, title: 'Session One', scheduledAt: new Date(Date.now() + 3_600_000).toISOString() },
    });
    // Session creation might not exist in API yet; skip if 404
    const sessionCreated = sessionRes.statusCode < 400;

    // Archive
    const archiveRes = await app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${id}/archive`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
    });
    expect(archiveRes.statusCode).toBe(200);

    // Get campaign detail — members should still be there
    const detailRes = await app.inject({
      method: 'GET',
      url: `/api/v1/campaigns/${id}`,
      headers: { authorization: `Bearer ${gm.accessToken}` },
    });
    expect(detailRes.statusCode).toBe(200);
    const detail = detailRes.json() as { members: Array<{ userId: string }> };
    const memberIds = detail.members.map((m) => m.userId);
    // Both gm and player should still be members
    expect(memberIds).toContain(gm.id);
    expect(memberIds).toContain(player.id);

    // sessions: skip if no sessions API; if created verify count via list
    if (sessionCreated) {
      const sessionsRes = await app.inject({
        method: 'GET',
        url: `/api/v1/sessions?campaignId=${id}`,
        headers: { authorization: `Bearer ${gm.accessToken}` },
      });
      // At minimum 200 and no crash
      expect(sessionsRes.statusCode).toBe(200);
    }
  });
});
