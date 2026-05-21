import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';

/**
 * Slice 2 — Event log append + lectura con visibility filtering.
 */
describe('sessions — Slice 2 (events)', () => {
  let dm: TestUser;
  let alice: TestUser;
  let bob: TestUser;
  let outsider: TestUser;
  let campaignId: string;
  let aliceCharId: string;
  let bobCharId: string;

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
          payload: { name: 'Events Campaign' },
        })
        .then((r) => r.json())
    ).id;

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
  });

  afterAll(async () => {
    if (dm) await deleteTestUser(dm.id);
    if (alice) await deleteTestUser(alice.id);
    if (bob) await deleteTestUser(bob.id);
    if (outsider) await deleteTestUser(outsider.id);
    await closeTestApp();
  });

  async function newSession(title: string): Promise<string> {
    const app = await getTestApp();
    return (
      await app
        .inject({
          method: 'POST',
          url: '/api/v1/sessions',
          headers: { authorization: `Bearer ${dm.accessToken}` },
          payload: { campaignId, title },
        })
        .then((r) => r.json())
    ).id;
  }

  async function startSession(id: string) {
    const app = await getTestApp();
    await app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${id}/start`,
      headers: { authorization: `Bearer ${dm.accessToken}` },
    });
  }

  async function join(sessionId: string, user: TestUser, characterId: string) {
    const app = await getTestApp();
    await app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${sessionId}/join`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: { characterId },
    });
  }

  // ---- POST /events ------------------------------------------------------
  describe('POST /sessions/:id/events', () => {
    it('GM puede appendar event en sesión scheduled (prep)', async () => {
      const app = await getTestApp();
      const sessionId = await newSession('Prep Session');
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/sessions/${sessionId}/events`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
        payload: {
          eventType: 'note',
          payload: { text: 'Acordate de introducir al NPC enano' },
          visibility: 'dm-only',
        },
      });
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.eventType).toBe('note');
      expect(body.visibility).toBe('dm-only');
      expect(body.actorUserId).toBe(dm.id);
    });

    it('participant NO puede appendar en sesión scheduled', async () => {
      const app = await getTestApp();
      const sessionId = await newSession('Prep Block');
      // Join sin start (queda scheduled).
      // Necesitamos bob acá porque alice ya está en otra sesión potencialmente.
      // Para evitar overlap, hacemos un freshChar para esta prueba.
      const localChar = await freshChar();
      await join(sessionId, alice, localChar);

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/sessions/${sessionId}/events`,
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: { eventType: 'note', payload: { text: 'Test' } },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().issues[0].code).toBe('FORBIDDEN_ROLE');
    });

    it('participant puede appendar event public en sesión active', async () => {
      const app = await getTestApp();
      const sessionId = await newSession('Active Session');
      const localChar = await freshChar();
      await join(sessionId, alice, localChar);
      await startSession(sessionId);

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/sessions/${sessionId}/events`,
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: {
          eventType: 'note',
          payload: { text: 'Alice rolea diplomacia con el guardia' },
        },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().visibility).toBe('public');
    });

    it('participant NO puede appendar event dm-only', async () => {
      const app = await getTestApp();
      const sessionId = await newSession('DM-Only Block');
      const localChar = await freshChar();
      await join(sessionId, alice, localChar);
      await startSession(sessionId);

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/sessions/${sessionId}/events`,
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: {
          eventType: 'note',
          payload: { text: 'Secret' },
          visibility: 'dm-only',
        },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().issues[0].code).toBe('DM_ONLY_REQUIRES_GM');
    });

    it('campaign-member (non-participant) NO puede appendar', async () => {
      const app = await getTestApp();
      const sessionId = await newSession('Member Block');
      await startSession(sessionId);

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/sessions/${sessionId}/events`,
        headers: { authorization: `Bearer ${bob.accessToken}` },
        payload: { eventType: 'note', payload: { text: 'Should fail' } },
      });
      expect(res.statusCode).toBe(403);
    });

    it('SESSION_TERMINAL si la sesión está cancelled', async () => {
      const app = await getTestApp();
      const sessionId = await newSession('Cancelled');
      await app.inject({
        method: 'POST',
        url: `/api/v1/sessions/${sessionId}/cancel`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
      });
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/sessions/${sessionId}/events`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
        payload: { eventType: 'note', payload: { text: 'too late' } },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().issues[0].code).toBe('SESSION_TERMINAL');
    });

    it('outsider NO puede appendar', async () => {
      const app = await getTestApp();
      const sessionId = await newSession('Outsider Block');
      await startSession(sessionId);
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/sessions/${sessionId}/events`,
        headers: { authorization: `Bearer ${outsider.accessToken}` },
        payload: { eventType: 'note', payload: { text: 'nope' } },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  // ---- GET /events --------------------------------------------------------
  describe('GET /sessions/:id/events', () => {
    let sessionId: string;
    let localChar: string;

    beforeAll(async () => {
      const app = await getTestApp();
      sessionId = await newSession('Read Session');
      localChar = await freshChar();
      await join(sessionId, alice, localChar);
      await startSession(sessionId);

      // 1 dm-only + 2 public
      await app.inject({
        method: 'POST',
        url: `/api/v1/sessions/${sessionId}/events`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
        payload: { eventType: 'note', payload: { text: 'Secret' }, visibility: 'dm-only' },
      });
      await app.inject({
        method: 'POST',
        url: `/api/v1/sessions/${sessionId}/events`,
        headers: { authorization: `Bearer ${alice.accessToken}` },
        payload: { eventType: 'note', payload: { text: 'Public 1' } },
      });
      await app.inject({
        method: 'POST',
        url: `/api/v1/sessions/${sessionId}/events`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
        payload: { eventType: 'hex_revealed', payload: { hexId: '0304' } },
      });
    });

    it('GM ve todos los events (incluye dm-only)', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/sessions/${sessionId}/events`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      const events = res.json().data;
      expect(events.length).toBe(3);
      expect(events.find((e: any) => e.visibility === 'dm-only')).toBeDefined();
    });

    it('participant solo ve events public', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/sessions/${sessionId}/events`,
        headers: { authorization: `Bearer ${alice.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      const events = res.json().data;
      expect(events.length).toBe(2);
      expect(events.every((e: any) => e.visibility === 'public')).toBe(true);
    });

    it('campaign-member (no participant) ve public events', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/sessions/${sessionId}/events`,
        headers: { authorization: `Bearer ${bob.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.length).toBe(2);
    });

    it('outsider → 403', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/sessions/${sessionId}/events`,
        headers: { authorization: `Bearer ${outsider.accessToken}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it('filtra por type=hex_revealed', async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/sessions/${sessionId}/events?type=hex_revealed`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
      });
      expect(res.statusCode).toBe(200);
      const events = res.json().data;
      expect(events.length).toBe(1);
      expect(events[0].eventType).toBe('hex_revealed');
    });

    it('respeta limit y offset', async () => {
      const app = await getTestApp();
      const r1 = await app.inject({
        method: 'GET',
        url: `/api/v1/sessions/${sessionId}/events?limit=1`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
      });
      expect(r1.json().data.length).toBe(1);
      const r2 = await app.inject({
        method: 'GET',
        url: `/api/v1/sessions/${sessionId}/events?limit=1&offset=1`,
        headers: { authorization: `Bearer ${dm.accessToken}` },
      });
      expect(r2.json().data.length).toBe(1);
      // El de offset 1 es distinto al de offset 0.
      expect(r1.json().data[0].id).not.toBe(r2.json().data[0].id);
    });
  });

  // ---- helpers ----------------------------------------------------------
  async function freshChar(): Promise<string> {
    const app = await getTestApp();
    return (
      await app
        .inject({
          method: 'POST',
          url: '/api/v1/characters',
          headers: { authorization: `Bearer ${alice.accessToken}` },
          payload: { campaignId, name: `Alice Tmp ${Math.random()}` },
        })
        .then((r) => r.json())
    ).id;
  }
});
