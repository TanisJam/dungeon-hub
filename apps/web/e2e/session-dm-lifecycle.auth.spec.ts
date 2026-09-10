import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

/**
 * session-dm-lifecycle — E2E for the DM session play-loop (REQ-DPPMB-E2E-02).
 *
 * Flow (single user — the test user is world-GM of 'E2E Test Campaign (World)'):
 *   1. DM opens the E2E campaign via /campanas.
 *   2. DM taps the "Nueva sesión" FAB → fill title → submit → session appears in list.
 *   3. DM opens session detail via the "Ver" link.
 *   4. DM taps "Iniciar" → status pill changes to "En curso".
 *   5. DM taps "Completar sesión" → complete form opens → fills xpPerPlayer → submits.
 *   6. Session status shows "Jugada".
 *
 * Mobile-first: runs at 375px (iPhone SE) per CLAUDE.md §2.
 *
 * Requires:
 *   - Stack running (web :3001, api :4000, supabase).
 *   - auth.setup.ts has run and saved e2e/.auth/user.json.
 *   - The test user is GM of 'E2E Test Campaign (World)' and 'E2E Test Campaign' exists.
 */

const MOBILE = { width: 375, height: 812 };
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const TEST_EMAIL = process.env.TEST_USER_EMAIL ?? 'e2e@dungeon-hub.test';
const TEST_PASSWORD = process.env.TEST_USER_PASSWORD ?? 'e2e-test-pass-1234';

test.use({ viewport: MOBILE });

test.describe('DM session lifecycle @ 375px', () => {
  let campaignId: string;
  let accessToken: string;

  // Before: resolve the E2E campaign ID via the API so we can navigate directly.
  test.beforeAll(async () => {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: signIn, error } = await supabase.auth.signInWithPassword({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    });
    if (error || !signIn.session) {
      throw new Error(`Sign-in failed in beforeAll: ${error?.message ?? 'no session'}`);
    }
    accessToken = signIn.session.access_token;

    // Resolve the campaign ID for 'E2E Test Campaign'.
    const res = await fetch(`${API_URL}/api/v1/campaigns`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const json = (await res.json()) as { data: Array<{ id: string; name: string; worldId: string }> };
    const campaign = json.data?.find((c) => c.name === 'E2E Test Campaign');
    if (!campaign) {
      throw new Error(
        "'E2E Test Campaign' not found. Run auth.setup.ts (pnpm test:e2e --project=setup) first.",
      );
    }
    campaignId = campaign.id;
  });

  test('DM creates session → detail → iniciar → completar → Jugada', async ({ page }) => {
    // ── 1. Navigate to the E2E campaign detail ──────────────────────────────
    await page.goto(`/campanas/${campaignId}`, { waitUntil: 'domcontentloaded' });
    // Wait for the sessions section to be rendered.
    await expect(page.getByRole('button', { name: 'Nueva sesión' })).toBeVisible({
      timeout: 15_000,
    });

    // ── 2. Open the create-session sheet via the FAB ─────────────────────────
    // Wait for the V3Sheet dialog to open (portal-based, role=dialog).
    const createDialog = page.locator('[role="dialog"]').first();

    // Retry the tap until the sheet actually opens. A server-rendered button is
    // visible and clickable well before React attaches its handler, so a single
    // click can land on markup that has no onClick yet and simply do nothing —
    // under `next dev`, where hydration is slow, that window is wide. Both this
    // list and the sessions FAB are 'use client' islands and both failed the same
    // way, which is the signature of a platform race rather than a component bug.
    // The assertion is unchanged: the dialog must still appear.
    await expect(async () => {
      await page.getByRole('button', { name: 'Nueva sesión' }).click();
      await expect(createDialog).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 20_000 });

    // Fill a unique title so this session is identifiable in the list.
    const sessionTitle = `Sesión E2E DM ${Date.now()}`;
    await createDialog.getByLabel('Título').fill(sessionTitle);

    // ── 3. Submit the form ────────────────────────────────────────────────────
    await createDialog.getByRole('button', { name: 'Crear sesión' }).click();

    // Wait for the sheet to close and the page to revalidate.
    // The session card title link should appear in the list.
    await expect(page.getByRole('link', { name: sessionTitle })).toBeVisible({ timeout: 15_000 });

    // ── 4. Open the session detail via the title link ────────────────────────
    // The session card has a title link that navigates to the detail page.
    // Extract the href from the title link, then navigate directly.
    const titleLink = page.getByRole('link', { name: sessionTitle });
    const sessionHref = await titleLink.getAttribute('href', { timeout: 5_000 });
    if (!sessionHref) throw new Error(`No href found on session title link for "${sessionTitle}"`);
    await page.goto(sessionHref, { waitUntil: 'domcontentloaded' });

    // Confirm we navigated to the session detail route.
    await expect(page).toHaveURL(
      /\/campanas\/[a-f0-9-]+\/sessions\/[a-f0-9-]+$/,
      { timeout: 10_000 },
    );

    // Session title h1 is visible in the main content area.
    // (AppShell also has the title in the banner, so scope to 'main' to avoid strict-mode violation.)
    await expect(page.getByRole('main').getByRole('heading', { name: sessionTitle })).toBeVisible({
      timeout: 5_000,
    });

    // Status is "Programada" before starting.
    await expect(page.getByText('Programada')).toBeVisible({ timeout: 5_000 });

    // ── 5. DM starts the session ──────────────────────────────────────────────
    // "Iniciar" button lives in the DmControls sticky bar.
    //
    // Retry the tap, the same way step 2 above already does for the sessions FAB:
    // DmControls is a client island, and its button is server-rendered and
    // clickable before React attaches the handler. The tap is guarded on the
    // button still being there because it unmounts once the session starts, and a
    // blind re-tap would then wait on an element that no longer exists.
    const iniciarBtn = page.getByRole('button', { name: 'Iniciar' });
    await expect(iniciarBtn).toBeVisible({ timeout: 5_000 });
    await expect(async () => {
      if (await iniciarBtn.isVisible().catch(() => false)) {
        await iniciarBtn.click({ timeout: 5_000 }).catch(() => {});
      }
      await expect(page.getByText('En curso')).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 25_000 });
    // "Iniciar" button should be gone; "Pausar" and "Completar sesión" visible.
    await expect(page.getByRole('button', { name: 'Pausar' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: 'Completar sesión' })).toBeVisible({
      timeout: 10_000,
    });

    // ── 6. DM opens the complete form ────────────────────────────────────────
    await page.getByRole('button', { name: 'Completar sesión' }).click();

    // Wait for the V3Sheet dialog to open (portal-based, role=dialog).
    const completeDialog = page.locator('[role="dialog"]').first();
    await expect(completeDialog).toBeVisible({ timeout: 10_000 });

    // Fill XP per player.
    await completeDialog.getByLabel('XP por jugador').fill('150');

    // ── 7. Submit the complete form ───────────────────────────────────────────
    await completeDialog.getByRole('button', { name: 'Cerrar sesión y repartir' }).click();

    // After completing, the sheet closes and the page revalidates.
    // The status pill should now show "Jugada".
    await expect(page.getByText('Jugada')).toBeVisible({ timeout: 15_000 });

    // DmControls should be gone (terminal state).
    await expect(page.getByRole('button', { name: 'Iniciar' })).toHaveCount(0, {
      timeout: 5_000,
    });
    await expect(page.getByRole('button', { name: 'Completar sesión' })).toHaveCount(0, {
      timeout: 5_000,
    });
  });
});
