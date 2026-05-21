import { randomUUID } from 'node:crypto';
import { env } from '../../src/env.js';

export interface TestUser {
  id: string;
  email: string;
  password: string;
  accessToken: string;
}

/**
 * Crea un user en Supabase via admin API + login para obtener access_token.
 * Email único por ejecución para evitar colisiones.
 */
export async function createTestUser(): Promise<TestUser> {
  const email = `test-${randomUUID()}@dh.test`;
  const password = 'test-password-strong-123!';

  // 1. Crear via admin API (email_confirm: true → no necesita verificación)
  const createRes = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: { username: email.split('@')[0] },
    }),
  });

  if (!createRes.ok) {
    throw new Error(`Failed to create test user: ${createRes.status} ${await createRes.text()}`);
  }

  const created = (await createRes.json()) as { id: string };

  // 2. Login para obtener access_token
  const loginRes = await fetch(`${env.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });

  if (!loginRes.ok) {
    throw new Error(`Failed to login test user: ${loginRes.status} ${await loginRes.text()}`);
  }

  const session = (await loginRes.json()) as { access_token: string };

  return { id: created.id, email, password, accessToken: session.access_token };
}

/**
 * Borra el user de auth.users via admin API. Los campaign_members y characters
 * se borran en cascada por FK. Las campaigns que ese user es GM se borran
 * explícitamente abajo (FK gm_user_id NO tiene cascade).
 */
export async function deleteTestUser(userId: string): Promise<void> {
  // Borrar campaigns donde es GM (FK no cascadea)
  // Lo hacemos via SQL directo porque no tenemos endpoint para esto.
  const { db } = await import('../../src/infra/db/client.js');
  const { campaigns } = await import('../../src/infra/db/schema.js');
  const { eq } = await import('drizzle-orm');
  await db.delete(campaigns).where(eq(campaigns.gmUserId, userId));

  // Borrar user de auth (cascadea a public.users)
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
    method: 'DELETE',
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });

  if (!res.ok && res.status !== 404) {
    // No fallamos el test por errores de cleanup, solo log.
    console.warn(`Cleanup: failed to delete user ${userId}: ${res.status}`);
  }
}
