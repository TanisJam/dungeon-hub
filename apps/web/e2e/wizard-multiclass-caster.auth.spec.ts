/*
 * wizard-multiclass-caster.auth.spec.ts
 *
 * E2E for the multiclass spell picker tab UI (SP-06).
 *
 * Fixture: Cleric 1 / Wizard 1 character, pre-seeded via API because the
 * wizard class step does not yet support multiclass character creation
 * (class step only supports classes[0] — P.4 result from apply phase).
 *
 * When multiclass class-step lands, this fixture can be replaced with a
 * full wizard walkthrough. Until then, the test creates the character via
 * direct API calls in beforeEach.
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
       * FIXME: This E2E requires the API to support patching character.data.classes
       * with multiple entries via the class wizard step or a PATCH endpoint.
       * At time of SP-06 apply, the class step only supports classes[0] and there
       * is no PATCH /characters/:id/data endpoint.
       *
       * Pre-condition to unblock:
       *   Option A: the multiclass class-step lands (follow-up SDD)
       *   Option B: add PATCH /characters/:id endpoint to accept full character data
       *
       * When unblocked, remove test.fixme, implement setup below:
       *
       *   1. Create character via wizard (stats + race + background)
       *   2. PATCH classes to [{cleric, L1}, {wizard, L1}]
       *   3. Navigate to /wizard/spells
       *   4. Assert two tabs: "Clérigo" and "Mago"
       *   5. Pick spells on Cleric tab (N cantrips + M prepared)
       *   6. Switch to Wizard tab
       *   7. Assert Cleric picks preserved (tab state not reset on switch)
       *   8. Pick spells on Wizard tab (cantrips + spellbook + prepared)
       *   9. Click "Siguiente"
       *   10. Assert redirect to /wizard/review
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
       * FIXME: same pre-condition as above — need full wizard creation to
       * reach /wizard/spells in E2E mode.
       *
       * When unblocked:
       *   1. Create Wizard-only character
       *   2. Navigate to /wizard/spells
       *   3. Assert no role=tab elements in DOM (REQ-SP06-SINGLE-CASTER-NO-TAB-BAR)
       *   4. Assert existing single-caster flow still works end-to-end
       */
      await page.goto('/dashboard');
      await expect(page).toHaveURL(/\/dashboard$/, { timeout: 10_000 });
    },
  );
});
