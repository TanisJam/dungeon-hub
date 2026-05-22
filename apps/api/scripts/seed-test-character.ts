/**
 * Seed test character — útil para probar /character show del bot.
 *
 * Crea un Fighter L1 humano para el user indicado.
 *
 * Uso:
 *   TEST_EMAIL=mauricio@test.local \
 *   TEST_PASSWORD=password123 \
 *   CAMPAIGN_ID=<campaign-uuid> \
 *   pnpm --filter @dungeon-hub/api seed-test-character
 *
 * Defaults:
 *   API_BASE_URL=http://localhost:4000
 *   SUPABASE_URL=http://localhost:8000
 *   SUPABASE_ANON_KEY=tomado del .env del paquete
 *   CHARACTER_NAME="Pepito McTester"
 */
import 'dotenv/config';

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:4000';
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;
const TEST_EMAIL = process.env.TEST_EMAIL!;
const TEST_PASSWORD = process.env.TEST_PASSWORD!;
const CAMPAIGN_ID = process.env.CAMPAIGN_ID!;
const CHARACTER_NAME = process.env.CHARACTER_NAME ?? 'Pepito McTester';

function requireEnv(name: string, val: string | undefined): asserts val is string {
  if (!val) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
}

requireEnv('SUPABASE_URL', SUPABASE_URL);
requireEnv('SUPABASE_ANON_KEY', SUPABASE_ANON_KEY);
requireEnv('TEST_EMAIL', TEST_EMAIL);
requireEnv('TEST_PASSWORD', TEST_PASSWORD);
requireEnv('CAMPAIGN_ID', CAMPAIGN_ID);

async function login(): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY },
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
  console.log(`[seed] login as ${TEST_EMAIL}…`);
  const jwt = await login();

  console.log(`[seed] creando character "${CHARACTER_NAME}" en campaign ${CAMPAIGN_ID}…`);
  const created = await call<{ id: string }>('POST', '/api/v1/characters', jwt, {
    campaignId: CAMPAIGN_ID,
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
