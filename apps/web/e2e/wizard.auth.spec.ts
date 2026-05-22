import { test, expect } from '@playwright/test';

// End-to-end del character builder wizard.
// Cubre: create draft → stats → race → class → background → review → activate.
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

    await test.step('stats: standard array → continue', async () => {
      await page.getByRole('tab', { name: 'Standard Array' }).click();
      // Defaults son [15,14,13,12,10,8] — válidos out of the box.
      await page.getByRole('button', { name: /save & continue/i }).click();
      await expect(page).toHaveURL(/\/wizard\/race$/, { timeout: 10_000 });
    });

    await test.step('race: Human PHB (MPMM-style) → continue', async () => {
      // Human PHB en 5etools 2024+ no tiene `ability` field — el picker
      // sintetiza 2 slots de choose (+2 y +1). Buen test para ese path.
      await page
        .locator('li')
        .filter({ hasText: 'Human' })
        .filter({ hasText: 'PHB' })
        .first()
        .getByRole('button')
        .click();
      // 2 bloques de choose en DOM order: primero +2, después +1. Cada bloque
      // tiene los 6 buttons STR/DEX/CON/INT/WIS/CHA. Picamos:
      //   - STR del primer bloque (+2)
      //   - CON del segundo bloque (+1)
      await page.getByRole('button', { name: 'STR', exact: true }).first().click();
      await page.getByRole('button', { name: 'CON', exact: true }).last().click();
      await page.getByRole('button', { name: /save & continue/i }).click();
      await expect(page).toHaveURL(/\/wizard\/class$/, { timeout: 10_000 });
    });

    await test.step('class: Fighter PHB + skills acrobatics/survival → continue', async () => {
      await page
        .locator('li')
        .filter({ hasText: 'Fighter' })
        .filter({ hasText: 'PHB' })
        .first()
        .getByRole('button')
        .click();
      // Skill picker — buttons en el detail panel
      await page.getByRole('button', { name: 'Acrobatics', exact: true }).click();
      await page.getByRole('button', { name: 'Survival', exact: true }).click();
      await page.getByRole('button', { name: /save & continue/i }).click();
      await expect(page).toHaveURL(/\/wizard\/background$/, { timeout: 10_000 });
    });

    await test.step('background: Soldier PHB + dice-set → continue', async () => {
      await page
        .locator('li')
        .filter({ hasText: 'Soldier' })
        .filter({ hasText: 'PHB' })
        .first()
        .getByRole('button')
        .click();
      // Tool choice: anyGamingSet → pick "Dice Set"
      await page.getByRole('button', { name: 'Dice Set', exact: true }).click();
      await page.getByRole('button', { name: /save & continue/i }).click();
      await expect(page).toHaveURL(/\/wizard\/review$/, { timeout: 10_000 });
    });

    await test.step('review: verify completeness + activate', async () => {
      // Las 4 checks deben estar marcadas (✓)
      const completeness = page.locator('text=Completeness').locator('..').locator('..');
      await expect(completeness).toContainText('Stats');
      await expect(completeness).toContainText('Race');
      await expect(completeness).toContainText('Class');
      await expect(completeness).toContainText('Background');

      // Activate
      await page.getByRole('button', { name: /activate character/i }).click();
      await expect(page).toHaveURL(/\/dashboard$/, { timeout: 10_000 });
    });

    await test.step('dashboard shows new character as active', async () => {
      const charCard = page.locator('li').filter({ hasText: charName });
      await expect(charCard).toBeVisible();
      await expect(charCard).toContainText('active');
    });
  });
});
