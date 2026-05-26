import { test, expect } from '@playwright/test';

/**
 * E2E tests for Batch 6 (race-additional-spells).
 *
 * Tests:
 * E2E-RS-1: High Elf wizard step — cantrip picker appears, picks fire-bolt, wizard saves
 * E2E-RS-2: Tiefling sheet — racial spells (Infernal Legacy) listed on character sheet
 *
 * Prerequisites:
 * - Stack must be running (see e2e/README.md)
 * - Compendium must be imported (`pnpm import:5etools`) so elf--high and tiefling
 *   have additionalSpellsNormalized populated.
 * - Wizard cantrips (level 0) must exist in compendium_spells for 'wizard'.
 *
 * PHB citations:
 * - High Elf cantrip: PHB p.23 — "You know one cantrip of your choice from the wizard spell list."
 * - Tiefling Infernal Legacy: PHB p.42-43 — thaumaturgy at-will, hellish rebuke 3rd level,
 *   darkness 5th level.
 */

test.describe('Racial spells — Batch 6 (race-additional-spells)', () => {
  // E2E-RS-1: High Elf cantrip picker in race wizard step
  test('E2E-RS-1: High Elf race step shows cantrip picker, picks fire-bolt, wizard advances', async ({ page }) => {
    const charName = `E2E HighElf ${Date.now()}`;

    await test.step('create character + stats', async () => {
      await page.goto('/dashboard');
      await page.locator('a[href="/characters/new"]').first().click();
      await expect(page).toHaveURL(/\/characters\/new$/);

      await page.selectOption('select[name="worldId"]', { label: 'E2E Test Campaign (World)' });
      await page.fill('input[name="name"]', charName);
      await page.getByRole('button', { name: /crear personaje/i }).click();
      await expect(page).toHaveURL(/\/wizard\/stats$/, { timeout: 10_000 });

      // Standard array stats
      await page.getByRole('tab', { name: 'Estándar' }).click();
      const tileButtons = page.locator(
        'button[aria-label*="FUE"], button[aria-label*="DES"], button[aria-label*="CON"], button[aria-label*="INT"], button[aria-label*="SAB"], button[aria-label*="CAR"]',
      );
      const count = await tileButtons.count();
      for (let i = 0; i < count; i++) await tileButtons.nth(i).click();
      await page.getByRole('button', { name: /^siguiente/i }).click();
      await expect(page).toHaveURL(/\/wizard\/race$/, { timeout: 10_000 });
    });

    await test.step('race step: select High Elf subrace', async () => {
      // Elf (PHB) is in RACES_REQUIRING_SUBRACE → renders as a collapsible accordion group.
      // Expand the Elf group first, then select the High Elf subrace card inside.
      await page.locator('[data-testid="subrace-group-elf"]').click();

      // Select the High Elf subrace card inside the expanded accordion.
      // Use getByRole('button', { name: /^high elf/i }) to target the ChoiceCard button
      // directly — avoids the ambiguity of class-based selectors when the accordion outer
      // div also contains 'High Elf' text and matches [class*="rounded-md border"].
      await page.getByRole('button', { name: /^high elf/i }).click();

      // The "Cantrip de linaje" section must be visible (PHB p.23).
      await expect(page.getByText(/cantrip de linaje/i).first()).toBeVisible({ timeout: 5_000 });
    });

    await test.step('race step: pick fire-bolt cantrip', async () => {
      // PHB p.23: High Elf may choose from the wizard spell list. Fire Bolt is a common choice.
      // The picker shows all wizard cantrips alphabetically.
      // Use the search to narrow down.
      const cantripSearch = page.getByPlaceholder(/buscar cantrip/i);
      await cantripSearch.fill('fire');

      // Fire Bolt should appear as a selectable button
      const fireBoltBtn = page.getByRole('button', { name: /fire bolt/i });
      await expect(fireBoltBtn).toBeVisible({ timeout: 5_000 });
      await fireBoltBtn.click();
    });

    await test.step('race step: choose language + advance', async () => {
      // Elf grants Common + Elvish fixed. No language choices for base Elf.
      // High Elf adds a bonus language (anyStandard) — pick Dwarvish.
      const dwarvishBtn = page.getByRole('button', { name: 'Dwarvish', exact: true });
      if (await dwarvishBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await dwarvishBtn.click();
      }

      await page.getByRole('button', { name: /^siguiente/i }).click();
      await expect(page).toHaveURL(/\/wizard\/class$/, { timeout: 10_000 });
    });

    await test.step('complete wizard (class → background → review → publish)', async () => {
      // Class: Fighter (non-caster) — E2E-RS-1 focuses on the race cantrip picker, not
      // class spells. Using Fighter means the spells step shows the no-picks panel and
      // siguiente is enabled immediately, avoiding the need to fill Wizard spell picks.
      await page
        .locator('[class*="rounded-md border"]')
        .filter({ hasText: 'Fighter' })
        .filter({ hasText: 'PHB' })
        .first()
        .click();
      await page.getByRole('button', { name: 'Acrobatics', exact: true }).first().click();
      await page.getByRole('button', { name: 'Intimidation', exact: true }).first().click();
      await page.getByRole('button', { name: /^siguiente/i }).click();
      await expect(page).toHaveURL(/\/wizard\/background$/, { timeout: 10_000 });

      // Background: Acolyte PHB (fixed skills Insight + Religion).
      // PHB p.127: Acolyte grants 2 languages of choice — pick Gnomish + Halfling.
      await page
        .locator('[class*="rounded-md border"]')
        .filter({ hasText: 'Acolyte' })
        .filter({ hasText: 'PHB' })
        .first()
        .click();
      // Pick 2 standard languages (PHB p.127 — "Two of your choice")
      await page.getByRole('button', { name: 'Gnomish', exact: true }).click();
      await page.getByRole('button', { name: 'Halfling', exact: true }).click();
      await page.getByRole('button', { name: /^siguiente/i }).click();
      await expect(page).toHaveURL(/\/wizard\/spells$/, { timeout: 10_000 });

      // Spells step: Fighter is a non-caster at L1 → shows "no picks" panel
      // with an enabled siguiente that navigates directly to /review.
      await page.getByRole('button', { name: /^siguiente/i }).click();
      await expect(page).toHaveURL(/\/wizard\/review$/, { timeout: 10_000 });

      // Publish
      await page.getByRole('button', { name: /^publicar/i }).click();
      const profileLink = page.getByRole('link', { name: /ir al perfil/i });
      await expect(profileLink).toBeVisible({ timeout: 10_000 });
      await profileLink.click();
      await expect(page).toHaveURL(/\/characters\/.+\/?(?:\?.*)?$/, { timeout: 10_000 });
    });

    await test.step('sheet: chosen cantrip (fire-bolt) visible in Hechizos raciales section (PHB p.23)', async () => {
      // Navigate to hechizos tab
      const hechizosTab = page.getByRole('tab', { name: /hechizos/i });
      if (await hechizosTab.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await hechizosTab.click();
      } else {
        await page.goto(page.url() + '?tab=hechizos');
      }

      // PHB p.23: "You know one cantrip of your choice from the wizard spell list."
      // We picked Fire Bolt — it must appear in the Hechizos raciales section.
      await expect(page.getByRole('heading', { name: /hechizos raciales/i }).first()).toBeVisible({ timeout: 5_000 });
      await expect(page.getByText(/fire bolt/i).first()).toBeVisible({ timeout: 5_000 });
    });
  });

  // E2E-RS-2: Tiefling character sheet shows Infernal Legacy racial spells
  test('E2E-RS-2: Tiefling sheet shows Infernal Legacy racial spells (PHB p.42-43)', async ({ page }) => {
    const charName = `E2E Tiefling ${Date.now()}`;

    await test.step('create character + stats', async () => {
      await page.goto('/dashboard');
      await page.locator('a[href="/characters/new"]').first().click();
      await expect(page).toHaveURL(/\/characters\/new$/);

      await page.selectOption('select[name="worldId"]', { label: 'E2E Test Campaign (World)' });
      await page.fill('input[name="name"]', charName);
      await page.getByRole('button', { name: /crear personaje/i }).click();
      await expect(page).toHaveURL(/\/wizard\/stats$/, { timeout: 10_000 });

      await page.getByRole('tab', { name: 'Estándar' }).click();
      const tileButtons = page.locator(
        'button[aria-label*="FUE"], button[aria-label*="DES"], button[aria-label*="CON"], button[aria-label*="INT"], button[aria-label*="SAB"], button[aria-label*="CAR"]',
      );
      const count = await tileButtons.count();
      for (let i = 0; i < count; i++) await tileButtons.nth(i).click();
      await page.getByRole('button', { name: /^siguiente/i }).click();
      await expect(page).toHaveURL(/\/wizard\/race$/, { timeout: 10_000 });
    });

    await test.step('race step: select Tiefling, no language choice needed', async () => {
      // Tiefling is a base race (no subrace required) with CHA+2 / INT+1 fixed.
      await page
        .locator('[class*="rounded-md border"]')
        .filter({ hasText: 'Tiefling' })
        .filter({ hasText: 'PHB' })
        .first()
        .click();

      // No cantrip picker — Tiefling has fixed innate spells, not isPlayerChoice.
      await expect(page.getByText(/cantrip de linaje/i)).toHaveCount(0);

      await page.getByRole('button', { name: /^siguiente/i }).click();
      await expect(page).toHaveURL(/\/wizard\/class$/, { timeout: 10_000 });
    });

    await test.step('class: Fighter + skills to satisfy class step', async () => {
      // Use Fighter (non-caster) so the spells step shows a "no picks needed" panel
      // and allows skipping directly to review — the test only cares about Tiefling racial spells on sheet.
      await page
        .locator('[class*="rounded-md border"]')
        .filter({ hasText: 'Fighter' })
        .filter({ hasText: 'PHB' })
        .first()
        .click();
      // Fighter class skill choices (pick 2 from its list)
      await page.getByRole('button', { name: 'Acrobatics', exact: true }).first().click();
      await page.getByRole('button', { name: 'Intimidation', exact: true }).first().click();
      await page.getByRole('button', { name: /^siguiente/i }).click();
      await expect(page).toHaveURL(/\/wizard\/background$/, { timeout: 10_000 });
    });

    await test.step('background: Acolyte PHB', async () => {
      // Use Acolyte PHB (fixed skills: Insight + Religion).
      // PHB p.127: Acolyte grants 2 languages of choice — pick Gnomish + Halfling.
      await page
        .locator('[class*="rounded-md border"]')
        .filter({ hasText: 'Acolyte' })
        .filter({ hasText: 'PHB' })
        .first()
        .click();
      // Pick 2 standard languages (PHB p.127 — "Two of your choice")
      await page.getByRole('button', { name: 'Gnomish', exact: true }).click();
      await page.getByRole('button', { name: 'Halfling', exact: true }).click();
      await page.getByRole('button', { name: /^siguiente/i }).click();
      await expect(page).toHaveURL(/\/wizard\/spells$/, { timeout: 10_000 });
    });

    await test.step('spells step: skip (pick cantrips/spells or advance)', async () => {
      // Navigate to review directly (spells step for Wizard requires picks but we test sheet only)
      await page.getByRole('button', { name: /^siguiente/i }).click();
      await expect(page).toHaveURL(/\/wizard\/review$/, { timeout: 10_000 });
    });

    await test.step('publish + navigate to sheet', async () => {
      await page.getByRole('button', { name: /^publicar/i }).click();
      const profileLink = page.getByRole('link', { name: /ir al perfil/i });
      await expect(profileLink).toBeVisible({ timeout: 10_000 });
      await profileLink.click();
      await expect(page).toHaveURL(/\/characters\/.+\/?(?:\?.*)?$/, { timeout: 10_000 });
    });

    await test.step('sheet: Infernal Legacy racial spells visible in Hechizos raciales section (PHB p.42-43)', async () => {
      // Navigate to hechizos tab (the tab where racial spells are rendered)
      const hechizosTab = page.getByRole('tab', { name: /hechizos/i });
      if (await hechizosTab.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await hechizosTab.click();
      } else {
        await page.goto(page.url() + '?tab=hechizos');
      }

      // PHB p.42-43: Tiefling at level 1 has thaumaturgy (at-will, CHA).
      // The sheet must render a "Hechizos raciales" section heading.
      await expect(page.getByRole('heading', { name: /hechizos raciales/i }).first()).toBeVisible({ timeout: 5_000 });

      // Thaumaturgy must appear in the section (it's available at level 1 — PHB p.42-43).
      await expect(page.getByText(/thaumaturgy/i).first()).toBeVisible({ timeout: 5_000 });

      // The frequency label for at-will spells must be visible
      await expect(page.getByText(/a voluntad/i).first()).toBeVisible({ timeout: 5_000 });
    });
  });
});
