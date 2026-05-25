import { test, expect } from '@playwright/test';

/**
 * E2E tests for Batch 8 (race-traits-on-sheet).
 * SCEN-RT-13: Full data path validation —
 *   DB JSONB → API projection → domain compute → web sheet render
 *
 * Race chosen: Dwarf (PHB) + Hill Dwarf subrace (PHB)
 * Guaranteed mechanical traits (post-blocklist):
 *   Race level:    Dwarven Resilience, Dwarven Combat Training, Tool Proficiency, Stonecunning
 *   Subrace level: Dwarven Toughness
 *
 * Blocklist verified absent: Age, Size, Speed, Languages, Darkvision, Alignment
 * (PHB p.20 — these are surfaced in dedicated sheet sections)
 *
 * Decision #628: blocklist applied in domain.
 * Decision #630: heading "Rasgos raciales", source order preserved.
 *
 * Prerequisites (see apps/web/e2e/README.md):
 *   - Stack must be running (web + api + supabase)
 *   - Compendium imported: dwarf + dwarf--hill have `entries` in JSONB
 *   - auth.setup.ts has run (uses .auth/user.json)
 */

test.describe('Racial traits on sheet — Batch 8 (race-traits-on-sheet)', () => {
  test('SCEN-RT-13: Dwarf + Hill Dwarf sheet shows Rasgos raciales block with correct traits', async ({ page }) => {
    const charName = `E2E Dwarf Traits ${Date.now()}`;

    // -----------------------------------------------------------------------
    // Step 1: Create character and fill stats (standard array)
    // -----------------------------------------------------------------------
    await test.step('create character + fill stats (standard array)', async () => {
      await page.goto('/dashboard');
      await page.locator('a[href="/characters/new"]').first().click();
      await expect(page).toHaveURL(/\/characters\/new$/);

      await page.selectOption('select[name="campaignId"]', { label: 'E2E Test Campaign' });
      await page.fill('input[name="name"]', charName);
      await page.getByRole('button', { name: /crear personaje/i }).click();
      await expect(page).toHaveURL(/\/wizard\/stats$/, { timeout: 10_000 });

      // Standard array — tap all 6 tiles once each
      await page.getByRole('tab', { name: 'Estándar' }).click();
      const tileButtons = page.locator(
        'button[aria-label*="FUE"], button[aria-label*="DES"], button[aria-label*="CON"], button[aria-label*="INT"], button[aria-label*="SAB"], button[aria-label*="CAR"]',
      );
      const count = await tileButtons.count();
      for (let i = 0; i < count; i++) await tileButtons.nth(i).click();
      await page.getByRole('button', { name: /^siguiente/i }).click();
      await expect(page).toHaveURL(/\/wizard\/race$/, { timeout: 10_000 });
    });

    // -----------------------------------------------------------------------
    // Step 2: Race step — select Dwarf + Hill Dwarf subrace
    // PHB p.20: Dwarf requires a subrace (Mountain or Hill).
    // -----------------------------------------------------------------------
    await test.step('race step: select Dwarf → Hill Dwarf subrace', async () => {
      // Dwarf is in RACES_REQUIRING_SUBRACE → renders as collapsible accordion group.
      await page.locator('[data-testid="subrace-group-dwarf"]').click();

      // Select Hill Dwarf subrace card inside the expanded group.
      await page.getByRole('button', { name: /^hill dwarf/i }).click();

      await page.getByRole('button', { name: /^siguiente/i }).click();
      await expect(page).toHaveURL(/\/wizard\/class$/, { timeout: 10_000 });
    });

    // -----------------------------------------------------------------------
    // Step 3: Class step — Fighter PHB (non-caster, avoids spell step complexity)
    // -----------------------------------------------------------------------
    await test.step('class step: Fighter PHB + skills', async () => {
      await page
        .locator('[class*="rounded-md border"]')
        .filter({ hasText: 'Fighter' })
        .filter({ hasText: 'PHB' })
        .first()
        .click();
      await page.getByRole('button', { name: 'Acrobatics', exact: true }).first().click();
      await page.getByRole('button', { name: 'Survival', exact: true }).first().click();
      await page.getByRole('button', { name: /^siguiente/i }).click();
      await expect(page).toHaveURL(/\/wizard\/background$/, { timeout: 10_000 });
    });

    // -----------------------------------------------------------------------
    // Step 4: Background step — Acolyte PHB + 2 language choices
    // PHB p.127: Acolyte grants 2 languages of choice.
    // -----------------------------------------------------------------------
    await test.step('background step: Acolyte PHB + 2 languages', async () => {
      await page
        .locator('[class*="rounded-md border"]')
        .filter({ hasText: 'Acolyte' })
        .filter({ hasText: 'PHB' })
        .first()
        .click();
      await page.getByRole('button', { name: 'Gnomish', exact: true }).click();
      await page.getByRole('button', { name: 'Halfling', exact: true }).click();
      await page.getByRole('button', { name: /^siguiente/i }).click();
      await expect(page).toHaveURL(/\/wizard\/spells$/, { timeout: 10_000 });
    });

    // -----------------------------------------------------------------------
    // Step 5: Spells step — Fighter is non-caster → no-picks panel → next
    // -----------------------------------------------------------------------
    await test.step('spells step: non-caster panel → siguiente', async () => {
      await page.getByRole('button', { name: /^siguiente/i }).click();
      await expect(page).toHaveURL(/\/wizard\/review$/, { timeout: 10_000 });
    });

    // -----------------------------------------------------------------------
    // Step 6: Review step — publish character
    // -----------------------------------------------------------------------
    await test.step('review step: publish character', async () => {
      await page.getByRole('button', { name: /^publicar/i }).click();
      const profileLink = page.getByRole('link', { name: /ir al perfil/i });
      await expect(profileLink).toBeVisible({ timeout: 10_000 });
      await profileLink.click();
      await expect(page).toHaveURL(/\/characters\/.+\/?(?:\?.*)?$/, { timeout: 10_000 });
    });

    // -----------------------------------------------------------------------
    // Step 7: Navigate to Resumen tab and verify Rasgos raciales block
    // SCEN-RT-13 core assertions.
    // -----------------------------------------------------------------------
    await test.step('sheet resumen tab: "Rasgos raciales" heading visible', async () => {
      // Navigate to or stay on the Resumen tab (default tab on sheet)
      const resumenTab = page.getByRole('tab', { name: /resumen/i });
      if (await resumenTab.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await resumenTab.click();
      }

      // PHB p.20: Dwarf + Hill Dwarf should have mechanical traits visible
      await expect(page.getByRole('heading', { name: /rasgos raciales/i })).toBeVisible({ timeout: 5_000 });
    });

    await test.step('sheet: "Dwarven Resilience" race trait visible (PHB p.20)', async () => {
      // PHB p.20: "You have advantage on saving throws against poison..."
      await expect(page.getByText('Dwarven Resilience')).toBeVisible({ timeout: 5_000 });
    });

    await test.step('sheet: "Stonecunning" race trait visible (PHB p.20)', async () => {
      // PHB p.20: "Whenever you make an Intelligence (History) check..."
      await expect(page.getByText('Stonecunning')).toBeVisible({ timeout: 5_000 });
    });

    await test.step('sheet: blocklisted names absent from Racial Traits card (PHB p.20)', async () => {
      // Age/Size/Speed/Languages/Darkvision/Alignment are surfaced in dedicated sections.
      // They must NOT appear inside the Rasgos raciales card.
      // We scope to the card to avoid false positives from other sections.
      const racialTraitsCard = page.locator('text=Rasgos raciales').locator('..').locator('..');
      await expect(racialTraitsCard.getByText('Age', { exact: true })).not.toBeVisible();
      await expect(racialTraitsCard.getByText('Size', { exact: true })).not.toBeVisible();
      await expect(racialTraitsCard.getByText('Speed', { exact: true })).not.toBeVisible();
      await expect(racialTraitsCard.getByText('Languages', { exact: true })).not.toBeVisible();
      await expect(racialTraitsCard.getByText('Darkvision', { exact: true })).not.toBeVisible();
      await expect(racialTraitsCard.getByText('Alignment', { exact: true })).not.toBeVisible();
    });

    await test.step('sheet: "Sublinaje" badge visible for at least one Hill Dwarf subrace trait', async () => {
      // PHB p.20: Hill Dwarf's Dwarven Toughness is a subrace trait → "Sublinaje" badge
      await expect(page.getByText('Sublinaje').first()).toBeVisible({ timeout: 5_000 });
    });
  });
});
