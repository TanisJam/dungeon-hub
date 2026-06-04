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

/**
 * Optional class override for seedJourneyCharacter.
 * When provided, replaces the default Human Fighter/Soldier class.
 * skillChoices must NOT conflict with the background's fixed skills.
 *
 * Example for Barbarian (Soldier background):
 *   Soldier fixed skills: Athletics + Intimidation (PHB p.140 — Soldier).
 *   Barbarian pool: Animal Handling, Athletics, Intimidation, Nature, Perception, Survival (PHB p.49).
 *   Safe choices (no overlap with Soldier fixed): ['animal handling', 'survival'].
 */
export interface ClassOverride {
  slug: string;
  source: string;
  /** Skill choices that do NOT conflict with the background's fixed skills. */
  skillChoices: string[];
}

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
  /**
   * Optional class override. When absent, defaults to Human Fighter/Soldier
   * (backward-compatible with all existing callers).
   * The background always stays Soldier PHB — caller must ensure skillChoices
   * do not conflict with Soldier's fixed Athletics+Intimidation.
   */
  classOverride?: ClassOverride;
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
    classOverride,
  } = opts;

  // Default class is Human Fighter / Soldier (backward-compatible with all existing callers).
  // classOverride replaces only the class call; race and background stay the same.
  const classSlug = classOverride?.slug ?? 'fighter';
  const classSource = classOverride?.source ?? 'PHB';
  // Fighter default skillChoices: Acrobatics + Survival (no overlap with Soldier's fixed Athletics+Intimidation).
  // Override caller is responsible for choosing non-conflicting skills.
  const classSkillChoices = classOverride?.skillChoices ?? ['acrobatics', 'survival'];

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

  // 4. Class — defaults to Fighter PHB. Override via classOverride for other classes (e.g. Barbarian).
  // Skill choices must NOT overlap with Soldier's fixed skills (Athletics + Intimidation).
  // Fighter defaults: Acrobatics + Survival (safe with Soldier).
  // Barbarian override: use ['animal handling', 'survival'] (safe with Soldier — PHB p.49, p.140).
  await apiCall('PUT', `/api/v1/characters/${charId}/class`, ownerJwt, {
    class: { slug: classSlug, source: classSource },
    level: 1,
    skillChoices: classSkillChoices,
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
 * Fetch a character's current status via the API (authoritative).
 * Used to assert state transitions (e.g. reject → 'draft') deterministically,
 * instead of relying on transient UI state subject to revalidatePath timing.
 */
export async function getCharacterStatus(charId: string, jwt: string): Promise<string> {
  const char = await apiCall<{ status: string }>('GET', `/api/v1/characters/${charId}`, jwt);
  return char.status;
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

/**
 * Find a character ID by name in the caller's character list.
 * Returns the first active character with the given name, or null.
 */
export async function findCharacterIdByName(name: string, jwt: string): Promise<string | null> {
  const data = await apiCall<{ data: Array<{ id: string; name: string; status: string }> }>(
    'GET',
    '/api/v1/characters',
    jwt,
  );
  const chars = data.data ?? [];
  const found = chars.find((c) => c.name === name && c.status === 'active');
  return found?.id ?? null;
}

/**
 * Get a character's HP data via API.
 * Returns { current, max, temp } or null if not available.
 */
export async function getCharacterHp(
  charId: string,
  jwt: string,
): Promise<{ current: number | null; max: number | null; temp: number } | null> {
  const char = await apiCall<{ data?: { hp?: { current?: number; max?: number; temp?: number } } }>(
    'GET',
    `/api/v1/characters/${charId}`,
    jwt,
  );
  const hp = char.data?.hp;
  if (!hp) return null;
  return {
    current: hp.current ?? null,
    max: hp.max ?? null,
    temp: hp.temp ?? 0,
  };
}

/**
 * Get the character sheet spellsByClass data.
 */
export async function getCharacterSheetSpells(
  charId: string,
  jwt: string,
): Promise<Array<{ classSlug: string; spells: { leveled: Array<{ slug: string; prepared?: boolean }> } }>> {
  const data = await apiCall<{
    sheet: {
      spellsByClass?: Array<{
        classSlug: string;
        spells: { leveled: Array<{ slug: string; prepared?: boolean }> };
      }>;
    };
  }>('GET', `/api/v1/characters/${charId}/sheet`, jwt);
  return data.sheet.spellsByClass ?? [];
}
