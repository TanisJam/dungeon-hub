/**
 * Integration tests — codex-knowledge A-5: POST /sessions/:id/complete
 * extended with optional knowledgeGrants[].
 *
 * RED-first per STRICT TDD (codex-knowledge SDD tasks #1950).
 *
 * Design: FORK 1 (#1944) — HYBRID unlock model. DM bulk-grants knowledge
 * when closing a session. The grant loop runs INSIDE the existing complete
 * transaction (OQ4 confirmed, design #1948 §3.1).
 * Idempotent via character_knowledge UNIQUE ON CONFLICT DO NOTHING.
 *
 * REQ-CK-UNLOCK-01, UNLOCK-02, UNLOCK-03, UNLOCK-04, UNLOCK-05, UNLOCK-06, UNLOCK-07.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';
import { addCampaignAndWorldMember } from '../helpers/add-world-member.js';

describe('codex-knowledge A-5: POST /sessions/:id/complete + knowledgeGrants[]', () => {
  let dm: TestUser;
  let player1: TestUser;
  let player2: TestUser;
  let campaignId: string;
  let worldId: string;
  let char1Id: string;
  let char2Id: string;

  beforeAll(async () => {
    const app = await getTestApp();

    dm = await createTestUser();
    player1 = await createTestUser();
    player2 = await createTestUser();

    const campaign = await app.inject({
      method: 'POST',
      url: '/api/v1/campaigns',
      headers: { authorization: `Bearer ${dm.accessToken}` },
      payload: { name: 'A5 Knowledge Campaign' },
    }).then((r) => r.json());
    campaignId = campaign.id;
    worldId = campaign.worldId;

    await addCampaignAndWorldMember(campaignId, player1.id, 'player');
    await addCampaignAndWorldMember(campaignId, player2.id, 'player');

    char1Id = await makeChar(player1, 'A5 Char1');
    char2Id = await makeChar(player2, 'A5 Char2');
  });

  afterAll(async () => {
    if (dm) await deleteTestUser(dm.id);
    if (player1) await deleteTestUser(player1.id);
    if (player2) await deleteTestUser(player2.id);
    await closeTestApp();
  });

  async function makeChar(user: TestUser, name: string): Promise<string> {
    const app = await getTestApp();
    const c = await app.inject({
      method: 'POST',
      url: '/api/v1/characters',
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: { worldId, name: `${name} ${Math.random().toFixed(4)}` },
    }).then((r) => r.json());
    return c.id as string;
  }

  async function createAndStartSession(title: string, ...charIds: string[]): Promise<string> {
    const app = await getTestApp();
    const session = await app.inject({
      method: 'POST',
      url: '/api/v1/sessions',
      headers: { authorization: `Bearer ${dm.accessToken}` },
      payload: { campaignId, title },
    }).then((r) => r.json());

    for (let i = 0; i < charIds.length; i++) {
      const charUser = i === 0 ? player1 : player2;
      await app.inject({
        method: 'POST',
        url: `/api/v1/sessions/${session.id}/join`,
        headers: { authorization: `Bearer ${charUser.accessToken}` },
        payload: { characterId: charIds[i] },
      });
    }

    await app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${session.id}/start`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
    });

    return session.id as string;
  }

  // ── (a) Happy path: grant + session completes ──────────────────────────────

  it('GM completes session with knowledgeGrants → session completed + character_knowledge row exists', async () => {
    const app = await getTestApp();
    const c1 = await makeChar(player1, 'A5-a-c1');
    const sessionId = await createAndStartSession('A5 Happy Path', c1);

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${sessionId}/complete`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
      payload: {
        knowledgeGrants: [
          { characterId: c1, kind: 'bestiary', refKey: 'goblin', refSource: 'mm' },
        ],
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('completed');

    // Verify character_knowledge row exists in DB
    const { db } = await import('../../src/infra/db/client.js');
    const { characterKnowledge } = await import('../../src/infra/db/schema.js');
    const rows = await db
      .select()
      .from(characterKnowledge)
      .where(
        and(
          eq(characterKnowledge.characterId, c1),
          eq(characterKnowledge.kind, 'bestiary'),
          eq(characterKnowledge.refKey, 'goblin'),
          eq(characterKnowledge.refSource, 'mm'),
        ),
      );
    expect(rows.length).toBe(1);
  });

  // ── (b) Idempotent: duplicate grant = no error, no duplicate row ──────────

  it('duplicate knowledgeGrants entry → 200, still only 1 row (idempotent ON CONFLICT DO NOTHING)', async () => {
    const app = await getTestApp();
    const c1 = await makeChar(player1, 'A5-b-c1');
    const s1 = await createAndStartSession('A5 Idempotent S1', c1);
    const s2 = await createAndStartSession('A5 Idempotent S2', c1);

    // Grant in first session
    await app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${s1}/complete`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
      payload: {
        knowledgeGrants: [{ characterId: c1, kind: 'bestiary', refKey: 'troll', refSource: 'mm' }],
      },
    });

    // Grant same thing again in second session
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${s2}/complete`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
      payload: {
        knowledgeGrants: [{ characterId: c1, kind: 'bestiary', refKey: 'troll', refSource: 'mm' }],
      },
    });

    expect(res.statusCode).toBe(200);

    // Still only one row
    const { db } = await import('../../src/infra/db/client.js');
    const { characterKnowledge } = await import('../../src/infra/db/schema.js');
    const rows = await db
      .select()
      .from(characterKnowledge)
      .where(
        and(
          eq(characterKnowledge.characterId, c1),
          eq(characterKnowledge.kind, 'bestiary'),
          eq(characterKnowledge.refKey, 'troll'),
          eq(characterKnowledge.refSource, 'mm'),
        ),
      );
    expect(rows.length).toBe(1);
  });

  // ── (c) knowledgeGrants omitted → session completes unchanged (backward compat) ─

  it('knowledgeGrants omitted → session completes normally (backward compat, REQ-CK-UNLOCK-03)', async () => {
    const app = await getTestApp();
    const c1 = await makeChar(player1, 'A5-c-c1');
    const sessionId = await createAndStartSession('A5 No Grants', c1);

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${sessionId}/complete`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
      payload: { summary: 'No grants this session' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('completed');
  });

  // ── (d) Non-GM caller with non-empty knowledgeGrants → 403 ───────────────

  it('non-GM with knowledgeGrants → 403 FORBIDDEN (REQ-CK-UNLOCK-04)', async () => {
    const app = await getTestApp();
    const c1 = await makeChar(player1, 'A5-d-c1');
    const sessionId = await createAndStartSession('A5 Non-GM Grants', c1);

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${sessionId}/complete`,
      headers: { authorization: `Bearer ${player1.accessToken}` },
      payload: {
        knowledgeGrants: [{ characterId: c1, kind: 'bestiary', refKey: 'orc', refSource: 'mm' }],
      },
    });

    expect(res.statusCode).toBe(403);
  });

  // ── (e) knowledgeGrants entry with non-participant characterId → silently skipped ─

  it('knowledgeGrants with non-participant characterId → 200 (skipped, not errored)', async () => {
    const app = await getTestApp();
    const c1 = await makeChar(player1, 'A5-e-c1');
    const outsiderChar = await makeChar(player2, 'A5-e-outsider');
    const sessionId = await createAndStartSession('A5 Skip Non-Participant', c1);
    // outsiderChar is NOT in this session

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${sessionId}/complete`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
      payload: {
        knowledgeGrants: [
          // valid participant
          { characterId: c1, kind: 'bestiary', refKey: 'wolf', refSource: 'mm' },
          // non-participant — should be skipped, not cause error
          { characterId: outsiderChar, kind: 'bestiary', refKey: 'wolf', refSource: 'mm' },
        ],
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('completed');
  });
});
