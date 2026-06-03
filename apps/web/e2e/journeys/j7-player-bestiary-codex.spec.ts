/**
 * J7 — Player Bestiary Codex (cross-role)
 *
 * Verifies the PLAYER view of /characters/:id/codex/bestiario:
 *   1. DM grants a specific monster → player sees it by name + CR/type.
 *   2. "N de M descubiertos" progress text is visible.
 *   3. Player view is filtered: only known monsters have [data-monster-slug].
 *      No silhouette "???" tiles — those are DM-only.
 *   4. An ungranted monster (tarrasque) has no [data-monster-slug] in the DOM.
 *   5. No horizontal overflow at 375px.
 *
 * Spec: character-codex SDD #1626
 * REQ-CK-WEB-01: Player bestiary view — known monsters shown, ungranted NOT leaked.
 * REQ-CK-WEB-02: Active character via URL :id param.
 *
 * HOUSE RULE: Bestiary statblock gating — no RAW basis (PHB p.177-179).
 * DM grants a monster → player sees it. Ungranted monsters NOT in player DOM.
 *
 * Cross-role setup:
 *   - player1@dh.test owns the character.
 *   - dm@dh.test grants the monster via API (POST /characters/:id/knowledge).
 *   - The player1 browser context (cookie-auth) navigates to the codex page.
 *
 * The API derives effectiveView from the JWT caller's world membership role:
 *   GM → 'dm' (full MM + known flags).
 *   Player/owner → 'player' (known-only, no silhouette rows).
 * The web page renders ONLY what the API returns — no client-side filtering.
 *
 * Mobile-first: 375×667 viewport (iPhone SE) per CLAUDE.md §2.
 *
 * Stack must be running (web :3001, api :4000, Postgres).
 * Fixture setup must have run (e2e/.auth/{dm,player1}.json must exist).
 */

import { test, expect, type Browser } from '@playwright/test';
import path from 'node:path';
import {
  getJwt,
  getFixtureWorldId,
  seedJourneyCharacter,
} from '../helpers/seed-journey-character';

const AUTH_DIR = path.join(__dirname, '../.auth');
const BASE_URL = process.env.WEB_BASE_URL ?? 'http://localhost:3001';
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const VIEWPORT = { width: 375, height: 667 };

// A monster slug that is astronomically unlikely to be granted to any fresh
// ephemeral character. Used to assert it is absent from the player DOM.
const UNGRANTED_SLUG = 'tarrasque';

test.describe('J7 — Player Bestiary Codex @ 375px', () => {
  test(
    'DM grants goblin → player codex shows it; ungranted tarrasque absent; no silhouettes',
    async ({ browser }: { browser: Browser }) => {
      // ── 1. Seed: obtain JWTs + create ephemeral active character for player1 ──
      const dmJwt = await getJwt('dm@dh.test');
      const p1Jwt = await getJwt('player1@dh.test');
      const worldId = await getFixtureWorldId(dmJwt);

      const char = await seedJourneyCharacter({
        ownerJwt: p1Jwt,
        dmJwt,
        worldId,
        name: `J7 Bestiary ${Date.now()}`,
        targetStatus: 'active',
      });
      const charId = char.id;
      const codexPath = `/characters/${charId}/codex/bestiario`;

      // ── 2. Pick a known-good monster slug from the compendium ────────────────
      // Use 'goblin|MM' — always present in the compendium (2797 monsters seeded).
      const grantedSlug = 'goblin';
      const grantedSource = 'MM';
      const grantedName = 'Goblin';

      // ── 3. DM grants the monster via API ─────────────────────────────────────
      const grantRes = await fetch(`${API_BASE}/api/v1/characters/${charId}/knowledge`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${dmJwt}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ kind: 'bestiary', refKey: grantedSlug, refSource: grantedSource }),
      });
      expect(grantRes.status, `DM grant failed: ${await grantRes.text()}`).toBe(200);

      // Sanity check via API: player view returns only the granted monster
      const bestiaryRes = await fetch(`${API_BASE}/api/v1/characters/${charId}/knowledge/bestiary`, {
        headers: { Authorization: `Bearer ${p1Jwt}` },
      });
      const bestiaryData = (await bestiaryRes.json()) as {
        monsters: Array<{ slug: string; source: string; name: string; cr: string | null; type: string | null; known: boolean }>;
        total: number;
        knownCount: number;
        effectiveView: 'dm' | 'player';
      };
      expect(bestiaryData.effectiveView).toBe('player');
      expect(bestiaryData.knownCount).toBeGreaterThanOrEqual(1);
      // Player view must only contain known=true rows (API-level gate)
      expect(bestiaryData.monsters.every((m) => m.known)).toBe(true);

      // ── 4. Open player1 browser context ──────────────────────────────────────
      const p1Ctx = await browser.newContext({
        storageState: path.join(AUTH_DIR, 'player1.json'),
        viewport: VIEWPORT,
        baseURL: BASE_URL,
      });
      const p1Page = await p1Ctx.newPage();

      try {
        // ── 5. Navigate to /characters/:id/codex/bestiario ───────────────────
        await p1Page.goto(codexPath, { waitUntil: 'networkidle', timeout: 60_000 });
        await expect(p1Page).toHaveURL(/\/codex\/bestiario/, { timeout: 15_000 });

        // ── 6. Page heading visible ───────────────────────────────────────────
        // AppShell renders "Bestiario" in both the nav header AND the page body.
        // Scope to <main> to avoid strict-mode violation with two matching h1s.
        await expect(p1Page.locator('main h1', { hasText: /bestiario/i })).toBeVisible({
          timeout: 15_000,
        });

        // ── 7. "N de M descubiertos" progress text visible ───────────────────
        // REQ-CK-WEB-01: header + footer both render this text
        const progressText = p1Page.getByText(/descubiertos/);
        await expect(progressText.first()).toBeVisible({ timeout: 10_000 });

        // ── 8. Granted monster is visible with its full name ─────────────────
        await expect(p1Page.getByText(grantedName)).toBeVisible({ timeout: 10_000 });

        // ── 9. Player-filtered: [data-monster-slug] count == knownCount ───────
        // The player API returns only known monsters. Every [data-monster-slug]
        // element corresponds to a known monster. There must be no silhouette "???"
        // tiles (those only appear in DM view when known=false).
        const slugElements = p1Page.locator('[data-monster-slug]');
        const slugCount = await slugElements.count();
        // knownCount from API is authoritative — page must render exactly that many
        expect(
          slugCount,
          `[data-monster-slug] count (${slugCount}) should equal API knownCount (${bestiaryData.knownCount})`,
        ).toBe(bestiaryData.knownCount);

        // ── 10. No silhouette "???" tiles — player view only ──────────────────
        // DM silhouette tiles render <p>???</p> for unknown monsters.
        // Player API never returns unknown rows → no "???" in player DOM.
        const silhouetteCount = await p1Page.getByText('???').count();
        expect(silhouetteCount, '"???" silhouette tiles must be absent in player view').toBe(0);

        // ── 11. Ungranted monster absent from DOM ─────────────────────────────
        // The tarrasque was never granted → no [data-monster-slug="tarrasque"] element.
        // REQ-CK-WEB-01: statblock data must not leak for ungranted monsters.
        const tarrasqueEl = p1Page.locator(`[data-monster-slug="${UNGRANTED_SLUG}"]`);
        await expect(tarrasqueEl).toHaveCount(0);

        // ── 12. No horizontal overflow at 375px ───────────────────────────────
        const scrollWidth = await p1Page.evaluate(() => document.documentElement.scrollWidth);
        expect(scrollWidth, 'No horizontal overflow at 375px').toBeLessThanOrEqual(375);
      } finally {
        await p1Ctx.close();
      }
    },
  );
});
