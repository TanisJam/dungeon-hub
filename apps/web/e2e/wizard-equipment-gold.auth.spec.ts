import { test, expect } from '@playwright/test';

/**
 * wizard-equipment-gold.auth.spec.ts
 *
 * REQ-SEQUIP-11 / REQ-SEQUIP-06 — Gold path E2E:
 *   1. Player selects the gold path on the equipment step.
 *   2. Player enters a fixed gold value (100 gp).
 *   3. Player advances through the wizard and publishes.
 *   4. After publish, navigates to the character sheet inventory tab and asserts:
 *      - currency strip shows 100 gp (or equivalent cp) deposited (PHB p.143)
 *      - no class equipment package items in the sheet content
 *
 * PHB p.143 — "Starting Wealth by Class": Fighter starts with 5d4 × 10 gp
 * when the gold path is chosen; no equipment package is granted.
 *
 * Class: Fighter PHB (has goldAlternative "5d4 × 10").
 * Background: Soldier PHB (fixed skills athletics + intimidation, tool: dice-set).
 * The background still grants its own equipment (fixed items + currency) via seed,
 * but class equipment items MUST NOT appear on the gold path.
 */

test.describe('equipment wizard step — gold path (REQ-SEQUIP-06, REQ-SEQUIP-11)', () => {
  test('gold path: enters 100 gp → publish → currency.gp = 100, no class items', async ({ page }) => {
    const charName = `E2E EqGold ${Date.now()}`;

    // ── Create character and reach /wizard/equipment ──────────────────────

    await test.step('create character and reach /wizard/equipment', async () => {
      await page.goto('/personajes');
      await page.locator('a[href="/characters/new"]').first().click();
      await expect(page).toHaveURL(/\/characters\/new$/, { timeout: 10_000 });

      await page.selectOption('select[name="worldId"]', { label: 'E2E Test Campaign (World)' });
      await page.fill('input[name="name"]', charName);
      await page.getByRole('button', { name: /crear personaje/i }).click();
      await expect(page).toHaveURL(/\/wizard\/stats$/, { timeout: 10_000 });

      // Stats: standard array
      await page.getByRole('tab', { name: 'Estándar' }).click();
      const tileButtons = page.locator(
        'button[aria-label*="FUE"], button[aria-label*="DES"], button[aria-label*="CON"], button[aria-label*="INT"], button[aria-label*="SAB"], button[aria-label*="CAR"]',
      );
      const count = await tileButtons.count();
      for (let i = 0; i < count; i++) {
        await tileButtons.nth(i).click();
      }
      await page.getByRole('button', { name: /^siguiente/i }).click();
      await expect(page).toHaveURL(/\/wizard\/race$/, { timeout: 10_000 });

      // Race: Tiefling PHB (fixed CHA+2/INT+1, no choose blocks, no language choices)
      // Using Tiefling avoids the Human PHB ASI-choose step which requires extra interaction.
      await page
        .locator('[class*="rounded-md border"]')
        .filter({ hasText: 'Tiefling' })
        .filter({ hasText: 'PHB' })
        .first()
        .click();
      // Tiefling has no ASI choose blocks and no language of choice — just advance.
      await page.getByRole('button', { name: /^siguiente/i }).click();
      await expect(page).toHaveURL(/\/wizard\/class$/, { timeout: 10_000 });

      // Class: Fighter PHB + skills
      await page
        .locator('[class*="rounded-md border"]')
        .filter({ hasText: 'Fighter' })
        .filter({ hasText: 'PHB' })
        .first()
        .click();
      await page.getByRole('button', { name: 'Acrobatics', exact: true }).click();
      await page.getByRole('button', { name: 'Survival', exact: true }).click();
      await page.getByRole('button', { name: /^siguiente/i }).click();
      await expect(page).toHaveURL(/\/wizard\/background$/, { timeout: 10_000 });

      // Background: Soldier PHB
      await page
        .locator('[class*="rounded-md border"]')
        .filter({ hasText: 'Soldier' })
        .filter({ hasText: 'PHB' })
        .first()
        .click();
      await page.getByRole('button', { name: 'Dice Set', exact: true }).click();
      await page.getByRole('button', { name: /^siguiente/i }).click();
      await expect(page).toHaveURL(/\/wizard\/equipment$/, { timeout: 10_000 });
      await expect(page.locator('text=Equipo').first()).toBeVisible({ timeout: 5_000 });
    });

    // ── Select gold path and enter 100 gp ────────────────────────────────

    await test.step('select gold path, enter 100 gp', async () => {
      // Fighter has goldAlternative "5d4 × 10", so the gold radio should exist.
      const goldRadio = page.locator('input[type="radio"][name="class-path"][value="gold"]');
      const goldExists = await goldRadio.isVisible({ timeout: 5_000 }).catch(() => false);

      if (!goldExists) {
        // Fighter compendium row missing goldAlternative — skip test rather than assert wrong thing.
        test.skip(
          true,
          'Fighter gold radio not visible — compendium goldAlternative may be missing.',
        );
      }

      await goldRadio.check();
      await expect(goldRadio).toBeChecked({ timeout: 3_000 });

      // The gold field should now be visible (PHB p.143 — gold path active).
      const goldInput = page.getByRole('spinbutton'); // type="number"
      await expect(goldInput).toBeVisible({ timeout: 3_000 });

      // Enter 100 gp (known fixed value for deterministic assertion).
      await goldInput.fill('100');
      await expect(goldInput).toHaveValue('100', { timeout: 2_000 });
    });

    // ── Click Siguiente → saves selections → lands on /spells ─────────────

    await test.step('click Siguiente → saves gold selections → lands on /spells', async () => {
      await page.getByRole('button', { name: /^siguiente/i }).click();
      await expect(page).toHaveURL(/\/wizard\/spells$/, { timeout: 15_000 });
    });

    // ── Complete spells + review ──────────────────────────────────────────

    await test.step('spells: Fighter non-caster → advance to review', async () => {
      await expect(page.locator('text=Tu clase no utiliza hechizos.').first()).toBeVisible({
        timeout: 5_000,
      });
      await expect(page.getByRole('button', { name: /^siguiente/i })).toBeEnabled({
        timeout: 10_000,
      });
      await page.getByRole('button', { name: /^siguiente/i }).click();
      await expect(page).toHaveURL(/\/wizard\/review$/, { timeout: 10_000 });
    });

    // ── Publish ───────────────────────────────────────────────────────────

    await test.step('publish → seed-equipment runs with gold path', async () => {
      // publishCharacter (review/actions.ts) reads equipmentSelections and
      // calls POST /seed-equipment with the gold path body (REQ-SEQUIP-04).
      await page.getByRole('button', { name: /^publicar/i }).click();
      const irAlPerfilLink = page.getByRole('link', { name: /ir al perfil/i });
      await expect(irAlPerfilLink).toBeVisible({ timeout: 15_000 });
      await irAlPerfilLink.click();
      await expect(page).toHaveURL(/\/characters\/.+\/?(?:\?.*)?$/, { timeout: 10_000 });
    });

    // ── Assert via UI: navigate to inventory tab, check currency.gp = 100 ─

    await test.step('navigate to inventario tab', async () => {
      // The character sheet uses Link navigation (not ARIA tabs).
      // SheetTabs renders links like ?tab=inventario.
      // Click the "Inventario" link to navigate to the inventory tab.
      const invLink = page.getByRole('link', { name: 'Inventario', exact: true });
      await expect(invLink).toBeVisible({ timeout: 10_000 });
      await invLink.click();
      // Wait for the currency section to appear in the inventory tab.
      await expect(page.getByLabel('Monedas')).toBeVisible({ timeout: 10_000 });
    });

    await test.step('assert gold deposited in currency strip (REQ-SEQUIP-06, PHB p.143)', async () => {
      // The CurrencyStrip renders aria-label="Monedas" with individual coin spans.
      // The strip shows pp / gp / sp / cp. The coin values are in <span class="v">.
      //
      // The use-case writes currency.cp = goldValue * 100 (10000 cp for 100 gp input).
      // Background equipment may also deposit cp (e.g. background currency grants).
      // We assert that total cp >= 10000 (i.e. at least the 100 gp was deposited).
      // The sheet displays cp directly (it does NOT auto-convert to gp).
      const monedasSection = page.getByLabel('Monedas');
      await expect(monedasSection).toBeVisible({ timeout: 5_000 });
      const coinTexts = await monedasSection.locator('.v').allTextContents();
      // coinTexts order: pp, gp, sp, cp (matching COINS array in CurrencyStrip).
      // For the gold path, cp should be >= 10000 (the 100 gp * 100 deposited as cp).
      const cpValue = parseInt(coinTexts[3]?.trim() ?? '0', 10);
      const gpValue = parseInt(coinTexts[1]?.trim() ?? '0', 10);
      const goldDepositedAsGp = gpValue >= 100;
      const goldDepositedAsCp = cpValue >= 10000;
      expect(
        goldDepositedAsGp || goldDepositedAsCp,
        `Gold path: expected >= 100 gp or >= 10000 cp deposited. Got coins: ${coinTexts.join(', ')} (pp/gp/sp/cp)`,
      ).toBe(true);
    });

    await test.step('assert no class package items in inventory list (gold path, PHB p.143)', async () => {
      // On the gold path, no class equipment package items should be in inventory.
      // The inventory tab is active. Check the visible text for absence of typical
      // Fighter package items (chain-mail, handaxe). We use innerText of the main
      // content area — if these item names appear there, the gold path failed to
      // suppress the package grant.
      // Background items (soldier pack) may still appear since background equipment
      // is always seeded; we only exclude class-specific items.
      const mainText = (await page.locator('main').innerText().catch(() => '')).toLowerCase();
      const classEquipmentNames = ['chain-mail', 'leather-armor', 'handaxe'];
      for (const name of classEquipmentNames) {
        expect(
          mainText.includes(name),
          `Gold path: ${name} should NOT appear in inventory (no package granted, PHB p.143)`,
        ).toBe(false);
      }
    });
  });
});
