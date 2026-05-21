import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';

/**
 * World State — Slice 1 (Factions + NPCs).
 * CRUD bajo campaña, visibility por rol, cross-links opcionales NPC → Faction
 * y NPC → Hex (con SET NULL en cascade).
 */
describe('world — factions + npcs', () => {
  let dm: TestUser;
  let alice: TestUser;
  let outsider: TestUser;
  let campaignId: string;
  let otherCampaignId: string;
  let hexId: string;

  beforeAll(async () => {
    const app = await getTestApp();
    dm = await createTestUser();
    alice = await createTestUser();
    outsider = await createTestUser();

    campaignId = (
      await app
        .inject({
          method: 'POST',
          url: '/api/v1/campaigns',
          headers: { authorization: `Bearer ${dm.accessToken}` },
          payload: { name: 'World Campaign' },
        })
        .then((r) => r.json())
    ).id;
    otherCampaignId = (
      await app
        .inject({
          method: 'POST',
          url: '/api/v1/campaigns',
          headers: { authorization: `Bearer ${dm.accessToken}` },
          payload: { name: 'Other Campaign' },
        })
        .then((r) => r.json())
    ).id;

    const { db } = await import('../../src/infra/db/client.js');
    const { campaignMembers } = await import('../../src/infra/db/schema.js');
    await db.insert(campaignMembers).values({ campaignId, userId: alice.id, role: 'player' });

    hexId = (
      await app
        .inject({
          method: 'POST',
          url: `/api/v1/campaigns/${campaignId}/hexes`,
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

  async function createFaction(payload: Record<string, unknown>): Promise<any> {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${campaignId}/factions`,
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

  // ---- Factions --------------------------------------------------------
  describe('factions', () => {
    it('GM crea facción con state, reputation, dmNotes', async () => {
      const f = await createFaction({
        name: 'Thieves Guild',
        description: 'Mercaderes y ladrones',
        dmNotes: 'Cuentan con asesinos',
        reputation: -5,
      });
      expect(f.state).toBe('active');
      expect(f.reputation).toBe(-5);
      expect(f.dmNotes).toBe('Cuentan con asesinos');
    });

    it('player NO puede crear', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/campaigns/${campaignId}/factions`,
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: { name: 'Player Attempt' },
      });
      expect(res.statusCode).toBe(403);
    });

    it('outsider NO puede listar', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/campaigns/${campaignId}/factions`,
        headers: { authorization: `Bearer ${outsider.accessToken}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it('player ve facciones sin dmNotes', async () => {
      const app = await getTestApp();
      await createFaction({ name: 'Knights', dmNotes: 'secret order' });
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/campaigns/${campaignId}/factions`,
        headers: { authorization: `Bearer ${alice.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      const data = res.json().data;
      expect(data.length).toBeGreaterThan(0);
      expect(data.every((f: any) => f.dmNotes === undefined)).toBe(true);
    });

    it('PATCH cambia state y reputation', async () => {
      const app = await getTestApp();
      const f = await createFaction({ name: 'To patch' });
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/factions/${f.id}`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
        payload: { state: 'dormant', reputation: 10 },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().state).toBe('dormant');
      expect(res.json().reputation).toBe(10);
    });

    it('player NO puede PATCH', async () => {
      const app = await getTestApp();
      const f = await createFaction({ name: 'Locked' });
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/factions/${f.id}`,
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: { reputation: 99 },
      });
      expect(res.statusCode).toBe(403);
    });

    it('DELETE borra la facción', async () => {
      const app = await getTestApp();
      const f = await createFaction({ name: 'Doomed' });
      const del = await app.inject({
        method: 'DELETE',
        url: `/api/v1/factions/${f.id}`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
      });
      expect(del.statusCode).toBe(204);
    });
  });

  // ---- NPCs ------------------------------------------------------------
  describe('npcs', () => {
    let factionId: string;
    beforeAll(async () => {
      const f = await createFaction({ name: 'Royal Guard' });
      factionId = f.id;
    });

    it('GM crea NPC con faction + hex link', async () => {
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

    it('FACTION_NOT_FOUND si factionId no existe', async () => {
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

    it('FACTION_NOT_FOUND si la facción es de otra campaña', async () => {
      const app = await getTestApp();
      const otherFaction = await app
        .inject({
          method: 'POST',
          url: `/api/v1/campaigns/${otherCampaignId}/factions`,
          headers: { authorization: `Bearer ${dm.accessToken}` },
          payload: { name: 'Foreign' },
        })
        .then((r) => r.json());

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/campaigns/${campaignId}/npcs`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
        payload: { name: 'Cross-campaign', factionId: otherFaction.id },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().issues[0].code).toBe('FACTION_NOT_FOUND');
    });

    it('HEX_NOT_FOUND si el hex no es de la campaña', async () => {
      const app = await getTestApp();
      const otherHex = await app
        .inject({
          method: 'POST',
          url: `/api/v1/campaigns/${otherCampaignId}/hexes`,
          headers: { authorization: `Bearer ${dm.accessToken}` },
          payload: { q: 0, r: 0 },
        })
        .then((r) => r.json());

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/campaigns/${campaignId}/npcs`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
        payload: { name: 'Wrong hex', hexId: otherHex.id },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().issues[0].code).toBe('HEX_NOT_FOUND');
    });

    it('player lista NPCs sin dmNotes', async () => {
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

    it('borrar la faction setea NPCs.factionId = NULL (SET NULL cascade)', async () => {
      const app = await getTestApp();
      const f = await createFaction({ name: 'Goners' });
      const npc = await createNpc({ name: 'Member', factionId: f.id });

      await app.inject({
        method: 'DELETE',
        url: `/api/v1/factions/${f.id}`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
      });

      // NPC sigue existiendo, pero sin faction.
      const after = await app
        .inject({
          method: 'GET',
          url: `/api/v1/npcs/${npc.id}`,
          headers: { authorization: `Bearer ${dm.accessToken}` },
        })
        .then((r) => r.json());
      expect(after.factionId).toBeNull();
    });

    it('borrar el hex setea NPCs.hexId = NULL', async () => {
      const app = await getTestApp();
      const tempHex = (
        await app
          .inject({
            method: 'POST',
            url: `/api/v1/campaigns/${campaignId}/hexes`,
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

    it('PATCH cambia status a dead', async () => {
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
