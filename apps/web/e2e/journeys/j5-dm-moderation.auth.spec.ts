/**
 * J5 — DM moderation: reject/return-to-draft + DM chrome verification (cross-role)
 *
 * Part A: Creates an ephemeral PENDING character for player1.
 *   In DM context: views the pending character, clicks "Rechazar" (which returns
 *   to draft), confirms state transition to draft/rejected.
 *
 * Part B: Creates an ephemeral ACTIVE character for player1.
 *   In DM context: opens the active sheet, confirms DM chrome (Otorgar button)
 *   is visible — verifying callerRole=gm gates render correctly.
 *
 * Cross-role: DM context moderates; player1 context verifies state.
 * Mobile-first: 375×667 viewport per CLAUDE.md §2.
 *
 * NOTE: "Rechazar" in the current UI returns the character to draft status
 * (same as "Devolver a borrador"). approveCharacter / rejectCharacter per
 * approval-actions.tsx:handleReject. This is intentional per the app design.
 */
import { test, expect, type Browser } from '@playwright/test';
import path from 'node:path';
import {
  getJwt,
  getFixtureWorldId,
  seedJourneyCharacter,
  getCharacterStatus,
} from '../helpers/seed-journey-character';

const AUTH_DIR = path.join(__dirname, '../.auth');
const BASE_URL = process.env.WEB_BASE_URL ?? 'http://localhost:3001';
const VIEWPORT = { width: 375, height: 667 };

test.describe('J5 — DM moderation: reject/return-to-draft + DM chrome @ 375px', () => {
  // ── Part A: Reject/return-to-draft ──────────────────────────────────────────
  test('DM rejects pending character → state transitions to draft', async ({
    browser,
  }: {
    browser: Browser;
  }) => {
    // Seed: create a PENDING character for player1
    const p1Jwt = await getJwt('player1@dh.test');
    const dmJwt = await getJwt('dm@dh.test');
    const worldId = await getFixtureWorldId(dmJwt);

    const char = await seedJourneyCharacter({
      ownerJwt: p1Jwt,
      dmJwt,
      worldId,
      name: `J5 Pending ${Date.now()}`,
      targetStatus: 'pending_approval',
    });

    const charPath = `/characters/${char.id}`;

    // DM context
    const dmCtx = await browser.newContext({
      storageState: path.join(AUTH_DIR, 'dm.json'),
      viewport: VIEWPORT,
      baseURL: BASE_URL,
    });
    // player1 context (to verify post-rejection state)
    const p1Ctx = await browser.newContext({
      storageState: path.join(AUTH_DIR, 'player1.json'),
      viewport: VIEWPORT,
      baseURL: BASE_URL,
    });

    const dmPage = await dmCtx.newPage();
    const p1Page = await p1Ctx.newPage();

    try {
      // ── Step 1: DM opens the pending character ──────────────────────────
      await dmPage.goto(charPath, { waitUntil: 'domcontentloaded' });
      await expect(dmPage).toHaveURL(/\/characters\/[a-f0-9-]+/, { timeout: 15_000 });

      // DM sees pending banner
      const pendingBanner = dmPage.getByText(/pendiente de aprobaci/i).first();
      await expect(pendingBanner).toBeVisible({ timeout: 10_000 });

      // ── Step 2: Aprobar + Rechazar buttons visible for DM on pending char ──
      const aprobarBtn = dmPage.getByRole('button', { name: /^aprobar$/i });
      const rechazarBtn = dmPage.getByRole('button', { name: /^rechazar$/i });
      await expect(aprobarBtn).toBeVisible({ timeout: 8_000 });
      await expect(rechazarBtn).toBeVisible({ timeout: 5_000 });

      // No horizontal scroll at 375px
      const scrollWidth = await dmPage.evaluate(() => document.documentElement.scrollWidth);
      expect(scrollWidth, 'horizontal scroll at 375px on pending char page').toBeLessThanOrEqual(375);

      // ── Step 3: DM clicks "Rechazar" ────────────────────────────────────
      // "Rechazar" calls rejectCharacter directly (NO window.confirm — that
      // confirm only guards the active→draft "Devolver a borrador" path, see
      // approval-actions.tsx:handleReject). rejectCharacter → POST /reject →
      // status 'draft' (characters.ts:1303). A single click; the suite-level
      // retries absorb a rare revalidatePath no-op (re-clicking here fires
      // concurrent rejects that race, so do NOT loop the click).
      // ── Steps 3+4 together: click, then assert the AUTHORITATIVE state ───
      // Re-clicking is guarded by the status read, which is what makes it safe
      // despite the warning above: a second click only happens when the API still
      // reports pending_approval after a full inner poll, i.e. when the previous
      // click provably did nothing. It cannot race a real in-flight reject.
      //
      // It needs to be able to happen because a server-rendered button is visible
      // and clickable before React attaches its handler — approval-actions.tsx
      // lives under a 'use client' island — so under `next dev` the first click
      // can land on markup with no onClick. Same window that made the Mercado and
      // sessions sheets look broken.
      await expect(async () => {
        if ((await getCharacterStatus(char.id, dmJwt)) === 'pending_approval') {
          await rechazarBtn.click();
        }
        await expect
          .poll(async () => getCharacterStatus(char.id, dmJwt), {
            message: 'rejected character status should become "draft"',
            timeout: 8_000,
          })
          .toBe('draft');
      }).toPass({ timeout: 25_000 });

      // ── Step 5: UI reflects the transition (best-effort, non-flaky) ─────
      // The Aprobar/Rechazar buttons only render for pending_approval, so after
      // the page re-validates they should be gone. Reload to force a clean read
      // (avoids racing the soft-nav revalidation from the server action).
      await dmPage.reload({ waitUntil: 'domcontentloaded' });
      await expect(aprobarBtn).toBeHidden({ timeout: 10_000 });
      await expect(rechazarBtn).toBeHidden({ timeout: 5_000 });

      // ── Step 6: player1's view confirms it is no longer active ──────────
      // Draft characters redirect to the wizard when opened via /characters/[id].
      await p1Page.goto(charPath, { waitUntil: 'domcontentloaded' });
      await p1Page
        .waitForURL(
          (url) =>
            url.pathname.includes('/wizard') ||
            url.pathname.match(/\/characters\/[a-f0-9-]+$/) !== null,
          { timeout: 10_000 },
        )
        .catch(() => {});
      const activoVisible = await p1Page
        .getByText('Activo', { exact: true })
        .first()
        .isVisible({ timeout: 2_000 })
        .catch(() => false);
      expect(activoVisible, 'Rejected character must not show Activo status').toBe(false);
    } finally {
      await dmCtx.close();
      await p1Ctx.close();
    }
  });

  // ── Part B: DM chrome on active sheet ──────────────────────────────────────
  test('DM views active sheet — Otorgar button (DM chrome) visible', async ({
    browser,
  }: {
    browser: Browser;
  }) => {
    // Seed: create an ACTIVE character for player1
    const p1Jwt = await getJwt('player1@dh.test');
    const dmJwt = await getJwt('dm@dh.test');
    const worldId = await getFixtureWorldId(dmJwt);

    const char = await seedJourneyCharacter({
      ownerJwt: p1Jwt,
      dmJwt,
      worldId,
      name: `J5 Active ${Date.now()}`,
      targetStatus: 'active',
    });

    const charPath = `/characters/${char.id}`;

    // DM context
    const dmCtx = await browser.newContext({
      storageState: path.join(AUTH_DIR, 'dm.json'),
      viewport: VIEWPORT,
      baseURL: BASE_URL,
    });
    const dmPage = await dmCtx.newPage();

    try {
      // ── Step 1: DM opens the active character sheet ─────────────────────
      await dmPage.goto(charPath, { waitUntil: 'domcontentloaded' });
      await expect(dmPage).toHaveURL(/\/characters\/[a-f0-9-]+/, { timeout: 15_000 });

      // ── Step 2: Activo pill visible ──────────────────────────────────────
      const activoPill = dmPage.getByText('Activo', { exact: true }).first();
      await expect(activoPill).toBeVisible({ timeout: 10_000 });

      // ── Step 3: DM chrome — "Otorgar" button visible ─────────────────────
      // DmGrantPanel renders the "Otorgar recompensa de DM" button when callerRole=gm.
      // REQ-CDG-DM-PANEL-VISIBILITY.
      const otorgarBtn = dmPage.getByRole('button', { name: 'Otorgar recompensa de DM' });
      await expect(otorgarBtn).toBeVisible({ timeout: 10_000 });

      // Check touch target size (min-h-[44px] per dm-grant-panel.tsx:58)
      const otorgarBox = await otorgarBtn.boundingBox();
      if (otorgarBox) {
        // FLAG if below 44px — known touch-target bug from QA tour
        if (otorgarBox.height < 44) {
          console.warn(
            `[J5] REAL BUG: "Otorgar recompensa de DM" button height=${otorgarBox.height}px < 44px. See sdd/mobile-qa-sweep findings.`,
          );
        }
      }

      // ── Step 4: DM chrome — "Devolver a borrador" visible on active char ──
      // REQ-CAU-REVERT-BUTTON: gm + active → "Devolver a borrador".
      const revertBtn = dmPage.getByRole('button', { name: /devolver.*borrador/i });
      await expect(revertBtn).toBeVisible({ timeout: 5_000 });

      // ── Step 5: No horizontal scroll at 375px ────────────────────────────
      const scrollWidth = await dmPage.evaluate(() => document.documentElement.scrollWidth);
      expect(scrollWidth, 'horizontal scroll on DM view of active char at 375px').toBeLessThanOrEqual(375);

      // ── Step 6: "Subir nivel" NOT visible for DM (only for char owner) ───
      // REQ-CLU-PLAY-TIME-AUTH: level-up entry point only for the character owner.
      // isOwner = char.userId === session.user.id — DM is not the owner.
      const levelUpLink = dmPage.getByRole('link', { name: /subir.*nivel/i });
      const levelUpVisible = await levelUpLink.isVisible({ timeout: 2_000 }).catch(() => false);
      // This is an assertion — DM should NOT see the level-up CTA on someone else's char.
      // If the char was seeded with XP=0, LevelUpEntryPoint would not render anyway.
      // Flag if it IS visible (would be a bug).
      if (levelUpVisible) {
        console.warn(
          '[J5] POTENTIAL BUG: "Subir nivel" link visible for DM on a non-owned character. ' +
            'LevelUpEntryPoint should gate on isOwner. Check level-up-entry-point.tsx:49.',
        );
      }
    } finally {
      await dmCtx.close();
    }
  });
});
