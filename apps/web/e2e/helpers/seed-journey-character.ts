/**
 * seed-journey-character.ts — Create ephemeral characters for cross-role journey specs.
 *
 * Each journey that MUTATES character state creates its OWN ephemeral character
 * via the API at test start, using this helper. This preserves the stable seeded
 * fixtures (P1 Hero, P2 Mage, etc.) for read-only assertions.
 *
 * Uses the same API sequence as apps/api/scripts/seed-e2e-fixture.ts.
 * Bearer tokens are obtained via Supabase password grant — same as fixture.setup.ts.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://localhost:8000';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

// The shared E2E fixture world (created by seed-e2e-fixture.ts).
export const FIXTURE_WORLD_NAME = 'E2E Fixture (World)';
export const FIXTURE_PASSWORD = 'DungeonHub!E2E1';

// ── Auth ─────────────────────────────────────────────────────────────────────

/** Sign in and return the JWT bearer token. */
export async function getJwt(email: string, password: string = FIXTURE_PASSWORD): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    throw new Error(`[seed-journey] Login failed for ${email} (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

// ── API helper ────────────────────────────────────────────────────────────────

async function apiCall<T>(method: string, path: string, jwt: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${jwt}`,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    throw new Error(`[seed-journey] ${method} ${path} → ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as T;
}

// ── World lookup ──────────────────────────────────────────────────────────────

/** Find the fixture world ID via the DM's /worlds endpoint. */
export async function getFixtureWorldId(dmJwt: string): Promise<string> {
  const data = await apiCall<{ worlds: Array<{ id: string; name: string }> }>(
    'GET',
    '/api/v1/worlds?mine=1',
    dmJwt,
  );
  const world = data.worlds.find((w) => w.name === FIXTURE_WORLD_NAME);
  if (!world) {
    throw new Error(
      `[seed-journey] Fixture world "${FIXTURE_WORLD_NAME}" not found. ` +
        'Run: pnpm --filter @dungeon-hub/api db:seed:e2e',
    );
  }
  return world.id;
}

// ── Character creation ────────────────────────────────────────────────────────

export type TargetStatus = 'draft' | 'pending_approval' | 'active';

export interface SeedCharacterOptions {
  /** JWT of the character owner. */
  ownerJwt: string;
  /** JWT of the DM — required when targetStatus is 'active'. */
  dmJwt?: string;
  /** World ID to create the character in. */
  worldId: string;
  /** Character name (should be unique per test run — use a timestamp suffix). */
  name: string;
  /** Status to reach. Defaults to 'active'. */
  targetStatus?: TargetStatus;
  /** XP to grant after approval (DM action, active chars only). 300 = L2 eligible. */
  xpGrant?: number;
}

export interface SeededCharacter {
  id: string;
  name: string;
  status: TargetStatus;
}

/**
 * Create a Human Fighter (non-caster) character through the API up to the
 * requested status. Returns the character ID.
 *
 * Human PHB: fixed +1 to all 6 abilities, 1 language choice required (PHB p.30).
 * Fighter PHB: non-caster, no spells required.
 * Soldier background: no language/tool ambiguity, dice-set tool choice.
 */
export async function seedJourneyCharacter(opts: SeedCharacterOptions): Promise<SeededCharacter> {
  const {
    ownerJwt,
    dmJwt,
    worldId,
    name,
    targetStatus = 'active',
    xpGrant = 0,
  } = opts;

  // 1. Create
  const created = await apiCall<{ id: string }>('POST', '/api/v1/characters', ownerJwt, {
    worldId,
    name,
  });
  const charId = created.id;

  if (targetStatus === 'draft') {
    return { id: charId, name, status: 'draft' };
  }

  // 2. Stats — standard array
  await apiCall('PUT', `/api/v1/characters/${charId}/stats`, ownerJwt, {
    method: 'standard-array',
    scores: { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 },
  });

  // 3. Race — Human PHB (fixed +1 to all, no ASI choices needed, 1 language choice)
  await apiCall('PUT', `/api/v1/characters/${charId}/race`, ownerJwt, {
    race: { slug: 'human', source: 'PHB' },
    languageChoices: ['elvish'],
  });

  // 4. Class — Fighter PHB, pick 2 skills that don't conflict with Soldier's fixed skills.
  // Soldier has fixed: athletics + intimidation. Fighter must NOT pick those.
  // Fighter PHB skill pool: Acrobatics, Animal Handling, Athletics, History, Insight,
  // Intimidation, Perception, Survival. Pick Acrobatics + Survival (no overlap).
  await apiCall('PUT', `/api/v1/characters/${charId}/class`, ownerJwt, {
    class: { slug: 'fighter', source: 'PHB' },
    level: 1,
    skillChoices: ['acrobatics', 'survival'],
  });

  // 5. Background — Soldier PHB (fixed skills: athletics + intimidation, dice-set tool)
  // Soldier skills are FIXED (not chosen), so pass empty skillChoices to avoid
  // SKILL_DUPLICATE_WITH_CLASS validation. The fixed skills are granted automatically.
  await apiCall('PUT', `/api/v1/characters/${charId}/background`, ownerJwt, {
    background: { slug: 'soldier', source: 'PHB' },
    skillChoices: [],
    toolChoices: { anyGamingSet: ['dice-set'] },
  });

  // 6. Submit for approval
  await apiCall('PATCH', `/api/v1/characters/${charId}`, ownerJwt, {
    status: 'pending_approval',
  });

  if (targetStatus === 'pending_approval') {
    return { id: charId, name, status: 'pending_approval' };
  }

  // 7. Approve (DM)
  if (!dmJwt) throw new Error('[seed-journey] dmJwt required to approve character');
  await apiCall('POST', `/api/v1/characters/${charId}/approve`, dmJwt);

  // 8. Optional XP grant
  if (xpGrant > 0) {
    await apiCall('POST', `/api/v1/characters/${charId}/xp`, dmJwt, { award: xpGrant });
  }

  return { id: charId, name, status: 'active' };
}

/**
 * Grant XP to a character via the DM token.
 * Used by journeys that need a specific XP total post-creation.
 */
export async function grantXpApi(charId: string, award: number, dmJwt: string): Promise<void> {
  await apiCall('POST', `/api/v1/characters/${charId}/xp`, dmJwt, { award });
}

/**
 * Grant gold to a character via the DM token.
 */
export async function grantGoldApi(charId: string, gp: number, dmJwt: string): Promise<void> {
  await apiCall('POST', `/api/v1/characters/${charId}/grant/gold`, dmJwt, { gp });
}

/**
 * Grant an item to a character via the DM token.
 */
export async function grantItemApi(
  charId: string,
  slug: string,
  source: string,
  dmJwt: string,
): Promise<void> {
  await apiCall('POST', `/api/v1/characters/${charId}/grant/item`, dmJwt, {
    item: { slug, source },
  });
}
