import { test, expect } from '@playwright/test';

/**
 * /dashboard — dissolved (navigability-audit fix).
 *
 * The old dashboard grab-bag (IdentityHeader + role text, CharactersSection,
 * CampaignsSection, DevModeToggle, sign-out) is gone — see
 * apps/web/app/dashboard/page.tsx, now just `redirect('/inicio')`. Its pieces
 * moved to proper homes: identity + preferences + sign-out to /settings,
 * characters to /personajes, the GM "Master pill" world link to /mesa.
 * Coverage for those destinations now lives in their own specs
 * (approval-transition-mobile, dm-panel-mobile, dm-grants*, wizard*, etc.)
 * and in apps/web/app/mesa/page.test.tsx / apps/web/app/settings/page.test.tsx.
 *
 * This spec intentionally stops asserting dead dashboard UI. It instead
 * covers exactly what the redesign set out to fix:
 *   (a) the route survives as a redirect, so saved links don't 404.
 *   (b) the audit's worst finding, now fixed: sign-out used to be reachable
 *       ONLY from inside /dashboard, and /dashboard itself was unreachable
 *       from the TabBar/DesktopSidebar — a user navigating the shell had no
 *       way to log out. AccountMenu (TopBar right cluster, every page) now
 *       exposes sign-out everywhere.
 */
test.describe('dashboard (authenticated)', () => {
  test('/dashboard redirects to /inicio', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/inicio$/);
  });

  test('home redirects to /inicio when authenticated', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/inicio$/);
  });

  test('AccountMenu sign-out is reachable from the shell nav', async ({ page }) => {
    await page.goto('/inicio', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/inicio$/, { timeout: 10_000 });

    // AccountMenu trigger — TopBar right cluster, aria-label="Cuenta"
    // (account-menu.tsx). Opens a V3Sheet listing Mis personajes / Mis
    // campañas / Ajustes / sign-out.
    await page.getByRole('button', { name: 'Cuenta' }).click();

    // Sign-out control (SignOutButton, "Cerrar sesión") inside the sheet —
    // this is the control that /dashboard used to be the ONLY way to reach.
    await expect(
      page.getByRole('button', { name: /cerrar sesión/i }),
    ).toBeVisible({ timeout: 5_000 });
  });
});
