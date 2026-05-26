import { test, expect, type Page } from '@playwright/test';

// E2E del wizard de personaje con foco en Custom Background (PHB p.125).
// Cubre 4 escenarios:
//   1. Happy path lang2 + equipment coin + feature → publish + dashboard
//   2. Happy path tool2 + equipment package (Acolyte) + feature → publish
//   3. lang1tool1 demanda 1 lang + 1 tool (regresión Bug 2 — patchAnyToolCount
//      NO debe aplicar cuando el alt tiene anyLanguage)
//   4. Round-trip: completar customization → Siguiente → volver al step →
//      los 3 sub-pickers (mixedPool / equipment / feature) deben estar
//      pre-populados (regresión Bug 1 — useState seedeado de initialSelection)
//
// Combinación de clase + race elegida para evitar overlap con skills del
// Custom Background:
//   - Fighter PHB con Acrobatics + Survival → Custom BG puede elegir
//     Perception + Arcana sin conflicto (any:2 skill block).

const CUSTOM_BG_LABEL = 'Custom Background';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function createCharacterAndReachBackground(page: Page, charName: string) {
  await page.goto('/dashboard');
  await page.locator('a[href="/characters/new"]').first().click();
  await expect(page).toHaveURL(/\/characters\/new$/);

  await page.selectOption('select[name="worldId"]', { label: 'E2E Test Campaign (World)' });
  await page.fill('input[name="name"]', charName);
  await page.getByRole('button', { name: /crear personaje/i }).click();
  await expect(page).toHaveURL(/\/wizard\/stats$/, { timeout: 10_000 });

  // Stats: estándar (tile-based, asigna en orden)
  await page.getByRole('tab', { name: 'Estándar' }).click();
  const tileButtons = page.locator(
    'button[aria-label*="FUE"], button[aria-label*="DES"], button[aria-label*="CON"], button[aria-label*="INT"], button[aria-label*="SAB"], button[aria-label*="CAR"]',
  );
  const count = await tileButtons.count();
  for (let i = 0; i < count; i++) {
    await tileButtons.nth(i).click();
  }
  await expect(page.getByRole('button', { name: /^siguiente/i })).toBeEnabled({ timeout: 3000 });
  await page.getByRole('button', { name: /^siguiente/i }).click();
  await expect(page).toHaveURL(/\/wizard\/race$/, { timeout: 10_000 });

  // Race: Human PHB (2 choose blocks: +2 / +1)
  await page
    .locator('[class*="rounded-md border"]')
    .filter({ hasText: 'Human' })
    .filter({ hasText: 'PHB' })
    .first()
    .click();
  await page.getByRole('button', { name: 'STR', exact: true }).first().click();
  await page.getByRole('button', { name: 'CON', exact: true }).last().click();
  // Race language picker — Human PHB grants Common fixed + 1 standard of choice
  await page.getByRole('button', { name: 'Dwarvish', exact: true }).click();
  await page.getByRole('button', { name: /^siguiente/i }).click();
  await expect(page).toHaveURL(/\/wizard\/class$/, { timeout: 10_000 });

  // Class: Fighter PHB + Acrobatics + Survival (no overlap with Perception/Arcana)
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
}

async function selectCustomBackground(page: Page) {
  await page
    .locator('[class*="rounded-md border"]')
    .filter({ hasText: CUSTOM_BG_LABEL })
    .first()
    .click();
}

async function pickCustomBgSkills(page: Page) {
  // Custom BG skillProficiencies: [{ any: 2 }] → cualquier 2.
  // Perception + Arcana no chocan con Fighter (Acrobatics + Survival).
  await page.getByRole('button', { name: 'Perception', exact: true }).click();
  await page.getByRole('button', { name: 'Arcana', exact: true }).click();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Custom Background — full wizard E2E', () => {
  test('shape lang2 + equipment coin + feature Shelter → publish + dashboard', async ({ page }) => {
    const charName = `CustomBG lang2 ${Date.now()}`;
    await createCharacterAndReachBackground(page, charName);

    await selectCustomBackground(page);
    await pickCustomBgSkills(page);

    // MixedPool: lang2 + 2 idiomas (Draconic, Elvish)
    await page.locator('input[type="radio"][value="lang2"]').check();
    await page.getByRole('button', { name: 'Draconic', exact: true }).click();
    await page.getByRole('button', { name: 'Elvish', exact: true }).click();

    // Equipment: coin
    await page.locator('input[type="radio"][value="coin"]').check();

    // Feature: Shelter of the Faithful (acolyte)
    await page.getByRole('searchbox', { name: /filtrar caracter/i }).fill('Shelter');
    await page.locator('select').last().selectOption('acolyte-shelter-of-the-faithful');
    // El select del feature tiene el value seteado al slug
    await expect(page.locator('select').last()).toHaveValue('acolyte-shelter-of-the-faithful');

    await page.getByRole('button', { name: /^siguiente/i }).click();
    await expect(page).toHaveURL(/\/wizard\/spells$/, { timeout: 10_000 });

    // Spells: Fighter non-caster
    await expect(page.locator('text=Tu clase no utiliza hechizos.').first()).toBeVisible({
      timeout: 5_000,
    });
    await page.getByRole('button', { name: /^siguiente/i }).click();
    await expect(page).toHaveURL(/\/wizard\/review$/, { timeout: 10_000 });

    // Publish
    await page.getByRole('button', { name: /^publicar/i }).click();
    await page.getByRole('link', { name: /ir al perfil/i }).click();
    await expect(page).toHaveURL(/\/characters\/.+/, { timeout: 10_000 });

    // Dashboard muestra el char
    await page.goto('/dashboard');
    const charCard = page.locator('li').filter({ hasText: charName });
    await expect(charCard).toBeVisible();
  });

  test('shape tool2 + equipment package Acolyte + feature → publish', async ({ page }) => {
    const charName = `CustomBG tool2 ${Date.now()}`;
    await createCharacterAndReachBackground(page, charName);

    await selectCustomBackground(page);
    await pickCustomBgSkills(page);

    // MixedPool: tool2 (2 herramientas)
    await page.locator('input[type="radio"][value="tool2"]').check();
    // Tool pool incluye instrumentos + sets de juego + artisans. Picamos 2 cualquiera.
    await page.getByRole('button', { name: 'Lute', exact: true }).click();
    await page.getByRole('button', { name: 'Drum', exact: true }).click();

    // Equipment: package mode + select Acolyte
    await page.locator('input[type="radio"][value="package"]').check();
    // El primer select del detail es el de equipment packages
    await page.locator('select').first().selectOption('acolyte|PHB');

    // Feature: Shelter of the Faithful
    await page.getByRole('searchbox', { name: /filtrar caracter/i }).fill('Shelter');
    await page.locator('select').last().selectOption('acolyte-shelter-of-the-faithful');

    await page.getByRole('button', { name: /^siguiente/i }).click();
    await expect(page).toHaveURL(/\/wizard\/spells$/, { timeout: 10_000 });

    // Continue through spells + review
    await page.getByRole('button', { name: /^siguiente/i }).click();
    await expect(page).toHaveURL(/\/wizard\/review$/, { timeout: 10_000 });
    await page.getByRole('button', { name: /^publicar/i }).click();
    await page.getByRole('link', { name: /ir al perfil/i }).click();
    await expect(page).toHaveURL(/\/characters\/.+/, { timeout: 10_000 });
  });

  test('lang1tool1: demands exactly 1 lang + 1 tool (Bug 2 regression)', async ({ page }) => {
    const charName = `CustomBG lang1tool1 ${Date.now()}`;
    await createCharacterAndReachBackground(page, charName);

    await selectCustomBackground(page);
    await pickCustomBgSkills(page);

    // MixedPool: lang1tool1
    await page.locator('input[type="radio"][value="lang1tool1"]').check();

    // El sub-picker debe mostrar:
    //   "Elegí 1 idioma" (singular)
    //   "Elegí 1 herramienta" (singular — NO "2 herramientas")
    // Si el bug volviera, el label diría "Elegí 2 herramientas".
    await expect(
      page.locator('text=/eleg[íi] 1 idioma\\b/i').first(),
    ).toBeVisible();
    await expect(
      page.locator('text=/eleg[íi] 1 herramienta\\b/i').first(),
    ).toBeVisible();

    // Comportamental: completar con 1+1 debe permitir avanzar.
    // Halfling (no Dwarvish — ya fixed por race).
    await page.getByRole('button', { name: 'Halfling', exact: true }).click();
    await page.getByRole('button', { name: 'Lute', exact: true }).click();
    await page.locator('input[type="radio"][value="coin"]').check();
    await page.getByRole('searchbox', { name: /filtrar caracter/i }).fill('Shelter');
    await page.locator('select').last().selectOption('acolyte-shelter-of-the-faithful');

    await page.getByRole('button', { name: /^siguiente/i }).click();
    await expect(page).toHaveURL(/\/wizard\/spells$/, { timeout: 10_000 });
  });

  test('round-trip: customization pre-populated when returning to step (Bug 1 regression)', async ({
    page,
  }) => {
    const charName = `CustomBG round-trip ${Date.now()}`;
    await createCharacterAndReachBackground(page, charName);

    await selectCustomBackground(page);
    await pickCustomBgSkills(page);

    // Fill customization completa
    await page.locator('input[type="radio"][value="lang2"]').check();
    await page.getByRole('button', { name: 'Draconic', exact: true }).click();
    await page.getByRole('button', { name: 'Elvish', exact: true }).click();
    await page.locator('input[type="radio"][value="coin"]').check();
    await page.getByRole('searchbox', { name: /filtrar caracter/i }).fill('Shelter');
    await page.locator('select').last().selectOption('acolyte-shelter-of-the-faithful');

    // Continue → spells
    await page.getByRole('button', { name: /^siguiente/i }).click();
    await expect(page).toHaveURL(/\/wizard\/spells$/, { timeout: 10_000 });

    // Volver al step de background — la URL de spells tiene `/wizard/spells`,
    // construyo la de background reemplazando.
    const backUrl = page.url().replace('/spells', '/background');
    await page.goto(backUrl);
    await expect(page).toHaveURL(/\/wizard\/background$/, { timeout: 10_000 });

    // El picker debe haber re-seleccionado Custom Background (initialSelection.slug)
    // y el detail debería expandirse mostrando los sub-pickers pre-populados.

    // Bug 1 regression — los 3 sub-pickers deben tener su estado restaurado:
    // 1. MixedPool radio "lang2" checked
    await expect(page.locator('input[type="radio"][value="lang2"]')).toBeChecked();

    // 2. Equipment radio "coin" checked
    await expect(page.locator('input[type="radio"][value="coin"]')).toBeChecked();

    // 3. Feature select tiene el slug pre-seteado (preview se renderiza a partir de esto)
    await expect(page.locator('select').last()).toHaveValue(
      'acolyte-shelter-of-the-faithful',
    );
  });
});
