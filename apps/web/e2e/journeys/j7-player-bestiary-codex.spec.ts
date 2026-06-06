/**
 * J7 — Player Bestiary Codex (cross-role) — UPDATED for character-codex-browser Slice 1'
 *
 * Verifies the PLAYER view of /characters/:id/codex/monsters (replaces /codex/bestiario):
 *   1. DM grants a specific monster → player sees it by name in CodexList.
 *   2. "N de M descubiertos" progress text visible on the grid page (/codex).
 *   3. CodexList shows the granted monster as a tappable row (no [data-monster-slug] — new DOM model).
 *   4. An ungranted monster (tarrasque) is absent from the player DOM.
 *   5. No horizontal overflow at 375px.
 *   6. SheetTabs renders "Códex" link (not "Bestiario").
 *
 * Spec: character-codex-browser SDD (Slice 1')
 * REQ-CCB-WEB-01: grid page "N de M descubiertos"
 * REQ-CCB-WEB-02: player known-only rows in CodexList
 * REQ-CCB-WEB-05: SheetTabs "Códex" label + /codex href
 * REQ-CCB-MIG-02: E2E updated same slice as bespoke page removal
 *
 * HOUSE RULE: Bestiary statblock gating — no RAW basis (PHB p.177-179).
 * DM grants a monster → player sees it. Ungranted monsters NOT in player DOM.
 *
 * Cross-role setup:
 *   - player1@dh.test owns the character.
 *   - dm@dh.test grants the monster via API (POST /characters/:id/knowledge).
 *   - The player1 browser context (cookie-auth) navigates to the codex page.
 *
 * DOM model change from old bestiario page:
 *   OLD: [data-monster-slug] attributes, silhouette "???" tiles (DM view)
 *   NEW: CodexList rows — plain buttons rendered by MonsterRowView (no data-monster-slug).
 *        Row tap opens DetailSheet. No silhouette tiles in player view (known-only rows only).
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

test.describe.skip('J7 — Player Bestiary Codex (CodexList) @ 375px', () => {
  // W1 Biblioteca: world-knowledge gated surface deleted; re-enabled by Bitácora wave
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
        name: `J7 Codex ${Date.now()}`,
        targetStatus: 'active',
      });
      const charId = char.id;
      const codexGridPath = `/characters/${charId}/codex`;
      const codexMonstersPath = `/characters/${charId}/codex/monsters`;

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

      // Sanity check via API: /knowledge/monsters returns new envelope shape (rows[])
      const codexRes = await fetch(`${API_BASE}/api/v1/characters/${charId}/knowledge/monsters`, {
        headers: { Authorization: `Bearer ${p1Jwt}` },
      });
      const codexData = (await codexRes.json()) as {
        rows: Array<{ slug: string; source: string; name: string; known: boolean }>;
        total: number;
        knownCount: number;
        effectiveView: 'dm' | 'player';
      };
      expect(codexData.effectiveView).toBe('player');
      expect(codexData.knownCount).toBeGreaterThanOrEqual(1);
      // Player view must only contain known=true rows (API-level gate)
      expect(codexData.rows.every((r) => r.known)).toBe(true);

      // ── 4. Open player1 browser context ──────────────────────────────────────
      const p1Ctx = await browser.newContext({
        storageState: path.join(AUTH_DIR, 'player1.json'),
        viewport: VIEWPORT,
        baseURL: BASE_URL,
      });
      const p1Page = await p1Ctx.newPage();

      try {
        // ── 5. Navigate to /characters/:id/codex (grid page) ─────────────────
        await p1Page.goto(codexGridPath, { waitUntil: 'networkidle', timeout: 60_000 });
        await expect(p1Page).toHaveURL(/\/codex$/, { timeout: 15_000 });

        // ── 6. Grid shows "N de M descubiertos" — REQ-CCB-WEB-01 ─────────────
        const progressText = p1Page.getByText(/descubiertos/);
        await expect(progressText.first()).toBeVisible({ timeout: 10_000 });

        // ── 7. Monstruos card link visible + navigable ────────────────────────
        const monstrosCard = p1Page.getByRole('link', { name: /monstruos/i });
        await expect(monstrosCard).toBeVisible({ timeout: 10_000 });

        // ── 8. Navigate to /characters/:id/codex/monsters ─────────────────────
        await p1Page.goto(codexMonstersPath, { waitUntil: 'networkidle', timeout: 60_000 });
        await expect(p1Page).toHaveURL(/\/codex\/monsters/, { timeout: 15_000 });

        // ── 9. Granted monster is visible by name in CodexList ────────────────
        await expect(p1Page.getByText(grantedName)).toBeVisible({ timeout: 10_000 });

        // ── 10. No [data-monster-slug] elements — new DOM model ───────────────
        // CodexList uses MonsterRowView rows (no data-monster-slug attributes).
        // The old bestiario page used [data-monster-slug]. This asserts the DOM model changed.
        const slugElements = p1Page.locator('[data-monster-slug]');
        await expect(slugElements).toHaveCount(0);

        // ── 11. No silhouette "???" tiles — player view only ──────────────────
        // Player API never returns unknown rows → no "???" in player DOM.
        const silhouetteCount = await p1Page.getByText('???').count();
        expect(silhouetteCount, '"???" silhouette tiles must be absent in player view').toBe(0);

        // ── 12. Ungranted monster (tarrasque) absent from DOM ─────────────────
        // CodexList only shows API-returned rows (player = known-only).
        // Tarrasque was not granted → its name must not appear.
        // Note: 'Tarrasque' text must not be in the list (it may appear elsewhere if the
        // tarrasque happens to be the granted monster in some edge case — skip in that case).
        const grantedSlugs = new Set(codexData.rows.map((r) => r.slug));
        if (!grantedSlugs.has(UNGRANTED_SLUG)) {
          const tarrasqueCount = await p1Page.getByText('Tarrasque').count();
          expect(tarrasqueCount, 'Ungranted tarrasque must not appear in player CodexList').toBe(0);
        }

        // ── 13. No horizontal overflow at 375px ───────────────────────────────
        const scrollWidth = await p1Page.evaluate(() => document.documentElement.scrollWidth);
        expect(scrollWidth, 'No horizontal overflow at 375px').toBeLessThanOrEqual(375);
      } finally {
        await p1Ctx.close();
      }
    },
  );
});
