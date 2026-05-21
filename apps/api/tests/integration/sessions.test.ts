import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';

/**
 * Slice 1 — Session CRUD + state machine + join/leave.
 *
 * Roles:
 *   - dm: campaign GM (rol 'gm' en campaign_members), también gmUserId de sus sesiones.
 *   - alice/bob: players con character en la campaña.
 *   - outsider: user sin acceso a la campaña.
 */
describe('sessions — Slice 1', () => {
  let dm: TestUser;
  let alice: TestUser;
  let bob: TestUser;
  let outsider: TestUser;
  let campaignId: string;
  let otherCampaignId: string;
  let aliceCharId: string;
  let bobCharId: string;
  /** Char de alice en OTRA campaña → no joineable a sesiones de campaignId. */
  let aliceOtherCampaignCharId: string;

  beforeAll(async () => {
    const app = await getTestApp();
    dm = await createTestUser();
    alice = await createTestUser();
    bob = await createTestUser();
    outsider = await createTestUser();

    campaignId = (
      await app
        .inject({
          method: 'POST',
          url: '/api/v1/campaigns',
          headers: { authorization: `Bearer ${dm.accessToken}` },
          payload: { name: 'Sessions Campaign' },
        })
        .then((r) => r.json())
    ).id;

    // Alice y Bob se unen como players.
    const { db } = await import('../../src/infra/db/client.js');
    const { campaignMembers } = await import('../../src/infra/db/schema.js');
    await db.insert(campaignMembers).values([
      { campaignId, userId: alice.id, role: 'player' },
      { campaignId, userId: bob.id, role: 'player' },
    ]);

    aliceCharId = (
      await app
        .inject({
          method: 'POST',
          url: '/api/v1/characters',
          headers: { authorization: `Bearer ${alice.accessToken}` },
          payload: { campaignId, name: 'Alice Char' },
        })
        .then((r) => r.json())
    ).id;

    bobCharId = (
      await app
        .inject({
          method: 'POST',
          url: '/api/v1/characters',
          headers: { authorization: `Bearer ${bob.accessToken}` },
          payload: { campaignId, name: 'Bob Char' },
        })
        .then((r) => r.json())
    ).id;

    // Otra campaña, char de alice ahí.
    otherCampaignId = (
      await app
        .inject({
          method: 'POST',
          url: '/api/v1/campaigns',
          headers: { authorization: `Bearer ${alice.accessToken}` },
          payload: { name: 'Other Campaign' },
        })
        .then((r) => r.json())
    ).id;
    aliceOtherCampaignCharId = (
      await app
        .inject({
          method: 'POST',
          url: '/api/v1/characters',
          headers: { authorization: `Bearer ${alice.accessToken}` },
          payload: { campaignId: otherCampaignId, name: 'Alice Other' },
        })
        .then((r) => r.json())
    ).id;
  });

  afterAll(async () => {
    if (dm) await deleteTestUser(dm.id);
    if (alice) await deleteTestUser(alice.id);
    if (bob) await deleteTestUser(bob.id);
    if (outsider) await deleteTestUser(outsider.id);
    await closeTestApp();
  });

  // ---- POST /sessions ----------------------------------------------------
  describe('POST /sessions', () => {
    it('GM crea una sesión draft (sin scheduledAt)', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/sessions',
        headers: { authorization: `Bearer ${dm.accessToken}` },
        payload: { campaignId, title: 'Draft Session', dmNotes: 'Trampa en la sala 3' },
      });
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.status).toBe('scheduled');
      expect(body.scheduledAt).toBeNull();
      expect(body.dmNotes).toBe('Trampa en la sala 3');
      expect(body.gmUserId).toBe(dm.id);
    });

    it('player NO puede crear sesión', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/sessions',
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: { campaignId, title: 'Player attempt' },
      });
      expect(res.statusCode).toBe(403);
    });

    it('outsider NO puede crear sesión', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/sessions',
        headers: { authorization: `Bearer ${outsider.accessToken}` },
        payload: { campaignId, title: 'Outsider attempt' },
      });
      expect(res.statusCode).toBe(403);
    });

    it('LEVEL_RANGE_INVALID si min > max', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/sessions',
        headers: { authorization: `Bearer ${dm.accessToken}` },
        payload: { campaignId, title: 'Bad levels', levelMin: 10, levelMax: 3 },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().issues[0].code).toBe('LEVEL_RANGE_INVALID');
    });
  });

  // ---- GET /sessions/:id : visibility -----------------------------------
  describe('GET /sessions/:id visibility', () => {
    let sessionId: string;
    beforeAll(async () => {
      const app = await getTestApp();
      sessionId = (
        await app
          .inject({
            method: 'POST',
            url: '/api/v1/sessions',
            headers: { authorization: `Bearer ${dm.accessToken}` },
            payload: { campaignId, title: 'Visibility Session', dmNotes: 'Secreto' },
          })
          .then((r) => r.json())
      ).id;
    });

    it('GM ve dmNotes', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/sessions/${sessionId}`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().dmNotes).toBe('Secreto');
    });

    it('player (no participant) NO ve dmNotes', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/sessions/${sessionId}`,
        headers: { authorization: `Bearer ${alice.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().dmNotes).toBeUndefined();
    });

    it('outsider → 403', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/sessions/${sessionId}`,
        headers: { authorization: `Bearer ${outsider.accessToken}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  // ---- State machine -----------------------------------------------------
  describe('state machine', () => {
    let sessionId: string;
    beforeAll(async () => {
      const app = await getTestApp();
      sessionId = (
        await app
          .inject({
            method: 'POST',
            url: '/api/v1/sessions',
            headers: { authorization: `Bearer ${dm.accessToken}` },
            payload: { campaignId, title: 'SM Session' },
          })
          .then((r) => r.json())
      ).id;
    });

    it('scheduled → start → active (setea startedAt)', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/sessions/${sessionId}/start`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.status).toBe('active');
      expect(body.startedAt).not.toBeNull();
    });

    it('start sobre una sesión active → 400 INVALID_STATE_TRANSITION', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/sessions/${sessionId}/start`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().issues[0].code).toBe('INVALID_STATE_TRANSITION');
    });

    it('active → pause → paused, luego resume → active', async () => {
      const app = await getTestApp();
      const p = await app.inject({
        method: 'POST',
        url: `/api/v1/sessions/${sessionId}/pause`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
      });
      expect(p.statusCode).toBe(200);
      expect(p.json().status).toBe('paused');

      const r = await app.inject({
        method: 'POST',
        url: `/api/v1/sessions/${sessionId}/resume`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
      });
      expect(r.statusCode).toBe(200);
      expect(r.json().status).toBe('active');
    });

    it('player NO puede ejecutar transiciones', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/sessions/${sessionId}/pause`,
        headers: { authorization: `Bearer ${alice.accessToken}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it('cancel desde active → cancelled (setea endedAt)', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/sessions/${sessionId}/cancel`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe('cancelled');
      expect(res.json().endedAt).not.toBeNull();
    });

    it('cancelled es terminal — resume falla', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/sessions/${sessionId}/resume`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  // ---- Join / Leave ------------------------------------------------------
  describe('join + leave', () => {
    let sessionId: string;
    beforeAll(async () => {
      const app = await getTestApp();
      sessionId = (
        await app
          .inject({
            method: 'POST',
            url: '/api/v1/sessions',
            headers: { authorization: `Bearer ${dm.accessToken}` },
            payload: { campaignId, title: 'Join Session', maxPlayers: 2 },
          })
          .then((r) => r.json())
      ).id;
    });

    it('alice joinea su char a la sesión scheduled', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/sessions/${sessionId}/join`,
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: { characterId: aliceCharId },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.participants).toHaveLength(1);
      expect(body.participants[0].characterId).toBe(aliceCharId);
    });

    it('join idempotente — joinear el mismo char dos veces no duplica', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/sessions/${sessionId}/join`,
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: { characterId: aliceCharId },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().participants).toHaveLength(1);
    });

    it('alice NO puede joinear char de otra campaña', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/sessions/${sessionId}/join`,
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: { characterId: aliceOtherCampaignCharId },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().issues[0].code).toBe('CHARACTER_NOT_ELIGIBLE');
    });

    it('alice NO puede joinear char ajeno (de bob)', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/sessions/${sessionId}/join`,
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: { characterId: bobCharId },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().issues[0].code).toBe('CHARACTER_NOT_ELIGIBLE');
    });

    it('CHARACTER_ALREADY_IN_LIVE_SESSION si char ya está en otra sesión active', async () => {
      const app = await getTestApp();
      // Crear otra sesión y joinear ahí.
      const other = (
        await app
          .inject({
            method: 'POST',
            url: '/api/v1/sessions',
            headers: { authorization: `Bearer ${dm.accessToken}` },
            payload: { campaignId, title: 'Other Live' },
          })
          .then((r) => r.json())
      ).id;
      // Necesitamos un char libre — bob aún no joineó nada.
      await app.inject({
        method: 'POST',
        url: `/api/v1/sessions/${other}/join`,
        headers: { authorization: `Bearer ${bob.accessToken}` },
        payload: { characterId: bobCharId },
      });
      await app.inject({
        method: 'POST',
        url: `/api/v1/sessions/${other}/start`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
      });

      // Ahora bob trata de joinear bobChar en la otra sesión → debe fallar.
      const yetAnother = (
        await app
          .inject({
            method: 'POST',
            url: '/api/v1/sessions',
            headers: { authorization: `Bearer ${dm.accessToken}` },
            payload: { campaignId, title: 'Yet Another' },
          })
          .then((r) => r.json())
      ).id;
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/sessions/${yetAnother}/join`,
        headers: { authorization: `Bearer ${bob.accessToken}` },
        payload: { characterId: bobCharId },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().issues[0].code).toBe('CHARACTER_ALREADY_IN_LIVE_SESSION');

      // Cleanup: cancel para no afectar tests posteriores.
      await app.inject({
        method: 'POST',
        url: `/api/v1/sessions/${other}/cancel`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
      });
    });

    it('leave setea left_at y libera el char para otra sesión', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/sessions/${sessionId}/leave`,
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: { characterId: aliceCharId },
      });
      expect(res.statusCode).toBe(200);
      const part = res.json().participants.find((p: any) => p.characterId === aliceCharId);
      expect(part.leftAt).not.toBeNull();

      // Ahora alice puede joinear a otra sesión.
      const other = (
        await app
          .inject({
            method: 'POST',
            url: '/api/v1/sessions',
            headers: { authorization: `Bearer ${dm.accessToken}` },
            payload: { campaignId, title: 'After Leave' },
          })
          .then((r) => r.json())
      ).id;
      const re = await app.inject({
        method: 'POST',
        url: `/api/v1/sessions/${other}/join`,
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: { characterId: aliceCharId },
      });
      expect(re.statusCode).toBe(200);
    });
  });

  // ---- maxPlayers --------------------------------------------------------
  describe('maxPlayers', () => {
    it('SESSION_FULL cuando se alcanza maxPlayers', async () => {
      const app = await getTestApp();
      const sessionId = (
        await app
          .inject({
            method: 'POST',
            url: '/api/v1/sessions',
            headers: { authorization: `Bearer ${dm.accessToken}` },
            payload: { campaignId, title: 'Tiny Party', maxPlayers: 1 },
          })
          .then((r) => r.json())
      ).id;

      // Char de bob libre (asumiendo cleanup previo de otras sesiones).
      // Para asegurar limpieza, hacemos leave si hace falta.
      await app.inject({
        method: 'POST',
        url: `/api/v1/sessions/${sessionId}/join`,
        headers: { authorization: `Bearer ${bob.accessToken}` },
        payload: { characterId: bobCharId },
      });

      // Necesitamos un segundo char ajeno para llenar. Creamos uno nuevo.
      const charlie = await createTestUser();
      const { db } = await import('../../src/infra/db/client.js');
      const { campaignMembers } = await import('../../src/infra/db/schema.js');
      await db.insert(campaignMembers).values({ campaignId, userId: charlie.id, role: 'player' });
      const charlieCharId = (
        await app
          .inject({
            method: 'POST',
            url: '/api/v1/characters',
            headers: { authorization: `Bearer ${charlie.accessToken}` },
            payload: { campaignId, name: 'Charlie' },
          })
          .then((r) => r.json())
      ).id;

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/sessions/${sessionId}/join`,
        headers: { authorization: `Bearer ${charlie.accessToken}` },
        payload: { characterId: charlieCharId },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().issues[0].code).toBe('SESSION_FULL');

      await deleteTestUser(charlie.id);
    });
  });

  // ---- PATCH terminal ---------------------------------------------------
  describe('PATCH terminal sessions', () => {
    it('summary editable post-completed... usamos cancelled como proxy', async () => {
      const app = await getTestApp();
      const sessionId = (
        await app
          .inject({
            method: 'POST',
            url: '/api/v1/sessions',
            headers: { authorization: `Bearer ${dm.accessToken}` },
            payload: { campaignId, title: 'To Cancel' },
          })
          .then((r) => r.json())
      ).id;
      await app.inject({
        method: 'POST',
        url: `/api/v1/sessions/${sessionId}/cancel`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
      });

      // Sí permite summary y dmNotes.
      const ok = await app.inject({
        method: 'PATCH',
        url: `/api/v1/sessions/${sessionId}`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
        payload: { summary: 'Se canceló por falta de quórum' },
      });
      expect(ok.statusCode).toBe(200);

      // NO permite title.
      const bad = await app.inject({
        method: 'PATCH',
        url: `/api/v1/sessions/${sessionId}`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
        payload: { title: 'Renamed' },
      });
      expect(bad.statusCode).toBe(400);
      expect(bad.json().issues[0].code).toBe('SESSION_TERMINAL');
    });
  });
});
