import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';
import { db } from '../../src/infra/db/client.js';
import { users } from '../../src/infra/db/schema.js';

/**
 * POST /auth/link/revoke — unlinks the authenticated user's Discord identity.
 *
 * Idempotent: subsequent calls return 200 with previousDiscordId=null.
 */
describe('POST /auth/link/revoke', () => {
  let user: TestUser;

  beforeAll(async () => {
    user = await createTestUser();
  });

  afterAll(async () => {
    if (user) await deleteTestUser(user.id);
    await closeTestApp();
  });

  it('REV-1: linked user → 200, clears discord fields, returns previous values', async () => {
    const app = await getTestApp();

    // Seed discord_id directly via DB (avoids needing the full link flow).
    await db
      .update(users)
      .set({ discordId: 'discord-abc-123', discordUsername: 'someuser' })
      .where(eq(users.id, user.id));

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/link/revoke',
      headers: { authorization: `Bearer ${user.accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      ok: true,
      previousDiscordId: 'discord-abc-123',
      previousDiscordUsername: 'someuser',
    });

    // Verify DB cleared.
    const rows = await db
      .select({ discordId: users.discordId, discordUsername: users.discordUsername })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);
    expect(rows[0]).toEqual({ discordId: null, discordUsername: null });
  });

  it('REV-2: idempotent — unlinked user → 200 with null previous values', async () => {
    const app = await getTestApp();

    // Re-call after REV-1 already cleared.
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/link/revoke',
      headers: { authorization: `Bearer ${user.accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      ok: true,
      previousDiscordId: null,
      previousDiscordUsername: null,
    });
  });

  it('REV-3: unauthenticated → 401', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/link/revoke',
    });
    expect(res.statusCode).toBe(401);
  });
});
