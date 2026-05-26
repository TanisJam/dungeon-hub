/**
 * Seed test character — útil para probar /character show del bot o el dashboard web.
 *
 * Crea un mundo ("Dev World") con la campaign "Dev Campaign" bajo él, y un Fighter
 * L1 humano asignado a ese mundo. El user queda como GM del world.
 *
 * Idempotente: si el world ya existe (GET /worlds?mine=1 devuelve "Dev World"),
 * usa el worldId existente en lugar de crear uno nuevo. Si querés recrearlo,
 * borralo manualmente antes de correr el script.
 *
 * Uso con email/password (path original):
 *   TEST_EMAIL=foo@test.local TEST_PASSWORD=… pnpm seed-test-character
 *
 * Uso con JWT (más simple si ya estás logueado en el web):
 *   1. Andá a http://localhost:3001/dev/token y copiá el token.
 *   2. TEST_JWT=<token> pnpm --filter @dungeon-hub/api seed-test-character
 *
 * Defaults:
 *   API_BASE_URL=http://localhost:4000
 *   SUPABASE_URL=http://localhost:8000
 *   CHARACTER_NAME="Pepito McTester"
 */
import 'dotenv/config';

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:4000';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const TEST_EMAIL = process.env.TEST_EMAIL;
const TEST_PASSWORD = process.env.TEST_PASSWORD;
const TEST_JWT = process.env.TEST_JWT;
const CHARACTER_NAME = process.env.CHARACTER_NAME ?? 'Pepito McTester';

// POST /campaigns crea el world "${SEED_CAMPAIGN_NAME} (World)" + campaign atómicamente.
// El user queda como gm worldMember. SEED_WORLD_LABEL es el nombre auto-derivado del world.
const SEED_CAMPAIGN_NAME = 'Dev Campaign';
const SEED_WORLD_LABEL = `${SEED_CAMPAIGN_NAME} (World)`;

if (!TEST_JWT && !(TEST_EMAIL && TEST_PASSWORD)) {
  console.error('Need either TEST_JWT or (TEST_EMAIL + TEST_PASSWORD).');
  process.exit(1);
}
if (!TEST_JWT && (!SUPABASE_URL || !SUPABASE_ANON_KEY)) {
  console.error('Email/password path needs SUPABASE_URL + SUPABASE_ANON_KEY.');
  process.exit(1);
}

async function getToken(): Promise<string> {
  if (TEST_JWT) return TEST_JWT;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY! },
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
  });
  if (!res.ok) throw new Error(`Login failed (${res.status}): ${await res.text()}`);
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

async function call<T>(method: string, path: string, jwt: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${jwt}`,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    throw new Error(`${method} ${path} failed (${res.status}): ${await res.text()}`);
  }
  return (await res.json()) as T;
}

async function main(): Promise<void> {
  console.log(`[seed] obteniendo JWT…`);
  const jwt = await getToken();

  // 1. Idempotencia: buscar si "Dev Campaign (World)" ya existe en los worlds del user.
  console.log(`[seed] verificando si el world "${SEED_WORLD_LABEL}" ya existe…`);
  const worldsRes = await call<{ worlds: Array<{ id: string; name: string }> }>(
    'GET',
    '/api/v1/worlds?mine=1',
    jwt,
  );
  const existingWorld = worldsRes.worlds.find((w) => w.name === SEED_WORLD_LABEL);

  let worldId: string;
  if (existingWorld) {
    worldId = existingWorld.id;
    console.log(`   ↳ world ya existe, usando id: ${worldId}`);
  } else {
    // POST /campaigns crea el world "${SEED_CAMPAIGN_NAME} (World)" + campaign atómicamente.
    // El user queda como gm worldMember automáticamente.
    console.log(`[seed] creando world + campaign "${SEED_CAMPAIGN_NAME}"…`);
    const campaign = await call<{ id: string; worldId: string }>('POST', '/api/v1/campaigns', jwt, {
      name: SEED_CAMPAIGN_NAME,
    });
    worldId = campaign.worldId;
    console.log(`   ↳ campaign id: ${campaign.id} | world id: ${worldId}`);
  }

  console.log(`[seed] creando character "${CHARACTER_NAME}" en world ${worldId}…`);
  const created = await call<{ id: string }>('POST', '/api/v1/characters', jwt, {
    worldId,
    name: CHARACTER_NAME,
  });
  console.log(`   ↳ id: ${created.id}`);

  console.log(`[seed] PUT stats (standard array)…`);
  await call('PUT', `/api/v1/characters/${created.id}/stats`, jwt, {
    method: 'standard-array',
    scores: { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 },
  });

  console.log(`[seed] PUT race (human, +2 STR / +1 CON — convención MPMM/2024)…`);
  await call('PUT', `/api/v1/characters/${created.id}/race`, jwt, {
    race: { slug: 'human', source: 'PHB' },
    appliedAsis: [
      { ability: 'str', bonus: 2, source: 'race' },
      { ability: 'con', bonus: 1, source: 'race' },
    ],
  });

  console.log(`[seed] PUT class (Fighter L1, skills: athletics + intimidation)…`);
  await call('PUT', `/api/v1/characters/${created.id}/class`, jwt, {
    class: { slug: 'fighter', source: 'PHB' },
    level: 1,
    skillChoices: ['athletics', 'intimidation'],
  });

  console.log(`[seed] PUT background (soldier PHB, gaming set: dice-set)…`);
  await call('PUT', `/api/v1/characters/${created.id}/background`, jwt, {
    background: { slug: 'soldier', source: 'PHB' },
    skillChoices: ['athletics', 'intimidation'],
    toolChoices: { anyGamingSet: ['dice-set'] },
  });

  console.log(`\n✓ Done. Character created with id: ${created.id}`);
  console.log(`  Probá: /character show name:${CHARACTER_NAME} en Discord.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
