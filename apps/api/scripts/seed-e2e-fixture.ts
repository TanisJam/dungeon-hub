/**
 * seed-e2e-fixture.ts — Persistent, idempotent multi-user E2E fixture.
 *
 * Creates FIXED, REUSABLE test users + world + characters for E2E tests.
 * Safe to run multiple times: find-or-create semantics throughout.
 *
 * ┌──────────────────────────────────────────────────────────────────┐
 * │ FIXED CREDENTIALS (commit-safe; local-only Supabase)             │
 * │  DM:      dm@dh.test                                             │
 * │  Player1: player1@dh.test                                        │
 * │  Player2: player2@dh.test                                        │
 * │  Player3: player3@dh.test                                        │
 * │  Password: DungeonHub!E2E1  (or env E2E_FIXTURE_PASSWORD)        │
 * └──────────────────────────────────────────────────────────────────┘
 *
 * Characters created:
 *  player1 → "P1 Draft"    (status: draft)
 *  player1 → "P1 Pending"  (status: pending_approval)
 *  player1 → "P1 Hero"     (status: active, XP ≥ 300, gold + longsword)
 *  player2 → "P2 Mage"     (status: active, Wizard with spells)
 *  player3 → (no characters)
 *
 * Usage:
 *   pnpm --filter @dungeon-hub/api db:seed:e2e
 */
import 'dotenv/config';
import { eq, and, count } from 'drizzle-orm';

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:4000';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const E2E_PASSWORD = process.env.E2E_FIXTURE_PASSWORD ?? 'DungeonHub!E2E1';

// The campaign name used to find-or-create the shared E2E world.
const E2E_CAMPAIGN_NAME = 'E2E Fixture';
const E2E_WORLD_LABEL = `${E2E_CAMPAIGN_NAME} (World)`;

// ── Env guard ────────────────────────────────────────────────────────────────

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    '[seed-e2e] Missing env: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY are required.',
  );
  process.exit(1);
}

// ── Compendium guard (fail early if data not imported) ────────────────────────

async function assertCompendiumLoaded(): Promise<void> {
  const { db } = await import('../src/infra/db/client.js');
  const { compendiumRaces, compendiumClasses } = await import('../src/infra/db/schema.js');

  const [racesRow] = await db.select({ n: count() }).from(compendiumRaces);
  const [classesRow] = await db.select({ n: count() }).from(compendiumClasses);

  const racesCount = Number(racesRow?.n ?? 0);
  const classesCount = Number(classesRow?.n ?? 0);

  if (racesCount === 0 || classesCount === 0) {
    console.error(
      '[seed-e2e] Compendium tables are empty (races=%d, classes=%d).',
      racesCount,
      classesCount,
    );
    console.error(
      '[seed-e2e] Run: pnpm --filter @dungeon-hub/api import:5etools',
    );
    process.exit(1);
  }

  console.log(
    `[seed-e2e] Compendium OK (races=${racesCount}, classes=${classesCount}).`,
  );
}

// ── Types ────────────────────────────────────────────────────────────────────

interface FixtureUser {
  id: string;
  email: string;
  jwt: string;
}

// ── Auth helpers ─────────────────────────────────────────────────────────────

/**
 * Find-or-create a Supabase user with a fixed email + confirmed email.
 * If the user already exists (admin API returns 422 / email_exists), signs in.
 */
async function findOrCreateUser(email: string): Promise<FixtureUser> {
  // 1. Try to create via admin API.
  const createRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY!,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      password: E2E_PASSWORD,
      email_confirm: true,
      user_metadata: { username: email.split('@')[0] },
    }),
  });

  let userId: string;

  if (createRes.ok) {
    const created = (await createRes.json()) as { id: string };
    userId = created.id;
    console.log(`  [auth] created  ${email} (id: ${userId})`);
  } else {
    const body = await createRes.text();
    // 422 = user already exists — look up by listing admin users filtered by email.
    if (createRes.status === 422 || body.includes('email_exists') || body.includes('already been registered')) {
      console.log(`  [auth] exists   ${email} — signing in`);
    } else {
      throw new Error(`[auth] Failed to create ${email} (${createRes.status}): ${body}`);
    }
    // Fall through: sign in to get both access_token AND the user id.
    // We get user id from the JWT or from the sign-in response.
    userId = ''; // will be resolved from login
  }

  // 2. Sign in to get access_token (always — even for newly created users).
  const loginRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password: E2E_PASSWORD }),
  });

  if (!loginRes.ok) {
    throw new Error(`[auth] Login failed for ${email} (${loginRes.status}): ${await loginRes.text()}`);
  }

  const session = (await loginRes.json()) as { access_token: string; user: { id: string } };

  // Use userId from sign-in if we didn't get it from create (existing user path).
  if (!userId) {
    userId = session.user.id;
  }

  return { id: userId, email, jwt: session.access_token };
}

// ── API call helper ───────────────────────────────────────────────────────────

async function apiCall<T>(
  method: string,
  path: string,
  jwt: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${jwt}`,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    throw new Error(
      `${method} ${path} → ${res.status}: ${await res.text()}`,
    );
  }

  return (await res.json()) as T;
}

// ── World helpers ─────────────────────────────────────────────────────────────

/**
 * Find-or-create the shared E2E world.
 * POST /campaigns creates the world + GM membership atomically.
 * If it already exists, GET /worlds?mine=1 finds it.
 */
async function findOrCreateWorld(dmJwt: string): Promise<string> {
  const worldsRes = await apiCall<{ worlds: Array<{ id: string; name: string }> }>(
    'GET',
    '/api/v1/worlds?mine=1',
    dmJwt,
  );

  const existing = worldsRes.worlds.find((w) => w.name === E2E_WORLD_LABEL);
  if (existing) {
    console.log(`  [world] exists  "${E2E_WORLD_LABEL}" (id: ${existing.id})`);
    return existing.id;
  }

  const campaign = await apiCall<{ id: string; worldId: string }>(
    'POST',
    '/api/v1/campaigns',
    dmJwt,
    { name: E2E_CAMPAIGN_NAME },
  );

  console.log(
    `  [world] created "${E2E_WORLD_LABEL}" (worldId: ${campaign.worldId}, campaignId: ${campaign.id})`,
  );
  return campaign.worldId;
}

/**
 * Add a player to the world (idempotent via onConflictDoNothing).
 */
async function ensureWorldMember(worldId: string, userId: string): Promise<void> {
  const { addWorldMember } = await import('../tests/helpers/add-world-member.js');
  await addWorldMember(worldId, userId, 'player');
}

// ── Character helpers ─────────────────────────────────────────────────────────

/**
 * Look up characters by userId in the given world and return the matching
 * character id if a character with the given name already exists.
 */
async function findCharacterByName(
  worldId: string,
  userId: string,
  name: string,
): Promise<string | null> {
  const { db } = await import('../src/infra/db/client.js');
  const { characters } = await import('../src/infra/db/schema.js');

  const rows = await db
    .select({ id: characters.id })
    .from(characters)
    .where(
      and(
        eq(characters.worldId, worldId),
        eq(characters.userId, userId),
        eq(characters.name, name),
      ),
    )
    .limit(1);

  return rows[0]?.id ?? null;
}

/** Build a standard Fighter (non-caster) character through the API up to a given status. */
async function buildFighterCharacter(
  worldId: string,
  ownerJwt: string,
  name: string,
  targetStatus: 'draft' | 'pending_approval' | 'active',
  dmJwt?: string,
): Promise<string> {
  // 1. Create
  const created = await apiCall<{ id: string }>('POST', '/api/v1/characters', ownerJwt, {
    worldId,
    name,
  });
  const charId = created.id;

  if (targetStatus === 'draft') {
    console.log(`  [char] created  "${name}" (draft, id: ${charId})`);
    return charId;
  }

  // 2. Stats
  await apiCall('PUT', `/api/v1/characters/${charId}/stats`, ownerJwt, {
    method: 'standard-array',
    scores: { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 },
  });

  // 3. Race (human PHB — fixed +1 to all 6 abilities, purelyFixed path → appliedAsis omitted,
  //    derived automatically by the validator. PHB p.30 requires 1 language choice).
  await apiCall('PUT', `/api/v1/characters/${charId}/race`, ownerJwt, {
    race: { slug: 'human', source: 'PHB' },
    languageChoices: ['elvish'],
  });

  // 4. Class (Fighter — non-caster, no spells required)
  await apiCall('PUT', `/api/v1/characters/${charId}/class`, ownerJwt, {
    class: { slug: 'fighter', source: 'PHB' },
    level: 1,
    skillChoices: ['athletics', 'perception'],
  });

  // 5. Background (soldier — no language/tool slot ambiguity)
  await apiCall('PUT', `/api/v1/characters/${charId}/background`, ownerJwt, {
    background: { slug: 'soldier', source: 'PHB' },
    skillChoices: ['athletics', 'intimidation'],
    toolChoices: { anyGamingSet: ['dice-set'] },
  });

  // 6. Submit for approval
  await apiCall('PATCH', `/api/v1/characters/${charId}`, ownerJwt, {
    status: 'pending_approval',
  });

  if (targetStatus === 'pending_approval') {
    console.log(`  [char] created  "${name}" (pending_approval, id: ${charId})`);
    return charId;
  }

  // 7. Approve (DM)
  if (!dmJwt) throw new Error('dmJwt required to approve character');
  await apiCall('POST', `/api/v1/characters/${charId}/approve`, dmJwt);

  console.log(`  [char] created  "${name}" (active, id: ${charId})`);
  return charId;
}

/** Build a Wizard character through the API up to active status with spells. */
async function buildWizardCharacter(
  worldId: string,
  ownerJwt: string,
  name: string,
  dmJwt: string,
): Promise<string> {
  // 1. Create
  const created = await apiCall<{ id: string }>('POST', '/api/v1/characters', ownerJwt, {
    worldId,
    name,
  });
  const charId = created.id;

  // 2. Stats (INT 15 for Wizard)
  await apiCall('PUT', `/api/v1/characters/${charId}/stats`, ownerJwt, {
    method: 'standard-array',
    scores: { str: 8, dex: 14, con: 13, int: 15, wis: 12, cha: 10 },
  });

  // 3. Race (human PHB — fixed +1 to all 6, purelyFixed → appliedAsis omitted.
  //    PHB p.30: 1 extra language choice required).
  await apiCall('PUT', `/api/v1/characters/${charId}/race`, ownerJwt, {
    race: { slug: 'human', source: 'PHB' },
    languageChoices: ['elvish'],
  });

  // 4. Class (Wizard L1 — pick skills that don't overlap with Sage background's arcana+history)
  await apiCall('PUT', `/api/v1/characters/${charId}/class`, ownerJwt, {
    class: { slug: 'wizard', source: 'PHB' },
    level: 1,
    skillChoices: ['investigation', 'medicine'],
  });

  // 5. Background (sage — fixed skills arcana+history; PHB p.138 — 2 languages chosen)
  await apiCall('PUT', `/api/v1/characters/${charId}/background`, ownerJwt, {
    background: { slug: 'sage', source: 'PHB' },
    languageChoices: ['elvish', 'dwarvish'],
  });

  // 6. Spells — Wizard L1: 3 cantrips + 6 known spells (spellbook)
  //    PHB p.114: wizards start with 6 spells in spellbook + 3 cantrips.
  //    We pick a minimal set known to exist in the PHB compendium.
  await apiCall(
    'PUT',
    `/api/v1/characters/${charId}/classes/wizard/spells`,
    ownerJwt,
    {
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
    },
  );

  // 7. Submit
  await apiCall('PATCH', `/api/v1/characters/${charId}`, ownerJwt, {
    status: 'pending_approval',
  });

  // 8. Approve
  await apiCall('POST', `/api/v1/characters/${charId}/approve`, dmJwt);

  console.log(`  [char] created  "${name}" (active/wizard, id: ${charId})`);
  return charId;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('[seed-e2e] Starting E2E fixture seed…\n');

  // 0. Guard: compendium must be loaded.
  await assertCompendiumLoaded();

  // ── 1. Auth users (find-or-create) ──────────────────────────────────────────
  console.log('\n[seed-e2e] Step 1: auth users');
  const dm = await findOrCreateUser('dm@dh.test');
  const player1 = await findOrCreateUser('player1@dh.test');
  const player2 = await findOrCreateUser('player2@dh.test');
  const player3 = await findOrCreateUser('player3@dh.test');

  // ── 2. World (find-or-create) ────────────────────────────────────────────────
  console.log('\n[seed-e2e] Step 2: world');
  const worldId = await findOrCreateWorld(dm.jwt);

  // Ensure all players are world members (idempotent).
  console.log('\n[seed-e2e] Step 3: world memberships');
  await ensureWorldMember(worldId, player1.id);
  console.log(`  [member] player1@dh.test → ${worldId}`);
  await ensureWorldMember(worldId, player2.id);
  console.log(`  [member] player2@dh.test → ${worldId}`);
  await ensureWorldMember(worldId, player3.id);
  console.log(`  [member] player3@dh.test → ${worldId}`);

  // ── 3. Characters (find-or-create) ──────────────────────────────────────────
  console.log('\n[seed-e2e] Step 4: characters');

  // player1 → P1 Draft (left in draft)
  const p1DraftName = 'P1 Draft';
  let p1DraftId = await findCharacterByName(worldId, player1.id, p1DraftName);
  if (p1DraftId) {
    console.log(`  [char] exists   "${p1DraftName}" (id: ${p1DraftId})`);
  } else {
    p1DraftId = await buildFighterCharacter(worldId, player1.jwt, p1DraftName, 'draft');
  }

  // player1 → P1 Pending (taken to pending_approval)
  const p1PendingName = 'P1 Pending';
  let p1PendingId = await findCharacterByName(worldId, player1.id, p1PendingName);
  if (p1PendingId) {
    console.log(`  [char] exists   "${p1PendingName}" (id: ${p1PendingId})`);
  } else {
    p1PendingId = await buildFighterCharacter(worldId, player1.jwt, p1PendingName, 'pending_approval');
  }

  // player1 → P1 Hero (active, XP ≥ 300, gold, inventory item)
  const p1HeroName = 'P1 Hero';
  let p1HeroId = await findCharacterByName(worldId, player1.id, p1HeroName);
  if (p1HeroId) {
    console.log(`  [char] exists   "${p1HeroName}" (id: ${p1HeroId})`);
  } else {
    p1HeroId = await buildFighterCharacter(worldId, player1.jwt, p1HeroName, 'active', dm.jwt);

    // Grant XP ≥ 300 (DM-only endpoint)
    await apiCall('POST', `/api/v1/characters/${p1HeroId}/xp`, dm.jwt, { award: 300 });
    console.log(`  [xp]   granted  300 XP → "${p1HeroName}"`);

    // Grant gold (DM-only endpoint)
    await apiCall('POST', `/api/v1/characters/${p1HeroId}/grant/gold`, dm.jwt, { gp: 50 });
    console.log(`  [gold] granted  50 gp → "${p1HeroName}"`);

    // Grant inventory item (DM-only endpoint)
    await apiCall('POST', `/api/v1/characters/${p1HeroId}/grant/item`, dm.jwt, {
      item: { slug: 'longsword', source: 'PHB' },
    });
    console.log(`  [item] granted  longsword → "${p1HeroName}"`);
  }

  // player2 → P2 Mage (active Wizard with spells)
  const p2MageName = 'P2 Mage';
  let p2MageId = await findCharacterByName(worldId, player2.id, p2MageName);
  if (p2MageId) {
    console.log(`  [char] exists   "${p2MageName}" (id: ${p2MageId})`);
  } else {
    p2MageId = await buildWizardCharacter(worldId, player2.jwt, p2MageName, dm.jwt);
  }

  // player3 → no characters (intentional)
  console.log(`  [char] player3@dh.test — no characters (intentional)`);

  // ── 4. Summary ──────────────────────────────────────────────────────────────

  console.log(`
╔══════════════════════════════════════════════════════════════╗
║           E2E FIXTURE SEED — COMPLETE                        ║
╠══════════════════════════════════════════════════════════════╣
║  CREDENTIALS (shared password for all users)                 ║
║  Password:  ${E2E_PASSWORD.padEnd(38)}║
║                                                              ║
║  dm@dh.test         (DM / GM)                                ║
║  player1@dh.test    (player)                                 ║
║  player2@dh.test    (player)                                 ║
║  player3@dh.test    (player — no characters)                 ║
╠══════════════════════════════════════════════════════════════╣
║  WORLD                                                       ║
║  worldId: ${worldId.padEnd(40)}║
╠══════════════════════════════════════════════════════════════╣
║  CHARACTERS                                                  ║
║  "${p1DraftName}"  →  draft        (player1)                       ║
║    id: ${p1DraftId!.padEnd(43)}║
║  "${p1PendingName}" →  pending_approval (player1)              ║
║    id: ${p1PendingId!.padEnd(43)}║
║  "${p1HeroName}"   →  active  +XP +gold +item (player1)       ║
║    id: ${p1HeroId!.padEnd(43)}║
║  "${p2MageName}"   →  active  wizard+spells (player2)         ║
║    id: ${p2MageId!.padEnd(43)}║
╚══════════════════════════════════════════════════════════════╝
`);
}

main().catch((err) => {
  console.error('[seed-e2e] FATAL:', err);
  process.exit(1);
});
