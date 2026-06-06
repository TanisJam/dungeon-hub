/**
 * Integration tests — codex-knowledge B-0: POST /users/me/dev-mode
 *
 * RED-first per STRICT TDD (codex-knowledge SDD tasks #1950).
 *
 * B-0 gap closure: provides the endpoint the B-4 devMode toggle UI needs.
 * Thin route: Zod body { devMode: boolean } → update users.devMode → 200 { devMode }.
 * Auth required (preHandler: app.authenticate).
 *
 * REQ-CK-DEV-01, REQ-CK-DEV-03. Design intent: FORK 5 (#1944).
 * This arc encodes NO PHB rule.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';

describe('codex-knowledge B-0: POST /users/me/dev-mode', () => {
  let user: TestUser;

  beforeAll(async () => {
    user = await createTestUser();
  });

  afterAll(async () => {
    if (user) await deleteTestUser(user.id);
    await closeTestApp();
  });

  it('requires auth — no token → 401', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/users/me/dev-mode',
      payload: { devMode: true },
    });
    expect(res.statusCode).toBe(401);
  });

  it('missing body → 400 VALIDATION_FAILED', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/users/me/dev-mode',
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('invalid devMode type → 400 VALIDATION_FAILED', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/users/me/dev-mode',
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: { devMode: 'yes' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST { devMode: true } → sets devMode=true, returns { devMode: true }', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/users/me/dev-mode',
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: { devMode: true },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ devMode: boolean }>();
    expect(body.devMode).toBe(true);

    // Confirm DB persisted
    const { db } = await import('../../src/infra/db/client.js');
    const { users } = await import('../../src/infra/db/schema.js');
    const rows = await db.select({ devMode: users.devMode }).from(users).where(eq(users.id, user.id)).limit(1);
    expect(rows[0]?.devMode).toBe(true);
  });

  it('POST { devMode: false } → sets devMode=false, returns { devMode: false }', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/users/me/dev-mode',
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: { devMode: false },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ devMode: boolean }>();
    expect(body.devMode).toBe(false);

    // Confirm DB persisted
    const { db } = await import('../../src/infra/db/client.js');
    const { users } = await import('../../src/infra/db/schema.js');
    const rows = await db.select({ devMode: users.devMode }).from(users).where(eq(users.id, user.id)).limit(1);
    expect(rows[0]?.devMode).toBe(false);
  });
});
