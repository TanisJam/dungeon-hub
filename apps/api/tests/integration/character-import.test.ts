/**
 * Integration tests for POST /characters/import — the inverse of
 * GET /characters/:id/export. MVP §3.9.
 *
 * NOTE: these tests require a live Supabase + Postgres (real compendium data
 * seeded — 'elf'/PHB, 'wizard'/PHB, 'acolyte'/PHB, 'longsword'/PHB, 'shield'/
 * PHB, 'magic-missile'/PHB, per the fixtures already used by
 * character-race.test.ts / character-class.test.ts / character-spells.test.ts).
 * That stack is NOT available in this environment — written per CLAUDE.md §5
 * (test commands table) to run under `pnpm --filter @dungeon-hub/api test
 * character-import`, but not executed here. Treat as unverified until run
 * against a live stack.
 *
 * Stack required: Supabase + Postgres must be running locally.
 * Runs sequentially (singleFork) per vitest.config.ts.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';
import { addCampaignAndWorldMember } from '../helpers/add-world-member.js';

function validEnvelope(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    character: {
      id: '00000000-0000-0000-0000-0000000000aa', // deliberately not reused
      name: 'Imported Aria',
      worldId: '00000000-0000-0000-0000-0000000000bb', // deliberately ignored
      status: 'active', // deliberately downgraded to 'draft' on import
      xp: 900,
      data: {
        race: { slug: 'elf', source: 'PHB' },
        classes: [{ slug: 'wizard', source: 'PHB', level: 3, subclass: null }],
        background: { slug: 'acolyte', source: 'PHB' },
        spells: {
          wizard: {
            cantrips: [],
            known: [{ slug: 'magic-missile', source: 'PHB' }],
            prepared: [{ slug: 'shield', source: 'PHB' }],
          },
        },
      },
      inventory: [
        { instanceId: 'iid-1', itemSlug: 'longsword', itemSource: 'PHB', quantity: 1, state: 'carried' },
      ],
      ...overrides,
    },
  };
}

describe('POST /characters/import', () => {
  let owner: TestUser;
  let outsider: TestUser; // no relation to the target world at all
  let worldId: string;
  let campaignId: string;

  beforeAll(async () => {
    const app = await getTestApp();
    owner = await createTestUser();
    outsider = await createTestUser();

    const campaign = await app
      .inject({
        method: 'POST',
        url: '/api/v1/campaigns',
        headers: { authorization: `Bearer ${owner.accessToken}` },
        payload: { name: 'Import Test Campaign' },
      })
      .then((r) => r.json());
    campaignId = campaign.id;
    worldId = campaign.worldId;

    await addCampaignAndWorldMember(campaignId, owner.id, 'player');
  });

  afterAll(async () => {
    if (owner) await deleteTestUser(owner.id);
    if (outsider) await deleteTestUser(outsider.id);
    await closeTestApp();
  });

  it('SCEN-IMPORT-AUTH-01: no token → 401', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/characters/import',
      payload: { worldId, envelope: validEnvelope() },
    });
    expect(res.statusCode).toBe(401);
  });

  it('SCEN-IMPORT-VAL-01: malformed envelope (missing character) → 400 VALIDATION_FAILED', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/characters/import',
      headers: { authorization: `Bearer ${owner.accessToken}` },
      payload: { worldId, envelope: { schemaVersion: 1, exportedAt: 'x' } },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json() as { error: string; issues: Array<{ code: string }> };
    expect(body.error).toBe('VALIDATION_FAILED');
    expect(body.issues.length).toBeGreaterThan(0);
    for (const issue of body.issues) {
      expect(issue.code).toBe('MALFORMED_ENVELOPE');
    }
  });

  it('SCEN-IMPORT-VAL-02: wrong schemaVersion → 400 VALIDATION_FAILED with SCHEMA_VERSION_UNSUPPORTED', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/characters/import',
      headers: { authorization: `Bearer ${owner.accessToken}` },
      payload: { worldId, envelope: { ...validEnvelope(), schemaVersion: 2 } },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json() as { error: string; issues: Array<Record<string, unknown>> };
    expect(body.error).toBe('VALIDATION_FAILED');
    expect(body.issues).toEqual([
      { code: 'SCHEMA_VERSION_UNSUPPORTED', expected: 1, got: 2 },
    ]);
  });

  it('SCEN-IMPORT-WORLD-01: unknown worldId → 404 NOT_FOUND', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/characters/import',
      headers: { authorization: `Bearer ${owner.accessToken}` },
      payload: {
        worldId: '00000000-0000-0000-0000-000000000000',
        envelope: validEnvelope(),
      },
    });
    expect(res.statusCode).toBe(404);
  });

  it('SCEN-IMPORT-WORLD-02: authenticated but not a world member → 403 NOT_WORLD_MEMBER', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/characters/import',
      headers: { authorization: `Bearer ${outsider.accessToken}` },
      payload: { worldId, envelope: validEnvelope() },
    });
    expect(res.statusCode).toBe(403);
    const body = res.json() as { error: string };
    expect(body.error).toBe('NOT_WORLD_MEMBER');
  });

  it('SCEN-IMPORT-REFS-01: unresolved compendium ref → 400 UNRESOLVED_REFS naming kind+slug+source', async () => {
    const app = await getTestApp();
    const envelope = validEnvelope({
      data: {
        race: { slug: 'totally-not-a-real-race', source: 'HOMEBREW' },
      },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/characters/import',
      headers: { authorization: `Bearer ${owner.accessToken}` },
      payload: { worldId, envelope },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json() as { error: string; issues: Array<{ kind: string; slug: string; source: string }> };
    expect(body.error).toBe('UNRESOLVED_REFS');
    expect(body.issues).toContainEqual({
      kind: 'race',
      slug: 'totally-not-a-real-race',
      source: 'HOMEBREW',
    });
  });

  it('SCEN-IMPORT-PRIV-01: envelope claims status "active" → persisted row is "draft" (privilege boundary)', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/characters/import',
      headers: { authorization: `Bearer ${owner.accessToken}` },
      payload: { worldId, envelope: validEnvelope() },
    });
    expect(res.statusCode).toBe(201);
    const created = res.json() as { id: string; status: string; worldId: string; xp: number };
    expect(created.status).toBe('draft');
  });

  it('SCEN-IMPORT-ID-01: a new id is minted; envelope.character.id is never reused', async () => {
    const app = await getTestApp();
    const envelope = validEnvelope();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/characters/import',
      headers: { authorization: `Bearer ${owner.accessToken}` },
      payload: { worldId, envelope },
    });
    expect(res.statusCode).toBe(201);
    const created = res.json() as { id: string };
    expect(created.id).not.toBe(envelope.character.id);
  });

  it('SCEN-IMPORT-WORLD-03: worldId comes from the request body, not the envelope', async () => {
    const app = await getTestApp();
    const envelope = validEnvelope(); // envelope.character.worldId is a bogus id
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/characters/import',
      headers: { authorization: `Bearer ${owner.accessToken}` },
      payload: { worldId, envelope },
    });
    expect(res.statusCode).toBe(201);
    const created = res.json() as { worldId: string };
    expect(created.worldId).toBe(worldId);
    expect(created.worldId).not.toBe(envelope.character.worldId);
  });

  it('SCEN-IMPORT-XP-01: xp carries over verbatim', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/characters/import',
      headers: { authorization: `Bearer ${owner.accessToken}` },
      payload: { worldId, envelope: validEnvelope({ xp: 1337 }) },
    });
    expect(res.statusCode).toBe(201);
    const created = res.json() as { xp: number };
    expect(created.xp).toBe(1337);
  });

  it('SCEN-IMPORT-DATA-01: data and inventory survive the round-trip verbatim', async () => {
    const app = await getTestApp();
    const envelope = validEnvelope();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/characters/import',
      headers: { authorization: `Bearer ${owner.accessToken}` },
      payload: { worldId, envelope },
    });
    expect(res.statusCode).toBe(201);
    const created = res.json() as { data: Record<string, unknown>; inventory: unknown[] };
    expect(created.data['race']).toEqual({ slug: 'elf', source: 'PHB' });
    expect(created.inventory).toHaveLength(1);
    expect((created.inventory[0] as Record<string, unknown>)['itemSlug']).toBe('longsword');
  });
});
