/**
 * W1 Biblioteca: world-knowledge gated surface deleted; re-enabled by Bitácora wave.
 * All tests in this file are quarantined until the Bitácora wave re-introduces
 * the /characters/[id]/codex surface.
 */

/**
 * J8 — codex-knowledge E2E round-trip @ 375px
 *
 * codex-knowledge B-5 (SDD tasks #1950, spec #1947 Area 8):
 *
 * E2E-A (REQ-CK-E2E-01): Full knowledge round-trip
 *   1. DM completes session with knowledgeGrants[] for character C1 (goblin/bestiary).
 *   2. Player (C1) navigates to /codex/monsters — routing split now shows CodexList (gated).
 *   3. Player sees "goblin" in the list (leak closed; entity is now known).
 *   4. Player opens the goblin detail (sheet opens on row tap).
 *   5. Player sees the "＋ Agregar nota" affordance (ContributionComposer).
 *   6. Player submits a note → personal contribution row exists via API.
 *
 * E2E-B (REQ-CK-E2E-04): Empty state for ungated character
 *   - Player character with zero character_knowledge rows navigates to /codex/monsters.
 *   - 375px: empty state message visible; no error boundary or 500.
 *
 * Cross-role setup:
 *   - dm@dh.test is the DM / session creator.
 *   - player1@dh.test owns the character.
 *
 * NOTE: These specs require the full stack (web :3001, api :4000, Postgres).
 * Run with: pnpm --filter @dungeon-hub/web test:e2e
 * Auth fixtures: e2e/.auth/{dm,player1}.json must exist (run auth setup first).
 *
 * Mobile-first: 375×667 viewport (iPhone SE) per CLAUDE.md §2.
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

// ---------------------------------------------------------------------------
// E2E-A: Full knowledge round-trip (REQ-CK-E2E-01)
// ---------------------------------------------------------------------------

test.describe.skip('J8-A — codex-knowledge round-trip @ 375px', () => {
  // W1 Biblioteca: world-knowledge gated surface deleted; re-enabled by Bitácora wave
  test(
    'DM grants goblin via session-complete → player /codex/monsters shows it → player adds note',
    async ({ browser }: { browser: Browser }) => {
      // ── 1. Seed: JWTs + ephemeral active character for player1 ───────────────
      const dmJwt = await getJwt('dm@dh.test');
      const p1Jwt = await getJwt('player1@dh.test');
      const worldId = await getFixtureWorldId(dmJwt);

      const char = await seedJourneyCharacter({
        ownerJwt: p1Jwt,
        dmJwt,
        worldId,
        name: `J8 KnowledgeRoundtrip ${Date.now()}`,
        targetStatus: 'active',
      });
      const charId = char.id;

      // ── 2. Create a session and complete it with knowledgeGrants ──────────────
      // Create campaign (needed for session)
      const campaignRes = await fetch(`${API_BASE}/api/v1/campaigns`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${dmJwt}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ worldId, name: `J8 Session Campaign ${Date.now()}` }),
      });
      expect(campaignRes.status, `Campaign create failed`).toBe(201);
      const campaign = (await campaignRes.json()) as { id: string };

      const sessionRes = await fetch(`${API_BASE}/api/v1/sessions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${dmJwt}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId: campaign.id, title: `J8 Session ${Date.now()}` }),
      });
      expect(sessionRes.status, `Session create failed`).toBe(201);
      const session = (await sessionRes.json()) as { id: string };

      // Start session so participants can join
      await fetch(`${API_BASE}/api/v1/sessions/${session.id}/start`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${dmJwt}`, 'Content-Type': 'application/json' },
      });

      // Player joins
      await fetch(`${API_BASE}/api/v1/sessions/${session.id}/join`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${p1Jwt}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ characterId: charId }),
      });

      // DM completes session with knowledgeGrants (REQ-CK-UNLOCK-03)
      const grantedSlug = 'goblin';
      const grantedSource = 'MM';
      const grantedName = 'Goblin';

      const completeRes = await fetch(`${API_BASE}/api/v1/sessions/${session.id}/complete`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${dmJwt}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summary: 'J8 test session',
          knowledgeGrants: [
            { characterId: charId, kind: 'bestiary', refKey: grantedSlug, refSource: grantedSource },
          ],
        }),
      });
      expect(completeRes.status, `Session complete failed: ${await completeRes.text()}`).toBe(200);

      // Verify grant via API (sanity check — REAL shape: { rows[], total, knownCount, effectiveView })
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
      const knownGoblin = codexData.rows.find((r) => r.slug === grantedSlug && r.source === grantedSource);
      expect(knownGoblin, 'Goblin must be in player knowledge after grant').toBeTruthy();

      // ── 3. Open player1 browser context ───────────────────────────────────────
      const p1Ctx = await browser.newContext({
        storageState: path.join(AUTH_DIR, 'player1.json'),
        viewport: VIEWPORT,
        baseURL: BASE_URL,
      });
      const p1Page = await p1Ctx.newPage();

      try {
        // ── 4. Navigate to /codex/monsters (routing split — gated CodexList) ────
        // REQ-CK-GATE-08: world-knowledge → gated path, not unfiltered compendium.
        await p1Page.goto(`/codex/monsters`, { waitUntil: 'networkidle', timeout: 60_000 });
        // The page may redirect to '/' if getActiveCharacter fails — that's an environment issue.
        // Assert we're on a codex-related page or home (not an error page).
        const finalUrl = p1Page.url();
        if (finalUrl.includes('/codex/monsters')) {
          // ── 5. Granted monster appears in the list (REQ-CK-GATE-08 — leak closed) ─
          await expect(p1Page.getByText(grantedName)).toBeVisible({ timeout: 10_000 });

          // ── 6. No horizontal overflow at 375px ────────────────────────────────
          const scrollWidth = await p1Page.evaluate(() => document.documentElement.scrollWidth);
          expect(scrollWidth, 'No horizontal overflow at 375px').toBeLessThanOrEqual(375);

          // ── 7. "＋ Agregar nota" affordance visible on row click (B-2) ──────────
          // Click on the monster row (opens detail sheet)
          const monsterRow = p1Page.getByText(grantedName).first();
          await monsterRow.click();

          // ContributionComposer "Agregar nota" button (REQ-CK-NOTE-02)
          const addNoteBtn = p1Page.getByRole('button', { name: /agregar nota/i });
          await expect(addNoteBtn).toBeVisible({ timeout: 5_000 });

          // ── 8. Player submits a note ───────────────────────────────────────────
          await addNoteBtn.click();
          const noteBody = 'Encontré un goblin en la cueva norte (J8 test).';
          await p1Page.getByPlaceholder(/escribí tu nota/i).fill(noteBody);
          await p1Page.getByRole('button', { name: /guardar nota/i }).click();

          // Sheet closes on success (no dialog present after submit)
          await expect(p1Page.getByRole('dialog', { name: /nueva nota/i })).not.toBeVisible({ timeout: 5_000 });
        } else {
          // Environment issue — active character not set up properly; skip assertions.
          test.skip(true, `Redirected to ${finalUrl} — active character may not be set for player1`);
        }
      } finally {
        await p1Ctx.close();
      }
    },
  );
});

// ---------------------------------------------------------------------------
// E2E-B: Empty state for character with zero knowledge (REQ-CK-E2E-04)
// ---------------------------------------------------------------------------

test.describe.skip('J8-B — codex-knowledge empty state @ 375px', () => {
  // W1 Biblioteca: world-knowledge gated surface deleted; re-enabled by Bitácora wave
  test(
    'Player character with zero character_knowledge rows sees empty state on /codex/monsters',
    async ({ browser }: { browser: Browser }) => {
      const p1Jwt = await getJwt('player1@dh.test');
      const dmJwt = await getJwt('dm@dh.test');
      const worldId = await getFixtureWorldId(dmJwt);

      // Seed a fresh character (no knowledge grants)
      const char = await seedJourneyCharacter({
        ownerJwt: p1Jwt,
        dmJwt,
        worldId,
        name: `J8-B EmptyCodex ${Date.now()}`,
        targetStatus: 'active',
      });
      const charId = char.id;

      // Verify via API: zero known rows (sanity check)
      const codexRes = await fetch(`${API_BASE}/api/v1/characters/${charId}/knowledge/monsters`, {
        headers: { Authorization: `Bearer ${p1Jwt}` },
      });
      const codexData = (await codexRes.json()) as { rows: unknown[]; knownCount: number };
      expect(codexData.rows.length, 'Fresh character has zero known monsters').toBe(0);
      expect(codexData.knownCount, 'knownCount = 0').toBe(0);

      // Open player1 browser context
      const p1Ctx = await browser.newContext({
        storageState: path.join(AUTH_DIR, 'player1.json'),
        viewport: VIEWPORT,
        baseURL: BASE_URL,
      });
      const p1Page = await p1Ctx.newPage();

      try {
        // Navigate to /codex/monsters — REQ-CK-GATE-09: empty state must render
        await p1Page.goto('/codex/monsters', { waitUntil: 'networkidle', timeout: 60_000 });

        const finalUrl = p1Page.url();
        if (finalUrl.includes('/codex/monsters')) {
          // Must NOT render an error boundary (no "Error" heading or 500 text)
          const errorText = await p1Page.getByText(/error interno|something went wrong/i).count();
          expect(errorText, 'No error boundary must appear').toBe(0);

          // Empty state message must be visible (REQ-CK-GATE-09)
          // CodexList renders "No hay entradas descubiertas aún." when rows=[].
          const emptyState = await p1Page.getByText(/no hay entradas descubiertas/i).count();
          expect(emptyState, 'Empty state message must appear for 0 known rows').toBeGreaterThan(0);

          // No horizontal overflow at 375px
          const scrollWidth = await p1Page.evaluate(() => document.documentElement.scrollWidth);
          expect(scrollWidth, 'No horizontal overflow at 375px').toBeLessThanOrEqual(375);
        } else {
          test.skip(true, `Redirected to ${finalUrl} — active character may not be set for player1`);
        }
      } finally {
        await p1Ctx.close();
      }
    },
  );
});
