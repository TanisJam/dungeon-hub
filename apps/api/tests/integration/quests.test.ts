import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';
import { createWorldWithGm } from '../helpers/create-world-with-gm.js';
import { addWorldMember } from '../helpers/add-world-member.js';

/**
 * Quests — MVP gap #3.7 (world content).
 *
 * Routes:
 *   POST   /api/v1/worlds/:worldId/quests          (GM only)
 *   GET    /api/v1/worlds/:worldId/quests           (any member; strips dm-only + dmNotes for player)
 *   GET    /api/v1/quests/:questId                  (member; 404 dm-only for player; dmNotes null for player)
 *   PATCH  /api/v1/quests/:questId                  (GM only; updatedAt bump mandatory)
 *   DELETE /api/v1/quests/:questId                  (GM only)
 *
 * Auth: getWorldAccess. GM = full access; player = public quests + dmNotes stripped; none = 403.
 *
 * SDD spec #1890, design #1891, tasks #1892.
 */
describe('quests — world-scoped DM quest management', () => {
  let dm: TestUser;
  let alice: TestUser;
  let outsider: TestUser;
  let worldId: string;

  beforeAll(async () => {
    await getTestApp();
    dm = await createTestUser();
    alice = await createTestUser();
    outsider = await createTestUser();

    ({ worldId } = await createWorldWithGm(dm.id));
    await addWorldMember(worldId, alice.id, 'player');
  });

  afterAll(async () => {
    if (dm) await deleteTestUser(dm.id);
    if (alice) await deleteTestUser(alice.id);
    if (outsider) await deleteTestUser(outsider.id);
    await closeTestApp();
  });

  async function createQuest(payload: Record<string, unknown>, wid = worldId): Promise<any> {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/worlds/${wid}/quests`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
      payload,
    });
    expect(res.statusCode).toBe(201);
    return res.json();
  }

  // ---------------------------------------------------------------------------
  // IT-QUEST-01: GM creates quest → 201, default fields
  // ---------------------------------------------------------------------------
  it('IT-QUEST-01: GM crea quest → 201, defaults correctos', async () => {
    const q = await createQuest({ title: 'Lost Mine of Phandelver' });
    expect(q.id).toBeDefined();
    expect(q.title).toBe('Lost Mine of Phandelver');
    expect(q.status).toBe('available');
    expect(q.visibility).toBe('public');
    expect(q.authorUserId).toBe(dm.id);
    expect(q.worldId).toBe(worldId);
  });

  // ---------------------------------------------------------------------------
  // IT-QUEST-02: Player POST → 403
  // ---------------------------------------------------------------------------
  it('IT-QUEST-02: player NO puede crear quest → 403', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/worlds/${worldId}/quests`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: { title: 'Player attempt' },
    });
    expect(res.statusCode).toBe(403);
  });

  // ---------------------------------------------------------------------------
  // IT-QUEST-03: GM lists — all quests including dm-only AND dmNotes present
  // ---------------------------------------------------------------------------
  it('IT-QUEST-03: GM lista todas las quests (public + dm-only, dmNotes presente)', async () => {
    const app = await getTestApp();
    const { worldId: w } = await createWorldWithGm(dm.id);
    const pub = await createQuest({ title: 'Public Quest', dmNotes: 'secret' }, w);
    const dmOnly = await createQuest({ title: 'DM-Only Quest', visibility: 'dm-only', dmNotes: 'hidden notes' }, w);

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/worlds/${w}/quests`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.find((q: any) => q.id === pub.id)).toBeDefined();
    expect(data.find((q: any) => q.id === dmOnly.id)).toBeDefined();
    const pubRow = data.find((q: any) => q.id === pub.id);
    expect(pubRow.dmNotes).toBe('secret');
  });

  // ---------------------------------------------------------------------------
  // IT-QUEST-04: Player lists — dm-only absent, dmNotes null on public quests
  // ---------------------------------------------------------------------------
  it('IT-QUEST-04: player lista — dm-only ausente, dmNotes null en public', async () => {
    const app = await getTestApp();
    const { worldId: w } = await createWorldWithGm(dm.id);
    await addWorldMember(w, alice.id, 'player');

    const pub = await createQuest({ title: 'Visible Quest', dmNotes: 'DM secret' }, w);
    await createQuest({ title: 'Hidden Quest', visibility: 'dm-only' }, w);

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/worlds/${w}/quests`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;

    // dm-only quest must be absent
    expect(data.find((q: any) => q.title === 'Hidden Quest')).toBeUndefined();

    // public quest must be present but dmNotes stripped
    const pubRow = data.find((q: any) => q.id === pub.id);
    expect(pubRow).toBeDefined();
    expect(pubRow.dmNotes === null || pubRow.dmNotes === undefined).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // IT-QUEST-05: GM GET detail on dm-only → 200 with dmNotes
  // ---------------------------------------------------------------------------
  it('IT-QUEST-05: GM GET dm-only quest detail → 200 con dmNotes', async () => {
    const app = await getTestApp();
    const q = await createQuest({ title: 'Secret Quest', visibility: 'dm-only', dmNotes: 'hidden plan' });
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/quests/${q.id}`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().dmNotes).toBe('hidden plan');
    expect(res.json().visibility).toBe('dm-only');
  });

  // ---------------------------------------------------------------------------
  // IT-QUEST-06: Player GET detail on dm-only → 404
  // ---------------------------------------------------------------------------
  it('IT-QUEST-06: player GET dm-only quest detail → 404', async () => {
    const app = await getTestApp();
    const q = await createQuest({ title: 'DM Hidden', visibility: 'dm-only' });
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/quests/${q.id}`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
    });
    expect(res.statusCode).toBe(404);
  });

  // ---------------------------------------------------------------------------
  // IT-QUEST-07 (CRITICAL — dmNotes leakage): Player GET public quest → dmNotes null/absent
  // ---------------------------------------------------------------------------
  it('IT-QUEST-07: player GET public quest con dmNotes → dmNotes ausente/null (no leakage)', async () => {
    const app = await getTestApp();
    const q = await createQuest({ title: 'Public With Notes', dmNotes: 'confidential DM prep' });
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/quests/${q.id}`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    // dmNotes must NOT leak to non-GM callers
    expect(body.dmNotes === null || body.dmNotes === undefined).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // IT-QUEST-08: GM PATCH status → 200, updatedAt strictly greater than before
  // ---------------------------------------------------------------------------
  it('IT-QUEST-08: GM PATCH status → 200, updatedAt estrictamente mayor', async () => {
    const app = await getTestApp();
    const q = await createQuest({ title: 'Quest to Update' });
    const before = new Date(q.updatedAt).getTime();

    await new Promise((r) => setTimeout(r, 50));

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/quests/${q.id}`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
      payload: { status: 'active' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('active');
    const after = new Date(res.json().updatedAt).getTime();
    expect(after).toBeGreaterThan(before);
  });

  // ---------------------------------------------------------------------------
  // IT-QUEST-09: Player PATCH → 403
  // ---------------------------------------------------------------------------
  it('IT-QUEST-09: player NO puede PATCH → 403', async () => {
    const app = await getTestApp();
    const q = await createQuest({ title: 'Locked Quest' });
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/quests/${q.id}`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: { title: 'hack' },
    });
    expect(res.statusCode).toBe(403);
  });

  // ---------------------------------------------------------------------------
  // IT-QUEST-10: PATCH with invalid status → 400 VALIDATION_FAILED
  // ---------------------------------------------------------------------------
  it('IT-QUEST-10: PATCH con status inválido → 400 VALIDATION_FAILED', async () => {
    const app = await getTestApp();
    const q = await createQuest({ title: 'Quest Invalid Status' });
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/quests/${q.id}`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
      payload: { status: 'invalid' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('VALIDATION_FAILED');
  });

  // ---------------------------------------------------------------------------
  // IT-QUEST-11: POST with empty title → 400 VALIDATION_FAILED with issues[]
  // ---------------------------------------------------------------------------
  it('IT-QUEST-11: POST con title vacío → 400 VALIDATION_FAILED con issues[]', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/worlds/${worldId}/quests`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
      payload: { title: '' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('VALIDATION_FAILED');
    const issues = res.json().issues;
    expect(Array.isArray(issues)).toBe(true);
    expect(issues.length).toBeGreaterThan(0);
  });

  // ---------------------------------------------------------------------------
  // IT-QUEST-12: GM DELETE → 204; subsequent GET → 404
  // ---------------------------------------------------------------------------
  it('IT-QUEST-12: GM DELETE → 204; GET posterior → 404', async () => {
    const app = await getTestApp();
    const q = await createQuest({ title: 'Quest to Delete' });

    const del = await app.inject({
      method: 'DELETE',
      url: `/api/v1/quests/${q.id}`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
    });
    expect(del.statusCode).toBe(204);

    const get = await app.inject({
      method: 'GET',
      url: `/api/v1/quests/${q.id}`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
    });
    expect(get.statusCode).toBe(404);
  });

  // ---------------------------------------------------------------------------
  // IT-QUEST-13: Player DELETE → 403
  // ---------------------------------------------------------------------------
  it('IT-QUEST-13: player NO puede DELETE → 403', async () => {
    const app = await getTestApp();
    const q = await createQuest({ title: 'Protected Quest' });
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/quests/${q.id}`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  // ---------------------------------------------------------------------------
  // IT-QUEST-14: GET unknown questId → 404
  // ---------------------------------------------------------------------------
  it('IT-QUEST-14: GET questId inexistente → 404', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/quests/00000000-0000-0000-0000-000000000000`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
    });
    expect(res.statusCode).toBe(404);
  });

  // ---------------------------------------------------------------------------
  // IT-QUEST-15: Outsider (access='none') → 403 on any endpoint
  // ---------------------------------------------------------------------------
  it('IT-QUEST-15: outsider (access=none) → 403 en cualquier endpoint', async () => {
    const app = await getTestApp();

    // POST
    const post = await app.inject({
      method: 'POST',
      url: `/api/v1/worlds/${worldId}/quests`,
      headers: { authorization: `Bearer ${outsider.accessToken}` },
      payload: { title: 'Outsider create' },
    });
    expect(post.statusCode).toBe(403);

    // GET list
    const list = await app.inject({
      method: 'GET',
      url: `/api/v1/worlds/${worldId}/quests`,
      headers: { authorization: `Bearer ${outsider.accessToken}` },
    });
    expect(list.statusCode).toBe(403);
  });
});
