import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';
import { createWorldWithGm } from '../helpers/create-world-with-gm.js';
import { addWorldMember } from '../helpers/add-world-member.js';

/**
 * contributions — tags on create + ?tag= filter (REQ-GREM-CT-02, REQ-GREM-CT-03).
 *
 * Strict TDD: these tests are written FIRST (RED) before implementation.
 * bitacora-gremio W4 — tags write-at-create-only, domain-validated against KNOWLEDGE_TAGS.
 */
describe('contributions — tags (REQ-GREM-CT-02, REQ-GREM-CT-03, bitacora-gremio W4)', () => {
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

  async function createContribution(
    token: string,
    payload: Record<string, unknown>,
    wid = worldId,
  ) {
    const app = await getTestApp();
    return app.inject({
      method: 'POST',
      url: `/api/v1/worlds/${wid}/contributions`,
      headers: { authorization: `Bearer ${token}` },
      payload,
    });
  }

  async function listContributions(token: string, params: Record<string, string>, wid = worldId) {
    const app = await getTestApp();
    const qs = new URLSearchParams(params).toString();
    return app.inject({
      method: 'GET',
      url: `/api/v1/worlds/${wid}/contributions${qs ? `?${qs}` : ''}`,
      headers: { authorization: `Bearer ${token}` },
    });
  }

  // ── Tags on create ──────────────────────────────────────────────────────────

  it('POST create with valid tags → 200, persisted tags (REQ-GREM-CT-02 scenario 1)', async () => {
    const res = await createContribution(playerA.accessToken, {
      contributionType: 'rumor',
      body: 'Lore about the old keep',
      visibility: 'guild',
      tags: ['lore'],
    });
    expect(res.statusCode).toBe(200);
    const json = res.json();
    expect(Array.isArray(json.tags)).toBe(true);
    expect(json.tags).toContain('lore');
  });

  it('POST create with invalid tag → 400 VALIDATION_FAILED (REQ-GREM-CT-02 scenario 2)', async () => {
    const res = await createContribution(playerA.accessToken, {
      contributionType: 'nota',
      body: 'Some note',
      visibility: 'guild',
      tags: ['unknown-tag'],
    });
    expect(res.statusCode).toBe(400);
    const json = res.json();
    expect(json.error).toBe('VALIDATION_FAILED');
  });

  it('POST create without tags → 200, tags defaults to [] (REQ-GREM-CT-02 scenario 3)', async () => {
    const res = await createContribution(playerA.accessToken, {
      contributionType: 'sighting',
      body: 'Spotted goblins near the river',
      visibility: 'guild',
    });
    expect(res.statusCode).toBe(200);
    const json = res.json();
    expect(Array.isArray(json.tags)).toBe(true);
    expect(json.tags).toEqual([]);
  });

  it('POST create with multiple valid tags → 200, all tags persisted', async () => {
    const res = await createContribution(playerA.accessToken, {
      contributionType: 'nota',
      body: 'Monsters and lore mixed note',
      visibility: 'guild',
      tags: ['monsters', 'lore'],
    });
    expect(res.statusCode).toBe(200);
    const json = res.json();
    expect(json.tags).toContain('monsters');
    expect(json.tags).toContain('lore');
  });

  // ── ?tag= filter ─────────────────────────────────────────────────────────────

  it('GET contributions?tag=lore → only contributions with lore tag returned (REQ-GREM-CT-03)', async () => {
    // Create a 'lore' tagged contribution
    await createContribution(playerA.accessToken, {
      contributionType: 'nota',
      body: 'A lore contribution for filtering test',
      visibility: 'guild',
      tags: ['lore'],
    });
    // Create an 'monsters' tagged contribution (should NOT appear)
    await createContribution(playerA.accessToken, {
      contributionType: 'nota',
      body: 'A monsters contribution for filtering test',
      visibility: 'guild',
      tags: ['monsters'],
    });

    const res = await listContributions(playerA.accessToken, { tag: 'lore' });
    expect(res.statusCode).toBe(200);
    const json = res.json();
    const rows = json.rows as Array<{ tags: string[] }>;
    // All returned rows must contain 'lore'
    for (const row of rows) {
      expect(row.tags).toContain('lore');
    }
  });

  it('GET contributions?tag=unknown-tag → 400 VALIDATION_FAILED (REQ-GREM-CT-03)', async () => {
    const res = await listContributions(playerA.accessToken, { tag: 'unknown-tag' });
    expect(res.statusCode).toBe(400);
    const json = res.json();
    expect(json.error).toBe('VALIDATION_FAILED');
  });

  it('GET contributions?tag=lore — personal rows from other authors excluded (REQ-GREM-CT-03 visibility-first)', async () => {
    // PlayerA creates a personal lore contribution (PlayerB should NOT see it)
    await createContribution(playerA.accessToken, {
      contributionType: 'nota',
      body: 'Personal lore note — only playerA sees this',
      visibility: 'personal',
      tags: ['lore'],
    });

    // PlayerB lists with ?tag=lore — must not see playerA's personal contribution
    const res = await listContributions(playerB.accessToken, { tag: 'lore' });
    expect(res.statusCode).toBe(200);
    const json = res.json();
    const rows = json.rows as Array<{ authorUserId: string; visibility: string; tags: string[] }>;

    // No personal rows from other authors should appear
    for (const row of rows) {
      if (row.visibility === 'personal') {
        expect(row.authorUserId).toBe(playerB.id);
      }
    }
  });
});
