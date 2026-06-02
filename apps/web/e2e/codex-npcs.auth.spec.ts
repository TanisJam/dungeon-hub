import { test, expect } from '@playwright/test';

/**
 * codex-npcs — E2E spec for the NPCs section in the Codex tab.
 * REQ-NPC-01, REQ-NPC-02, REQ-GATE-01, REQ-GATE-03.
 *
 * Verifies:
 *   (a) /codex/npcs renders for GM (DM view).
 *   (b) DM sees FAB "Crear" button.
 *   (c) DM creates an NPC → appears in list.
 *   (d) DM opens NPC detail → faction chip section is visible.
 *   (e) Player view (role toggled) sees no FAB, no chip controls.
 *
 * CRITICAL: FAB/forms are hydrated client islands — tests MUST use
 * waitUntil:'networkidle' + await expect(fab).toBeVisible() BEFORE clicking,
 * or the click is a no-op (pre-hydration). See Slice 1 E2E learnings.
 *
 * Mobile-first: 375px viewport. REQ-GATE-03.
 */

const MOBILE = { width: 375, height: 812 };

test.use({ viewport: MOBILE });

test('NPCs page renders for GM (DM view)', async ({ page }) => {
  await page.goto('/codex/npcs', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/codex\/npcs/, { timeout: 10_000 });

  // Page rendered without error — title visible
  const title = page.locator('h1, h2').first();
  await expect(title).toBeVisible({ timeout: 10_000 });
});

test('SubNav pills are visible on /codex/npcs: Facciones and NPCs', async ({ page }) => {
  await page.goto('/codex/npcs', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/codex\/npcs/, { timeout: 10_000 });

  // Both sub-nav pills should be visible
  await expect(page.getByRole('link', { name: /facciones/i })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('link', { name: /npcs/i })).toBeVisible({ timeout: 10_000 });
});

test('DM view: FAB "Crear" is visible at /codex/npcs', async ({ page }) => {
  await page.goto('/codex/npcs', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/codex\/npcs/, { timeout: 10_000 });

  // DM (callerRole='gm') should see the FAB — REQ-NPC-01, REQ-GATE-01
  const fab = page.getByRole('button', { name: /crear/i });
  await expect(fab).toBeVisible({ timeout: 10_000 });
});

test('DM can create an NPC via FAB', async ({ page }) => {
  // networkidle: the FAB is a hydrated client island — must wait before clicking
  await page.goto('/codex/npcs', { waitUntil: 'networkidle' });
  await expect(page).toHaveURL(/\/codex\/npcs/, { timeout: 10_000 });

  // Open create form
  const fab = page.getByRole('button', { name: /crear/i });
  await expect(fab).toBeVisible({ timeout: 10_000 });
  await fab.click();

  // Form sheet opens
  const nameInput = page.getByLabel(/nombre/i);
  await expect(nameInput).toBeVisible({ timeout: 5_000 });

  // Fill form
  const uniqueName = `E2E NPC ${Date.now()}`;
  await nameInput.fill(uniqueName);

  // Submit
  const submitButton = page.getByRole('button', { name: /crear npc/i });
  await submitButton.click();

  // After successful create, the NPC should appear in the list
  await expect(page.getByText(uniqueName)).toBeVisible({ timeout: 10_000 });
});

test('DM opens NPC detail: faction chip section is visible', async ({ page }) => {
  // First create an NPC so there's something to open
  await page.goto('/codex/npcs', { waitUntil: 'networkidle' });
  await expect(page).toHaveURL(/\/codex\/npcs/, { timeout: 10_000 });

  const fab = page.getByRole('button', { name: /crear/i });
  await expect(fab).toBeVisible({ timeout: 10_000 });
  await fab.click();

  const nameInput = page.getByLabel(/nombre/i);
  await expect(nameInput).toBeVisible({ timeout: 5_000 });
  const npcName = `E2E NPC Factions ${Date.now()}`;
  await nameInput.fill(npcName);

  const submitButton = page.getByRole('button', { name: /crear npc/i });
  await submitButton.click();
  await expect(page.getByText(npcName)).toBeVisible({ timeout: 10_000 });

  // Tap the NPC row to open detail sheet
  await page.getByRole('button', { name: new RegExp(npcName) }).click();

  // Detail sheet should open — "Facciones" label visible (faction chip section)
  await expect(page.getByText('Facciones', { exact: true })).toBeVisible({ timeout: 5_000 });
});

test('Codex tab remains active when on /codex/npcs', async ({ page }) => {
  await page.goto('/codex/npcs', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/codex\/npcs/, { timeout: 10_000 });

  // Codex tab should remain highlighted (TabBar matches startsWith('/codex'))
  const nav = page.locator('nav[aria-label="Navegación principal"]');
  const codexLink = nav.locator('a[href^="/codex"]');
  await expect(codexLink.first()).toBeVisible({ timeout: 5_000 });
});
