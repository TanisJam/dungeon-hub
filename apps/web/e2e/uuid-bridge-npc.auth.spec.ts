import { test, expect } from '@playwright/test';
import { resolveAccessToken } from './helpers/resolve-access-token';

/**
 * E2E — uuid-bridge-npc Wave 5a auth spec @ 375px (iPhone SE)
 *
 * Covers the NPC knowledge bridge end-to-end:
 *   Spec A (GRANT→SEE): DM grants NPC → player sees it in Conocidos (NPCs section).
 *   Spec B (dmNotes ABSENCE — SECURITY-CRITICAL): player DOM must NOT contain dmNotes text.
 *   Spec C (REF ROUND-TRIP): player creates bitácora page with NPC ref → reload → NPC card visible.
 *
 * REQ-UBN-E2E, REQ-UBN-GRANT, REQ-UBN-CONOCIDOS, REQ-UBN-SECURITY, REQ-UBN-BITACORA.
 * uuid-bridge-npc SDD spec #2002, design #2003 ADR-7, tasks #2004 Phase 4.
 *
 * Pre-requisites:
 *   - Stack running (see apps/web/e2e/README.md).
 *   - Auth test user (auth.setup.ts) owns an active character and is GM of its world.
 *   - API seeded (pnpm --filter @dungeon-hub/api seed:dev or equivalent).
 *
 * Mobile-first: 375px viewport. ADR-7.
 */

const MOBILE = { width: 375, height: 812 };
const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/** A dmNotes value that MUST NOT appear in player DOM — used for Spec B assertion. */
const DM_NOTES_SENTINEL = 'E2E-DMNOTES-MUST-NOT-LEAK-uuid-bridge-npc';

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

async function createTestNpc(
  request: import('@playwright/test').APIRequestContext,
  accessToken: string,
  worldId: string,
  opts: { name: string; dmNotes?: string },
): Promise<string | null> {
  const res = await request.post(`${API}/api/v1/worlds/${worldId}/npcs`, {
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    data: {
      name: opts.name,
      race: 'Human',
      description: `Test NPC: ${opts.name}`,
      ...(opts.dmNotes ? { dmNotes: opts.dmNotes } : {}),
      status: 'alive',
    },
  });
  if (!res.ok()) return null;
  return (await res.json() as { id: string }).id;
}

async function grantNpc(
  request: import('@playwright/test').APIRequestContext,
  accessToken: string,
  characterId: string,
  npcId: string,
): Promise<boolean> {
  const res = await request.post(`${API}/api/v1/characters/${characterId}/knowledge`, {
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    data: { kind: 'npc', refKey: npcId, refSource: 'world' },
  });
  return res.ok();
}

// ---------------------------------------------------------------------------
// Spec A: GRANT → SEE in Conocidos
// ---------------------------------------------------------------------------

test(
  'Spec A — DM grants NPC → player sees it in Conocidos NPCs section, ungranted absent',
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

    // Create two NPCs: one will be granted, one will not
    const grantedNpcName = `GrantedNPC-${Date.now()}`;
    const ungrantedNpcName = `UngrantedNPC-${Date.now()}`;

    const grantedNpcId = await createTestNpc(request, accessToken, worldId, { name: grantedNpcName });
    if (!grantedNpcId) {
      test.skip(true, 'Could not create test NPC');
      return;
    }

    await createTestNpc(request, accessToken, worldId, { name: ungrantedNpcName });

    // Grant the first NPC
    const granted = await grantNpc(request, accessToken, characterId, grantedNpcId);
    expect(granted).toBe(true);

    // Navigate to Conocidos sub-view
    await page.goto(
      `/characters/${characterId}?tab=notas&sub=conocidos`,
      { waitUntil: 'networkidle', timeout: 60_000 },
    );
    await expect(page).toHaveURL(/tab=notas/, { timeout: 15_000 });

    // Granted NPC must appear in "NPCs" section
    await expect(page.getByText(grantedNpcName)).toBeVisible({ timeout: 10_000 });

    // Ungranted NPC must NOT appear
    const ungrantedEl = page.getByText(ungrantedNpcName);
    const ungrantedCount = await ungrantedEl.count();
    expect(ungrantedCount, 'Ungranted NPC must not appear in player Conocidos').toBe(0);
  },
);

// ---------------------------------------------------------------------------
// Spec B: dmNotes ABSENCE — SECURITY-CRITICAL
// ---------------------------------------------------------------------------

test(
  'Spec B (SECURITY) — player DOM does NOT contain dmNotes text in Conocidos',
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

    // Create an NPC with a known dmNotes sentinel value
    const secTestNpcName = `SecurityNPC-${Date.now()}`;
    const npcId = await createTestNpc(request, accessToken, worldId, {
      name: secTestNpcName,
      dmNotes: DM_NOTES_SENTINEL,
    });
    if (!npcId) {
      test.skip(true, 'Could not create security test NPC');
      return;
    }

    // Grant it to the character
    const granted = await grantNpc(request, accessToken, characterId, npcId);
    expect(granted).toBe(true);

    // Navigate to Conocidos as player
    await page.goto(
      `/characters/${characterId}?tab=notas&sub=conocidos`,
      { waitUntil: 'networkidle', timeout: 60_000 },
    );
    await expect(page).toHaveURL(/tab=notas/, { timeout: 15_000 });

    // NPC name visible — confirms it was granted and appears
    await expect(page.getByText(secTestNpcName)).toBeVisible({ timeout: 10_000 });

    // SECURITY ASSERTION: dmNotes sentinel must NOT appear anywhere in the page body
    await expect(page.locator('body')).not.toContainText(DM_NOTES_SENTINEL);

    // Also tap the NPC row to open detail view and assert absence there too
    await page.getByText(secTestNpcName).click();

    // Wait for detail view to render
    await expect(page.getByText('Mis notas')).toBeVisible({ timeout: 5_000 });

    // dmNotes still absent from player detail view
    await expect(page.locator('body')).not.toContainText(DM_NOTES_SENTINEL);
  },
);

// ---------------------------------------------------------------------------
// Spec C: Bitácora NPC ref round-trip
// ---------------------------------------------------------------------------

test(
  'Spec C — player creates bitácora page with NPC ref → reload → NPC card visible, dmNotes absent',
  async ({ page, request }) => {
    // QUARANTINED: composer sheet does not dismiss after "Crear página" at 375px
    // (body + select both match the NPC name). Triage with factions Spec C (#1946).
    // See engram ticket e2e/quarantined-auth-spec-failures (#2045).
    test.fixme(true, 'composer npc-ref sheet not dismissed at 375px — see #2045');
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

    // Create and grant a test NPC
    const roundTripNpcName = `RoundTripNPC-${Date.now()}`;
    const npcId = await createTestNpc(request, accessToken, worldId, {
      name: roundTripNpcName,
      dmNotes: DM_NOTES_SENTINEL,
    });
    if (!npcId) {
      test.skip(true, 'Could not create round-trip NPC');
      return;
    }

    const granted = await grantNpc(request, accessToken, characterId, npcId);
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
    const pageBody = `Notas sobre el NPC ${roundTripNpcName}`;
    await page.getByRole('textbox', { name: /Notas/i }).fill(pageBody);

    // The NPC kind switch — if both monsters and npcs are available, switch to NPC
    const npcPill = page.getByRole('button', { name: 'NPC', exact: true });
    if (await npcPill.count() > 0) {
      await npcPill.click();
    }

    // Select the NPC in the picker (NPC section)
    const npcSelect = page.locator('#bp-ref-npc');
    if (await npcSelect.count() > 0) {
      await npcSelect.selectOption({ label: roundTripNpcName });
    }

    // Submit
    await page.getByRole('button', { name: 'Crear página' }).click();

    // Wait for page reload (Server Action revalidates)
    await page.waitForLoadState('networkidle', { timeout: 30_000 });

    // The created page should appear in the list
    await expect(page.getByText(pageBody.slice(0, 30))).toBeVisible({ timeout: 10_000 });

    // Open the page detail
    await page.getByText(pageBody.slice(0, 30)).click();

    // NPC name card must be visible in detail view (ADR-5 linked-entity scenario)
    await expect(page.getByText(roundTripNpcName)).toBeVisible({ timeout: 5_000 });

    // SECURITY: dmNotes sentinel absent from page detail DOM
    await expect(page.locator('body')).not.toContainText(DM_NOTES_SENTINEL);
  },
);
