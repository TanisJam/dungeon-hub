import { test, expect } from '@playwright/test';

// End-to-end del character builder wizard.
// Cubre: create draft → atributos → linaje → clase → trasfondo → revisión → activar.
//
// Combinación elegida para evitar overlap entre class skills y background skills
// (validación cross-step):
//   - Fighter PHB: pick acrobatics + survival
//   - Soldier PHB: skills fijas athletics + intimidation (no chocan)
//   - Soldier tools: pick 1 gaming set (dice-set)

test.describe('character builder wizard', () => {
  test('create, fill 5 steps, activate', async ({ page }) => {
    const charName = `E2E Char ${Date.now()}`;

    await test.step('navigate to new character form', async () => {
      await page.goto('/dashboard');
      await page.locator('a[href="/characters/new"]').first().click();
      await expect(page).toHaveURL(/\/characters\/new$/);
    });

    await test.step('submit name + campaign → land on stats step', async () => {
      await page.selectOption('select[name="campaignId"]', { label: 'E2E Test Campaign' });
      await page.fill('input[name="name"]', charName);
      await page.getByRole('button', { name: /crear personaje/i }).click();
      await expect(page).toHaveURL(/\/wizard\/stats$/, { timeout: 10_000 });
    });

    await test.step('atributos: estándar (tile-based) → guardar y seguir', async () => {
      // Switch to standard array method
      await page.getByRole('tab', { name: 'Estándar' }).click();
      // Tap all 6 tiles once to assign values (first available for each)
      // The tiles cycle from null → first available. We tap each once.
      // The order of assignment matters for uniqueness — tap all 6 sequentially.
      const tileButtons = page.locator('button[aria-label*="FUE"], button[aria-label*="DES"], button[aria-label*="CON"], button[aria-label*="INT"], button[aria-label*="SAB"], button[aria-label*="CAR"]');
      const count = await tileButtons.count();
      for (let i = 0; i < count; i++) {
        await tileButtons.nth(i).click();
      }
      // Wait until save button is enabled
      await expect(page.getByRole('button', { name: /guardar y seguir/i })).toBeEnabled({ timeout: 3000 });
      await page.getByRole('button', { name: /guardar y seguir/i }).click();
      await expect(page).toHaveURL(/\/wizard\/race$/, { timeout: 10_000 });
    });

    await test.step('linaje: Human PHB (MPMM-style) → guardar y seguir', async () => {
      // Human PHB en 5etools 2024+ no tiene `ability` field — el picker
      // sintetiza 2 slots de choose (+2 y +1). Buen test para ese path.
      // New ChoiceList pattern: tap the card button to expand inline detail.
      await page
        .locator('[class*="rounded-md border"]')
        .filter({ hasText: 'Human' })
        .filter({ hasText: 'PHB' })
        .first()
        .click();
      // 2 bloques de choose en DOM order: primero +2, después +1. Cada bloque
      // tiene los 6 buttons STR/DEX/CON/INT/WIS/CHA. Picamos:
      //   - STR del primer bloque (+2)
      //   - CON del segundo bloque (+1)
      await page.getByRole('button', { name: 'STR', exact: true }).first().click();
      await page.getByRole('button', { name: 'CON', exact: true }).last().click();
      await page.getByRole('button', { name: /guardar y seguir/i }).click();
      await expect(page).toHaveURL(/\/wizard\/class$/, { timeout: 10_000 });
    });

    await test.step('clase: Fighter PHB + skills acrobatics/survival → guardar y seguir', async () => {
      await page
        .locator('[class*="rounded-md border"]')
        .filter({ hasText: 'Fighter' })
        .filter({ hasText: 'PHB' })
        .first()
        .click();
      // Skill picker — buttons en el detail panel
      await page.getByRole('button', { name: 'Acrobatics', exact: true }).click();
      await page.getByRole('button', { name: 'Survival', exact: true }).click();
      await page.getByRole('button', { name: /guardar y seguir/i }).click();
      await expect(page).toHaveURL(/\/wizard\/background$/, { timeout: 10_000 });
    });

    await test.step('trasfondo: Soldier PHB + dice-set → guardar y seguir', async () => {
      await page
        .locator('[class*="rounded-md border"]')
        .filter({ hasText: 'Soldier' })
        .filter({ hasText: 'PHB' })
        .first()
        .click();
      // Tool choice: anyGamingSet → pick "Dice Set"
      await page.getByRole('button', { name: 'Dice Set', exact: true }).click();
      await page.getByRole('button', { name: /guardar y seguir/i }).click();
      await expect(page).toHaveURL(/\/wizard\/review$/, { timeout: 10_000 });
    });

    await test.step('revisión: verificar completitud + publicar', async () => {
      // Las 4 secciones aparecen (los labels pueden duplicarse entre completeness
      // y section headers — basta confirmar al menos una instancia).
      await expect(page.locator('text=Atributos').first()).toBeVisible();
      await expect(page.locator('text=Linaje').first()).toBeVisible();
      await expect(page.locator('text=Clase').first()).toBeVisible();
      await expect(page.locator('text=Trasfondo').first()).toBeVisible();

      // Publish — button text changed to "Publicar para aprobación"
      await page.getByRole('button', { name: /publicar para aprobación/i }).click();

      // Splash is shown — wait for it to appear then auto-redirect (4s) + buffer
      await expect(page).toHaveURL(/\/dashboard$/, { timeout: 10_000 });
    });

    await test.step('dashboard shows new character as pending', async () => {
      const charCard = page.locator('li').filter({ hasText: charName });
      await expect(charCard).toBeVisible();
      await expect(charCard).toContainText('Pendiente');
    });
  });
});
