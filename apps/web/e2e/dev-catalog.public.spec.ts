import { test, expect } from '@playwright/test';

/**
 * dev-design-catalog smoke (DEV-E2E-01).
 *
 * The /dev subtree is gated by `NODE_ENV === 'production' → notFound()`. The
 * E2E stack runs the web app via `next dev` (NODE_ENV=development), so the
 * catalog renders here. No auth needed — the catalog pages are public in dev.
 *
 * If this ever runs against a production build, /dev correctly 404s by design;
 * this spec is therefore dev-stack only (a `.public.spec.ts` against the dev server).
 */

const ROUTES: Array<{ path: string; heading: string }> = [
  { path: '/dev', heading: 'Dev Tools' },
  { path: '/dev/catalog/tokens', heading: 'Design Tokens' },
  { path: '/dev/catalog/components', heading: 'Components' },
  { path: '/dev/catalog/diagnostics', heading: 'Design Debt Audit' },
];

test.describe('dev design-system catalog (dev-only)', () => {
  for (const { path, heading } of ROUTES) {
    test(`${path} renders with HTTP 200 + visible content`, async ({ page }) => {
      const res = await page.goto(path);
      expect(res?.status(), `${path} should respond 200 in dev`).toBe(200);
      await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    });
  }
});
