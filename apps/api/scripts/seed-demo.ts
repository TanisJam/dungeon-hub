/**
 * seed-demo.ts — Populate the public portfolio demo account.
 *
 * Makes the demo user (DEMO_EMAIL) a DM with a populated world:
 *   - World + campaign + a scheduled session
 *   - Two approved characters owned by the demo user (Fighter + Wizard w/ spells)
 *   - Quests + public journal entries (the latter surface in the guild feed / NovedadesFeed)
 *
 * Idempotent by campaign: if the demo campaign already exists, the seed is skipped.
 * Drives the real HTTP API (same flow a user would), so all data is valid.
 *
 * Env: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, API_BASE_URL,
 *      DEMO_EMAIL, DEMO_PASSWORD.
 */
import 'dotenv/config';

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:4000';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEMO_EMAIL = process.env.DEMO_EMAIL ?? 'demo@dungeon-hub.mnr.ar';
const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? 'demo1234';
const CAMPAIGN_NAME = 'La Campaña de Ejemplo';

// SERVICE_ROLE_KEY is only needed to *create* the demo user (admin API). When it's
// absent we skip creation and sign in directly — enough to (re)seed content into an
// already-existing demo (e.g. adding POIs to a live demo world).
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('[seed-demo] Missing SUPABASE_URL / SUPABASE_ANON_KEY');
  process.exit(1);
}

interface DemoUser {
  id: string;
  jwt: string;
}

async function findOrCreateUser(email: string, password: string): Promise<DemoUser> {
  if (SUPABASE_SERVICE_ROLE_KEY) {
    await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        user_metadata: { username: 'DemoDM' },
      }),
    }); // ignore result — 422 (exists) is fine; we sign in next.
  }

  const loginRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY!, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!loginRes.ok) throw new Error(`[seed-demo] login failed (${loginRes.status}): ${await loginRes.text()}`);
  const session = (await loginRes.json()) as { access_token: string; user: { id: string } };
  return { id: session.user.id, jwt: session.access_token };
}

async function apiCall<T>(method: string, path: string, jwt: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${jwt}`,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${await res.text()}`);
  return (await res.json()) as T;
}

/** best-effort content creation — logs and continues on failure */
async function tryCreate(label: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
    console.log(`  [ok] ${label}`);
  } catch (e) {
    console.warn(`  [skip] ${label}: ${(e as Error).message.slice(0, 160)}`);
  }
}

async function buildFighter(worldId: string, jwt: string, name: string): Promise<void> {
  const c = await apiCall<{ id: string }>('POST', '/api/v1/characters', jwt, { worldId, name });
  await apiCall('PUT', `/api/v1/characters/${c.id}/stats`, jwt, {
    method: 'standard-array',
    scores: { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 },
  });
  await apiCall('PUT', `/api/v1/characters/${c.id}/race`, jwt, {
    race: { slug: 'human', source: 'PHB' },
    languageChoices: ['elvish'],
  });
  await apiCall('PUT', `/api/v1/characters/${c.id}/class`, jwt, {
    class: { slug: 'fighter', source: 'PHB' },
    level: 1,
    skillChoices: ['acrobatics', 'survival'],
  });
  await apiCall('PUT', `/api/v1/characters/${c.id}/background`, jwt, {
    background: { slug: 'soldier', source: 'PHB' },
    skillChoices: [],
    toolChoices: { anyGamingSet: ['dice-set'] },
  });
  await apiCall('PATCH', `/api/v1/characters/${c.id}`, jwt, { status: 'pending_approval' });
  await apiCall('POST', `/api/v1/characters/${c.id}/approve`, jwt);
  console.log(`  [char] Fighter "${name}" (active)`);
}

async function buildWizard(worldId: string, jwt: string, name: string): Promise<void> {
  const c = await apiCall<{ id: string }>('POST', '/api/v1/characters', jwt, { worldId, name });
  await apiCall('PUT', `/api/v1/characters/${c.id}/stats`, jwt, {
    method: 'standard-array',
    scores: { str: 8, dex: 14, con: 13, int: 15, wis: 12, cha: 10 },
  });
  await apiCall('PUT', `/api/v1/characters/${c.id}/race`, jwt, {
    race: { slug: 'human', source: 'PHB' },
    languageChoices: ['elvish'],
  });
  await apiCall('PUT', `/api/v1/characters/${c.id}/class`, jwt, {
    class: { slug: 'wizard', source: 'PHB' },
    level: 1,
    skillChoices: ['insight', 'religion'],
  });
  await apiCall('PUT', `/api/v1/characters/${c.id}/background`, jwt, {
    background: { slug: 'sage', source: 'PHB' },
    languageChoices: ['draconic', 'dwarvish'],
  });
  await apiCall('PUT', `/api/v1/characters/${c.id}/classes/wizard/spells`, jwt, {
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
  await apiCall('PATCH', `/api/v1/characters/${c.id}`, jwt, { status: 'pending_approval' });
  await apiCall('POST', `/api/v1/characters/${c.id}/approve`, jwt);
  console.log(`  [char] Wizard "${name}" (active)`);
}

// Points of interest on the Sword Coast map (image is 10200×6600 — see CreatePoiBody
// bounds in routes/map.ts). Coords scatter across the landmass; statuses are visible
// (discovered/cleared) so the demo map is populated for players too, not just the DM.
const DEMO_POIS: Array<{
  name: string;
  description: string;
  status: 'discovered' | 'cleared';
  worldX: number;
  worldY: number;
}> = [
  { name: 'Faro de la Costa Rota', description: 'El faro lleva tres noches sin luz. Los pescadores temen lo peor.', status: 'discovered', worldX: 4750, worldY: 4200 },
  { name: 'Cripta de Eldrath', description: 'Las ruinas bajo las que el gremio explora la cripta. Traigan antorchas.', status: 'discovered', worldX: 5750, worldY: 3400 },
  { name: 'Piedravado', description: 'El pueblo del herrero Borin, secuestrado por los goblins.', status: 'cleared', worldX: 6350, worldY: 2500 },
  { name: 'Vado del Puente', description: 'Unos 6 goblins con un lobo emboscan cerca del puente. Cuidado al cruzar.', status: 'discovered', worldX: 5950, worldY: 2100 },
  { name: 'Tienda de Aldo', description: 'El mercader Aldo compra reliquias élficas. Pregunta demasiado sobre la cripta.', status: 'discovered', worldX: 5200, worldY: 4700 },
];

interface PoiRow {
  id: string;
  name: string;
}

/** Idempotent by name: adds any missing demo POI to the world's free-floating layer. */
async function seedPois(worldId: string, jwt: string): Promise<void> {
  const existing = await apiCall<{ data: PoiRow[] }>(
    'GET',
    `/api/v1/worlds/${worldId}/pois?parent=all`,
    jwt,
  ).catch(() => ({ data: [] as PoiRow[] }));
  const have = new Set(existing.data.map((p) => p.name));
  for (const poi of DEMO_POIS) {
    if (have.has(poi.name)) {
      console.log(`  [ok] poi (exists): ${poi.name}`);
      continue;
    }
    await tryCreate(`poi: ${poi.name}`, () =>
      apiCall('POST', `/api/v1/worlds/${worldId}/pois`, jwt, {
        name: poi.name,
        description: poi.description,
        status: poi.status,
        worldX: poi.worldX,
        worldY: poi.worldY,
      }),
    );
  }
}

async function main(): Promise<void> {
  console.log(`[seed-demo] demo user ${DEMO_EMAIL} @ ${API_BASE_URL}`);
  const demo = await findOrCreateUser(DEMO_EMAIL, DEMO_PASSWORD);

  const list = await apiCall<{ data: Array<{ id: string; name: string; worldId: string }> }>(
    'GET',
    '/api/v1/campaigns',
    demo.jwt,
  );
  const existing = list.data?.find((c) => c.name === CAMPAIGN_NAME);
  if (existing) {
    console.log('[seed-demo] campaign already exists — seeding POIs idempotently.');
    await seedPois(existing.worldId, demo.jwt);
    console.log('[seed-demo] done.');
    return;
  }

  const campaign = await apiCall<{ id: string; worldId: string }>('POST', '/api/v1/campaigns', demo.jwt, {
    name: CAMPAIGN_NAME,
  });
  const { id: campaignId, worldId } = campaign;
  console.log(`  [world] created (worldId ${worldId}, campaignId ${campaignId})`);

  await buildFighter(worldId, demo.jwt, 'Kael el Centinela');
  await buildWizard(worldId, demo.jwt, 'Lyra Vexcel');

  const scheduledAt = new Date(Date.now() + 5 * 86_400_000).toISOString();
  await tryCreate('session', () =>
    apiCall('POST', '/api/v1/sessions', demo.jwt, {
      campaignId,
      title: 'Sesión 1 — La Cripta de Eldrath',
      description: 'El gremio explora la cripta bajo las ruinas. Traigan antorchas.',
      scheduledAt,
      levelMin: 1,
      levelMax: 3,
      maxPlayers: 5,
    }),
  );

  await tryCreate('quest: Rescatar al herrero', () =>
    apiCall('POST', `/api/v1/worlds/${worldId}/quests`, demo.jwt, {
      title: 'Rescatar al herrero de Piedravado',
      description: 'Los goblins se llevaron a Borin. Recompensa: 200 po y una armadura.',
      status: 'active',
      visibility: 'public',
    }),
  );
  await tryCreate('quest: El faro apagado', () =>
    apiCall('POST', `/api/v1/worlds/${worldId}/quests`, demo.jwt, {
      title: 'El faro apagado de la Costa Rota',
      description: 'El faro lleva tres noches sin luz. Los pescadores temen lo peor.',
      status: 'active',
      visibility: 'public',
    }),
  );

  const notes: Array<{ title: string; body: string; tags: string[] }> = [
    {
      title: 'Avistamiento: goblins al norte del vado',
      body: 'Grupo de ~6 goblins con un lobo. Emboscan cerca del puente. Cuidado al cruzar.',
      tags: ['rumor', 'goblins'],
    },
    {
      title: 'El mercader Aldo compra reliquias élficas',
      body: 'Paga bien por cualquier cosa con runas. Pregunta demasiado sobre la cripta.',
      tags: ['npc', 'mercado'],
    },
    {
      title: 'Sesión pasada: caída del puente colgante',
      body: 'El grupo perdió las provisiones al cruzar. Kael salvó a Lyra de la corriente.',
      tags: ['recap'],
    },
  ];
  for (const n of notes) {
    await tryCreate(`nota: ${n.title}`, () =>
      apiCall('POST', `/api/v1/worlds/${worldId}/journal-entries`, demo.jwt, {
        title: n.title,
        body: n.body,
        visibility: 'public',
        tags: n.tags,
      }),
    );
  }

  await seedPois(worldId, demo.jwt);

  console.log('[seed-demo] done.');
}

main().catch((e) => {
  console.error('[seed-demo] FAILED:', e);
  process.exit(1);
});
