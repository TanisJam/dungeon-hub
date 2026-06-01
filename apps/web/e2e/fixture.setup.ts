import { test as setup, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Fixture users — created by `pnpm --filter @dungeon-hub/api db:seed:e2e`.
// These credentials are FIXED and intentionally committed (test-only users in
// the local/CI Supabase instance; they MUST NOT be used in production).
// ---------------------------------------------------------------------------

const FIXTURE_PASSWORD = 'DungeonHub!E2E1';

const FIXTURE_USERS = [
  { email: 'dm@dh.test', authFile: path.join(__dirname, '.auth/dm.json') },
  { email: 'player1@dh.test', authFile: path.join(__dirname, '.auth/player1.json') },
  { email: 'player2@dh.test', authFile: path.join(__dirname, '.auth/player2.json') },
  { email: 'player3@dh.test', authFile: path.join(__dirname, '.auth/player3.json') },
] as const;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// ---------------------------------------------------------------------------
// One setup block per fixture user — each saves its own storageState.
// ---------------------------------------------------------------------------

for (const { email, authFile } of FIXTURE_USERS) {
  setup(`fixture sign-in: ${email}`, async ({ page }) => {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      throw new Error(
        'Missing env vars. Need NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in apps/web/.env.local',
      );
    }

    // 1. Sign in via supabase-js (Node-side) to get an access_token so we can
    //    call the API directly from the setup script.
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: signIn, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password: FIXTURE_PASSWORD,
    });
    if (signInError || !signIn.session) {
      throw new Error(
        `Sign-in failed for ${email}: ${signInError?.message ?? 'no session'}. ` +
          'Run `pnpm --filter @dungeon-hub/api db:seed:e2e` to ensure fixture users exist.',
      );
    }

    // 2. Browser-side login via /api/dev/login — sets the @supabase/ssr cookies
    //    so Server Components see the session when Playwright navigates.
    await page.goto('/');
    const loginRes = await page.request.post('/api/dev/login', {
      data: { email, password: FIXTURE_PASSWORD },
    });
    expect(loginRes.status(), `dev/login failed for ${email}: ${await loginRes.text()}`).toBe(200);

    // 3. Verify auth by visiting /inicio — "Jugador" (or "DM") role pill confirms
    //    the shell rendered correctly with a valid session.
    await page.goto('/inicio');
    await expect(page).toHaveURL(/\/inicio$/, { timeout: 10000 });

    // 4. Save storageState for this fixture user.
    await page.context().storageState({ path: authFile });
  });
}
