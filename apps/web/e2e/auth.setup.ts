import { test as setup, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import path from 'node:path';

const AUTH_FILE = path.join(__dirname, '.auth/user.json');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const TEST_EMAIL = process.env.TEST_USER_EMAIL ?? 'e2e@dungeon-hub.test';
const TEST_PASSWORD = process.env.TEST_USER_PASSWORD ?? 'e2e-test-pass-1234';

setup('ensure test user + sign in + save state', async ({ page }) => {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SERVICE_ROLE_KEY) {
    throw new Error(
      'Missing env vars. Need NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY in apps/web/.env.local',
    );
  }

  // 1. Crear/sync test user via admin (idempotente)
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Walk all pages of listUsers — default page size is 50 and the local
  // Supabase instance can accumulate plenty of test users.
  async function findExisting() {
    for (let page = 1; page < 50; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw new Error(`listUsers failed: ${error.message}`);
      const hit = data.users.find((u) => u.email === TEST_EMAIL);
      if (hit) return hit;
      if (data.users.length < 200) return null;
    }
    return null;
  }

  let existing = await findExisting();

  if (!existing) {
    const { error } = await admin.auth.admin.createUser({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      email_confirm: true,
    });
    if (error) {
      // Race: another setup run may have created the user between findExisting
      // and createUser. Re-fetch and fall through to the update path.
      existing = await findExisting();
      if (!existing) throw new Error(`Failed to create test user: ${error.message}`);
    }
  }

  if (existing) {
    const { error } = await admin.auth.admin.updateUserById(existing.id, {
      password: TEST_PASSWORD,
    });
    if (error) throw new Error(`Failed to update test user password: ${error.message}`);
  }

  // 2. Sign in via supabase-js (Node-side) para obtener access_token y poder
  //    llamar al API REST directamente desde el setup.
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: signIn, error: signInError } = await supabase.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });
  if (signInError || !signIn.session) {
    throw new Error(`Sign-in failed: ${signInError?.message ?? 'no session'}`);
  }
  const accessToken = signIn.session.access_token;

  // 3. Asegurar que existe la fixture de worlds-foundation:
  //    - 'E2E Test Campaign (World)' — world para el picker del wizard (creado
  //      automáticamente cuando se crea 'E2E Test Campaign' via POST /campaigns).
  //    - 'E2E Test Campaign' — campaign bajo ese world (para sesiones, etc.).
  //
  //    Chequeo de idempotencia: GET /worlds?mine=1. Si el world ya existe el
  //    /campaigns ya fue creado; no se vuelve a crear.
  const worldsRes = await fetch(`${API_URL}/api/v1/worlds?mine=1`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const worldsJson = (await worldsRes.json()) as { worlds: Array<{ id: string; name: string }> };
  const existingWorld = worldsJson.worlds?.find((w) => w.name === 'E2E Test Campaign (World)');
  let worldId: string;
  if (existingWorld) {
    worldId = existingWorld.id;
  } else {
    // POST /campaigns crea el world 'E2E Test Campaign (World)' + campaign
    // 'E2E Test Campaign' atómicamente, y agrega al user como gm worldMember.
    const createRes = await fetch(`${API_URL}/api/v1/campaigns`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'E2E Test Campaign' }),
    });
    if (!createRes.ok) {
      throw new Error(`Campaign create failed: ${createRes.status} ${await createRes.text()}`);
    }
    const created = (await createRes.json()) as { worldId: string };
    worldId = created.worldId;
  }

  // 3b. Ensure this user has an ACTIVE character in that world.
  //
  //     session-player-join-leave.auth.spec.ts (and any other spec that needs
  //     a playable character) used to rely on wizard.auth.spec.ts's side
  //     effect: the wizard leaves a pending_approval character behind, which
  //     that spec's own beforeAll then approves. Playwright runs spec files
  //     alphabetically, and 'session-*' sorts before 'wizard-*', so on a
  //     fresh database the character never existed yet and the spec failed
  //     unconditionally. Own that precondition here instead, the same way
  //     step 3 owns the world/campaign precondition.
  //
  //     Idempotency check (GET /api/v1/characters, like step 3's
  //     GET /worlds?mine=1): skip entirely if an active character already
  //     exists in this world. If a pending_approval one exists instead,
  //     approve it rather than creating a duplicate — this user is the
  //     world's GM, so POST /characters/:id/approve is authorized; that is
  //     exactly what session-player-join-leave.auth.spec.ts's beforeAll does.
  //     Otherwise build one from scratch, reusing the exact call sequence
  //     apps/api/scripts/seed-e2e-fixture.ts's buildFighterCharacter() makes
  //     (create → stats → race → class → background → submit → approve).
  const E2E_ACTIVE_CHARACTER_NAME = 'E2E Setup Fixture — Active';

  const charsRes = await fetch(`${API_URL}/api/v1/characters`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!charsRes.ok) {
    throw new Error(`Character list failed: ${charsRes.status} ${await charsRes.text()}`);
  }
  const charsJson = (await charsRes.json()) as {
    data: Array<{ id: string; name: string; worldId: string; status: string }>;
  };
  const hasActiveChar = charsJson.data?.some(
    (c) => c.worldId === worldId && c.status === 'active',
  );

  if (!hasActiveChar) {
    const pendingChar = charsJson.data?.find(
      (c) => c.worldId === worldId && c.status === 'pending_approval',
    );

    let charId: string;
    if (pendingChar) {
      charId = pendingChar.id;
    } else {
      // 1. Create
      const createCharRes = await fetch(`${API_URL}/api/v1/characters`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ worldId, name: E2E_ACTIVE_CHARACTER_NAME }),
      });
      if (!createCharRes.ok) {
        throw new Error(
          `Character create failed: ${createCharRes.status} ${await createCharRes.text()}`,
        );
      }
      const createdChar = (await createCharRes.json()) as { id: string };
      charId = createdChar.id;

      // 2. Stats
      const statsRes = await fetch(`${API_URL}/api/v1/characters/${charId}/stats`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          method: 'standard-array',
          scores: { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 },
        }),
      });
      if (!statsRes.ok) {
        throw new Error(`Character stats failed: ${statsRes.status} ${await statsRes.text()}`);
      }

      // 3. Race (human PHB — fixed +1 to all 6 abilities; PHB p.30 requires 1 language choice).
      const raceRes = await fetch(`${API_URL}/api/v1/characters/${charId}/race`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          race: { slug: 'human', source: 'PHB' },
          languageChoices: ['elvish'],
        }),
      });
      if (!raceRes.ok) {
        throw new Error(`Character race failed: ${raceRes.status} ${await raceRes.text()}`);
      }

      // 4. Class (Fighter — non-caster, no spells required). Soldier background has FIXED
      //    skills (athletics + intimidation), so the Fighter picks must not overlap
      //    (acrobatics + survival, PHB Fighter pool, PHB p.72).
      const classRes = await fetch(`${API_URL}/api/v1/characters/${charId}/class`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          class: { slug: 'fighter', source: 'PHB' },
          level: 1,
          skillChoices: ['acrobatics', 'survival'],
        }),
      });
      if (!classRes.ok) {
        throw new Error(`Character class failed: ${classRes.status} ${await classRes.text()}`);
      }

      // 5. Background (soldier — no language/tool slot ambiguity; fixed skills
      //    athletics + intimidation are granted automatically, PHB p.140).
      const backgroundRes = await fetch(`${API_URL}/api/v1/characters/${charId}/background`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          background: { slug: 'soldier', source: 'PHB' },
          skillChoices: [],
          toolChoices: { anyGamingSet: ['dice-set'] },
        }),
      });
      if (!backgroundRes.ok) {
        throw new Error(
          `Character background failed: ${backgroundRes.status} ${await backgroundRes.text()}`,
        );
      }

      // 6. Submit for approval
      const submitRes = await fetch(`${API_URL}/api/v1/characters/${charId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'pending_approval' }),
      });
      if (!submitRes.ok) {
        throw new Error(`Character submit failed: ${submitRes.status} ${await submitRes.text()}`);
      }
    }

    // 7. Approve (this user is the world's GM, so self-approval is authorized).
    const approveRes = await fetch(`${API_URL}/api/v1/characters/${charId}/approve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!approveRes.ok) {
      throw new Error(`Character approve failed: ${approveRes.status} ${await approveRes.text()}`);
    }
  }

  // 4. Browser-side login via /api/dev/login — esto setea las cookies de
  //    @supabase/ssr para que el resto de la app (server components) vea la
  //    sesión cuando Playwright navega.
  await page.goto('/');
  const loginRes = await page.request.post('/api/dev/login', {
    data: { email: TEST_EMAIL, password: TEST_PASSWORD },
  });
  expect(loginRes.status(), `dev/login failed: ${await loginRes.text()}`).toBe(200);

  // 5. Verificar auth visitando /inicio — la URL /inicio confirma que la shell v3
  //    rendereó correctamente (el role pill puede ser "Jugador" o "DM" según el
  //    callerRole del mundo activo; Slice 3 hace que los GMs vean "DM" por defecto).
  await page.goto('/inicio');
  await expect(page).toHaveURL(/\/inicio$/, { timeout: 5000 });
  // Wait for the TopBar to be visible (proxy for successful shell render).
  await expect(page.locator('header').first()).toBeVisible({ timeout: 5000 });

  // 6. Guardar storage state
  await page.context().storageState({ path: AUTH_FILE });
});
