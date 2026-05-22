import { test as setup, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import path from 'node:path';

const AUTH_FILE = path.join(__dirname, '.auth/user.json');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const TEST_EMAIL = process.env.TEST_USER_EMAIL ?? 'e2e@dungeon-hub.test';
const TEST_PASSWORD = process.env.TEST_USER_PASSWORD ?? 'e2e-test-pass-1234';

setup('ensure test user + sign in + save state', async ({ page }) => {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SERVICE_ROLE_KEY) {
    throw new Error(
      'Missing env vars. Need NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY in apps/web/.env.local',
    );
  }

  // 1. Crear/sync test user via admin (idempotente)
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: list } = await admin.auth.admin.listUsers();
  const existing = list.users.find((u) => u.email === TEST_EMAIL);

  if (!existing) {
    const { error } = await admin.auth.admin.createUser({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      email_confirm: true,
    });
    if (error) throw new Error(`Failed to create test user: ${error.message}`);
  } else {
    const { error } = await admin.auth.admin.updateUserById(existing.id, {
      password: TEST_PASSWORD,
    });
    if (error) throw new Error(`Failed to update test user password: ${error.message}`);
  }

  // 2. Sign in via supabase-js (Node-side) para obtener access_token y poder
  //    llamar al API REST directamente desde el setup.
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: signIn, error: signInError } = await supabase.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });
  if (signInError || !signIn.session) {
    throw new Error(`Sign-in failed: ${signInError?.message ?? 'no session'}`);
  }
  const accessToken = signIn.session.access_token;

  // 3. Asegurar que existe una "E2E Test Campaign" — necesaria para crear chars.
  const campaignsRes = await fetch(`${API_URL}/api/v1/campaigns`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const campaignsJson = (await campaignsRes.json()) as { data: Array<{ name: string }> };
  const hasE2eCampaign = campaignsJson.data?.some((c) => c.name === 'E2E Test Campaign');
  if (!hasE2eCampaign) {
    const createRes = await fetch(`${API_URL}/api/v1/campaigns`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'E2E Test Campaign' }),
    });
    if (!createRes.ok) {
      throw new Error(`Campaign create failed: ${createRes.status} ${await createRes.text()}`);
    }
  }

  // 4. Browser-side login via /api/dev/login — esto setea las cookies de
  //    @supabase/ssr para que el resto de la app (server components) vea la
  //    sesión cuando Playwright navega.
  await page.goto('/');
  const loginRes = await page.request.post('/api/dev/login', {
    data: { email: TEST_EMAIL, password: TEST_PASSWORD },
  });
  expect(loginRes.status(), `dev/login failed: ${await loginRes.text()}`).toBe(200);

  // 5. Verificar auth visitando dashboard — el role pill "Jugador" + section
  //    heading "Tus Personajes" son señales fiables de que el dashboard rendereó.
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 5000 });
  await expect(page.getByText('Jugador', { exact: true })).toBeVisible({ timeout: 5000 });

  // 6. Guardar storage state
  await page.context().storageState({ path: AUTH_FILE });
});
