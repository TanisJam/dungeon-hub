/**
 * Tests for D.1 (pending_approval enum), D.2 (status filter), D.3 (transition guard),
 * and D.4 (sheet augmentation with currentHp + inventory).
 *
 * TDD: these tests are written FIRST. Run them before implementing to confirm they fail.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';

// ---------------------------------------------------------------------------
// D.1 + D.3 — pending_approval enum + PATCH transition guard
// ---------------------------------------------------------------------------
describe('D.1 + D.3 — pending_approval enum + transition guard', () => {
  let alice: TestUser;
  let campaignId: string;
  let worldId: string;

  beforeAll(async () => {
    const app = await getTestApp();
    alice = await createTestUser();

    const campaign = await app
      .inject({
        method: 'POST',
        url: '/api/v1/campaigns',
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: { name: "Alice's Campaign" },
      })
      .then((r) => r.json());
    campaignId = campaign.id;
    worldId = campaign.worldId;
  });

  afterAll(async () => {
    if (alice) await deleteTestUser(alice.id);
    await closeTestApp();
  });

  it('D.1.1 — PATCH draft → pending_approval succeeds (was failing before enum extension)', async () => {
    const app = await getTestApp();

    const created = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: { worldId, name: 'Draft To Pending' },
      })
      .then((r) => r.json());

    expect(created.status).toBe('draft');

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/characters/${created.id}`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: { status: 'pending_approval' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('pending_approval');
  });

  it('D.3 — PATCH active → pending_approval returns 422', async () => {
    const app = await getTestApp();

    // Create draft then promote to active
    const created = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: { worldId, name: 'Active Char' },
      })
      .then((r) => r.json());

    await app.inject({
      method: 'PATCH',
      url: `/api/v1/characters/${created.id}`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: { status: 'active' },
    });

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/characters/${created.id}`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: { status: 'pending_approval' },
    });

    expect(res.statusCode).toBe(422);
    expect(res.json().error).toBe('ILLEGAL_TRANSITION');
  });

  it('D.3 — PATCH retired → pending_approval returns 422', async () => {
    const app = await getTestApp();

    const created = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: { worldId, name: 'Retired Char' },
      })
      .then((r) => r.json());

    await app.inject({
      method: 'PATCH',
      url: `/api/v1/characters/${created.id}`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: { status: 'retired' },
    });

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/characters/${created.id}`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: { status: 'pending_approval' },
    });

    expect(res.statusCode).toBe(422);
    expect(res.json().error).toBe('ILLEGAL_TRANSITION');
  });

  it('D.3 — PATCH dead → pending_approval returns 422', async () => {
    const app = await getTestApp();

    const created = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: { worldId, name: 'Dead Char' },
      })
      .then((r) => r.json());

    await app.inject({
      method: 'PATCH',
      url: `/api/v1/characters/${created.id}`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: { status: 'dead' },
    });

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/characters/${created.id}`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: { status: 'pending_approval' },
    });

    expect(res.statusCode).toBe(422);
    expect(res.json().error).toBe('ILLEGAL_TRANSITION');
  });
});

// ---------------------------------------------------------------------------
// D.2 — GET /characters?status= filter
// ---------------------------------------------------------------------------
describe('D.2 — GET /characters status filter', () => {
  let alice: TestUser;
  let campaignId: string;
  let worldId: string;
  let draftId: string;
  let activeId: string;
  let pendingId: string;

  beforeAll(async () => {
    const app = await getTestApp();
    alice = await createTestUser();

    const campaign = await app
      .inject({
        method: 'POST',
        url: '/api/v1/campaigns',
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: { name: "Alice's Filter Campaign" },
      })
      .then((r) => r.json());
    campaignId = campaign.id;
    worldId = campaign.worldId;

    // Create a draft character
    draftId = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: { worldId, name: 'Draft One' },
      })
      .then((r) => r.json().id);

    // Create and promote to active
    const activeChar = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: { worldId, name: 'Active One' },
      })
      .then((r) => r.json());
    activeId = activeChar.id;

    await app.inject({
      method: 'PATCH',
      url: `/api/v1/characters/${activeId}`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: { status: 'active' },
    });

    // Create and promote to pending_approval
    const pendingChar = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: { worldId, name: 'Pending One' },
      })
      .then((r) => r.json());
    pendingId = pendingChar.id;

    await app.inject({
      method: 'PATCH',
      url: `/api/v1/characters/${pendingId}`,
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: { status: 'pending_approval' },
    });
  });

  afterAll(async () => {
    if (alice) await deleteTestUser(alice.id);
    await closeTestApp();
  });

  it('D.4.1a — no status filter returns all characters (backward-compat)', async () => {
    const app = await getTestApp();

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/characters',
      headers: { authorization: `Bearer ${alice.accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const ids = res.json().data.map((c: { id: string }) => c.id);
    expect(ids).toContain(draftId);
    expect(ids).toContain(activeId);
    expect(ids).toContain(pendingId);
  });

  it('D.4.1b — ?status=active returns only active characters', async () => {
    const app = await getTestApp();

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/characters?status=active',
      headers: { authorization: `Bearer ${alice.accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const items = res.json().data;
    expect(items.every((c: { status: string }) => c.status === 'active')).toBe(true);
    const ids = items.map((c: { id: string }) => c.id);
    expect(ids).toContain(activeId);
    expect(ids).not.toContain(draftId);
    expect(ids).not.toContain(pendingId);
  });

  it('D.4.1c — ?status=active,pending_approval returns both statuses', async () => {
    const app = await getTestApp();

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/characters?status=active,pending_approval',
      headers: { authorization: `Bearer ${alice.accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const items = res.json().data;
    const ids = items.map((c: { id: string }) => c.id);
    expect(ids).toContain(activeId);
    expect(ids).toContain(pendingId);
    expect(ids).not.toContain(draftId);
    expect(items.every((c: { status: string }) => ['active', 'pending_approval'].includes(c.status))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// D.4 — GET /characters/:id/sheet augmented with currentHp + inventory
// ---------------------------------------------------------------------------
describe('D.4 — GET /characters/:id/sheet includes currentHp and inventory', () => {
  let user: TestUser;
  let characterId: string;

  beforeAll(async () => {
    const app = await getTestApp();
    user = await createTestUser();

    const campaign = await app
      .inject({
        method: 'POST',
        url: '/api/v1/campaigns',
        headers: { authorization: `Bearer ${user.accessToken}` },
        payload: { name: 'Sheet Augment Campaign' },
      })
      .then((r) => r.json());

    const character = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${user.accessToken}` },
        payload: { worldId: campaign.worldId, name: 'HP Sheet Test' },
      })
      .then((r) => r.json());
    characterId = character.id;
  });

  afterAll(async () => {
    if (user) await deleteTestUser(user.id);
    await closeTestApp();
  });

  it('D.7.1a — sheet response includes currentHp field', async () => {
    const app = await getTestApp();

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/characters/${characterId}/sheet`,
      headers: { authorization: `Bearer ${user.accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    // currentHp must be present in the response (either a number or null)
    expect('currentHp' in body).toBe(true);
  });

  it('D.7.1b — sheet response includes inventory field (array)', async () => {
    const app = await getTestApp();

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/characters/${characterId}/sheet`,
      headers: { authorization: `Bearer ${user.accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    // inventory must be present and be an array
    expect('inventory' in body).toBe(true);
    expect(Array.isArray(body.inventory)).toBe(true);
  });
});
