import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';

/**
 * World State — Slice 2a (Factions world-scoped) + Slice 1 NPC stubs.
 *
 * Factions are now scoped to world_id (world-first-model Slice 2a):
 *   - Routes: /worlds/:worldId/factions
 *   - No `reputation` field
 *   - Auth via getWorldAccess (worldMembers)
 *
 * NPC routes are still campaign-scoped (Slice 2b pending):
 *   - Routes: /campaigns/:campaignId/npcs (unchanged)
 *   - Faction cross-scope check uses faction.worldId vs campaign.worldId
 */
describe('world — factions + npcs', () => {
  let dm: TestUser;
  let alice: TestUser;
  let outsider: TestUser;
  let campaignId: string;
  let worldId: string;
  let otherCampaignId: string;
  let otherWorldId: string;
  let hexId: string;

  beforeAll(async () => {
    const app = await getTestApp();
    dm = await createTestUser();
    alice = await createTestUser();
    outsider = await createTestUser();

    const campaign = await app
      .inject({
        method: 'POST',
        url: '/api/v1/campaigns',
        headers: { authorization: `Bearer ${dm.accessToken}` },
        payload: { name: 'World Campaign' },
      })
      .then((r) => r.json());
    campaignId = campaign.id;
    worldId = campaign.worldId;

    const otherCampaign = await app
      .inject({
        method: 'POST',
        url: '/api/v1/campaigns',
        headers: { authorization: `Bearer ${dm.accessToken}` },
        payload: { name: 'Other Campaign' },
      })
      .then((r) => r.json());
    otherCampaignId = otherCampaign.id;
    otherWorldId = otherCampaign.worldId;

    const { addCampaignAndWorldMember } = await import('../helpers/add-world-member.js');
    await addCampaignAndWorldMember(campaignId, alice.id, 'player');

    // Hexes are now world-scoped (world-first-model Slice 1).
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

  // Helper creates a faction via the world-scoped route (Slice 2a).
  async function createFaction(payload: Record<string, unknown>): Promise<any> {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/worlds/${worldId}/factions`,
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
      url: `/api/v1/campaigns/${campaignId}/npcs`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
      payload,
    });
    expect(res.statusCode).toBe(201);
    return res.json();
  }

  // ---- Factions (world-scoped — Slice 2a) ----------------------------------
  describe('factions', () => {
    it('GM creates faction with state and dmNotes (no reputation field)', async () => {
      const f = await createFaction({
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
      expect(f.dmNotes).toBe('Cuentan con asesinos');
    });

    it('player cannot create faction (REQ-FAC-02 + REQ-CROSS-04)', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/worlds/${worldId}/factions`,
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: { name: 'Player Attempt' },
      });
      expect(res.statusCode).toBe(403);
    });

    it('non-member (outsider) gets 403 on list (REQ-FAC-02)', async () => {
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
      await createFaction({ name: 'Knights', dmNotes: 'secret order' });
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/worlds/${worldId}/factions`,
        headers: { authorization: `Bearer ${alice.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      const data = res.json().data;
      expect(data.length).toBeGreaterThan(0);
      expect(data.every((f: any) => f.dmNotes === undefined)).toBe(true);
      // REQ-FAC-01: no reputation field
      expect(data.every((f: any) => f.reputation === undefined)).toBe(true);
    });

    it('400 on POST with missing required name field (REQ-CROSS-04)', async () => {
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
      const f = await createFaction({ name: 'To patch' });
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/factions/${f.id}`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
        payload: { state: 'dormant' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().state).toBe('dormant');
      // REQ-FAC-01: no reputation in response
      expect(res.json().reputation).toBeUndefined();
    });

    it('player cannot PATCH faction', async () => {
      const app = await getTestApp();
      const f = await createFaction({ name: 'Locked' });
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/factions/${f.id}`,
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: { state: 'dormant' },
      });
      expect(res.statusCode).toBe(403);
    });

    it('DELETE removes the faction', async () => {
      const app = await getTestApp();
      const f = await createFaction({ name: 'Doomed' });
      const del = await app.inject({
        method: 'DELETE',
        url: `/api/v1/factions/${f.id}`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
      });
      expect(del.statusCode).toBe(204);
    });

    it('old /campaigns/:campaignId/factions route returns 404 (REQ-FAC-02)', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/campaigns/${campaignId}/factions`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  // ---- NPCs (still campaign-scoped — Slice 2b pending) ----------------------
  describe('npcs', () => {
    let factionId: string;
    beforeAll(async () => {
      // Create faction via world-scoped route (Slice 2a)
      const f = await createFaction({ name: 'Royal Guard' });
      factionId = f.id;
    });

    it('GM creates NPC with faction + hex link', async () => {
      const npc = await createNpc({
        name: 'Captain Aldric',
        race: 'Human',
        description: 'Capitán de la guardia',
        dmNotes: 'Es un traidor en realidad',
        factionId,
        hexId,
        status: 'alive',
      });
      expect(npc.factionId).toBe(factionId);
      expect(npc.hexId).toBe(hexId);
      expect(npc.dmNotes).toBe('Es un traidor en realidad');
    });

    it('FACTION_NOT_FOUND if factionId does not exist', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/campaigns/${campaignId}/npcs`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
        payload: {
          name: 'Orphan',
          factionId: '00000000-0000-0000-0000-000000000000',
        },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().issues[0].code).toBe('FACTION_NOT_FOUND');
    });

    it('FACTION_NOT_FOUND if faction belongs to another world (cross-world check)', async () => {
      const app = await getTestApp();
      // Create a faction in the OTHER world (otherWorldId)
      const otherFaction = await app
        .inject({
          method: 'POST',
          url: `/api/v1/worlds/${otherWorldId}/factions`,
          headers: { authorization: `Bearer ${dm.accessToken}` },
          payload: { name: 'Foreign Faction' },
        })
        .then((r) => r.json());

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/campaigns/${campaignId}/npcs`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
        payload: { name: 'Cross-world NPC', factionId: otherFaction.id },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().issues[0].code).toBe('FACTION_NOT_FOUND');
    });

    it('HEX_NOT_FOUND if hex does not exist', async () => {
      // TODO world-first-model Slice 2b: upgrade to cross-world hex validation.
      const app = await getTestApp();
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/campaigns/${campaignId}/npcs`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
        payload: { name: 'Wrong hex', hexId: '00000000-0000-0000-0000-000000000000' },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().issues[0].code).toBe('HEX_NOT_FOUND');
    });

    it('player lists NPCs without dmNotes', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/campaigns/${campaignId}/npcs`,
        headers: { authorization: `Bearer ${alice.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      const data = res.json().data;
      expect(data.length).toBeGreaterThan(0);
      expect(data.every((n: any) => n.dmNotes === undefined)).toBe(true);
    });

    it('deleting faction sets NPCs.factionId = NULL (SET NULL cascade)', async () => {
      const app = await getTestApp();
      const f = await createFaction({ name: 'Goners' });
      const npc = await createNpc({ name: 'Member', factionId: f.id });

      await app.inject({
        method: 'DELETE',
        url: `/api/v1/factions/${f.id}`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
      });

      // NPC still exists but without faction.
      const after = await app
        .inject({
          method: 'GET',
          url: `/api/v1/npcs/${npc.id}`,
          headers: { authorization: `Bearer ${dm.accessToken}` },
        })
        .then((r) => r.json());
      expect(after.factionId).toBeNull();
    });

    it('deleting hex sets NPCs.hexId = NULL', async () => {
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

    it('PATCH changes status to dead', async () => {
      const app = await getTestApp();
      const npc = await createNpc({ name: 'About to die' });
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/npcs/${npc.id}`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
        payload: { status: 'dead' },
      });
      expect(res.json().status).toBe('dead');
    });
  });
});
