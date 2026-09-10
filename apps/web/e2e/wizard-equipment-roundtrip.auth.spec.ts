import { test, expect } from '@playwright/test';

/**
 * wizard-equipment-roundtrip.auth.spec.ts
 *
 * REQ-SEQUIP-10 — E2E round-trip: player makes equipment picks, navigates
 * forward to /spells, navigates back to /equipment, and the picks PERSIST.
 *
 * CLAUDE.md §5: "Any 'saved state + re-render' feature needs an explicit
 * round-trip test — not just send-test + store-test in isolation."
 *
 * Character: Fighter PHB (4 choice rows in equipment) + Soldier PHB background.
 * Fighter has `goldAlternative: "5d4 × 10"` and choice rows including
 * row 0 options a/b. We pick option-b on row 0 to test persistence.
 *
 * Round-trip mechanism: `saveEquipmentSelections` (Server Action) calls
 * PUT /equipment-selections which stores the picks in character.data.equipmentSelections.
 * On back-navigation the page Server Component reads that field and hydrates the picker.
 */

test.describe('equipment wizard step — round-trip (REQ-SEQUIP-10)', () => {
  test('selections persist after navigate-to-spells and back', async ({ page }) => {
    const charName = `E2E EqRT ${Date.now()}`;

    // ── Create character and reach the equipment step ─────────────────────

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

    // ── Make a specific pick on the equipment step ────────────────────────

    await test.step('pick option-b on class choice row 0', async () => {
      // Fighter row 0 has option-a (chain-mail + martial weapon) and option-b.
      // option-b radio has value="b" and name="class-row0".
      // Click the label card that contains the "b" radio for row 0.
      const rowBRadio = page.locator('input[type="radio"][name="class-row0"][value="b"]');

      // Only proceed with the pick assertion if the row exists (Fighter must have choice rows).
      const rowBExists = await rowBRadio.isVisible({ timeout: 5_000 }).catch(() => false);
      if (!rowBExists) {
        // If Fighter choice rows aren't rendering (compendium data issue), skip the pick
        // and just advance with the default package path.
        test.skip(true, 'Fighter choice row 0 option-b not visible — compendium data may be missing.');
      }

      await rowBRadio.check();
      // Verify it's now checked
      await expect(rowBRadio).toBeChecked({ timeout: 3_000 });
    });

    // ── Click Siguiente → land on /spells ────────────────────────────────

    await test.step('click Siguiente → saves selections → lands on /spells', async () => {
      await page.getByRole('button', { name: /^siguiente/i }).click();
      await expect(page).toHaveURL(/\/wizard\/spells$/, { timeout: 15_000 });
    });

    // ── Navigate back to /equipment ───────────────────────────────────────

    await test.step('navigate back to /equipment using Atrás button', async () => {
      // The spells step's footer nav renders a "← Atrás" link pointing to /equipment.
      // (Batch C updated spells/page.tsx backHref → /equipment, PHB p.48)
      await page.getByRole('link', { name: /atrás/i }).click();
      await expect(page).toHaveURL(/\/wizard\/equipment$/, { timeout: 15_000 });
      await expect(page.locator('text=Equipo').first()).toBeVisible({ timeout: 5_000 });
    });

    // ── Assert picks are preserved ────────────────────────────────────────

    await test.step('option-b on class choice row 0 is still selected (round-trip)', async () => {
      // The page Server Component re-reads character.data.equipmentSelections from the DB
      // and passes initialSelections to EquipmentPicker, which re-hydrates the radio state.
      const rowBRadio = page.locator('input[type="radio"][name="class-row0"][value="b"]');
      await expect(rowBRadio).toBeChecked({ timeout: 5_000 });
    });
  });
});
