import { test, expect } from '@playwright/test';

// End-to-end del character builder wizard.
// Cubre: create draft → atributos → linaje → clase → trasfondo → equipo → hechizos (no-picks) → revisión → activar.
//
// Batch D (starting-equipment): added equipment step (index 4) between background and spells.
// Minimal interaction: default package path is pre-selected, click Siguiente to advance.
//
// Combinación elegida para evitar overlap entre class skills y background skills
// (validación cross-step):
//   - Fighter PHB: pick acrobatics + survival (non-caster → no-picks panel en step de hechizos)
//   - Soldier PHB: skills fijas athletics + intimidation (no chocan)
//   - Soldier tools: pick 1 gaming set (dice-set)

test.describe('character builder wizard', () => {
  test('create, fill 6 steps (non-caster), activate', async ({ page }) => {
    const charName = `E2E Char ${Date.now()}`;

    await test.step('navigate to new character form', async () => {
      await page.goto('/dashboard');
      await page.locator('a[href="/characters/new"]').first().click();
      await expect(page).toHaveURL(/\/characters\/new$/);
    });

    await test.step('submit name + world → land on stats step', async () => {
      await page.selectOption('select[name="worldId"]', { label: 'E2E Test Campaign (World)' });
      await page.fill('input[name="name"]', charName);
      await page.getByRole('button', { name: /crear personaje/i }).click();
      await expect(page).toHaveURL(/\/wizard\/stats$/, { timeout: 10_000 });
      // Render assertion: step heading must be visible. Catches Server Component
      // throws that would otherwise leave the URL intact while Next.js shows an
      // error boundary. See REQ-CWR-WIZARD-RENDER (engram #798).
      await expect(page.locator('text=Atributos').first()).toBeVisible({ timeout: 5_000 });
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
      await expect(page.getByRole('button', { name: /^siguiente/i })).toBeEnabled({ timeout: 3000 });
      await page.getByRole('button', { name: /^siguiente/i }).click();
      await expect(page).toHaveURL(/\/wizard\/race$/, { timeout: 10_000 });
      await expect(page.locator('text=Linaje').first()).toBeVisible({ timeout: 5_000 });
    });

    await test.step('linaje: Tiefling PHB → guardar y seguir', async () => {
      // Tiefling PHB: fixed CHA+2/INT+1, no ASI choose blocks, no language choices.
      // Using Tiefling avoids the Human PHB ASI-choose interaction (current compendium
      // data for Human PHB has fixed +1 to all 6 abilities — purelyFixed path — so
      // STR/CON choose-block buttons do not appear).
      await page
        .locator('[class*="rounded-md border"]')
        .filter({ hasText: 'Tiefling' })
        .filter({ hasText: 'PHB' })
        .first()
        .click();
      // Tiefling has no ASI choose blocks and no language choice — advance directly.
      await page.getByRole('button', { name: /^siguiente/i }).click();
      await expect(page).toHaveURL(/\/wizard\/class$/, { timeout: 10_000 });
      await expect(page.locator('text=Clase').first()).toBeVisible({ timeout: 5_000 });
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
      await page.getByRole('button', { name: /^siguiente/i }).click();
      await expect(page).toHaveURL(/\/wizard\/background$/, { timeout: 10_000 });
      await expect(page.locator('text=Trasfondo').first()).toBeVisible({ timeout: 5_000 });
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
      await page.getByRole('button', { name: /^siguiente/i }).click();
      await expect(page).toHaveURL(/\/wizard\/equipment$/, { timeout: 10_000 });
      await expect(page.locator('text=Equipo').first()).toBeVisible({ timeout: 5_000 });
    });

    await test.step('equipo: package path (default) → Siguiente', async () => {
      // Package path is selected by default (REQ-SEQUIP-09). No mandatory choice-row
      // selection required for the package path — just advance.
      await page.getByRole('button', { name: /^siguiente/i }).click();
      await expect(page).toHaveURL(/\/wizard\/spells$/, { timeout: 10_000 });
      await expect(page.locator('text=Hechizos').first()).toBeVisible({ timeout: 5_000 });
    });

    await test.step('hechizos: Fighter es non-caster → panel "no picks needed" → siguiente', async () => {
      // Fighter is a non-caster: the spells step renders NoPicksPanel instead of the picker.
      await expect(page.locator('text=Tu clase no utiliza hechizos.').first()).toBeVisible({
        timeout: 5_000,
      });
      // No checkbox / spell list should be rendered on this panel
      await expect(page.locator('input[type="checkbox"]')).toHaveCount(0);
      // Click the Siguiente button in the NoPicksPanel footer
      await page.getByRole('button', { name: /^siguiente/i }).click();
      await expect(page).toHaveURL(/\/wizard\/review$/, { timeout: 10_000 });
      await expect(page.locator('text=Revisión').first()).toBeVisible({ timeout: 5_000 });
    });

    await test.step('revisión: verificar contenido (incluye card Hechizos) + publicar', async () => {
      // El review (post-E.6) tiene: SectionHead size="md" "06 Revisión",
      // ReviewBanner con character name, AbilityScoreGrid, y 4 NumberedReviewCards
      // incluyendo la nueva card "05 Hechizos" (non-caster → sin hechizos guardados).
      await expect(page.locator('text=Revisión').first()).toBeVisible();
      await expect(page.locator('text=Atributos').first()).toBeVisible();
      await expect(page.getByText(charName, { exact: false }).first()).toBeVisible();
      await expect(page.locator('text=tiefling').first()).toBeVisible();
      await expect(page.locator('text=fighter').first()).toBeVisible();
      await expect(page.locator('text=soldier').first()).toBeVisible();
      // Spells review card (num "05") must be visible for Fighter (non-caster)
      await expect(page.locator('text=Hechizos').first()).toBeVisible();

      // Publish
      await page.getByRole('button', { name: /^publicar/i }).click();

      // Splash is shown — click "Ir al perfil" to navigate (no auto-redirect)
      await page.getByRole('link', { name: /ir al perfil/i }).click();
      await expect(page).toHaveURL(/\/characters\/.+\/?(?:\?.*)?$/, { timeout: 10_000 });
    });

    await test.step('dashboard shows new character as pending', async () => {
      await page.goto('/dashboard');
      const charCard = page.locator('li').filter({ hasText: charName });
      await expect(charCard).toBeVisible();
      await expect(charCard).toContainText('Pendiente');
    });
  });
});
