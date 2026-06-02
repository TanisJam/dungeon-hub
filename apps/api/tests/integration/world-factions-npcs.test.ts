import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';

/**
 * World State — Slice 2b (NPCs + N:M faction membership + reputation).
 *
 * Factions: /worlds/:worldId/factions (Slice 2a)
 * NPCs: /worlds/:worldId/npcs (Slice 2b) — worldId on NPC, no campaignId, no factionId FK
 * NPC Faction Membership: POST/DELETE /worlds/:worldId/npcs/:npcId/factions/:factionId
 * Reputation: PUT/GET /worlds/:worldId/characters/:characterId/factions/:factionId/reputation
 */
describe('world — factions + npcs + reputation', () => {
  let dm: TestUser;
  let alice: TestUser;
  let outsider: TestUser;
  let worldId: string;
  let otherWorldId: string;
  let hexId: string;

  beforeAll(async () => {
    const app = await getTestApp();
    dm = await createTestUser();
    alice = await createTestUser();
    outsider = await createTestUser();

    // Primary world via campaign creation (creates world automatically).
    const campaign = await app
      .inject({
        method: 'POST',
        url: '/api/v1/campaigns',
        headers: { authorization: `Bearer ${dm.accessToken}` },
        payload: { name: 'World Campaign' },
      })
      .then((r) => r.json());
    worldId = campaign.worldId;

    // Second world for cross-world tests.
    const otherCampaign = await app
      .inject({
        method: 'POST',
        url: '/api/v1/campaigns',
        headers: { authorization: `Bearer ${dm.accessToken}` },
        payload: { name: 'Other Campaign' },
      })
      .then((r) => r.json());
    otherWorldId = otherCampaign.worldId;

    const { addCampaignAndWorldMember } = await import('../helpers/add-world-member.js');
    await addCampaignAndWorldMember(campaign.id, alice.id, 'player');

    // Hexes are world-scoped (Slice 1).
    hexId = (
      await app
        .inject({
          method: 'POST',
          url: `/api/v1/worlds/${worldId}/hexes`,
          headers: { authorization: `Bearer ${dm.accessToken}` },
          payload: { q: 0, r: 0, name: 'Capital' },
        })
        .then((r) => r.json())
    ).id;
  });

  afterAll(async () => {
    if (dm) await deleteTestUser(dm.id);
    if (alice) await deleteTestUser(alice.id);
    if (outsider) await deleteTestUser(outsider.id);
    await closeTestApp();
  });

  // Helpers.
  async function createFaction(wId: string, payload: Record<string, unknown>): Promise<any> {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/worlds/${wId}/factions`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
      payload,
    });
    expect(res.statusCode).toBe(201);
    return res.json();
  }

  async function createNpc(payload: Record<string, unknown>): Promise<any> {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/worlds/${worldId}/npcs`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
      payload,
    });
    expect(res.statusCode).toBe(201);
    return res.json();
  }

  async function createCharacter(wId: string, userId: string, token: string): Promise<string> {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/characters',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        worldId: wId,
        name: 'Test Hero',
        data: { class: 'Fighter', level: 1, race: 'Human' },
      },
    });
    expect(res.statusCode).toBe(201);
    return res.json().id;
  }

  // ---- Factions (world-scoped — Slice 2a) ----------------------------------
  describe('factions', () => {
    it('GM creates faction (no reputation field, has worldId)', async () => {
      const f = await createFaction(worldId, {
        name: 'Thieves Guild',
        description: 'Mercaderes y ladrones',
        dmNotes: 'Cuentan con asesinos',
        state: 'active',
      });
      // REQ-FAC-01: worldId present, no campaignId, no reputation
      expect(f.worldId).toBe(worldId);
      expect(f.campaignId).toBeUndefined();
      expect(f.reputation).toBeUndefined();
      expect(f.state).toBe('active');
    });

    it('player cannot create faction', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/worlds/${worldId}/factions`,
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: { name: 'Player Attempt' },
      });
      expect(res.statusCode).toBe(403);
    });

    it('non-member gets 403 on list', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/worlds/${worldId}/factions`,
        headers: { authorization: `Bearer ${outsider.accessToken}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it('player sees factions without dmNotes', async () => {
      const app = await getTestApp();
      await createFaction(worldId, { name: 'Knights', dmNotes: 'secret order' });
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/worlds/${worldId}/factions`,
        headers: { authorization: `Bearer ${alice.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      const data = res.json().data;
      expect(data.length).toBeGreaterThan(0);
      expect(data.every((f: any) => f.dmNotes === undefined)).toBe(true);
      expect(data.every((f: any) => f.reputation === undefined)).toBe(true);
    });

    it('400 on POST with missing name (REQ-CROSS-04)', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/worlds/${worldId}/factions`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
        payload: { description: 'no name' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('PATCH changes state', async () => {
      const app = await getTestApp();
      const f = await createFaction(worldId, { name: 'To patch' });
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/factions/${f.id}`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
        payload: { state: 'dormant' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().state).toBe('dormant');
      expect(res.json().reputation).toBeUndefined();
    });

    it('DELETE removes the faction', async () => {
      const app = await getTestApp();
      const f = await createFaction(worldId, { name: 'Doomed' });
      const del = await app.inject({
        method: 'DELETE',
        url: `/api/v1/factions/${f.id}`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
      });
      expect(del.statusCode).toBe(204);
    });

    it('old /campaigns/:campaignId/factions route returns 404 (REQ-FAC-02)', async () => {
      // We need the campaignId for this test — use beforeAll campaignId via campaign creation.
      // Re-create a campaign just to get an ID we can use for the 404 check.
      const app = await getTestApp();
      const c = await app
        .inject({
          method: 'POST',
          url: '/api/v1/campaigns',
          headers: { authorization: `Bearer ${dm.accessToken}` },
          payload: { name: 'Temp campaign' },
        })
        .then((r) => r.json());
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/campaigns/${c.id}/factions`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  // ---- NPCs (world-scoped — Slice 2b) ----------------------------------------
  describe('npcs', () => {
    it('GM creates NPC — worldId on response, factions: [] default (REQ-NPC-01)', async () => {
      const npc = await createNpc({ name: 'Lone Wolf', race: 'Human' });
      // REQ-NPC-01: worldId present, no campaignId, no factionId direct column
      expect(npc.worldId).toBe(worldId);
      expect(npc.campaignId).toBeUndefined();
      expect(npc.factionId).toBeUndefined();
      // REQ-NPC-02: factions array (empty on creation)
      expect(Array.isArray(npc.factions)).toBe(true);
      expect(npc.factions).toHaveLength(0);
    });

    it('GM creates NPC with hex link (cross-scope hex check — ADR-5)', async () => {
      const npc = await createNpc({
        name: 'Stationed Guard',
        race: 'Half-Orc',
        hexId,
        status: 'alive',
      });
      expect(npc.hexId).toBe(hexId);
      expect(npc.worldId).toBe(worldId);
    });

    it('HEX_NOT_FOUND if hex belongs to another world (ADR-5)', async () => {
      const app = await getTestApp();
      // Create hex in the OTHER world.
      const otherHex = await app
        .inject({
          method: 'POST',
          url: `/api/v1/worlds/${otherWorldId}/hexes`,
          headers: { authorization: `Bearer ${dm.accessToken}` },
          payload: { q: 99, r: 99 },
        })
        .then((r) => r.json());

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/worlds/${worldId}/npcs`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
        payload: { name: 'Cross-world hex NPC', hexId: otherHex.id },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().issues[0].code).toBe('HEX_NOT_FOUND');
    });

    it('player lists NPCs without dmNotes', async () => {
      const app = await getTestApp();
      await createNpc({ name: 'Secret NPC', dmNotes: 'This is a spy' });
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/worlds/${worldId}/npcs`,
        headers: { authorization: `Bearer ${alice.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      const data = res.json().data;
      expect(data.length).toBeGreaterThan(0);
      expect(data.every((n: any) => n.dmNotes === undefined)).toBe(true);
    });

    it('non-member gets 403 on NPC list (REQ-NPC-05)', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/worlds/${worldId}/npcs`,
        headers: { authorization: `Bearer ${outsider.accessToken}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it('PATCH changes status to dead', async () => {
      const app = await getTestApp();
      const npc = await createNpc({ name: 'About to die' });
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/npcs/${npc.id}`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
        payload: { status: 'dead' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe('dead');
    });

    it('old /campaigns/:campaignId/npcs route returns 404 (REQ-NPC-05)', async () => {
      const app = await getTestApp();
      const c = await app
        .inject({
          method: 'POST',
          url: '/api/v1/campaigns',
          headers: { authorization: `Bearer ${dm.accessToken}` },
          payload: { name: 'Another Temp' },
        })
        .then((r) => r.json());
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/campaigns/${c.id}/npcs`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
      });
      expect(res.statusCode).toBe(404);
    });

    it('deleting hex sets NPC.hexId = NULL (SET NULL cascade)', async () => {
      const app = await getTestApp();
      const tempHex = (
        await app
          .inject({
            method: 'POST',
            url: `/api/v1/worlds/${worldId}/hexes`,
            headers: { authorization: `Bearer ${dm.accessToken}` },
            payload: { q: 50, r: 50 },
          })
          .then((r) => r.json())
      ).id;
      const npc = await createNpc({ name: 'Stranded', hexId: tempHex });

      await app.inject({
        method: 'DELETE',
        url: `/api/v1/hexes/${tempHex}`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
      });

      const after = await app
        .inject({
          method: 'GET',
          url: `/api/v1/npcs/${npc.id}`,
          headers: { authorization: `Bearer ${dm.accessToken}` },
        })
        .then((r) => r.json());
      expect(after.hexId).toBeNull();
    });
  });

  // ---- NPC Faction Membership (N:M — Slice 2b) --------------------------------
  describe('npc faction membership (N:M)', () => {
    let factionId: string;
    let npcId: string;

    beforeAll(async () => {
      const f = await createFaction(worldId, { name: 'Royal Guard' });
      factionId = f.id;
      const n = await createNpc({ name: 'Captain Aldric', race: 'Human' });
      npcId = n.id;
    });

    it('GM attaches faction to NPC (same world) — REQ-NPC-02', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/worlds/${worldId}/npcs/${npcId}/factions/${factionId}`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
    });

    it('NPC now shows faction in factions array', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/npcs/${npcId}`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      const npc = res.json();
      expect(Array.isArray(npc.factions)).toBe(true);
      expect(npc.factions.some((f: any) => f.id === factionId)).toBe(true);
    });

    it('NPC can belong to a second faction (0..N — REQ-NPC-02)', async () => {
      const app = await getTestApp();
      const f2 = await createFaction(worldId, { name: 'Merchants Guild' });
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/worlds/${worldId}/npcs/${npcId}/factions/${f2.id}`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
      });
      expect(res.statusCode).toBe(200);

      // NPC now has 2 factions.
      const npc = await app
        .inject({
          method: 'GET',
          url: `/api/v1/npcs/${npcId}`,
          headers: { authorization: `Bearer ${dm.accessToken}` },
        })
        .then((r) => r.json());
      expect(npc.factions.length).toBeGreaterThanOrEqual(2);
    });

    it('duplicate attach rejected (PK constraint → handled as error)', async () => {
      const app = await getTestApp();
      // Second attach of same pair → should fail (DB PK violation → 500 or 400 depending on error handling).
      // We verify it is NOT 200 (success) — the link must not duplicate.
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/worlds/${worldId}/npcs/${npcId}/factions/${factionId}`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
      });
      // PK violation — expect non-2xx response.
      expect(res.statusCode).not.toBe(200);
      expect(res.statusCode).not.toBe(201);
    });

    it('cross-world attach rejected — NPC_FACTION_CROSS_WORLD (REQ-NPC-02, REQ-NPC-03)', async () => {
      const app = await getTestApp();
      // Create faction in the OTHER world.
      const otherFaction = await createFaction(otherWorldId, { name: 'Foreign Guild' });

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/worlds/${worldId}/npcs/${npcId}/factions/${otherFaction.id}`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().issues[0].code).toBe('NPC_FACTION_CROSS_WORLD');
    });

    it('GM detaches faction from NPC', async () => {
      const app = await getTestApp();
      // Create a fresh NPC + faction pair so detach doesn't interfere with other tests.
      const npc2 = await createNpc({ name: 'Temporary Member' });
      const f = await createFaction(worldId, { name: 'Temp Faction' });

      await app.inject({
        method: 'POST',
        url: `/api/v1/worlds/${worldId}/npcs/${npc2.id}/factions/${f.id}`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
      });

      const detach = await app.inject({
        method: 'DELETE',
        url: `/api/v1/worlds/${worldId}/npcs/${npc2.id}/factions/${f.id}`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
      });
      expect(detach.statusCode).toBe(204);

      // NPC should have no factions now.
      const after = await app
        .inject({
          method: 'GET',
          url: `/api/v1/npcs/${npc2.id}`,
          headers: { authorization: `Bearer ${dm.accessToken}` },
        })
        .then((r) => r.json());
      expect(after.factions.some((f2: any) => f2.id === f.id)).toBe(false);
    });

    it('NPC with zero factions returns factions: [] — REQ-NPC-02', async () => {
      const app = await getTestApp();
      const npc = await createNpc({ name: 'Lone Wolf II' });
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/npcs/${npc.id}`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().factions).toEqual([]);
    });

    it('deleting faction removes membership rows (CASCADE, NPC survives)', async () => {
      const app = await getTestApp();
      const f = await createFaction(worldId, { name: 'Goners Faction' });
      const npc = await createNpc({ name: 'Ex-member' });

      await app.inject({
        method: 'POST',
        url: `/api/v1/worlds/${worldId}/npcs/${npc.id}/factions/${f.id}`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
      });

      await app.inject({
        method: 'DELETE',
        url: `/api/v1/factions/${f.id}`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
      });

      // NPC still exists, faction gone from factions array.
      const after = await app
        .inject({
          method: 'GET',
          url: `/api/v1/npcs/${npc.id}`,
          headers: { authorization: `Bearer ${dm.accessToken}` },
        })
        .then((r) => r.json());
      expect(after.id).toBe(npc.id);
      expect(after.factions.some((f2: any) => f2.id === f.id)).toBe(false);
    });
  });

  // ---- Character Faction Reputation (Slice 2b) --------------------------------
  describe('character faction reputation', () => {
    let factionId: string;
    let characterId: string;

    beforeAll(async () => {
      const f = await createFaction(worldId, { name: 'Reputation Faction' });
      factionId = f.id;
      characterId = await createCharacter(worldId, dm.id, dm.accessToken);
    });

    it('PUT sets reputation for character×faction (REQ-NPC-04)', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'PUT',
        url: `/api/v1/worlds/${worldId}/characters/${characterId}/factions/${factionId}/reputation`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
        payload: { value: -50 },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.value).toBe(-50);
      expect(body.characterId).toBe(characterId);
      expect(body.factionId).toBe(factionId);
    });

    it('PUT updates existing reputation (upsert — REQ-NPC-04)', async () => {
      const app = await getTestApp();
      // First set.
      await app.inject({
        method: 'PUT',
        url: `/api/v1/worlds/${worldId}/characters/${characterId}/factions/${factionId}/reputation`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
        payload: { value: 10 },
      });
      // Update same pair.
      const res = await app.inject({
        method: 'PUT',
        url: `/api/v1/worlds/${worldId}/characters/${characterId}/factions/${factionId}/reputation`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
        payload: { value: 75 },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().value).toBe(75);
    });

    it('GET retrieves current reputation', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/worlds/${worldId}/characters/${characterId}/factions/${factionId}/reputation`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(typeof res.json().value).toBe('number');
    });

    it('GET returns value 0 for non-existent reputation row', async () => {
      const app = await getTestApp();
      const f2 = await createFaction(worldId, { name: 'New Faction No Rep' });
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/worlds/${worldId}/characters/${characterId}/factions/${f2.id}/reputation`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().value).toBe(0);
    });

    it('reputation value has no cap — accepts large positive values', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'PUT',
        url: `/api/v1/worlds/${worldId}/characters/${characterId}/factions/${factionId}/reputation`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
        payload: { value: 999999 },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().value).toBe(999999);
    });

    it('reputation value has no floor — accepts large negative values', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'PUT',
        url: `/api/v1/worlds/${worldId}/characters/${characterId}/factions/${factionId}/reputation`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
        payload: { value: -999999 },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().value).toBe(-999999);
    });

    it('cross-world reputation rejected — REPUTATION_CROSS_WORLD (REQ-NPC-04)', async () => {
      const app = await getTestApp();
      // Create faction in the OTHER world.
      const otherFaction = await createFaction(otherWorldId, { name: 'Rival Faction' });

      const res = await app.inject({
        method: 'PUT',
        url: `/api/v1/worlds/${worldId}/characters/${characterId}/factions/${otherFaction.id}/reputation`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
        payload: { value: 100 },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().issues[0].code).toBe('REPUTATION_CROSS_WORLD');
    });

    it('non-member cannot set reputation (403)', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'PUT',
        url: `/api/v1/worlds/${worldId}/characters/${characterId}/factions/${factionId}/reputation`,
        headers: { authorization: `Bearer ${outsider.accessToken}` },
        payload: { value: 100 },
      });
      expect(res.statusCode).toBe(403);
    });
  });
});
