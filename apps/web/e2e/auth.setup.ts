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
  // Named after its class, as the four below are. The level-up specs find the
  // character they want with `text=/fighter/i` against the sheet, and this one was
  // called "— Active": Monk, Cleric and Wizard were being matched on their names,
  // not on any class badge, so the Fighter alone went undiscovered and its spec
  // skipped reporting that no Fighter existed while this one sat in the roster.
  const E2E_ACTIVE_CHARACTER_NAME = 'E2E Setup Fixture — Fighter';

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

    // A character with no XP shows no "Subir nivel", which is what level-up.auth
    // and level-up-features.auth reported as "not eligible" before skipping.
    // 300 is the PHB p.15 threshold for level 2. This sits inside the creation
    // branch so it is awarded once, alongside the character it belongs to.
    const xpRes = await fetch(`${API_URL}/api/v1/characters/${charId}/xp`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ award: 300 }),
    });
    if (!xpRes.ok) {
      throw new Error(`Character xp award failed: ${xpRes.status} ${await xpRes.text()}`);
    }
  }

  //  3b. The rest of the roster those specs need.
  //
  //     Several specs went looking for a character of a particular shape and, not
  //     finding one, skipped themselves with a note telling the reader to run a
  //     sibling spec first — "Run wizard-caster.auth.spec.ts first", and so on.
  //     That makes one spec's coverage depend on another spec's side effect and on
  //     Playwright's alphabetical order, so the level-up specs skipped on any run
  //     that did not happen to include their wizard counterpart. Others pointed at
  //     `db:seed:e2e`, which provisions dm@dh.test and player1..3@dh.test for the
  //     'journeys' project and never touches this user at all.
  //
  //     The preconditions belong here, next to the world and the active character
  //     that step 3 already owns for exactly this reason.
  const api = async (method: string, path: string, body?: unknown) => {
    const res = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!res.ok) {
      throw new Error(`${method} ${path} failed: ${res.status} ${await res.text()}`);
    }
    return res.status === 204 ? null : await res.json().catch(() => null);
  };

  const rosterRes = await fetch(`${API_URL}/api/v1/characters`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!rosterRes.ok) {
    throw new Error(`Character list failed: ${rosterRes.status} ${await rosterRes.text()}`);
  }
  const roster = (await rosterRes.json()) as {
    data: Array<{ id: string; name: string; worldId: string; status: string }>;
  };

  /**
   * Build one character and leave it in `status`, unless a character of that name
   * already exists in this world — the whole setup is re-run against a database
   * that may already hold it.
   *
   * The class payloads are the ones apps/api/scripts/seed-e2e-fixture.ts already
   * proves against this API, skill picks included: they are chosen not to collide
   * with the background's fixed skills, which the domain rejects.
   */
  async function ensureCharacter(opts: {
    name: string;
    status: 'pending_approval' | 'active';
    /** Runs after the character exists, before it is submitted. */
    build: (charId: string) => Promise<void>;
    /** Granted once, after approval — a character with no XP shows no "Subir nivel". */
    xp?: number;
    /** Override the default spread — a prepared caster needs its casting stat. */
    scores?: Record<string, number>;
  }): Promise<void> {
    if (roster.data?.some((c) => c.worldId === worldId && c.name === opts.name)) return;

    const created = (await api('POST', '/api/v1/characters', {
      worldId,
      name: opts.name,
    })) as { id: string };
    const id = created.id;

    await api('PUT', `/api/v1/characters/${id}/stats`, {
      method: 'standard-array',
      scores: opts.scores ?? { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 },
    });
    await opts.build(id);
    await api('PATCH', `/api/v1/characters/${id}`, { status: 'pending_approval' });

    if (opts.status === 'active') {
      // This user is the world's GM, so self-approval is authorized.
      await api('POST', `/api/v1/characters/${id}/approve`);
      if (opts.xp) await api('POST', `/api/v1/characters/${id}/xp`, { award: opts.xp });
    }
  }

  // A Wizard L1 — level-up-subclass and level-up-wizard-spellbook both look for one
  // and both skipped without it. 300 XP is the PHB p.15 threshold for level 2, which
  // is what makes the "Subir nivel" affordance render.
  await ensureCharacter({
    name: 'E2E Setup Fixture — Wizard',
    status: 'active',
    xp: 300,
    build: async (id) => {
      await api('PUT', `/api/v1/characters/${id}/race`, {
        race: { slug: 'human', source: 'PHB' },
        languageChoices: ['elvish'],
      });
      await api('PUT', `/api/v1/characters/${id}/class`, {
        class: { slug: 'wizard', source: 'PHB' },
        level: 1,
        skillChoices: ['insight', 'religion'],
      });
      await api('PUT', `/api/v1/characters/${id}/background`, {
        background: { slug: 'sage', source: 'PHB' },
        languageChoices: ['draconic', 'dwarvish'],
      });
      await api('PUT', `/api/v1/characters/${id}/classes/wizard/spells`, {
        cantrips: [
          { slug: 'fire-bolt', source: 'PHB' },
          { slug: 'mage-hand', source: 'PHB' },
          { slug: 'prestidigitation', source: 'PHB' },
        ],
        known: [
          { slug: 'magic-missile', source: 'PHB' },
          { slug: 'shield', source: 'PHB' },
          { slug: 'burning-hands', source: 'PHB' },
          { slug: 'charm-person', source: 'PHB' },
          { slug: 'sleep', source: 'PHB' },
          { slug: 'thunderwave', source: 'PHB' },
        ],
      });
    },
  });

  // A Monk — level-up-monk-ki looks for one. No spell step: monks are not casters.
  // Acrobatics + stealth come from the Monk pool (PHB p.78) and stay clear of the
  // athletics + intimidation the Soldier background grants outright, which the
  // domain rejects as a duplicate pick.
  await ensureCharacter({
    name: 'E2E Setup Fixture — Monk',
    status: 'active',
    xp: 300,
    build: async (id) => {
      await api('PUT', `/api/v1/characters/${id}/race`, {
        race: { slug: 'human', source: 'PHB' },
        languageChoices: ['elvish'],
      });
      await api('PUT', `/api/v1/characters/${id}/class`, {
        class: { slug: 'monk', source: 'PHB' },
        level: 1,
        skillChoices: ['acrobatics', 'stealth'],
      });
      await api('PUT', `/api/v1/characters/${id}/background`, {
        background: { slug: 'soldier', source: 'PHB' },
        skillChoices: [],
        toolChoices: { anyGamingSet: ['dice-set'] },
      });
    },
  });

  // A Cleric — level-up-spells asserts a prepared caster gains no spells step at L2.
  // The payload is the one apps/api/tests/integration/character-sheet.test.ts proves:
  // clerics take `prepared`, not the `known` a spellbook caster takes, and they choose
  // their domain at level 1, so the subclass belongs in this same call.
  await ensureCharacter({
    name: 'E2E Setup Fixture — Cleric',
    status: 'active',
    xp: 300,
    // Wisdom first. How many spells a cleric may prepare is its Wisdom modifier plus
    // its level (PHB p.58), so the default spread — Wisdom 10, modifier 0 — allows
    // exactly one, and the API refused the second with PREPARED_LIMIT_EXCEEDED.
    scores: { wis: 15, con: 14, str: 13, cha: 12, dex: 10, int: 8 },
    build: async (id) => {
      await api('PUT', `/api/v1/characters/${id}/race`, {
        race: { slug: 'human', source: 'PHB' },
        languageChoices: ['elvish'],
      });
      await api('PUT', `/api/v1/characters/${id}/class`, {
        class: { slug: 'cleric', source: 'PHB' },
        level: 1,
        skillChoices: ['medicine', 'insight'],
        subclass: { slug: 'cleric--life', source: 'PHB' },
      });
      await api('PUT', `/api/v1/characters/${id}/background`, {
        background: { slug: 'soldier', source: 'PHB' },
        skillChoices: [],
        toolChoices: { anyGamingSet: ['dice-set'] },
      });
      await api('PUT', `/api/v1/characters/${id}/classes/cleric/spells`, {
        cantrips: [
          { slug: 'sacred-flame', source: 'PHB' },
          { slug: 'guidance', source: 'PHB' },
          { slug: 'light', source: 'PHB' },
        ],
        prepared: [
          { slug: 'cure-wounds', source: 'PHB' },
          { slug: 'bless', source: 'PHB' },
        ],
      });
    },
  });

  // A Bard — the other half of level-up-spells, which wants a caster that DOES gain a
  // spells step. Bards know their spells rather than preparing them, so this takes the
  // `known` shape the wizard above takes. PHB p.52: 2 cantrips and 4 spells at level 1,
  // and the class picks any three skills, so these avoid the Soldier's two.
  await ensureCharacter({
    name: 'E2E Setup Fixture — Bard',
    status: 'active',
    xp: 300,
    build: async (id) => {
      await api('PUT', `/api/v1/characters/${id}/race`, {
        race: { slug: 'human', source: 'PHB' },
        languageChoices: ['elvish'],
      });
      await api('PUT', `/api/v1/characters/${id}/class`, {
        class: { slug: 'bard', source: 'PHB' },
        level: 1,
        skillChoices: ['persuasion', 'perception', 'deception'],
      });
      await api('PUT', `/api/v1/characters/${id}/background`, {
        background: { slug: 'soldier', source: 'PHB' },
        skillChoices: [],
        toolChoices: { anyGamingSet: ['dice-set'] },
      });
      await api('PUT', `/api/v1/characters/${id}/classes/bard/spells`, {
        cantrips: [
          { slug: 'vicious-mockery', source: 'PHB' },
          { slug: 'mage-hand', source: 'PHB' },
        ],
        known: [
          { slug: 'cure-wounds', source: 'PHB' },
          { slug: 'charm-person', source: 'PHB' },
          { slug: 'healing-word', source: 'PHB' },
          { slug: 'thunderwave', source: 'PHB' },
        ],
      });
    },
  });

  // A Barbarian, reserved for level-up.auth. That spec walks the plain same-class
  // average-HP flow, so it needs a character that reaches the confirm step without
  // detouring: barbarians take no spells, choose their path at level 3 and their
  // first ability score improvement at level 4, so levelling one to 2 asks nothing
  // extra. No sibling spec looks for a barbarian, so this one is still unspent by
  // the time level-up.auth runs last.
  await ensureCharacter({
    name: 'E2E Setup Fixture — Barbarian',
    status: 'active',
    xp: 300,
    build: async (id) => {
      await api('PUT', `/api/v1/characters/${id}/race`, {
        race: { slug: 'human', source: 'PHB' },
        languageChoices: ['elvish'],
      });
      await api('PUT', `/api/v1/characters/${id}/class`, {
        class: { slug: 'barbarian', source: 'PHB' },
        level: 1,
        skillChoices: ['perception', 'survival'],
      });
      await api('PUT', `/api/v1/characters/${id}/background`, {
        background: { slug: 'soldier', source: 'PHB' },
        skillChoices: [],
        toolChoices: { anyGamingSet: ['dice-set'] },
      });
    },
  });

  // A character left awaiting approval — approval-transition-mobile needs one and
  // told the reader to run wizard.auth.spec.ts to produce it.
  await ensureCharacter({
    name: 'E2E Setup Fixture — Pending',
    status: 'pending_approval',
    build: async (id) => {
      await api('PUT', `/api/v1/characters/${id}/race`, {
        race: { slug: 'human', source: 'PHB' },
        languageChoices: ['elvish'],
      });
      await api('PUT', `/api/v1/characters/${id}/class`, {
        class: { slug: 'fighter', source: 'PHB' },
        level: 1,
        skillChoices: ['acrobatics', 'survival'],
      });
      await api('PUT', `/api/v1/characters/${id}/background`, {
        background: { slug: 'soldier', source: 'PHB' },
        skillChoices: [],
        toolChoices: { anyGamingSet: ['dice-set'] },
      });
    },
  });

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
