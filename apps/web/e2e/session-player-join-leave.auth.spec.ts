import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

/**
 * session-player-join-leave — E2E for the player join + leave flow (REQ-DPPMB-E2E-01).
 *
 * Flow (single user — the test user is world-GM AND can join as a player via DM-as-player):
 *   1. Precondition: ensure an active character exists in the E2E world (via API).
 *   2. Precondition: create a scheduled session in the E2E campaign (via API).
 *   3. Navigate to the campaign → session card is visible with "Unirme".
 *   4. Tap "Unirme" → join sheet opens → character list shown → select character → confirm.
 *   5. Session card now shows "En sesión" chip + "Salir" button.
 *   6. Tap "Salir" → confirmation sheet → "Confirmar" → "Unirme" returns.
 *
 * Mobile-first: 375px (iPhone SE) per CLAUDE.md §2.
 *
 * Design note (ADR from design #1909): single-user E2E is valid because the test user
 * is a world-GM and can exercise the DM-as-player flow. True multi-user cross-role E2E
 * is covered by the Slice A integration tests.
 *
 * Requires:
 *   - Stack running (web :3001, api :4000, supabase).
 *   - auth.setup.ts has run and saved e2e/.auth/user.json.
 */

const MOBILE = { width: 375, height: 812 };
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const TEST_EMAIL = process.env.TEST_USER_EMAIL ?? 'e2e@dungeon-hub.test';
const TEST_PASSWORD = process.env.TEST_USER_PASSWORD ?? 'e2e-test-pass-1234';

test.use({ viewport: MOBILE });

test.describe('Player join + leave a session @ 375px', () => {
  let campaignId: string;
  let worldId: string;
  let sessionId: string;
  let characterName: string;
  let accessToken: string;

  test.beforeAll(async () => {
    // ── Sign in and resolve tokens ────────────────────────────────────────────
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

    // ── Resolve the E2E campaign and its world ────────────────────────────────
    const campaignsRes = await fetch(`${API_URL}/api/v1/campaigns`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const campaignsJson = (await campaignsRes.json()) as {
      data: Array<{ id: string; name: string; worldId: string }>;
    };
    const campaign = campaignsJson.data?.find((c) => c.name === 'E2E Test Campaign');
    if (!campaign) {
      throw new Error(
        "'E2E Test Campaign' not found. Run auth.setup.ts (pnpm test:e2e --project=setup) first.",
      );
    }
    campaignId = campaign.id;
    worldId = campaign.worldId;

    // ── Ensure an active character exists for this user in this world ─────────
    // Check existing active characters first (idempotent).
    const charsRes = await fetch(`${API_URL}/api/v1/characters?status=active`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const charsJson = (await charsRes.json()) as {
      data: Array<{ id: string; name: string; worldId: string; status: string }>;
    };
    const existingChar = charsJson.data?.find(
      (c) => c.worldId === worldId && c.status === 'active',
    );

    if (existingChar) {
      characterName = existingChar.name;
    } else {
      // No active character — look for a pending one in this world and approve it.
      // The test user is the GM of this world (via 'E2E Test Campaign'), so approval
      // is authorized. Previous wizard runs create pending characters in this world.
      const allCharsRes = await fetch(`${API_URL}/api/v1/characters`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const allCharsJson = (await allCharsRes.json()) as {
        data: Array<{ id: string; name: string; worldId: string; status: string }>;
      };
      const pendingChar = allCharsJson.data?.find(
        (c) => c.worldId === worldId && c.status === 'pending_approval',
      );

      if (!pendingChar) {
        throw new Error(
          `No active or pending character found in world ${worldId}. ` +
            'Run the character wizard (e2e/wizard.auth.spec.ts) first to create one, ' +
            'then re-run this spec. The wizard leaves characters as pending_approval ' +
            'and this beforeAll will approve one automatically.',
        );
      }

      // Approve the pending character (GM approves their own char — valid DM-as-player flow).
      const approveRes = await fetch(
        `${API_URL}/api/v1/characters/${pendingChar.id}/approve`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
      if (!approveRes.ok) {
        const text = await approveRes.text();
        throw new Error(`Failed to approve character ${pendingChar.id}: ${approveRes.status} ${text}`);
      }
      characterName = pendingChar.name;
    }

    // ── Create a fresh scheduled session for this test run ───────────────────
    const sessionTitle = `E2E Join/Leave ${Date.now()}`;
    const sessionRes = await fetch(`${API_URL}/api/v1/sessions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        campaignId,
        title: sessionTitle,
        maxPlayers: 4,
      }),
    });
    if (!sessionRes.ok) {
      const text = await sessionRes.text();
      throw new Error(`Failed to create E2E session: ${sessionRes.status} ${text}`);
    }
    const sessionJson = (await sessionRes.json()) as { id: string; title: string };
    sessionId = sessionJson.id;
  });

  test.afterAll(async () => {
    // Clean up: cancel the session we created so it does not pollute subsequent runs.
    if (sessionId && accessToken) {
      await fetch(`${API_URL}/api/v1/sessions/${sessionId}/cancel`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      }).catch(() => {
        // Best-effort — do not fail if cancel fails (session may already be terminal).
      });
    }
  });

  test('player sees session card → joins → En sesión → leaves → Unirme', async ({ page }) => {
    // ── 1. Navigate to the campaign detail ────────────────────────────────────
    await page.goto(`/campanas/${campaignId}`, { waitUntil: 'domcontentloaded' });

    // ── 2. Session card is visible ────────────────────────────────────────────
    // Wait for the session list to render and find our session.
    const sessionCard = page
      .locator('li')
      .filter({ has: page.locator(`a[href*="/sessions/${sessionId}"]`) });
    await expect(sessionCard).toBeVisible({ timeout: 15_000 });

    // The card shows the "Unirme" button (session is scheduled, user is not a participant).
    const unirmeBtn = sessionCard.getByRole('button', { name: 'Unirme' });
    await expect(unirmeBtn).toBeVisible({ timeout: 5_000 });

    // ── 3. Open the join sheet ────────────────────────────────────────────────
    await unirmeBtn.click();

    // The V3Sheet title "Elegí tu personaje" must be visible.
    await expect(page.getByText('Elegí tu personaje')).toBeVisible({ timeout: 5_000 });

    // ── 4. Select the character and confirm ───────────────────────────────────
    // The character card button in the sheet contains the character name.
    // Using getByText to avoid strict-name matching issues with lineage text also in the button.
    await expect(page.getByText(characterName, { exact: true }).first()).toBeVisible({
      timeout: 5_000,
    });
    // Click the character card button (the parent button wrapping name + lineage).
    await page.getByText(characterName, { exact: true }).first().click();

    // The confirm button now shows "Unirme con [characterName]".
    // Use substring match (exact: false) since name could be long.
    const confirmBtn = page.getByRole('button', { name: `Unirme con ${characterName}`, exact: true });
    await expect(confirmBtn).toBeEnabled({ timeout: 3_000 });
    await confirmBtn.click();

    // ── 5. Session card shows "En sesión" + "Salir" ───────────────────────────
    // Wait for the join sheet to close.
    await expect(page.getByText('Elegí tu personaje')).toHaveCount(0, { timeout: 10_000 });

    // After joining, the page revalidates (revalidatePath called by joinSession action).
    // The server re-fetches GET /sessions?campaignId=X which now includes a participants
    // array per session (B6 API fix: attachParticipants added to list endpoint).
    // The CampanaDetailView re-derives activeParticipantCharIds from the participants,
    // and the session card shows "En sesión" for the joined session.
    const sessionCardAfterJoin = page
      .locator('li')
      .filter({ has: page.locator(`a[href*="/sessions/${sessionId}"]`) });

    await expect(sessionCardAfterJoin.getByText('En sesión')).toBeVisible({ timeout: 15_000 });
    const salirBtn = sessionCardAfterJoin.getByRole('button', { name: 'Salir' });
    await expect(salirBtn).toBeVisible({ timeout: 5_000 });

    // ── 6. Leave the session ──────────────────────────────────────────────────
    await salirBtn.click();

    // Leave confirmation sheet should open.
    await expect(
      page.getByText('¿Salir de la sesión? Tu personaje será removido.'),
    ).toBeVisible({ timeout: 5_000 });

    // Confirm leaving.
    await page.getByRole('button', { name: 'Confirmar' }).click();

    // The confirmation sheet should close.
    await expect(
      page.getByText('¿Salir de la sesión? Tu personaje será removido.'),
    ).toHaveCount(0, { timeout: 10_000 });

    // ── 7. Session card shows "Unirme" again ──────────────────────────────────
    const sessionCardAfterLeave = page
      .locator('li')
      .filter({ has: page.locator(`a[href*="/sessions/${sessionId}"]`) });

    await expect(
      sessionCardAfterLeave.getByRole('button', { name: 'Unirme' }),
    ).toBeVisible({ timeout: 15_000 });

    // "En sesión" chip is gone.
    await expect(sessionCardAfterLeave.getByText('En sesión')).toHaveCount(0, {
      timeout: 3_000,
    });
  });
});
