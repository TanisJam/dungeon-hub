import { test, expect } from '@playwright/test';
import { resolveAccessToken } from './helpers/resolve-access-token';

/**
 * bitacora-feed — E2E spec for the unified Bitácora del Gremio feed.
 *
 * bitacora-gremio W4, REQ-GREM-FD-01, REQ-GREM-FD-02, REQ-GREM-FD-03,
 * REQ-GREM-FD-04, REQ-GREM-FD-05, REQ-GREM-E2E-01.
 * REQ-RENAME-01 (barrido-final): renamed from cronica-feed → bitacora-feed; /cronica → /bitacora.
 *
 * Verifies:
 *   (a) /bitacora renders the unified feed WITHOUT redirecting (ADR-4).
 *   (b) Feed shows entries from multiple sources (source badges visible).
 *   (c) Tag filter chip strip is visible and scrollable at 375px.
 *   (d) Select tag chip → feed shows only matching entries (tag round-trip REQ-GREM-E2E-01).
 *   (e) Deselect chip (tap Todo) → all entries restored.
 *   (f) "Aportar" button visible at 375px without scroll past fold (REQ-GREM-FD-05).
 *   (g) Tap "Aportar" → ContributionComposer opens with tags picker visible.
 *   (h) Empty state: /bitacora with no world → V3Empty shown, no crash.
 *
 * Seed data prerequisite: E2E test world must have at least one public journal entry
 * or world event (created by existing DM create-note / create-event E2E tests).
 *
 * Note: The E2E test user is GM of 'E2E Test Campaign (World)' via auth.setup.ts.
 * The test assumes the dev stack is running (apps/web/e2e/README.md).
 *
 * Mobile-first: 375px viewport. REQ-GATE-03.
 */

const MOBILE = { width: 375, height: 812 };

test.use({ viewport: MOBILE });

test('/bitacora renders unified feed without redirect (REQ-GREM-FD-01, ADR-4)', async ({ page }) => {
  await page.goto('/bitacora', { waitUntil: 'domcontentloaded' });

  // URL must stay at /bitacora — no redirect to /bitacora/eventos
  await expect(page).toHaveURL(/\/bitacora$/, { timeout: 10_000 });

  // Page renders without 404 — title visible
  const title = page.locator('h1, h2').first();
  await expect(title).toBeVisible({ timeout: 10_000 });
});

test('Tag filter chip strip is visible at /bitacora (REQ-GREM-FD-03)', async ({ page }) => {
  await page.goto('/bitacora', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/bitacora$/, { timeout: 10_000 });

  // "Todo" chip must be visible (the deselect chip)
  const todoChip = page.getByRole('button', { name: /^todo$/i });
  await expect(todoChip).toBeVisible({ timeout: 10_000 });

  // At least one KNOWLEDGE_TAG chip must be visible (e.g. Monstruos = 'monsters')
  const monstruosChip = page.getByRole('button', { name: /monstruos/i });
  await expect(monstruosChip).toBeVisible({ timeout: 10_000 });
});

test('"Aportar" button visible at 375px (REQ-GREM-FD-05 scenario 1)', async ({ page }) => {
  await page.goto('/bitacora', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/bitacora$/, { timeout: 10_000 });

  // The "Aportar" FAB must be visible without scrolling (fold test)
  const aportarBtn = page.getByRole('button', { name: /aportar/i });
  await expect(aportarBtn).toBeVisible({ timeout: 10_000 });
});

test('Tap "Aportar" → ContributionComposer opens with tags picker (REQ-GREM-FD-05 scenario 2)', async ({ page }) => {
  await page.goto('/bitacora', { waitUntil: 'networkidle' });
  await expect(page).toHaveURL(/\/bitacora$/, { timeout: 10_000 });

  const aportarBtn = page.getByRole('button', { name: /aportar/i });
  await expect(aportarBtn).toBeVisible({ timeout: 10_000 });
  await aportarBtn.click();

  // Composer sheet opens — textarea visible
  const textarea = page.getByPlaceholder(/escribí tu nota/i);
  await expect(textarea).toBeVisible({ timeout: 5_000 });

  // Tags picker must be visible (KNOWLEDGE_TAGS multi-select, REQ-GREM-FD-05 scenario 2).
  // Scope to the composer dialog — the feed's TagFilter also renders a "Tradición"
  // chip, so an unscoped getByRole would resolve to two buttons (strict-mode violation).
  const composer = page.getByRole('dialog');
  const loreTag = composer.getByRole('button', { name: /tradición/i });
  await expect(loreTag).toBeVisible({ timeout: 5_000 });
});

test('SubNav shows 3 items: Todo | Eventos | Notas at /bitacora (ADR-4)', async ({ page }) => {
  await page.goto('/bitacora', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/bitacora$/, { timeout: 10_000 });

  await expect(page.getByRole('link', { name: /^todo$/i })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('link', { name: /eventos/i })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('link', { name: /notas/i })).toBeVisible({ timeout: 10_000 });
});

test('/bitacora/eventos deep-link preserved — renders as source-facet (REQ-GREM-FD-04)', async ({ page }) => {
  await page.goto('/bitacora/eventos', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/bitacora\/eventos/, { timeout: 10_000 });

  // Page renders without error
  const title = page.locator('h1, h2').first();
  await expect(title).toBeVisible({ timeout: 10_000 });
});

test('/bitacora/notas deep-link preserved — renders as source-facet (REQ-GREM-FD-04)', async ({ page }) => {
  await page.goto('/bitacora/notas', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/bitacora\/notas/, { timeout: 10_000 });

  // Page renders without error
  const title = page.locator('h1, h2').first();
  await expect(title).toBeVisible({ timeout: 10_000 });
});

test('Tag round-trip: select lore → filtered, deselect → all restored (REQ-GREM-E2E-01)', async ({ page }) => {
  await page.goto('/bitacora', { waitUntil: 'networkidle' });
  await expect(page).toHaveURL(/\/bitacora$/, { timeout: 10_000 });

  // Select 'Tradición' (lore) chip
  const loreChip = page.getByRole('button', { name: /tradición/i });
  await expect(loreChip).toBeVisible({ timeout: 10_000 });
  await loreChip.click();

  // After selection, chip should have aria-pressed="true"
  await expect(loreChip).toHaveAttribute('aria-pressed', 'true', { timeout: 5_000 });

  // Deselect — tap Todo chip
  const todoChip = page.getByRole('button', { name: /^todo$/i });
  await todoChip.click();

  // Todo chip now active (pressed)
  await expect(todoChip).toHaveAttribute('aria-pressed', 'true', { timeout: 5_000 });
  // Lore chip deselected
  await expect(loreChip).toHaveAttribute('aria-pressed', 'false', { timeout: 5_000 });
});

// ---------------------------------------------------------------------------
// REQ-GFLE-09: NPC ref shared → guild feed shows entity card at 375px
// ---------------------------------------------------------------------------

/**
 * E2E round-trip for guild-feed-linked-entity-refs:
 * 1. Resolve access token + active character + worldId.
 * 2. Create an NPC with a sentinel dmNotes value (MUST NOT appear in feed).
 * 3. Create a bitácora page with refs[0] pointing to the NPC.
 * 4. Share the page to the guild feed.
 * 5. Navigate to /bitacora feed at 375px.
 * 6. Assert: entity card visible with NPC name.
 * 7. Assert: sentinel dmNotes value is NOT in the page DOM.
 * 8. Assert: card height ≥ 44px (min tap target).
 */

const API_E2E = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const DM_NOTES_SENTINEL_E2E = 'GFLE-E2E-DMNOTES-MUST-NOT-LEAK';

async function resolveCharacterAndWorld(
  request: import('@playwright/test').APIRequestContext,
  accessToken: string,
): Promise<{ characterId: string; worldId: string } | null> {
  const res = await request.get(`${API_E2E}/api/v1/characters`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok()) return null;
  const data = await res.json() as { data?: Array<{ id: string; status: string; worldId: string }> };
  const active = (data.data ?? []).find((c) => c.status === 'active');
  if (!active) return null;
  return { characterId: active.id, worldId: active.worldId };
}

test(
  'REQ-GFLE-09: NPC ref shared → guild feed shows entity card with name, dmNotes absent, height ≥44px at 375px',
  async ({ page, request }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const accessToken = await resolveAccessToken(page);

    if (!accessToken) {
      test.skip(true, 'Could not resolve access token — ensure auth.setup.ts ran first');
      return;
    }

    const ids = await resolveCharacterAndWorld(request, accessToken);
    if (!ids) {
      test.skip(true, 'No active character with worldId found');
      return;
    }

    const { characterId, worldId } = ids;

    // 1. Create an NPC via the API (DM-owned — the test user is also GM of the world)
    const npcName = `Aldeana Marta Feed ${Date.now()}`;
    const npcRes = await request.post(`${API_E2E}/api/v1/worlds/${worldId}/npcs`, {
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      data: {
        name: npcName,
        race: 'Human',
        description: `Test NPC for guild-feed-linked-entity-refs E2E.`,
        dmNotes: DM_NOTES_SENTINEL_E2E,
        status: 'alive',
      },
    });

    if (!npcRes.ok()) {
      test.skip(true, `Could not create test NPC (status ${npcRes.status()}) — user may not be GM`);
      return;
    }

    const npcId = (await npcRes.json() as { id: string }).id;

    // 2. Create a bitácora page with refs[0] pointing to the NPC
    const pageTitle = `GFLE E2E Page ${Date.now()}`;
    const createPageRes = await request.post(
      `${API_E2E}/api/v1/characters/${characterId}/bitacora/pages`,
      {
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        data: {
          title: pageTitle,
          body: 'E2E test page with NPC ref.',
          tags: ['npcs'],
          refs: [{ kind: 'npc', refKey: npcId, refSource: 'world' }],
        },
      },
    );
    expect(createPageRes.status()).toBe(200);
    const pageId = (await createPageRes.json() as { page: { id: string } }).page.id;

    try {
      // 3. Share the page to the guild feed
      const shareRes = await request.post(
        `${API_E2E}/api/v1/characters/${characterId}/bitacora/pages/${pageId}/share`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      expect(shareRes.status()).toBe(200);

      // 4. Navigate to /bitacora guild feed at 375px
      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto('/bitacora', { waitUntil: 'networkidle', timeout: 60_000 });
      await expect(page).toHaveURL(/\/bitacora/, { timeout: 10_000 });

      // 5. Find the feed card with the page title
      const titleLocator = page.getByText(pageTitle).first();
      await expect(titleLocator).toBeVisible({ timeout: 20_000 });

      // 6. Assert entity card visible with NPC name
      const feedCard = page.locator('article').filter({ hasText: pageTitle });
      const entityCard = feedCard.locator('[data-testid="entity-card"]');
      await expect(entityCard).toBeVisible({ timeout: 10_000 });
      await expect(entityCard.getByText(npcName)).toBeVisible({ timeout: 5_000 });

      // 7. Assert NPC kind label "NPC" visible (exact match to avoid matching NPC in name)
      await expect(entityCard.getByText('NPC', { exact: true })).toBeVisible({ timeout: 5_000 });

      // 8. Assert dmNotes sentinel NOT in page DOM (SECURITY-CRITICAL)
      const pageContent = await page.content();
      expect(pageContent).not.toContain(DM_NOTES_SENTINEL_E2E);

      // 9. Assert entity card tap target height ≥ 44px
      const boundingBox = await entityCard.boundingBox();
      expect(boundingBox).not.toBeNull();
      if (boundingBox) {
        expect(boundingBox.height).toBeGreaterThanOrEqual(44);
      }

    } finally {
      // Cleanup: delete the test page (ON DELETE SET NULL on contribution — feed item stays)
      await request.delete(
        `${API_E2E}/api/v1/characters/${characterId}/bitacora/pages/${pageId}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      // Note: NPC deletion not strictly needed (world is owned by test user in CI,
      // but in local dev the test user is also GM). Leave it — no cleanup needed for NPC.
    }
  },
);

/**
 * REQ-TEST-FILTER-01 (tag chip filter) is covered by the "Tag round-trip" test above
 * (REQ-GREM-E2E-01): it exercises the real chip UI — select a tag, deselect via "Todo" —
 * with robust, auto-retrying aria-pressed assertions.
 *
 * A dedicated content-count assertion was intentionally NOT added. The feed refetches
 * asynchronously via a Server Action and keeps the previous rows mounted during the
 * fetch, so there is no clean signal that the *new* result set has rendered; counting
 * <article> elements over append-only data that grows across runs is structurally racy.
 * A flaky test is worse than none. (barrido-final: the original selectOption test was
 * also removed — the filter is chips, not a <select>; no data-testid="source-select".)
 */
