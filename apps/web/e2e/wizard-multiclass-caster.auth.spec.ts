/*
 * wizard-multiclass-caster.auth.spec.ts
 *
 * E2E for the multiclass spell picker tab UI (SP-06).
 *
 * DESIGN NOTE (FORK A=A3, signed — multiclass-additive Batch 8):
 * The creation wizard is intentionally L1-only and single-class per PHB p.163
 * ("Prerequisites: to qualify for a new class, you must meet the ability score
 * prerequisites for both your current class and your new one — this is done
 * at level-up, not character creation"). Multiclassing is a level-up mechanic.
 *
 * The canonical path for a multiclass character is:
 *   1. Create character via wizard (stats + race + class + background — single L1 class).
 *   2. DM approves → character becomes active.
 *   3. Player uses "Agregar clase" CTA on the sheet (/characters/:id) to reach
 *      the level-up new-class flow (/characters/:id/level-up).
 *   4. Post /classes → monk L1; grant XP; POST /classes/monk/level-up → monk L2.
 *
 * These tests remain fixme because implementing the E2E for the multiclass
 * spell-picker tab requires API-seeding the character (POST /classes, POST /level-up),
 * DM-approval flow, and a multi-step Playwright walkthrough — out of scope for B8.
 *
 * PHB reference:
 *   - Cleric 1: WIS-based, cantripsKnown=3, spellsPrepared=WIS_mod+1
 *   - Wizard 1: INT-based, cantripsKnown=3, wizardSpellbookSize=6, spellsPrepared=INT_mod+1
 *   - Multiclassing: each class tracks spells independently (PHB p.164)
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const TEST_EMAIL = process.env.TEST_USER_EMAIL ?? 'e2e@dungeon-hub.test';
const TEST_PASSWORD = process.env.TEST_USER_PASSWORD ?? 'e2e-test-pass-1234';

/**
 * Returns an access token for the E2E test user.
 */
async function getAccessToken(): Promise<string> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });
  if (error || !data.session) {
    throw new Error(`getAccessToken failed: ${error?.message ?? 'no session'}`);
  }
  return data.session.access_token;
}

async function apiGet<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${API_URL}/api/v1${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

async function apiPost<T>(path: string, body: unknown, token: string): Promise<T> {
  const res = await fetch(`${API_URL}/api/v1${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${path} → ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

async function apiPut<T>(path: string, body: unknown, token: string): Promise<T> {
  const res = await fetch(`${API_URL}/api/v1${path}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PUT ${path} → ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

test.describe('character wizard — multiclass spell picker tabs (SP-06)', () => {
  test.fixme(
    'Cleric 1 / Wizard 1 — two tabs render, picks on each, land on /review',
    async ({ page }) => {
      /*
       * FIXME: Multiclass character creation will NOT land in the wizard by design
       * (FORK A=A3 signed, PHB p.163 — multiclassing is a level-up mechanic, not a
       * creation-wizard feature).
       *
       * True E2E for multiclass spell tabs belongs in a level-up-flow E2E:
       *   1. Seed character via API (POST /characters, PUT /class cleric L1, PUT /race, etc.)
       *   2. DM-approve the character (POST /characters/:id/approve)
       *   3. Grant XP so the character qualifies for a new class (POST /characters/:id/xp)
       *   4. Navigate to /characters/:id (sheet)
       *   5. Click "Agregar clase" CTA → lands on /characters/:id/level-up (new-class mode)
       *   6. Select wizard as new class → wizard spell picker renders
       *   7. Assert two tabs: "Clérigo" and "Mago"
       *   8. Pick spells on each tab, assert picks preserved on tab switch
       *   9. Complete level-up flow
       * This is tracked as a follow-up (out of scope for B8).
       *
       * REQ-FIXME-02: "Option A: multiclass class-step lands" is NOT the unblock condition
       * (that option was explicitly rejected). REQ-FIXME-04.
       */

      // Placeholder: login to avoid "requires auth" bail-out at test start
      await page.goto('/dashboard');
      await expect(page).toHaveURL(/\/dashboard$/, { timeout: 10_000 });

      void getAccessToken; // suppress unused import warning
      void apiGet; void apiPost; void apiPut;
    },
  );

  test.fixme(
    'single Wizard — no tab bar renders (regression guard)',
    async ({ page }) => {
      /*
       * FIXME: same canonical-path reasoning as above (FORK A=A3, PHB p.163).
       * The single-caster regression guard also requires the full level-up E2E
       * fixture setup to reach a post-creation active wizard character reliably.
       *
       * True E2E unblock path:
       *   1. Seed Wizard-only character via API, DM-approve
       *   2. Navigate to /characters/:id (sheet) — no "Agregar clase" CTA expected
       *      (single class, already at L1)
       *   3. Navigate to /wizard/spells (or equivalent post-creation spell step)
       *   4. Assert no role=tab elements in DOM (REQ-SP06-SINGLE-CASTER-NO-TAB-BAR)
       *   5. Assert existing single-caster flow still works end-to-end
       * This is tracked as a follow-up (out of scope for B8).
       *
       * REQ-FIXME-02: "Option A: multiclass class-step lands" is NOT the unblock condition.
       * REQ-FIXME-04.
       */
      await page.goto('/dashboard');
      await expect(page).toHaveURL(/\/dashboard$/, { timeout: 10_000 });
    },
  );
});
