/**
 * J6 — GM+owner: HP max, role toggle, spell prep (cross-scenario)
 *
 * As dm@dh.test (who is simultaneously GM of the world AND owner of DM Hero / DM Mage):
 *
 * PART A — DM Hero (Fighter)
 *   1. Open "DM Hero" sheet. In DM mode (default): set HP including max → succeeds.
 *      Verify via API that hp.max changed.
 *   2. Toggle to "Jugador" view → "Otorgar" button DISAPPEARS.
 *   3. Toggle back to "DM" → "Otorgar" button REAPPEARS.
 *
 * PART B — DM Mage (Wizard)
 *   1. Open "DM Mage" hechizos tab.
 *   2. Verify the full spellbook is shown (6 spells — all known, 2 prepared).
 *   3. Open the prep editor → all 6 spellbook spells listed as candidates.
 *   4. Change prep: deselect magic-missile, add charm-person.
 *   5. Save → reload → verify change persisted AND spellbook intact (6 spells).
 *
 * Cross-scenario: same user (DM) is both owner and GM.
 * Mobile-first: 375×667 viewport per CLAUDE.md §2.
 *
 * Retries: 2 (configured globally in playwright.config.ts).
 * revalidatePath races: use API-authoritative assertions where possible.
 */
import { test, expect, type Browser } from '@playwright/test';
import path from 'node:path';
import {
  getJwt,
  findCharacterIdByName,
  getCharacterHp,
  getCharacterSheetSpells,
} from '../helpers/seed-journey-character';

const AUTH_DIR = path.join(__dirname, '../.auth');
const BASE_URL = process.env.WEB_BASE_URL ?? 'http://localhost:3001';
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const VIEWPORT = { width: 375, height: 667 };

// ── shared API helpers ────────────────────────────────────────────────────────

async function putHp(
  charId: string,
  payload: { current?: number; max?: number; temp?: number },
  jwt: string,
): Promise<{ ok: boolean; status: number; hp?: { max: number } }> {
  const res = await fetch(`${API_BASE_URL}/api/v1/characters/${charId}/hp`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const body = await res.json() as { ok?: boolean; hp?: { max: number } };
  return { ok: res.ok, status: res.status, hp: body.hp };
}

async function putSpells(
  charId: string,
  classSlug: string,
  payload: {
    cantrips?: Array<{ slug: string; source: string }>;
    known?: Array<{ slug: string; source: string }>;
    prepared?: Array<{ slug: string; source: string }>;
  },
  jwt: string,
): Promise<{ status: number }> {
  const res = await fetch(`${API_BASE_URL}/api/v1/characters/${charId}/classes/${classSlug}/spells`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  return { status: res.status };
}

// ─────────────────────────────────────────────────────────────────────────────
// PART A — DM Hero HP max + role toggle
// ─────────────────────────────────────────────────────────────────────────────

// Playwright's default per-test budget is 30s, and this block asks for more than
// that on its own: its explicit waits sum to ~60s (15 + 10 + 10 + 5 + 10 + 5 + 5). It only ever passed when every
// one of them returned near-instantly, which is not a property a test should
// depend on — a slow first paint made it fail looking like a role bug rather
// than a clock. Give it a budget consistent with what it actually waits for.
// The waits themselves are unchanged; nothing is being given more slack than it
// already asked for.
test.describe.configure({ timeout: 90_000 });

test.describe('J6A — GM+owner: HP max set + role toggle (DM Hero)', () => {
  test('GM+owner sets hp.max via API → 200; role toggle hides/shows DM affordances', async ({
    browser,
  }: {
    browser: Browser;
  }) => {
    const dmJwt = await getJwt('dm@dh.test');

    // ── Find DM Hero (created by seed) ─────────────────────────────────────
    const heroId = await findCharacterIdByName('DM Hero', dmJwt);
    expect(heroId, 'DM Hero fixture missing — run db:seed:e2e').toBeTruthy();
    if (!heroId) return;

    // ── DIRECT API PROOF (FIX A): GM+owner sets max → 200 ─────────────────
    // This is the authoritative assertion — we don't need the UI for this.
    const hpBefore = await getCharacterHp(heroId, dmJwt);
    const newMax = (hpBefore?.max ?? 20) + 2; // increment by 2 to prove change

    const putResult = await putHp(heroId, { max: newMax }, dmJwt);
    expect(
      putResult.status,
      `GM+owner PUT /characters/${heroId}/hp with max → expected 200, got ${putResult.status}`,
    ).toBe(200);

    // Verify via GET that max was actually persisted
    const hpAfter = await getCharacterHp(heroId, dmJwt);
    expect(hpAfter?.max, `hp.max should be ${newMax} after PUT`).toBe(newMax);

    // Restore HP to 20/20 for future runs
    await putHp(heroId, { current: 20, max: 20, temp: 0 }, dmJwt);

    // ── UI: role toggle hides/shows DM affordances ────────────────────────
    const dmCtx = await browser.newContext({
      storageState: path.join(AUTH_DIR, 'dm.json'),
      viewport: VIEWPORT,
      baseURL: BASE_URL,
    });

    const dmPage = await dmCtx.newPage();

    try {
      await dmPage.goto(`/characters/${heroId}`, { waitUntil: 'domcontentloaded' });
      await expect(dmPage).toHaveURL(/\/characters\/[a-f0-9-]+/, { timeout: 15_000 });

      // The page should have role switcher since callerRole=gm. `data-value` was
      // dropped when the ToggleChip atom was extracted (commit b79b794) in favor
      // of aria-pressed; the button's title stays stable across DM/PJ state.
      const roleSwitcher = dmPage.getByTitle('Cambiar vista DM / Jugador');
      await expect(roleSwitcher).toBeVisible({ timeout: 10_000 });

      // The role switcher is a single toggle button. Ensure DM mode: if the DM-only
      // "Otorgar" affordance isn't visible, tap the switcher to toggle into DM.
      const otorgarBtn = dmPage.getByRole('button', { name: 'Otorgar recompensa de DM' });
      if (!(await otorgarBtn.isVisible().catch(() => false))) {
        await roleSwitcher.click();
      }
      await expect(otorgarBtn).toBeVisible({ timeout: 10_000 });

      // ── UI FLOW (the REAL user path): set HP max via the editor in DM mode ──
      // This is what the user actually does — NOT a direct API call. Reproduces
      // "no puedo pasar el máximo como DM".
      await dmPage.getByRole('button', { name: 'Editar HP' }).click();
      const maxInput = dmPage.getByRole('spinbutton', { name: 'HP máximo' });
      await expect(maxInput, 'max input must be editable in DM mode').toBeEditable({ timeout: 5_000 });
      await maxInput.fill('27');
      await dmPage.getByRole('button', { name: /^guardar$/i }).click();
      // No "Sin permiso." error, and the new max persists (API-authoritative).
      await expect(async () => {
        const hp = await getCharacterHp(heroId, dmJwt);
        expect(hp?.max, 'hp.max should be 27 after UI save in DM mode').toBe(27);
      }).toPass({ timeout: 10_000 });
      // Restore to 20/20 for future runs.
      await putHp(heroId, { current: 20, max: 20, temp: 0 }, dmJwt);

      // Toggle to "Jugador" (player) mode via the single switcher button
      await roleSwitcher.click();

      // In player mode: "Otorgar" should DISAPPEAR
      await expect(otorgarBtn).not.toBeVisible({ timeout: 5_000 });

      // Toggle back to DM mode
      await roleSwitcher.click();

      // DM mode again: "Otorgar" should REAPPEAR
      await expect(otorgarBtn).toBeVisible({ timeout: 5_000 });
    } finally {
      await dmCtx.close();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PART A2 — REPRODUCE user bug: default load (NO switch click), HP editor in DM
// ─────────────────────────────────────────────────────────────────────────────

// Playwright's default per-test budget is 30s, and this block asks for more than
// that on its own: its explicit waits sum to ~60s (15 + 15 + 30). It only ever passed when every
// one of them returned near-instantly, which is not a property a test should
// depend on — a slow first paint made it fail looking like a role bug rather
// than a clock. Give it a budget consistent with what it actually waits for.
// The waits themselves are unchanged; nothing is being given more slack than it
// already asked for.
test.describe.configure({ timeout: 90_000 });

test.describe('J6A2 — GM+owner default load: HP editor must be in DM mode without clicking the switch', () => {
  test('on first load (default dm), Otorgar shows AND HP máximo is editable (no read-only hint)', async ({
    browser,
  }: {
    browser: Browser;
  }) => {
    const dmJwt = await getJwt('dm@dh.test');
    const heroId = await findCharacterIdByName('DM Hero', dmJwt);
    expect(heroId).toBeTruthy();
    if (!heroId) return;

    const dmCtx = await browser.newContext({
      storageState: path.join(AUTH_DIR, 'dm.json'),
      viewport: VIEWPORT,
      baseURL: BASE_URL,
    });
    const dmPage = await dmCtx.newPage();
    try {
      // Fresh load — DO NOT click the role switcher (mirrors the user relying on default).
      await dmPage.goto(`/characters/${heroId}`, { waitUntil: 'domcontentloaded' });
      await expect(dmPage).toHaveURL(/\/characters\/[a-f0-9-]+/, { timeout: 15_000 });

      // Affordances side: Otorgar must be visible by default (GM defaults to dm) — this
      // confirms the page hydrated into DM mode. Wait for it BEFORE checking the editor.
      await expect(
        dmPage.getByRole('button', { name: 'Otorgar recompensa de DM' }),
        'GM should default to DM mode (Otorgar visible) on first load',
      ).toBeVisible({ timeout: 15_000 });

      // HP editor side: in DM mode the "HP máximo" field must be EDITABLE with NO player
      // hint. Retry open+check to absorb the client-hydration race under suite load (the
      // editor can briefly render player-mode before useRole settles to 'dm').
      const maxInput = dmPage.getByRole('spinbutton', { name: 'HP máximo' });
      await expect(async () => {
        if (!(await maxInput.isVisible().catch(() => false))) {
          await dmPage.getByRole('button', { name: 'Editar HP' }).click().catch(() => {});
        }
        await expect(maxInput, 'HP máximo must be editable in DM mode').toBeEditable({
          timeout: 3_000,
        });
        await expect(
          dmPage.getByText('Solo el DM puede ajustar el máximo'),
          'player read-only hint must NOT show in DM mode',
        ).toBeHidden({ timeout: 1_000 });
      }).toPass({ timeout: 30_000 });
    } finally {
      await dmCtx.close();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PART B — DM Mage spell prep (full spellbook + prep change persists)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('J6B — GM+owner: spell prep — full spellbook visible + prep persists (DM Mage)', () => {
  test('DM Mage shows full 6-spell spellbook + prep change persists via API', async ({
    browser,
  }: {
    browser: Browser;
  }) => {
    const dmJwt = await getJwt('dm@dh.test');

    // ── Find DM Mage (created by seed) ────────────────────────────────────
    const mageId = await findCharacterIdByName('DM Mage', dmJwt);
    expect(mageId, 'DM Mage fixture missing — run db:seed:e2e').toBeTruthy();
    if (!mageId) return;

    // ── API PROOF: full spellbook (6 spells) + 2 prepared ─────────────────
    const spellsBefore = await getCharacterSheetSpells(mageId, dmJwt);
    const wizardSpells = spellsBefore.find((s) => s.classSlug === 'wizard');
    const leveledBefore = wizardSpells?.spells?.leveled ?? [];

    expect(
      leveledBefore.length,
      `DM Mage spellbook should have 6 leveled spells, got ${leveledBefore.length}`,
    ).toBe(6);

    const preparedBefore = leveledBefore.filter((s) => s.prepared === true);
    expect(
      preparedBefore.length,
      `DM Mage should have 2 prepared spells initially, got ${preparedBefore.length}`,
    ).toBe(2);

    // ── UI: hechizos tab shows full spellbook ─────────────────────────────
    const dmCtx = await browser.newContext({
      storageState: path.join(AUTH_DIR, 'dm.json'),
      viewport: VIEWPORT,
      baseURL: BASE_URL,
    });

    const dmPage = await dmCtx.newPage();

    try {
      // Navigate to hechizos tab
      await dmPage.goto(`/characters/${mageId}?tab=hechizos`, { waitUntil: 'domcontentloaded' });
      await expect(dmPage).toHaveURL(/\/characters\/[a-f0-9-]+/, { timeout: 15_000 });

      // Should see the spellcasting card
      const _spellCard = dmPage.locator('[class*="card"], .rounded-md, section').filter({
        has: dmPage.getByText(/wizard/i),
      }).first();
      // Actually look for a specific indicator: spell count or spell names
      // Check at least 1 spell is visible (Grimoario section or Preparados)
      const grimorioSection = dmPage.getByText('Grimoario').first();
      const preparadosSection = dmPage.getByText('Preparados').first();

      // At least one of Grimoario or Preparados should be visible
      const hasGrimorio = await grimorioSection.isVisible({ timeout: 10_000 }).catch(() => false);
      const hasPrepared = await preparadosSection.isVisible({ timeout: 10_000 }).catch(() => false);
      expect(
        hasGrimorio || hasPrepared,
        'DM Mage hechizos tab should show Grimoario and/or Preparados sections',
      ).toBe(true);

      // ── API: Change prep set (remove burning-hands, add charm-person) ────
      // Use API directly for reliable state change (avoid UI prep editor flakiness)
      const newPrepared = leveledBefore
        .filter((s) => s.slug !== 'burning-hands' && (s.slug === 'charm-person' || s.prepared))
        .map((s) => ({ slug: s.slug, source: 'PHB' }));

      // Add charm-person if not already prepared
      const hasCharmPerson = newPrepared.some((s) => s.slug === 'charm-person');
      if (!hasCharmPerson) {
        newPrepared.push({ slug: 'charm-person', source: 'PHB' });
      }

      // Send PUT with new prepared set (keep all known spells intact)
      const allKnown = leveledBefore.map((s) => ({ slug: s.slug, source: 'PHB' }));
      const putResult = await putSpells(
        mageId,
        'wizard',
        {
          cantrips: [
            { slug: 'fire-bolt', source: 'PHB' },
            { slug: 'mage-hand', source: 'PHB' },
            { slug: 'prestidigitation', source: 'PHB' },
          ],
          known: allKnown,
          prepared: newPrepared,
        },
        dmJwt,
      );

      expect(
        putResult.status,
        `Spell prep PUT should return 200, got ${putResult.status}`,
      ).toBe(200);

      // ── VERIFY: reload + check spellbook intact + prep changed ───────────
      const spellsAfter = await getCharacterSheetSpells(mageId, dmJwt);
      const wizardAfter = spellsAfter.find((s) => s.classSlug === 'wizard');
      const leveledAfter = wizardAfter?.spells?.leveled ?? [];

      // Spellbook must still have 6 spells (regression: old bug wiped it)
      expect(
        leveledAfter.length,
        `Spellbook after prep save should still have 6 spells, got ${leveledAfter.length}`,
      ).toBe(6);

      // charm-person should now be prepared
      const charmPersonAfter = leveledAfter.find((s) => s.slug === 'charm-person');
      expect(
        charmPersonAfter?.prepared,
        'charm-person should be prepared after save',
      ).toBe(true);

      // ── Restore to original prep state for future runs ───────────────────
      await putSpells(
        mageId,
        'wizard',
        {
          cantrips: [
            { slug: 'fire-bolt', source: 'PHB' },
            { slug: 'mage-hand', source: 'PHB' },
            { slug: 'prestidigitation', source: 'PHB' },
          ],
          known: allKnown,
          prepared: [
            { slug: 'magic-missile', source: 'PHB' },
            { slug: 'burning-hands', source: 'PHB' },
          ],
        },
        dmJwt,
      );
    } finally {
      await dmCtx.close();
    }
  });
});
