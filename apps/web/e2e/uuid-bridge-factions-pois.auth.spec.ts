import { test, expect } from '@playwright/test';
import { resolveAccessToken } from './helpers/resolve-access-token';

/**
 * E2E — uuid-bridge-factions-pois Wave 5b auth spec @ 375px (iPhone SE)
 *
 * Covers the faction and POI knowledge bridge end-to-end:
 *   Spec A (GRANT→SEE): DM grants faction → player sees it in Conocidos (Facciones section).
 *   Spec B (dmNotes ABSENCE — SECURITY-CRITICAL): player DOM must NOT contain faction dmNotes.
 *   Spec C (REF ROUND-TRIP): player creates bitácora page with faction ref → reload → faction card visible.
 *   Spec D (CASCADE-OVERRIDE): DM grants POI on unexplored hex → player sees it in Conocidos.
 *   Spec E (parentHexStatus ABSENCE — SECURITY-CRITICAL): parentHexStatus never in player DOM.
 *
 * REQ-UBFP-E2E, REQ-UBFP-GRANT, REQ-UBFP-CONOCIDOS, REQ-UBFP-SECURITY, REQ-UBFP-BITACORA.
 * uuid-bridge-factions-pois SDD spec #2011, design #2012 ADR-7, tasks #2013 Phase 4.
 *
 * Pre-requisites:
 *   - Stack running (see apps/web/e2e/README.md).
 *   - Auth test user (auth.setup.ts) owns an active character and is GM of its world.
 *
 * Mobile-first: 375px viewport. ADR-7.
 */

const MOBILE = { width: 375, height: 812 };
const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/** Sentinel values that MUST NOT appear in player DOM — Spec B + Spec E. */
const FACTION_DM_NOTES_SENTINEL = 'E2E-FACTION-DMNOTES-MUST-NOT-LEAK-uuid-bridge-factions-pois';
const POI_DM_NOTES_SENTINEL = 'E2E-POI-DMNOTES-MUST-NOT-LEAK-uuid-bridge-factions-pois';
const PARENT_HEX_STATUS_SENTINEL = 'E2E-PARENTHEXSTATUS-MUST-NOT-LEAK-uuid-bridge-factions-pois';

test.use({ viewport: MOBILE });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getAccessToken(page: import('@playwright/test').Page): Promise<string | null> {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  return resolveAccessToken(page);
}

async function resolveCharacterId(
  request: import('@playwright/test').APIRequestContext,
  accessToken: string,
): Promise<{ characterId: string; worldId: string } | null> {
  const res = await request.get(`${API}/api/v1/characters`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok()) return null;
  const data = await res.json() as { data?: Array<{ id: string; status: string; worldId: string }> };
  const active = (data.data ?? []).find((c) => c.status === 'active');
  if (!active) return null;
  return { characterId: active.id, worldId: active.worldId };
}

async function createTestFaction(
  request: import('@playwright/test').APIRequestContext,
  accessToken: string,
  worldId: string,
  opts: { name: string; dmNotes?: string },
): Promise<string | null> {
  const res = await request.post(`${API}/api/v1/worlds/${worldId}/factions`, {
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    data: {
      name: opts.name,
      description: `Test Faction: ${opts.name}`,
      state: 'active',
      ...(opts.dmNotes ? { dmNotes: opts.dmNotes } : {}),
    },
  });
  if (!res.ok()) return null;
  return (await res.json() as { id: string }).id;
}

async function createTestPoi(
  request: import('@playwright/test').APIRequestContext,
  accessToken: string,
  worldId: string,
  opts: { name: string; dmNotes?: string },
): Promise<string | null> {
  const res = await request.post(`${API}/api/v1/worlds/${worldId}/pois`, {
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    data: {
      name: opts.name,
      description: `Test POI: ${opts.name}`,
      status: 'unknown',
      ...(opts.dmNotes ? { dmNotes: opts.dmNotes } : {}),
    },
  });
  if (!res.ok()) return null;
  return (await res.json() as { id: string }).id;
}

async function grantKnowledge(
  request: import('@playwright/test').APIRequestContext,
  accessToken: string,
  characterId: string,
  kind: 'faction' | 'location',
  refKey: string,
): Promise<boolean> {
  const res = await request.post(`${API}/api/v1/characters/${characterId}/knowledge`, {
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    data: { kind, refKey, refSource: 'world' },
  });
  return res.ok();
}

// ---------------------------------------------------------------------------
// Spec A: DM grants faction → player sees in Conocidos Facciones section
// ---------------------------------------------------------------------------

test(
  'Spec A — DM grants faction → player sees it in Conocidos Facciones section, ungranted absent',
  async ({ page, request }) => {
    const accessToken = await getAccessToken(page);
    if (!accessToken) {
      test.skip(true, 'Could not resolve access token');
      return;
    }

    const ids = await resolveCharacterId(request, accessToken);
    if (!ids) {
      test.skip(true, 'No active character found');
      return;
    }

    const { characterId, worldId } = ids;

    // Create two factions: one granted, one not
    const grantedFactionName = `GrantedFaction-${Date.now()}`;
    const ungrantedFactionName = `UngrantedFaction-${Date.now()}`;

    const grantedFactionId = await createTestFaction(request, accessToken, worldId, { name: grantedFactionName });
    if (!grantedFactionId) {
      test.skip(true, 'Could not create test faction');
      return;
    }

    await createTestFaction(request, accessToken, worldId, { name: ungrantedFactionName });

    // Grant the first faction
    const granted = await grantKnowledge(request, accessToken, characterId, 'faction', grantedFactionId);
    expect(granted).toBe(true);

    // Navigate to Conocidos sub-view
    await page.goto(
      `/characters/${characterId}?tab=notas&sub=conocidos`,
      { waitUntil: 'networkidle', timeout: 60_000 },
    );
    await expect(page).toHaveURL(/tab=notas/, { timeout: 15_000 });

    // Facciones section header visible
    await expect(page.getByText('Facciones')).toBeVisible({ timeout: 10_000 });

    // Granted faction must appear
    await expect(page.getByText(grantedFactionName)).toBeVisible({ timeout: 10_000 });

    // Ungranted faction must NOT appear
    const ungrantedEl = page.getByText(ungrantedFactionName);
    const ungrantedCount = await ungrantedEl.count();
    expect(ungrantedCount, 'Ungranted faction must not appear in player Conocidos').toBe(0);
  },
);

// ---------------------------------------------------------------------------
// Spec B: dmNotes ABSENCE — SECURITY-CRITICAL (faction)
// ---------------------------------------------------------------------------

test(
  'Spec B (SECURITY) — player DOM does NOT contain faction dmNotes text in Conocidos or detail',
  async ({ page, request }) => {
    const accessToken = await getAccessToken(page);
    if (!accessToken) {
      test.skip(true, 'Could not resolve access token');
      return;
    }

    const ids = await resolveCharacterId(request, accessToken);
    if (!ids) {
      test.skip(true, 'No active character found');
      return;
    }

    const { characterId, worldId } = ids;

    // Create a faction with a known dmNotes sentinel value
    const secTestFactionName = `SecurityFaction-${Date.now()}`;
    const factionId = await createTestFaction(request, accessToken, worldId, {
      name: secTestFactionName,
      dmNotes: FACTION_DM_NOTES_SENTINEL,
    });
    if (!factionId) {
      test.skip(true, 'Could not create security test faction');
      return;
    }

    // Grant it to the character
    const granted = await grantKnowledge(request, accessToken, characterId, 'faction', factionId);
    expect(granted).toBe(true);

    // Navigate to Conocidos as player
    await page.goto(
      `/characters/${characterId}?tab=notas&sub=conocidos`,
      { waitUntil: 'networkidle', timeout: 60_000 },
    );
    await expect(page).toHaveURL(/tab=notas/, { timeout: 15_000 });

    // Faction name visible — confirms it was granted and appears
    await expect(page.getByText(secTestFactionName)).toBeVisible({ timeout: 10_000 });

    // SECURITY ASSERTION: dmNotes sentinel must NOT appear anywhere in the page body
    await expect(page.locator('body')).not.toContainText(FACTION_DM_NOTES_SENTINEL);

    // Tap the faction row to open detail view and assert absence there too
    await page.getByText(secTestFactionName).click();

    // Wait for detail view to render
    await expect(page.getByText('Mis notas')).toBeVisible({ timeout: 5_000 });

    // dmNotes still absent from player detail view
    await expect(page.locator('body')).not.toContainText(FACTION_DM_NOTES_SENTINEL);
  },
);

// ---------------------------------------------------------------------------
// Spec C: Bitácora faction ref round-trip
// ---------------------------------------------------------------------------

test(
  'Spec C — player creates bitácora page with faction ref → reload → faction card visible, dmNotes absent',
  async ({ page, request }) => {
    const accessToken = await getAccessToken(page);
    if (!accessToken) {
      test.skip(true, 'Could not resolve access token');
      return;
    }

    const ids = await resolveCharacterId(request, accessToken);
    if (!ids) {
      test.skip(true, 'No active character found');
      return;
    }

    const { characterId, worldId } = ids;

    // Create and grant a test faction
    const roundTripFactionName = `RoundTripFaction-${Date.now()}`;
    const factionId = await createTestFaction(request, accessToken, worldId, {
      name: roundTripFactionName,
      dmNotes: FACTION_DM_NOTES_SENTINEL,
    });
    if (!factionId) {
      test.skip(true, 'Could not create round-trip faction');
      return;
    }

    const granted = await grantKnowledge(request, accessToken, characterId, 'faction', factionId);
    expect(granted).toBe(true);

    // Navigate to Páginas sub-view
    await page.goto(
      `/characters/${characterId}?tab=notas&sub=paginas`,
      { waitUntil: 'networkidle', timeout: 60_000 },
    );
    await expect(page).toHaveURL(/tab=notas/, { timeout: 15_000 });

    // Open the composer
    await page.getByRole('button', { name: 'Nueva página' }).click();

    // Wait for composer sheet to open
    await expect(page.getByText('Nueva página').last()).toBeVisible({ timeout: 5_000 });

    // Fill body
    const pageBody = `Notas sobre la facción ${roundTripFactionName}`;
    await page.getByRole('textbox', { name: /Notas/i }).fill(pageBody);

    // Switch to Facción kind pill. exact:true scopes to the <button>Facción</button>
    // pill, not page-list cards whose body ("Notas sobre la facción ...") also matches.
    const factionPill = page.getByRole('button', { name: 'Facción', exact: true });
    if (await factionPill.count() > 0) {
      await factionPill.click();
    }

    // Select the faction in the picker
    const factionSelect = page.locator('#bp-ref-faction');
    if (await factionSelect.count() > 0) {
      await factionSelect.selectOption({ label: roundTripFactionName });
    }

    // Submit
    await page.getByRole('button', { name: 'Crear página' }).click();

    // Wait for page reload (Server Action revalidates)
    await page.waitForLoadState('networkidle', { timeout: 30_000 });

    // The created page should appear in the list — full pageBody (includes timestamp)
    // avoids strict-mode violations from pages accumulated across runs.
    await expect(page.getByRole('button', { name: pageBody })).toBeVisible({ timeout: 10_000 });

    // Open the page detail
    await page.getByRole('button', { name: pageBody }).click();

    // Faction name card must be visible in detail view.
    // exact:true scopes to the linked-entity card <p>name</p>, not the page body
    // ("Notas sobre la facción {name}") which also contains the name.
    await expect(page.getByText(roundTripFactionName, { exact: true })).toBeVisible({ timeout: 5_000 });

    // SECURITY: dmNotes sentinel absent from page detail DOM
    await expect(page.locator('body')).not.toContainText(FACTION_DM_NOTES_SENTINEL);
  },
);

// ---------------------------------------------------------------------------
// Spec D: DM grants POI on unexplored hex → cascade-override → player sees it
// ---------------------------------------------------------------------------

test(
  'Spec D (CASCADE-OVERRIDE) — DM grants POI on unexplored hex → player sees it in Conocidos Lugares section',
  async ({ page, request }) => {
    const accessToken = await getAccessToken(page);
    if (!accessToken) {
      test.skip(true, 'Could not resolve access token');
      return;
    }

    const ids = await resolveCharacterId(request, accessToken);
    if (!ids) {
      test.skip(true, 'No active character found');
      return;
    }

    const { characterId, worldId } = ids;

    // Create a POI (status='hidden' — simulates unexplored hex; DM grant overrides cascade)
    const cascadePOIName = `CascadePOI-${Date.now()}`;
    const poiId = await createTestPoi(request, accessToken, worldId, { name: cascadePOIName });
    if (!poiId) {
      test.skip(true, 'Could not create cascade POI');
      return;
    }

    // Grant the POI (known-set is sole gate — cascade does NOT block)
    const granted = await grantKnowledge(request, accessToken, characterId, 'location', poiId);
    expect(granted).toBe(true);

    // Navigate to Conocidos sub-view
    await page.goto(
      `/characters/${characterId}?tab=notas&sub=conocidos`,
      { waitUntil: 'networkidle', timeout: 60_000 },
    );
    await expect(page).toHaveURL(/tab=notas/, { timeout: 15_000 });

    // Lugares section header visible
    await expect(page.getByText('Lugares')).toBeVisible({ timeout: 10_000 });

    // Granted POI must appear despite hidden/unexplored status
    await expect(page.getByText(cascadePOIName)).toBeVisible({ timeout: 10_000 });
  },
);

// ---------------------------------------------------------------------------
// Spec E: parentHexStatus ABSENCE — SECURITY-CRITICAL (POI)
// ---------------------------------------------------------------------------

test(
  'Spec E (SECURITY) — player DOM does NOT contain parentHexStatus or POI dmNotes in Conocidos or detail',
  async ({ page, request }) => {
    const accessToken = await getAccessToken(page);
    if (!accessToken) {
      test.skip(true, 'Could not resolve access token');
      return;
    }

    const ids = await resolveCharacterId(request, accessToken);
    if (!ids) {
      test.skip(true, 'No active character found');
      return;
    }

    const { characterId, worldId } = ids;

    // Create a POI with a known dmNotes sentinel value
    const secTestPOIName = `SecurityPOI-${Date.now()}`;
    const poiId = await createTestPoi(request, accessToken, worldId, {
      name: secTestPOIName,
      dmNotes: POI_DM_NOTES_SENTINEL,
    });
    if (!poiId) {
      test.skip(true, 'Could not create security test POI');
      return;
    }

    // Grant it to the character
    const granted = await grantKnowledge(request, accessToken, characterId, 'location', poiId);
    expect(granted).toBe(true);

    // Navigate to Conocidos as player
    await page.goto(
      `/characters/${characterId}?tab=notas&sub=conocidos`,
      { waitUntil: 'networkidle', timeout: 60_000 },
    );
    await expect(page).toHaveURL(/tab=notas/, { timeout: 15_000 });

    // POI name visible — confirms it was granted and appears
    await expect(page.getByText(secTestPOIName)).toBeVisible({ timeout: 10_000 });

    // SECURITY ASSERTION 1: dmNotes sentinel must NOT appear anywhere in the page body
    await expect(page.locator('body')).not.toContainText(POI_DM_NOTES_SENTINEL);

    // SECURITY ASSERTION 2: parentHexStatus sentinel must NOT appear
    // (parentHexStatus is stripped by stripParentHexStatus in readLocationsKind — ADR-1b, C10)
    await expect(page.locator('body')).not.toContainText(PARENT_HEX_STATUS_SENTINEL);

    // Tap the POI row to open detail view and assert absence there too
    await page.getByText(secTestPOIName).click();

    // Wait for detail view to render
    await expect(page.getByText('Mis notas')).toBeVisible({ timeout: 5_000 });

    // Both sentinels still absent from player detail view
    await expect(page.locator('body')).not.toContainText(POI_DM_NOTES_SENTINEL);
    await expect(page.locator('body')).not.toContainText(PARENT_HEX_STATUS_SENTINEL);
  },
);
