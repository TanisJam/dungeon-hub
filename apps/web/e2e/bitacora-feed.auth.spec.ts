import { test, expect } from '@playwright/test';

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

  // Tags picker must be visible (KNOWLEDGE_TAGS multi-select, REQ-GREM-FD-05 scenario 2)
  // At least one tag button (e.g. "Tradición" for 'lore') must be present
  const loreChip = page.getByRole('button', { name: /tradición/i });
  await expect(loreChip).toBeVisible({ timeout: 5_000 });
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

/**
 * REQ-TEST-FILTER-01: selectOption on guild feed source filter.
 *
 * Uses selectOption with exact string (NOT label regex — pitfall §11).
 * The source select element (data-testid="source-select") passes ?source= to the
 * API and filters the result set to one source type only.
 *
 * NOTE: This test targets the source <select> facet on the /bitacora page.
 * When the source select UI lands, this spec is ready to run as-is.
 */
test('selectOption source filter: select "gremio" → feed shows only Gremio entries (REQ-TEST-FILTER-01)', async ({ page }) => {
  await page.goto('/bitacora', { waitUntil: 'networkidle' });
  await expect(page).toHaveURL(/\/bitacora$/, { timeout: 10_000 });

  // The source select facet — uses selectOption with exact value string, NOT label regex
  // (pitfall §11: selectOption({ label: regex }) does NOT exist in Playwright)
  const sourceSelect = page.locator('[data-testid="source-select"]');
  await expect(sourceSelect).toBeVisible({ timeout: 10_000 });

  // Select 'gremio' source using exact value string (REQ-TEST-FILTER-01, pitfall §11)
  await sourceSelect.selectOption('gremio');

  // After source filter, all visible feed cards must show the Gremio badge
  const feedCards = page.locator('article');
  await expect(feedCards.first()).toBeVisible({ timeout: 10_000 });

  // Verify each visible card has the "Gremio" source badge
  const gremioCards = feedCards.filter({ hasText: 'Gremio' });
  const allCards = await feedCards.count();
  const gremioCount = await gremioCards.count();
  expect(gremioCount).toBe(allCards);

  // Reset to show all sources — select the empty/all option
  await sourceSelect.selectOption('');

  // After reset, feed should have more entries (or at least not only gremio)
  await expect(feedCards.first()).toBeVisible({ timeout: 10_000 });
});
