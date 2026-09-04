/**
 * seed-dev-encounter.ts — Dev convenience: spin up a ready-to-test combat encounter.
 *
 * Creates (or reuses) a Level-1 Barbarian character for player1 in the E2E Fixture
 * world, then creates a NEW active encounter where the Barbarian is the current
 * combatant (initiative 20 > NPC initiative 5). Prints the encounter URL + login.
 *
 * Pre-requisites:
 *   1. Stack running (api :4000, web :3001, Supabase Kong :8000, postgres :5432)
 *   2. pnpm --filter @dungeon-hub/api db:seed:e2e  (fixture users + world + members)
 *
 * Usage:
 *   pnpm --filter @dungeon-hub/api seed-dev-encounter
 *   — or —
 *   pnpm --filter @dungeon-hub/api exec tsx scripts/seed-dev-encounter.ts
 *
 * Idempotency:
 *   - The Barbarian character is find-or-created by name ("Dev Barbarian").
 *   - A fresh encounter is created on each run (old ones left in DB, harmless).
 */
import 'dotenv/config';
import { eq, and } from 'drizzle-orm';

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:4000';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const E2E_PASSWORD = process.env.E2E_FIXTURE_PASSWORD ?? 'DungeonHub!E2E1';

const E2E_CAMPAIGN_NAME = 'E2E Fixture';
const BARBARIAN_NAME = 'Dev Barbarian';
const WEB_BASE = process.env.WEB_BASE_URL ?? 'http://localhost:3001';

// ── Env guard ────────────────────────────────────────────────────────────────

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    '[seed-dev] Missing env: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY',
  );
  process.exit(1);
}

// ── Auth helpers ─────────────────────────────────────────────────────────────

interface FixtureUser {
  id: string;
  email: string;
  jwt: string;
}

async function signIn(email: string): Promise<FixtureUser> {
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
  return { id: session.user.id, email, jwt: session.access_token };
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
    throw new Error(`${method} ${path} → ${res.status}: ${await res.text()}`);
  }

  return (await res.json()) as T;
}

// ── DB helpers ────────────────────────────────────────────────────────────────

async function findActiveCharacterByName(
  worldId: string,
  userId: string,
  name: string,
): Promise<string | null> {
  const { db } = await import('../src/infra/db/client.js');
  const { characters } = await import('../src/infra/db/schema.js');

  const rows = await db
    .select({ id: characters.id, status: characters.status })
    .from(characters)
    .where(
      and(
        eq(characters.worldId, worldId),
        eq(characters.userId, userId),
        eq(characters.name, name),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  if (row.status !== 'active') {
    console.log(`  [char] found "${name}" in status=${row.status} — will rebuild`);
    return null;
  }
  return row.id;
}

// ── Barbarian character builder ───────────────────────────────────────────────

/**
 * Build a Level-1 Human Barbarian (Soldier background) through the full 6-step API flow.
 *
 * PHB p.49 — Barbarian skills: Animal Handling, Athletics, Intimidation, Nature, Perception, Survival (pick 2).
 * PHB p.140 — Soldier fixed skills: Athletics + Intimidation (granted automatically — no overlap).
 * Safe choices: 'animal handling' + 'survival' (no collision with Soldier fixed skills).
 *
 * Level 1 Barbarian grants:
 *   - barbarian:rage-uses (2 uses/day, PHB p.48)  → RageControls renders
 *   - barbarian:unarmored-defense                  → ResourcePanel (no short-rest resources at L1)
 *   HP: 12 + CON modifier (CON 13 → +1 → 13 HP post-racial-bonus with Human +1 to all)
 */
async function buildBarbarianCharacter(
  worldId: string,
  ownerJwt: string,
  dmJwt: string,
  name: string,
): Promise<string> {
  console.log(`  [char] building "${name}" (Barbarian L1)…`);

  // 1. Create
  const created = await apiCall<{ id: string }>('POST', '/api/v1/characters', ownerJwt, {
    worldId,
    name,
  });
  const charId = created.id;

  // 2. Stats — standard array (STR 15 for Barbarian)
  await apiCall('PUT', `/api/v1/characters/${charId}/stats`, ownerJwt, {
    method: 'standard-array',
    scores: { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 },
  });

  // 3. Race — Human PHB (fixed +1 to all 6 abilities; PHB p.30 — 1 language choice)
  await apiCall('PUT', `/api/v1/characters/${charId}/race`, ownerJwt, {
    race: { slug: 'human', source: 'PHB' },
    languageChoices: ['elvish'],
  });

  // 4. Class — Barbarian L1
  // Soldier fixed: Athletics + Intimidation (PHB p.140); Barbarian pool safe choices: animal handling + survival
  await apiCall('PUT', `/api/v1/characters/${charId}/class`, ownerJwt, {
    class: { slug: 'barbarian', source: 'PHB' },
    level: 1,
    skillChoices: ['animal handling', 'survival'],
  });

  // 5. Background — Soldier PHB (fixed skills: athletics + intimidation; dice-set tool)
  await apiCall('PUT', `/api/v1/characters/${charId}/background`, ownerJwt, {
    background: { slug: 'soldier', source: 'PHB' },
    skillChoices: [],
    toolChoices: { anyGamingSet: ['dice-set'] },
  });

  // 6. Submit for approval
  await apiCall('PATCH', `/api/v1/characters/${charId}`, ownerJwt, {
    status: 'pending_approval',
  });

  // 7. DM approves
  await apiCall('POST', `/api/v1/characters/${charId}/approve`, dmJwt);

  console.log(`  [char] created "${name}" (active, id: ${charId})`);
  return charId;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('[seed-dev] Starting dev encounter seed…\n');

  // ── 1. Sign in as fixture users ──────────────────────────────────────────────
  console.log('[seed-dev] Step 1: signing in as fixture users');
  let dm: FixtureUser;
  let player1: FixtureUser;
  try {
    dm = await signIn('dm@dh.test');
    player1 = await signIn('player1@dh.test');
    console.log(`  dm@dh.test      → OK (id: ${dm.id})`);
    console.log(`  player1@dh.test → OK (id: ${player1.id})`);
  } catch (err) {
    console.error('[seed-dev] Auth failed. Run pnpm --filter @dungeon-hub/api db:seed:e2e first.');
    throw err;
  }

  // ── 2. Find E2E Fixture campaign + world ─────────────────────────────────────
  console.log('\n[seed-dev] Step 2: finding E2E Fixture campaign');
  const campaignListRes = await apiCall<{
    data: Array<{ id: string; name: string; worldId: string; memberRole: string }>;
  }>('GET', '/api/v1/campaigns', dm.jwt);

  const campaign = campaignListRes.data?.find((c) => c.name === E2E_CAMPAIGN_NAME);
  if (!campaign) {
    console.error(
      `[seed-dev] Campaign "${E2E_CAMPAIGN_NAME}" not found. ` +
        'Run: pnpm --filter @dungeon-hub/api db:seed:e2e',
    );
    process.exit(1);
  }
  const { id: campaignId, worldId } = campaign;
  console.log(`  campaignId: ${campaignId}  worldId: ${worldId}`);

  // ── 3. Find-or-create the Barbarian character for player1 ────────────────────
  console.log('\n[seed-dev] Step 3: find-or-create Barbarian character for player1');
  let barbarianId = await findActiveCharacterByName(worldId, player1.id, BARBARIAN_NAME);
  if (barbarianId) {
    console.log(`  [char] exists   "${BARBARIAN_NAME}" (id: ${barbarianId})`);
  } else {
    barbarianId = await buildBarbarianCharacter(worldId, player1.jwt, dm.jwt, BARBARIAN_NAME);
  }

  // ── 4. Create the encounter ──────────────────────────────────────────────────
  console.log('\n[seed-dev] Step 4: creating active encounter');
  const encounter = await apiCall<{ id: string; currentCombatantId: string; combatants: Array<{ id: string; characterId: string | null }> }>(
    'POST',
    '/api/v1/encounters',
    dm.jwt,
    {
      campaignId,
      name: `Dev Barbarian Test ${new Date().toISOString().slice(0, 16)}`,
      combatants: [
        {
          // player1's Barbarian — highest initiative → currentCombatant on turn 1
          name: 'Dev Barbarian',
          kind: 'pc',
          characterId: barbarianId,
          initiative: 20,
          hpCurrent: 14,
          hpMax: 14,
        },
        {
          // NPC opponent with low initiative and required ac field (REQ-AC-CREATE-01)
          name: 'Goblin Raider',
          kind: 'npc',
          initiative: 5,
          hpCurrent: 7,
          hpMax: 7,
          ac: 13,
        },
      ],
    },
  );

  const encounterId = encounter.id;
  const barbarianCombatant = encounter.combatants.find((c) => c.characterId === barbarianId);

  if (!barbarianCombatant) {
    throw new Error('[seed-dev] Barbarian combatant not found in encounter response');
  }

  const isCurrentCombatant = encounter.currentCombatantId === barbarianCombatant.id;
  console.log(`  encounterId:       ${encounterId}`);
  console.log(`  barbarianCombatantId: ${barbarianCombatant.id}`);
  console.log(`  currentCombatantId:  ${encounter.currentCombatantId}`);
  console.log(`  Barbarian is current combatant: ${isCurrentCombatant ? 'YES ✓' : 'NO — check initiative ordering'}`);

  if (!isCurrentCombatant) {
    console.warn(
      '[seed-dev] WARNING: Barbarian is NOT the current combatant. ' +
        'Initiative ordering may differ from expected. Check the encounter.',
    );
  }

  // ── 5. Print deliverables ────────────────────────────────────────────────────
  const encounterUrl = `${WEB_BASE}/encuentros/${encounterId}`;

  console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║              DEV ENCOUNTER READY — MANUAL TESTING                        ║
╠══════════════════════════════════════════════════════════════════════════╣
║  URL:      ${encounterUrl.padEnd(61)}║
╠══════════════════════════════════════════════════════════════════════════╣
║  LOGIN                                                                    ║
║  Email:    player1@dh.test                                                ║
║  Password: ${E2E_PASSWORD.padEnd(61)}║
╠══════════════════════════════════════════════════════════════════════════╣
║  ENCOUNTER                                                                ║
║  Character: ${BARBARIAN_NAME.padEnd(60)}║
║  Current combatant: ${(isCurrentCombatant ? 'YES — player1 goes first' : 'CHECK encounter — initiative ordering').padEnd(52)}║
╠══════════════════════════════════════════════════════════════════════════╣
║  WHAT TO TEST                                                             ║
║  - Read view: HP / conditions / effects / TurnBanner ("Tu turno")        ║
║  - ResourcePanel: use resource charge / short rest / long rest buttons   ║
║  - RageControls: "Entrar en Furia" (activate) / "Terminar Furia" (end)  ║
║  - PlayerActionPanel: "Pasar Turno" button (passes turn to Goblin)       ║
╠══════════════════════════════════════════════════════════════════════════╣
║  CAVEATS                                                                  ║
║  - Log in at http://localhost:3001/login first (web login page).         ║
║  - Use a 375px viewport (mobile-first) for full surface coverage.        ║
║  - "Terminar Furia" disabled after activation (bonus action used).       ║
║  - Advancing turn twice ends Rage early (PHB p.48 end-early rule).       ║
╚══════════════════════════════════════════════════════════════════════════╝
`);
}

main().catch((err) => {
  console.error('[seed-dev] FATAL:', err);
  process.exit(1);
});
