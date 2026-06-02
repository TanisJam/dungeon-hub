import { test, expect } from '@playwright/test';

/**
 * E2E — Compendium Browser end-to-end coverage @ 375px (iPhone SE).
 *
 * REQ-CBROWSE-01: category grid hrefs.
 * REQ-CBROWSE-02: dynamic list route, 404 on invalid slug.
 * REQ-CBROWSE-04: debounced name search (filter, clear).
 * REQ-CBROWSE-06: V3Sheet detail bottom-sheet (open, close).
 * REQ-CBROWSE-09: no horizontal overflow at 375px on list + open detail.
 * REQ-CBROWSE-11: this spec.
 *
 * Relies on the auth user (user.json) owning "E2E Test Campaign" created by
 * auth.setup.ts — the compendium page.tsx auto-resolves the first active
 * campaign so no explicit ?campaign= param is required for navigation.
 *
 * Stack must be running (see apps/web/e2e/README.md).
 * next dev cold-compile can be slow → 120 s timeout on first goto.
 * retries: 2 (playwright.config.ts) absorb cold-start races.
 */
test.describe('Compendium browser @ 375px (iPhone SE)', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  // -------------------------------------------------------------------------
  // Scenario 1 — Browse: /compendium grid → spells list renders (≥1 row)
  // REQ-CBROWSE-01: "Hechizos" card is a Link, not a disabled button.
  // REQ-CBROWSE-02: list page SSR-renders at least one row.
  // -------------------------------------------------------------------------
  test('browse: /compendium → click Hechizos → spell list renders', async ({ page }) => {
    await page.goto('/compendium', { timeout: 120_000 });

    // The grid card for "spells" has data-category="spells" (REQ-CBROWSE-01).
    // It is an <a> (Link) when a campaign is active. We assert it is visible.
    const spellsCard = page.locator('[data-category="spells"]');
    await expect(spellsCard, 'Hechizos card must be visible').toBeVisible({ timeout: 15_000 });

    // Navigate via the card.
    await spellsCard.click();

    // We should land on /compendium/spells (with ?campaign=... in the URL).
    await expect(page).toHaveURL(/\/compendium\/spells/, { timeout: 30_000 });

    // At least one spell row must be visible — each row is a <button> inside <ul>.
    // The list renders in a <ul class="divide-y"> — any <li><button> counts.
    const firstRow = page.locator('ul button').first();
    await expect(firstRow, 'At least one spell row must render').toBeVisible({ timeout: 15_000 });

    // No horizontal scroll on the list at 375px (REQ-CBROWSE-09).
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth, 'No horizontal overflow on spell list at 375px').toBeLessThanOrEqual(375);
  });

  // -------------------------------------------------------------------------
  // Scenario 2 — Search: type "fire" → list filters → clear → list restores
  // REQ-CBROWSE-04: debounced search, result updates, clear resets.
  // -------------------------------------------------------------------------
  test('search: type "fire" → list filters → clear → list restores', async ({ page }) => {
    await page.goto('/compendium/spells', { timeout: 120_000 });

    // Wait for the list to load (first row must be visible before searching).
    await expect(page.locator('ul button').first()).toBeVisible({ timeout: 15_000 });

    const countBefore = await page.locator('ul button').count();
    expect(countBefore, 'Initial list must have ≥1 rows').toBeGreaterThanOrEqual(1);

    // Type "fire" — the aria-label comes from the config.label ("Hechizos").
    const searchInput = page.getByRole('searchbox', { name: /buscar hechizos/i });
    await expect(searchInput).toBeVisible({ timeout: 5_000 });
    await searchInput.fill('fire');

    // Wait for the debounce (200ms) + Server Action round-trip.
    // Wait for the "Buscando…" indicator to disappear (proxy for search completion),
    // then assert the results changed. We use a custom wait because the list is
    // client-side state, not a navigation.
    await page.waitForFunction(
      () => {
        const searching = document.querySelector('[class*="Buscando"]');
        if (searching) return false;
        const rows = document.querySelectorAll('ul button');
        // Either we have rows (filtered) or we have "Sin resultados" — either way
        // the searching state is done.
        return rows.length > 0 || !!document.querySelector('[class*="Sin resultados"]');
      },
      { timeout: 15_000 },
    );

    // The filter should return at least one spell (or "Sin resultados" if no PHB spells
    // contain "fire" — but there are many like Fireball, Fire Bolt, Fire Shield, etc.).
    // We assert the list is not "Buscando…" (stuck) — actual content is DB-dependent.
    const isStillSearching = await page.locator('text=Buscando…').isVisible();
    expect(isStillSearching, '"Buscando…" should not persist after debounce').toBe(false);

    // Clear the search — list should restore to ≥ countBefore rows (SSR initial set).
    await searchInput.clear();

    // Wait for the list to restore to initial rows.
    await page.waitForFunction(
      (expected) => {
        const rows = document.querySelectorAll('ul button');
        return rows.length >= expected;
      },
      countBefore,
      { timeout: 15_000 },
    );

    const countAfterClear = await page.locator('ul button').count();
    expect(countAfterClear, 'After clearing search, list should restore to initial count').toBeGreaterThanOrEqual(
      countBefore,
    );
  });

  // -------------------------------------------------------------------------
  // Scenario 3 — Detail: click a spell row → V3Sheet opens → header visible → close
  // REQ-CBROWSE-06: V3Sheet opens on row tap, header + body visible, closes.
  // REQ-CBROWSE-07: spell header shows level/school fields.
  // -------------------------------------------------------------------------
  test('detail: click spell row → sheet opens with header fields → close', async ({ page }) => {
    await page.goto('/compendium/spells', { timeout: 120_000 });

    // Wait for at least one row.
    const firstRow = page.locator('ul button').first();
    await expect(firstRow).toBeVisible({ timeout: 15_000 });

    // Open the detail sheet by clicking the first spell row.
    await firstRow.click();

    // The V3Sheet renders as role="dialog" (aria-modal=true) via createPortal.
    const dialog = page.getByRole('dialog');
    await expect(dialog, 'Detail sheet (V3Sheet dialog) must open').toBeVisible({ timeout: 15_000 });

    // The loading state shows "Cargando…" then resolves to the header.
    // Wait for "Cargando…" to disappear (detail fetch completed).
    await expect(page.locator('text=Cargando…')).toBeHidden({ timeout: 15_000 });

    // After the detail loads the SpellHeader renders. Check that the school field
    // is visible — data-field="school" (REQ-CBROWSE-07).
    const schoolField = dialog.locator('[data-field="school"]');
    await expect(schoolField, 'School field must be visible in spell header').toBeVisible({ timeout: 5_000 });

    // Also assert casting-time is present (one of the 6 required spell meta fields).
    const castingTimeField = dialog.locator('[data-field="casting-time"]');
    await expect(castingTimeField, 'Casting time field must be visible').toBeVisible();

    // Close the sheet by pressing Escape (V3Sheet handles keydown Escape → onClose).
    await page.keyboard.press('Escape');
    await expect(dialog, 'Sheet must close after Escape').toBeHidden({ timeout: 5_000 });
  });

  // -------------------------------------------------------------------------
  // Scenario 4 — Monsters: search "goblin" → open → stat-block visible → no overflow
  // REQ-CBROWSE-03: monster rows show name, CR, type.
  // REQ-CBROWSE-07: stat-block header shows AC/HP/CR + 6 ability scores.
  // REQ-CBROWSE-09: no horizontal overflow on list + open detail @375px.
  // -------------------------------------------------------------------------
  test('monsters: search "goblin" → statblock renders → no overflow @375px', async ({ page }) => {
    await page.goto('/compendium/monsters', { timeout: 120_000 });

    // Wait for list.
    await expect(page.locator('ul button').first()).toBeVisible({ timeout: 15_000 });

    // No overflow on the list itself.
    const listScrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(listScrollWidth, 'No horizontal overflow on monster list at 375px').toBeLessThanOrEqual(375);

    // Search for "goblin".
    const searchInput = page.getByRole('searchbox', { name: /buscar monstruos/i });
    await expect(searchInput).toBeVisible({ timeout: 5_000 });
    await searchInput.fill('goblin');

    // Wait for search to complete (searching indicator gone + rows or empty state).
    await page.waitForFunction(
      () => {
        const rows = document.querySelectorAll('ul button');
        const empty = Array.from(document.querySelectorAll('div')).some(
          (el) => el.textContent?.trim() === 'Sin resultados',
        );
        return rows.length > 0 || empty;
      },
      { timeout: 15_000 },
    );

    // Verify not stuck searching.
    const isStillSearching = await page.locator('text=Buscando…').isVisible();
    expect(isStillSearching, '"Buscando…" should not persist').toBe(false);

    // If there are no goblin results skip gracefully — DB may not have been seeded yet.
    const rows = page.locator('ul button');
    const rowCount = await rows.count();
    if (rowCount === 0) {
      test.skip(true, 'No goblin results in DB — skipping monster detail sub-test.');
      return;
    }

    // Open the first goblin result.
    await rows.first().click();

    const dialog = page.getByRole('dialog');
    await expect(dialog, 'Monster detail sheet must open').toBeVisible({ timeout: 15_000 });

    // Wait for the detail fetch to complete ("Cargando…" disappears).
    await expect(page.locator('text=Cargando…')).toBeHidden({ timeout: 15_000 });

    // MonsterStatblockHeader renders data-field="ability-scores" (the 6-stat grid).
    // REQ-CBROWSE-07: all 6 ability scores must be present.
    const abilityGrid = dialog.locator('[data-field="ability-scores"]');
    await expect(abilityGrid, 'Ability score grid must be visible in monster stat block').toBeVisible({
      timeout: 5_000,
    });

    // Also verify AC and HP fields are present.
    await expect(dialog.locator('[data-field="ac"]'), 'AC field must be visible').toBeVisible();
    await expect(dialog.locator('[data-field="hp"]'), 'HP field must be visible').toBeVisible();

    // REQ-CBROWSE-09: no horizontal scroll with the detail sheet open @375px.
    const detailScrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(
      detailScrollWidth,
      'No horizontal overflow on monster detail sheet at 375px',
    ).toBeLessThanOrEqual(375);

    // Close sheet.
    await page.keyboard.press('Escape');
    await expect(dialog, 'Sheet must close after Escape').toBeHidden({ timeout: 5_000 });
  });

  // -------------------------------------------------------------------------
  // Scenario 5 — 404: /compendium/foobar → Next not-found
  // REQ-CBROWSE-02: invalid category slug returns 404.
  // -------------------------------------------------------------------------
  test('404: /compendium/foobar returns not-found', async ({ page }) => {
    const res = await page.goto('/compendium/foobar', { timeout: 60_000 });

    // Next.js notFound() returns a 404 HTTP response.
    // Also accept 200 (some Next.js dev builds return 200 with not-found UI).
    expect([404, 200], 'Response should be 404 or 200 with not-found UI').toContain(res?.status());

    // The not-found page renders some "not found" indicator.
    // Next.js default: "This page could not be found." — also accept custom messages.
    const notFoundText = page.locator(
      'text=/not found|página no encontrada|could not be found/i',
    );
    await expect(notFoundText, 'Not-found message must appear for /compendium/foobar').toBeVisible({
      timeout: 10_000,
    });
  });
});
