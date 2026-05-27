import { test, expect } from '@playwright/test';

/**
 * E2E happy path for Monk L1 through the 6-step character-builder wizard.
 *
 * REQ-MQS-WIZARD-MONK (sdd/mobile-qa-sweep spec #910):
 *   Monk is a non-caster at L1 → spells step renders "no picks" panel,
 *   wizard completes successfully, dashboard shows character as Pendiente.
 *
 * Class: Monk PHB
 *   - Skills (choose 2 from Acrobatics, Athletics, History, Insight, Religion, Stealth):
 *     Acrobatics + History (no overlap with Acolyte background: Insight + Religion).
 *   - Background: Acolyte PHB (Insight + Religion fixed, 2 language choices).
 *   - No subclass at L1 (Monk subclass unlocks at L3).
 *   - Non-caster → spells step shows NoPicksPanel.
 *
 * Skips gracefully when:
 *   - Monk is not present in the world's compendium (FEAT_NOT_FOUND early exit).
 *   - Any step's required button is not visible (compendium data missing).
 *
 * Mobile-first: viewport at 375px per CLAUDE.md §2.
 * Stack must be running (see apps/web/e2e/README.md).
 */
test.describe('character builder wizard — Monk L1 happy path @ 375px', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test('create Monk character, fill 6 steps (non-caster), publish → Pendiente', async ({
    page,
  }) => {
    const charName = `E2E Monk ${Date.now()}`;

    await test.step('navigate to new character form', async () => {
      await page.goto('/dashboard');
      await page.locator('a[href="/characters/new"]').first().click();
      await expect(page).toHaveURL(/\/characters\/new$/, { timeout: 10_000 });
    });

    await test.step('submit name + world → land on stats step', async () => {
      await page.selectOption('select[name="worldId"]', { label: 'E2E Test Campaign (World)' });
      await page.fill('input[name="name"]', charName);
      await page.getByRole('button', { name: /crear personaje/i }).click();
      await expect(page).toHaveURL(/\/wizard\/stats$/, { timeout: 10_000 });
      await expect(page.locator('text=Atributos').first()).toBeVisible({ timeout: 5_000 });
    });

    await test.step('atributos: estándar → guardar y seguir', async () => {
      await page.getByRole('tab', { name: 'Estándar' }).click();
      const tileButtons = page.locator(
        'button[aria-label*="FUE"], button[aria-label*="DES"], button[aria-label*="CON"], button[aria-label*="INT"], button[aria-label*="SAB"], button[aria-label*="CAR"]',
      );
      const count = await tileButtons.count();
      for (let i = 0; i < count; i++) {
        await tileButtons.nth(i).click();
      }
      await expect(page.getByRole('button', { name: /^siguiente/i })).toBeEnabled({ timeout: 3_000 });
      await page.getByRole('button', { name: /^siguiente/i }).click();
      await expect(page).toHaveURL(/\/wizard\/race$/, { timeout: 10_000 });
      await expect(page.locator('text=Linaje').first()).toBeVisible({ timeout: 5_000 });
    });

    await test.step('linaje: Human PHB → guardar y seguir', async () => {
      await page
        .locator('[class*="rounded-md border"]')
        .filter({ hasText: 'Human' })
        .filter({ hasText: 'PHB' })
        .first()
        .click();
      // Human PHB: +2 choice → STR, +1 choice → DEX
      await page.getByRole('button', { name: 'STR', exact: true }).first().click();
      await page.getByRole('button', { name: 'DEX', exact: true }).last().click();
      // Language choice: pick Dwarvish
      await page.getByRole('button', { name: 'Dwarvish', exact: true }).click();
      await page.getByRole('button', { name: /^siguiente/i }).click();
      await expect(page).toHaveURL(/\/wizard\/class$/, { timeout: 10_000 });
      await expect(page.locator('text=Clase').first()).toBeVisible({ timeout: 5_000 });
    });

    await test.step('clase: Monk PHB — skip gracefully if not in compendium', async () => {
      const monkCard = page
        .locator('[class*="rounded-md border"]')
        .filter({ hasText: 'Monk' })
        .filter({ hasText: 'PHB' })
        .first();

      const monkVisible = await monkCard.isVisible({ timeout: 5_000 }).catch(() => false);
      test.skip(!monkVisible, 'Monk PHB not found in class picker — compendium may not be seeded.');

      await monkCard.click();
      // Monk skills: choose 2 from Acrobatics, Athletics, History, Insight, Religion, Stealth.
      // Pick Acrobatics + History (no overlap with Acolyte background skills).
      await page.getByRole('button', { name: 'Acrobatics', exact: true }).click();
      await page.getByRole('button', { name: 'History', exact: true }).click();
      await page.getByRole('button', { name: /^siguiente/i }).click();
      await expect(page).toHaveURL(/\/wizard\/background$/, { timeout: 10_000 });
      await expect(page.locator('text=Trasfondo').first()).toBeVisible({ timeout: 5_000 });
    });

    await test.step('trasfondo: Acolyte PHB → guardar y seguir', async () => {
      // Acolyte PHB: fixed skills Insight + Religion (no overlap with Monk's Acrobatics + History).
      // 2 language choices: Elvish + Gnomish (PHB p.127 — "Two of your choice").
      await page
        .locator('[class*="rounded-md border"]')
        .filter({ hasText: 'Acolyte' })
        .filter({ hasText: 'PHB' })
        .first()
        .click();
      await page.getByRole('button', { name: 'Elvish', exact: true }).click();
      await page.getByRole('button', { name: 'Gnomish', exact: true }).click();
      await page.getByRole('button', { name: /^siguiente/i }).click();
      await expect(page).toHaveURL(/\/wizard\/spells$/, { timeout: 10_000 });
      await expect(page.locator('text=Hechizos').first()).toBeVisible({ timeout: 5_000 });
    });

    await test.step('hechizos: Monk es non-caster → panel "no picks needed" → siguiente', async () => {
      // Monk L1 is a non-caster: spells step renders NoPicksPanel.
      await expect(page.locator('text=Tu clase no utiliza hechizos.').first()).toBeVisible({
        timeout: 5_000,
      });
      // No checkboxes should be rendered
      await expect(page.locator('input[type="checkbox"]')).toHaveCount(0);
      await page.getByRole('button', { name: /^siguiente/i }).click();
      await expect(page).toHaveURL(/\/wizard\/review$/, { timeout: 10_000 });
      await expect(page.locator('text=Revisión').first()).toBeVisible({ timeout: 5_000 });
    });

    await test.step('revisión: contenido visible + publicar', async () => {
      await expect(page.locator('text=Revisión').first()).toBeVisible();
      await expect(page.locator('text=Atributos').first()).toBeVisible();
      await expect(page.getByText(charName, { exact: false }).first()).toBeVisible();
      await expect(page.locator('text=monk').first()).toBeVisible();
      await expect(page.locator('text=Hechizos').first()).toBeVisible();

      // No horizontal scroll at 375px (CLAUDE.md §2 mobile-first mandate)
      const wScroll = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(wScroll, 'horizontal scroll on /wizard/review at 375px').toBeLessThanOrEqual(375);

      await page.getByRole('button', { name: /^publicar/i }).click();
      await page.getByRole('link', { name: /ir al perfil/i }).click();
      await expect(page).toHaveURL(/\/characters\/.+\/?(?:\?.*)?$/, { timeout: 10_000 });
    });

    await test.step('dashboard muestra el personaje Monk como Pendiente', async () => {
      await page.goto('/dashboard');
      const charCard = page.locator('li').filter({ hasText: charName });
      await expect(charCard).toBeVisible();
      await expect(charCard).toContainText('Pendiente');
    });
  });
});
