import { test, expect } from '@playwright/test';
import { resolveAccessToken } from './helpers/resolve-access-token';

/**
 * E2E — Character import/export round trip @ 375px (iPhone SE)
 *
 * docs/STATUS.md §5 flags this flow as never exercised end-to-end: "upload a
 * .json, land as a draft awaiting DM approval". There is API integration
 * coverage (apps/api/tests/integration/character-import.test.ts) but nothing
 * that drives export → import through the browser. CLAUDE.md §5 — "Round-trip
 * is a first-class test concern" — export and import are exactly that pair,
 * so this spec proves the two halves agree with each other rather than
 * asserting each in isolation against a hand-written fixture that could drift.
 *
 * Flow:
 *   1. Find an active character owned by the test user (seeded by
 *      auth.setup.ts — "E2E Setup Fixture — Fighter" or similar).
 *   2. Export it via the REAL "Exportar JSON" button (apps/web/app/characters/
 *      [id]/_export-button.tsx) and capture the browser download — this is a
 *      client-built Blob + <a download> click, which Playwright's Chromium
 *      surfaces as a normal `download` event (acceptDownloads defaults to
 *      true; playwright.config.ts sets no override).
 *   3. Re-import that exact downloaded file via the REAL import form
 *      (apps/web/app/characters/import/_form.tsx — a file input, not a paste
 *      textarea).
 *   4. Assert draft-awaiting-approval the way a player actually sees it: the
 *      import success copy, then the wizard header pill for the newly
 *      created character (draft → redirect to /characters/:id/wizard/stats,
 *      apps/web/app/characters/[id]/page.tsx:97 and wizard/layout.tsx's
 *      STATUS_LABELS.draft = 'Borrador').
 *
 * Envelope agreement (verified by reading, not assumed): GET /characters/:id/
 * export builds `CharacterExportEnvelope` (apps/web/lib/sheet-types.ts) with
 * exactly the fields `CharacterImportEnvelopeSchema` (packages/domain/src/
 * character/import/schemas.ts) requires — schemaVersion, exportedAt,
 * character.{id,name,worldId,status,xp,data,inventory}. No drift found.
 *
 * Mobile: this flow (file picker + two buttons) is usable at 375px, so this
 * spec sets that viewport itself. playwright.config.ts currently runs every
 * project on Desktop Chrome — there is no mobile project — so this is an
 * opt-in per-spec viewport, not a change to that config.
 *
 * Fixture note: importing mints a brand-new character id every run (the
 * import use-case never reuses envelope.character.id — apps/api/src/
 * use-cases/characters/import-character.ts). No hardcoded id is used here,
 * and — matching this repo's existing auth.setup.ts / wizard fixture
 * convention — the created draft is not deleted afterward; draft fixtures
 * already accumulate for the test user by design (see e2e/README.md).
 */

const MOBILE = { width: 375, height: 667 };
const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

test.use({ viewport: MOBILE });

test.describe('Character import/export round trip @ 375px', () => {
  test('export a character then re-import it → lands as draft awaiting DM approval', async (
    { page, request },
    testInfo,
  ) => {
    // This spec's own timeout, not the config default: it is the only spec
    // that visits /characters/import, and — unlike scripts/e2e-stack.sh's
    // route-warming pass, which does not touch that route — a solo run pays
    // full `next dev` on-demand compile cost for it on top of the character
    // sheet + wizard route patterns.
    test.setTimeout(60_000);

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const accessToken = await resolveAccessToken(page);
    if (!accessToken) {
      test.skip(true, 'Could not resolve access token — ensure auth.setup.ts ran first');
      return;
    }

    // 1. Find an active character owned by the test user to export.
    const charsRes = await request.get(`${API}/api/v1/characters`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(charsRes.ok(), `GET /characters failed: ${await charsRes.text()}`).toBeTruthy();
    const charsJson = (await charsRes.json()) as {
      data: Array<{ id: string; worldId: string; status: string; name: string }>;
    };
    const source = charsJson.data.find((c) => c.status === 'active');
    if (!source) {
      test.skip(true, 'No active character found for the test user — auth.setup.ts should seed one');
      return;
    }

    // 2. Export via the real UI button, capturing the browser download.
    await page.goto(`/characters/${source.id}`, { waitUntil: 'networkidle' });
    const exportBtn = page.getByRole('button', { name: /Exportar JSON/i });
    await exportBtn.scrollIntoViewIfNeeded();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      exportBtn.click(),
    ]);
    const exportedFilePath = testInfo.outputPath('exported-character.json');
    await download.saveAs(exportedFilePath);

    // 3. Re-import that exact file via the real import form.
    await page.goto('/characters/import', { waitUntil: 'networkidle' });

    // The test user accumulates worlds across other specs (e.g.
    // create-campaign.auth.spec.ts), so the world <select> may or may not be
    // rendered — apps/web/app/characters/import/_form.tsx only shows it when
    // worlds.length > 1, auto-selecting the sole world otherwise.
    const worldSelect = page.locator('#worldId');
    if (await worldSelect.isVisible().catch(() => false)) {
      await worldSelect.selectOption(source.worldId);
    }

    await page.locator('#importFile').setInputFiles(exportedFilePath);

    const submitBtn = page.getByRole('button', { name: /^Importar personaje$/ });
    await expect(submitBtn, 'client-side envelope validation should enable the submit button').toBeEnabled({
      timeout: 10_000,
    });

    const [importResponse] = await Promise.all([
      page.waitForResponse(
        (res) => res.url().includes('/api/v1/characters/import') && res.request().method() === 'POST',
      ),
      submitBtn.click(),
    ]);
    expect(importResponse.status(), await importResponse.text().catch(() => '')).toBe(201);
    const created = (await importResponse.json()) as { id: string; status: string };

    // Privilege boundary (REQ-IMPORT — see import-character.ts): status is
    // ALWAYS forced to 'draft' server-side, regardless of what the exported
    // envelope claimed (the source character was 'active').
    expect(created.status).toBe('draft');

    // 4a. What the user sees immediately on the import page. Matched as one
    // block (not two separate getByText calls) because the page's static
    // intro copy also mentions DM approval ("...todavía necesita la
    // aprobación de tu DM...") — a second, narrower getByText would hit both
    // paragraphs and fail Playwright's strict mode.
    await expect(
      page.getByText(/se import[oó] como borrador\..*aprobaci[oó]n de tu DM/is),
      'import success copy should tell the player it landed as a draft awaiting DM approval',
    ).toBeVisible({ timeout: 10_000 });

    // 4b. What the user sees navigating to the new character: a draft
    // redirects to the wizard (page.tsx:97), whose header shows a "Borrador"
    // status pill next to the character's name (wizard/layout.tsx).
    // `next dev` compiles the wizard route pattern lazily on first request,
    // which can outrun the default navigation/assertion timeouts — give the
    // redirect + compile room rather than racing it.
    await page.goto(`/characters/${created.id}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForURL(new RegExp(`/characters/${created.id}/wizard`), { timeout: 30_000 });
    await expect(page.getByText('Borrador', { exact: true })).toBeVisible({ timeout: 10_000 });

    // No horizontal overflow at 375px on the import form (CLAUDE.md §2).
    await page.goto('/characters/import', { waitUntil: 'networkidle' });
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth, 'No horizontal overflow at 375px').toBeLessThanOrEqual(375);
  });
});
