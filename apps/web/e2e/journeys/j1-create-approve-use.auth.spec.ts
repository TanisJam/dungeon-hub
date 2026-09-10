/**
 * J1 — Create → Approve → Use (cross-role)
 *
 * player3 (no seeded characters) creates a character through the FULL wizard UI
 * (Human Fighter, non-caster), submits for approval. DM approves it from the
 * character sheet. player3 reloads the sheet and confirms it's Activo.
 *
 * Cross-role: two browser contexts (player3 + dm) in one test.
 * Mobile-first: 375×667 viewport per CLAUDE.md §2.
 *
 * REPLACES the stale wizard.auth.spec.ts single-user smoke — this version
 * exercises the FULL approval loop with real, separate role contexts.
 */
import { test, expect, type Browser } from '@playwright/test';
import path from 'node:path';

const AUTH_DIR = path.join(__dirname, '../.auth');
const BASE_URL = process.env.WEB_BASE_URL ?? 'http://localhost:3001';

const VIEWPORT = { width: 375, height: 667 };

// Three roles, a full character build, an approval and a read-back. All three
// attempts stopped at exactly 30s — the Playwright default — never at a varying
// point, which is the signature of a budget rather than a defect. j6-gm-owner
// carries 90s for the same reason.
test.describe.configure({ timeout: 90_000 });

test.describe('J1 — player creates character, DM approves, player sees Activo', () => {
  test('full create-approve-use loop @ 375px', async ({ browser }: { browser: Browser }) => {
    // ── Contexts ──────────────────────────────────────────────────────────────
    const p3Ctx = await browser.newContext({
      storageState: path.join(AUTH_DIR, 'player3.json'),
      viewport: VIEWPORT,
      baseURL: BASE_URL,
    });
    const dmCtx = await browser.newContext({
      storageState: path.join(AUTH_DIR, 'dm.json'),
      viewport: VIEWPORT,
      baseURL: BASE_URL,
    });

    const p3Page = await p3Ctx.newPage();
    const dmPage = await dmCtx.newPage();

    let charName: string = '';
    let charHref: string = '';

    try {
      // ── Step 1: player3 navigates to new character form ───────────────────
      charName = `J1 Fighter ${Date.now()}`;

      await p3Page.goto('/characters/new', { waitUntil: 'domcontentloaded' });
      await expect(p3Page).toHaveURL(/\/characters\/new$/, { timeout: 10_000 });

      // ── Step 2: Fill name + world, submit ────────────────────────────────
      // World selector: the fixture world is 'E2E Fixture (World)'
      await p3Page.selectOption('select[name="worldId"]', { label: 'E2E Fixture (World)' });
      await p3Page.fill('input[name="name"]', charName);
      await p3Page.getByRole('button', { name: /crear personaje/i }).click();

      // Land on stats step
      await expect(p3Page).toHaveURL(/\/wizard\/stats$/, { timeout: 15_000 });
      await expect(p3Page.locator('text=Atributos').first()).toBeVisible({ timeout: 5_000 });

      // ── Step 3: Stats — standard array ───────────────────────────────────
      // The stats form defaults to standard-array for the E2E Fixture world.
      // Click each of the 6 ability tile buttons by EXACT aria-label.
      // Each click cycles: null → first available standard-array value.
      // Clicking in order assigns: FUE=15, DES=14, CON=13, INT=12, SAB=10, CAR=8.
      const tileAbbrMap: Array<string> = ['FUE', 'DES', 'CON', 'INT', 'SAB', 'CAR'];
      for (const abbr of tileAbbrMap) {
        const tileBtn = p3Page.locator(`button[aria-label="${abbr} assign value"]`);
        await expect(tileBtn).toBeVisible({ timeout: 5_000 });
        await tileBtn.click();
        // Small wait between tile clicks to ensure React state updates
        await p3Page.waitForTimeout(100);
      }
      // All 6 tiles assigned → standardArrayValid = true → button enabled
      await expect(p3Page.getByRole('button', { name: /^siguiente/i })).toBeEnabled({ timeout: 10_000 });
      await p3Page.getByRole('button', { name: /^siguiente/i }).click();

      // ── Step 4: Race — Human PHB ──────────────────────────────────────────
      await expect(p3Page).toHaveURL(/\/wizard\/race$/, { timeout: 15_000 });
      await expect(p3Page.locator('text=Linaje').first()).toBeVisible({ timeout: 5_000 });

      // Pick Human PHB card
      await p3Page
        .locator('[class*="rounded-md border"]')
        .filter({ hasText: 'Human' })
        .filter({ hasText: 'PHB' })
        .first()
        .click();

      // Human PHB in this world has FIXED +1 to all 6 abilities (purelyFixed path,
      // no ASI choice buttons rendered). The race detail shows only a language picker.
      // Do NOT try to click STR/CON buttons — they don't exist and waiting for them
      // would consume 30s each.
      //
      // Language choice: Human PHB grants Common fixed + 1 extra standard language.
      // The language picker shows: Dwarvish, Elvish, Giant, Gnomish, Goblin, Halfling, Orc.
      await p3Page.getByRole('button', { name: 'Dwarvish', exact: true }).click();

      // Wait for the Siguiente button to be enabled (language chosen).
      const raceSiguiente = p3Page.getByRole('button', { name: /^siguiente/i });
      await expect(raceSiguiente).toBeEnabled({ timeout: 8_000 });

      // ── Step 5: Class — Fighter PHB ───────────────────────────────────────
      // The race step auto-saves on the language choice; clicking Siguiente while
      // that save is in flight can be a no-op (the wizard stays on /race). Retry
      // the click until the wizard actually advances to /class.
      await expect(async () => {
        if (!/\/wizard\/class$/.test(new URL(p3Page.url()).pathname)) {
          await raceSiguiente.click().catch(() => {});
        }
        await expect(p3Page).toHaveURL(/\/wizard\/class$/, { timeout: 4_000 });
      }).toPass({ timeout: 30_000 });
      await expect(p3Page.locator('text=Clase').first()).toBeVisible({ timeout: 5_000 });

      // Click Fighter PHB card — wait for skill picker to appear before clicking skills
      await p3Page
        .locator('[class*="rounded-md border"]')
        .filter({ hasText: 'Fighter' })
        .filter({ hasText: 'PHB' })
        .first()
        .click();

      // Wait for the skill section to appear after Fighter is selected
      await expect(p3Page.getByText(/habilidades/i).first()).toBeVisible({ timeout: 5_000 });

      // Fighter PHB: pick 2 skills. Acrobatics and Survival are available (not disabled).
      // Athletics and others may be disabled due to prior grants from race/background.
      await p3Page.getByRole('button', { name: 'Acrobatics', exact: true }).click();
      await p3Page.getByRole('button', { name: 'Survival', exact: true }).click();

      // Wait for Siguiente to be enabled (2 skills selected)
      await expect(p3Page.getByRole('button', { name: /^siguiente/i })).toBeEnabled({ timeout: 8_000 });
      await p3Page.getByRole('button', { name: /^siguiente/i }).click();

      // ── Step 6: Background — Soldier PHB ─────────────────────────────────
      await expect(p3Page).toHaveURL(/\/wizard\/background$/, { timeout: 15_000 });
      await expect(p3Page.locator('text=Trasfondo').first()).toBeVisible({ timeout: 5_000 });

      // Find and click Soldier PHB card
      await p3Page
        .locator('[class*="rounded-md border"]')
        .filter({ hasText: 'Soldier' })
        .filter({ hasText: 'PHB' })
        .first()
        .click();

      // Wait for the Soldier detail to expand (tool choice section appears)
      // Soldier has a "anyGamingSet" tool choice — wait for the section to render
      await expect(p3Page.getByRole('button', { name: 'Dice Set', exact: true })).toBeVisible({
        timeout: 8_000,
      });

      // Soldier tool choice: anyGamingSet → Dice Set (required for form to be valid)
      await p3Page.getByRole('button', { name: 'Dice Set', exact: true }).click();

      // Wait for Siguiente to be enabled (background complete with tool choice)
      await expect(p3Page.getByRole('button', { name: /^siguiente/i })).toBeEnabled({ timeout: 8_000 });
      await p3Page.getByRole('button', { name: /^siguiente/i }).click();

      // ── Step 7: Equipment — package path (default), advance ──────────────
      // Batch D (starting-equipment): equipment step inserted between background and spells.
      await expect(p3Page).toHaveURL(/\/wizard\/equipment$/, { timeout: 15_000 });
      await expect(p3Page.locator('text=Equipo').first()).toBeVisible({ timeout: 5_000 });

      // Package path is selected by default (REQ-SEQUIP-09). No mandatory picks required.
      await p3Page.getByRole('button', { name: /^siguiente/i }).click();

      // ── Step 8: Spells — Fighter is non-caster, skip panel ───────────────
      await expect(p3Page).toHaveURL(/\/wizard\/spells$/, { timeout: 15_000 });
      await expect(p3Page.locator('text=Hechizos').first()).toBeVisible({ timeout: 5_000 });
      // Non-caster shows "no picks needed" panel
      await expect(
        p3Page.locator('text=Tu clase no utiliza hechizos.').first(),
      ).toBeVisible({ timeout: 5_000 });
      // The NoPicksPanel auto-saves (empty spells). Wait for "Guardando..." to resolve
      // before clicking Siguiente (button stays disabled while saving).
      await expect(p3Page.getByRole('button', { name: /^siguiente/i })).toBeEnabled({ timeout: 10_000 });
      await p3Page.getByRole('button', { name: /^siguiente/i }).click();

      // ── Step 9: Review ───────────────────────────────────────────────────
      await expect(p3Page).toHaveURL(/\/wizard\/review$/, { timeout: 15_000 });
      await expect(p3Page.locator('text=Revisión').first()).toBeVisible({ timeout: 5_000 });
      // Basic content assertions
      await expect(p3Page.getByText(charName, { exact: false }).first()).toBeVisible();
      await expect(p3Page.locator('text=human').first()).toBeVisible();
      await expect(p3Page.locator('text=fighter').first()).toBeVisible();
      await expect(p3Page.locator('text=soldier').first()).toBeVisible();

      // ── Step 10: Publish (send for approval) ─────────────────────────────
      await p3Page.getByRole('button', { name: /^publicar/i }).click();

      // Splash — "Ir al perfil" link navigates to the character sheet
      const irAlPerfilLink = p3Page.getByRole('link', { name: /ir al perfil/i });
      await expect(irAlPerfilLink).toBeVisible({ timeout: 10_000 });
      charHref = (await irAlPerfilLink.getAttribute('href')) ?? '';
      await irAlPerfilLink.click();

      await expect(p3Page).toHaveURL(/\/characters\/.+\/?(?:\?.*)?$/, { timeout: 10_000 });

      // Grab the char URL from the final page
      if (!charHref?.startsWith('/')) {
        charHref = new URL(p3Page.url()).pathname;
      }

      // Player3 sees "Pendiente de aprobación" banner on the sheet
      const pendienteBanner = p3Page.getByText(/pendiente de aprobaci/i).first();
      await expect(pendienteBanner).toBeVisible({ timeout: 8_000 });

      // ── Step 11: DM approves from the character sheet ────────────────────
      // Navigate the DM to the same character page
      await dmPage.goto(charHref, { waitUntil: 'domcontentloaded' });
      await expect(dmPage).toHaveURL(/\/characters\/[a-f0-9-]+/, { timeout: 15_000 });

      // DM should see Aprobar + Rechazar buttons (pending_approval × gm)
      const aprobarBtn = dmPage.getByRole('button', { name: /^aprobar$/i });
      await expect(aprobarBtn).toBeVisible({ timeout: 10_000 });

      // FLAG: Touch-target bug — Aprobar button has min-h-[44px] per approval-actions.tsx:90.
      // Verified in code: class includes "min-h-[44px]" — should pass the 44px target check.
      const aprobarBox = await aprobarBtn.boundingBox();
      if (aprobarBox) {
        // KNOWN BUG (from prior QA tour): some approval buttons render <44px — FLAG if so.
        if (aprobarBox.height < 44) {
          console.warn(
            `[J1] REAL BUG: Aprobar button height=${aprobarBox.height}px < 44px touch target. See sdd/mobile-qa-sweep findings.`,
          );
        }
      }

      // Approving runs through a client island calling a Server Action, so the
      // click needs React attached. The DM page is opened with `domcontentloaded`
      // and the buttons are server-rendered, so a single click can land on markup
      // that carries no handler yet and do nothing at all. The trace of a failing
      // run showed precisely that: 132 requests on the DM context and not one
      // Server Action among them.
      //
      // The click is what has to be retried. The previous loop re-read the page
      // every time but never clicked again, so hydration finishing a second later
      // changed nothing and the whole budget went by with the sheet still pending.
      // Re-clicking is safe: handleApprove returns early while a transition is in
      // flight, and the button unmounts once the approval lands — which is why the
      // click is guarded on the button still being there.
      //
      // "Devolver a borrador" is the gm x active button (REQ-CAU-REVERT-BUTTON).
      // It can only render after the approval actually took and the action's
      // revalidatePath re-rendered the sheet, which makes it a sharper post-state
      // than "Aprobar went away" — a button can also go away by never rendering.
      const devolverBtn = dmPage.getByRole('button', { name: /^devolver a borrador$/i });
      await expect(async () => {
        if (await aprobarBtn.isVisible().catch(() => false)) {
          await aprobarBtn.click({ timeout: 5_000 }).catch(() => {});
        }
        await expect(devolverBtn, 'Post-approve: sheet must switch to the gm x active actions').toBeVisible({
          timeout: 2_000,
        });
      }).toPass({ timeout: 30_000 });

      // ── Step 12: player3 reloads the sheet and sees Activo ───────────────
      await p3Page.goto(charHref, { waitUntil: 'domcontentloaded' });
      await expect(p3Page).toHaveURL(/\/characters\/[a-f0-9-]+/, { timeout: 15_000 });

      // The AppShell right-action Pill shows "Activo" for active characters.
      // Also confirmed by the absence of the pending banner.
      const activoPill = p3Page.getByText('Activo', { exact: true }).first();
      await expect(activoPill).toBeVisible({ timeout: 10_000 });

      // Pending banner should be gone
      const pendingBannerAfter = p3Page.getByText(/pendiente de aprobaci/i).first();
      const bannerStillVisible = await pendingBannerAfter.isVisible({ timeout: 1_000 }).catch(() => false);
      expect(bannerStillVisible, 'Pending banner should be gone after approval').toBe(false);
    } finally {
      await p3Ctx.close();
      await dmCtx.close();
    }
  });
});
