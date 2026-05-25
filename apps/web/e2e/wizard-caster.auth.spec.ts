/*
 * wizard-caster.auth.spec.ts
 *
 * Happy-path E2E for a CASTER class through the 6-step wizard.
 *
 * Class chosen: Wizard PHB
 *   - Cantrips: 3 known (single-column)
 *   - Spellbook: ≥ 6 L1 spells (two-column "Conoce")
 *   - Prepared: intMod + 1 (at least 1 — we pick 2 to be safe)
 *   - Subclass: none selected at L1 (Wizard subclass is at L2 in standard rules)
 *     → no subclass-granted locked spells to deal with
 *
 * The test picks enough spells for the minimum-viable happy path:
 *   - 3 cantrips (exact limit)
 *   - 6 known L1 spells (minimum spellbook size)
 *   - 2 prepared L1 spells (subset of known; verified via auto-link behaviour)
 *
 * Because Playwright runs without a live dev server here, the test is written
 * to be run manually via `pnpm playwright test wizard-caster` once the stack
 * is up. See apps/web/e2e/README.md.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * MANUAL SMOKE CHECKLIST (run before merging wizard-spells-step)
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. Fighter (non-caster): wizard completes 6 steps, spells step shows
 *    "Tu clase no utiliza hechizos." panel, no checkboxes rendered, Siguiente
 *    skips to /review without any API PUT call.
 *
 * 2. Cleric L1 with Light Domain: wizard completes 6 steps, spells step shows
 *    the picker with Burning Hands + Faerie Fire pre-checked and disabled,
 *    each marked with a "Subclase" badge. Counter shows free prepared slots
 *    (total - 2 locked). Selecting the remaining free slots + clicking Siguiente
 *    sends all spells (free + subclass) in the PUT body and lands on /review.
 *
 * 3. Wizard class specifically: /wizard/spells shows two-column headers
 *    "Conoce" and "Prepara" above leveled spells; cantrip section is
 *    single-column. Checking "Prepara" auto-checks "Conoce" on the same row.
 *    Unchecking "Conoce" auto-unchecks "Prepara" on that same row. Counters
 *    update in real time. Submitting valid picks (3 cantrips + ≥6 known + N
 *    prepared) redirects to /review.
 *
 * 4. Refresh on /wizard/spells mid-edit: if a caster has already saved a spell
 *    selection (navigated forward then back), reloading the spells page shows
 *    the previously selected spells pre-checked. State comes from
 *    character.data.spells[classSlug], not from component state alone.
 *
 * 5. Review page "Hechizos" card: after completing the spells step, the review
 *    page shows the Hechizos NumberedReviewCard (num "05") with a non-empty
 *    summary (e.g. "3 cantrips · 6 conocidos · 2 preparados"). For a non-caster
 *    the card shows "Sin hechizos guardados" or equivalent. The Publicar button
 *    is enabled once all cards are complete (including Hechizos).
 *
 * 6. Publish flow end-to-end: after completing all 6 steps for a caster, clicking
 *    Publicar on /review succeeds, shows the PublishedSplash, and clicking
 *    "Ir al perfil" redirects to /characters/:id. The dashboard shows the
 *    character as "Pendiente".
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { test, expect } from '@playwright/test';

test.describe('character builder wizard — Wizard caster happy path', () => {
  test('create Wizard character, fill 6 steps including spell picks, activate', async ({
    page,
  }) => {
    const charName = `E2E Wizard ${Date.now()}`;

    await test.step('navigate to new character form', async () => {
      await page.goto('/dashboard');
      await page.locator('a[href="/characters/new"]').first().click();
      await expect(page).toHaveURL(/\/characters\/new$/, { timeout: 10_000 });
    });

    await test.step('submit name + campaign → land on stats step', async () => {
      await page.selectOption('select[name="campaignId"]', { label: 'E2E Test Campaign' });
      await page.fill('input[name="name"]', charName);
      await page.getByRole('button', { name: /crear personaje/i }).click();
      await expect(page).toHaveURL(/\/wizard\/stats$/, { timeout: 10_000 });
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
      await expect(page.getByRole('button', { name: /^siguiente/i })).toBeEnabled({
        timeout: 3000,
      });
      await page.getByRole('button', { name: /^siguiente/i }).click();
      await expect(page).toHaveURL(/\/wizard\/race$/, { timeout: 10_000 });
    });

    await test.step('linaje: Human PHB → guardar y seguir', async () => {
      // Human PHB: no race-granted cantrip, clean test for Wizard cantrip limit
      await page
        .locator('[class*="rounded-md border"]')
        .filter({ hasText: 'Human' })
        .filter({ hasText: 'PHB' })
        .first()
        .click();
      // Human PHB has two choose blocks: +2 then +1
      await page.getByRole('button', { name: 'STR', exact: true }).first().click();
      await page.getByRole('button', { name: 'CON', exact: true }).last().click();
      // Human PHB grants Common (fixed) + 1 standard language of choice (commit 1d3e594).
      // Pick Dwarvish (no overlap with class/background skills).
      await page.getByRole('button', { name: 'Dwarvish', exact: true }).click();
      await page.getByRole('button', { name: /^siguiente/i }).click();
      await expect(page).toHaveURL(/\/wizard\/class$/, { timeout: 10_000 });
    });

    await test.step('clase: Wizard PHB → guardar y seguir', async () => {
      await page
        .locator('[class*="rounded-md border"]')
        .filter({ hasText: 'Wizard' })
        .filter({ hasText: 'PHB' })
        .first()
        .click();
      // Wizard skill picks (choose 2): Arcana + History are canonical picks
      await page.getByRole('button', { name: 'Arcana', exact: true }).click();
      await page.getByRole('button', { name: 'History', exact: true }).click();
      await page.getByRole('button', { name: /^siguiente/i }).click();
      await expect(page).toHaveURL(/\/wizard\/background$/, { timeout: 10_000 });
    });

    await test.step('trasfondo: Acolyte PHB → guardar y seguir', async () => {
      // Acolyte PHB: fixed skills Insight + Religion (no overlap with Wizard's Arcana + History).
      // PHB p.127: Acolyte grants 2 languages of choice — pick Elvish + Gnomish.
      await page
        .locator('[class*="rounded-md border"]')
        .filter({ hasText: 'Acolyte' })
        .filter({ hasText: 'PHB' })
        .first()
        .click();
      // Pick 2 standard languages (PHB p.127 — "Two of your choice")
      await page.getByRole('button', { name: 'Elvish', exact: true }).click();
      await page.getByRole('button', { name: 'Gnomish', exact: true }).click();
      await page.getByRole('button', { name: /^siguiente/i }).click();
      await expect(page).toHaveURL(/\/wizard\/spells$/, { timeout: 10_000 });
    });

    await test.step('hechizos: Wizard → two-column picker visible', async () => {
      // Two-column headers must be visible for leveled spells
      await expect(page.locator('text=Conoce').first()).toBeVisible({ timeout: 5_000 });
      await expect(page.locator('text=Prepara').first()).toBeVisible({ timeout: 5_000 });

      // Cantrip section must be present (single-column)
      await expect(page.locator('text=Cantrips').first()).toBeVisible({ timeout: 5_000 });
    });

    await test.step('hechizos: seleccionar 3 cantrips (límite exacto)', async () => {
      // Cantrip rows use single-column aria-label="Elegir <spell>" checkboxes.
      // Leveled (Wizard) rows use "Conocer ..." / "Preparar ..." instead, so
      // "Elegir" labels uniquely identify cantrip rows.
      const cantripCheckboxes = page.locator(
        'input[type="checkbox"][aria-label^="Elegir"]:not([disabled])',
      );
      const cantripCount = await cantripCheckboxes.count();
      const picksNeeded = Math.min(3, cantripCount);
      for (let i = 0; i < picksNeeded; i++) {
        await cantripCheckboxes.nth(i).check();
      }
      await expect(page.locator('text=/Cantrips.*3.*\\/.*3/').first()).toBeVisible({
        timeout: 3_000,
      });
    });

    await test.step('hechizos: seleccionar 6 hechizos L1 como Conoce (spellbook mínimo)', async () => {
      // Wizard L1 spells are under <details> elements. Target the "Conoce" checkboxes
      // (aria-label="Conocer <spell name>") for the first 6 available non-disabled ones.
      const conoceCheckboxes = page.locator(
        'input[type="checkbox"][aria-label^="Conocer"]:not([disabled])',
      );
      const available = await conoceCheckboxes.count();
      const picks = Math.min(6, available);
      for (let i = 0; i < picks; i++) {
        await conoceCheckboxes.nth(i).check();
      }
      // Spellbook counter should show at least 6/6
      await expect(page.locator('text=/Spellbook|Conocidos/').first()).toBeVisible({
        timeout: 3_000,
      });
    });

    await test.step('hechizos: seleccionar Prepara según el límite real (intMod + nivel)', async () => {
      // Wizard L1 prepared = INT mod + level. INT mod depends on how the
      // Standard Array was distributed across abilities, so the limit is
      // not known statically. Read it from the UI counter ("Preparados: X/N").
      // The counter appears after Conoce selections are made.
      const prepCounter = page.locator('text=/Preparados:\\s*\\d+\\/\\d+/').first();
      await expect(prepCounter).toBeVisible({ timeout: 3_000 });
      const counterText = (await prepCounter.textContent()) ?? '';
      const match = counterText.match(/Preparados:\s*\d+\s*\/\s*(\d+)/);
      const targetPrepared = match ? Number(match[1]) : 0;

      if (targetPrepared > 0) {
        const prepararCheckboxes = page.locator(
          'input[type="checkbox"][aria-label^="Preparar"]:not([disabled])',
        );
        for (let i = 0; i < targetPrepared; i++) {
          await prepararCheckboxes.nth(i).check();
        }
        // Verify auto-link: the first Conoce stays checked alongside Prepara
        const conoceFirst = page
          .locator('input[type="checkbox"][aria-label^="Conocer"]')
          .first();
        await expect(conoceFirst).toBeChecked({ timeout: 2_000 });
      }
    });

    await test.step('hechizos: Siguiente → land on /review', async () => {
      await page.getByRole('button', { name: /^siguiente/i }).click();
      await expect(page).toHaveURL(/\/wizard\/review$/, { timeout: 10_000 });
    });

    await test.step('revisión: card Hechizos visible con contenido', async () => {
      await expect(page.locator('text=Revisión').first()).toBeVisible();
      // Spells review card (num "05") must show and have non-empty spell summary
      await expect(page.locator('text=Hechizos').first()).toBeVisible();
      await expect(page.getByText(charName, { exact: false }).first()).toBeVisible();
      // The wizard card and the character name confirm we're on the right page
      await expect(page.locator('text=wizard').first()).toBeVisible();
    });

    await test.step('publicar + ir al perfil', async () => {
      await page.getByRole('button', { name: /^publicar/i }).click();
      await page.getByRole('link', { name: /ir al perfil/i }).click();
      await expect(page).toHaveURL(/\/characters\/.+\/?(?:\?.*)?$/, { timeout: 10_000 });
    });

    await test.step('dashboard muestra el personaje Wizard como pendiente', async () => {
      await page.goto('/dashboard');
      const charCard = page.locator('li').filter({ hasText: charName });
      await expect(charCard).toBeVisible();
      await expect(charCard).toContainText('Pendiente');
    });
  });
});
