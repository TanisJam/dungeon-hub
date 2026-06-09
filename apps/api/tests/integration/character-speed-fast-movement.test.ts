/**
 * Integration tests — Barbarian Fast Movement (PHB p.49).
 *
 * Verifies that GET /characters/:id/sheet returns the correct sheet.speed.walk
 * for various barbarian configurations, using real Supabase + Postgres.
 *
 * PHB p.49: "Starting at 5th level, your speed increases by 10 feet while
 * you aren't wearing heavy armor."
 *
 * REQ-SPEED-01 (level gate), REQ-SPEED-02 (armor gate), REQ-SPEED-09 (non-barb),
 * REQ-SPEED-10 (barb <5), REQ-SPEED-11 (legacy tolerance), REQ-SPEED-14.
 * SCENARIO-16 (integration).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';

// ── Shared helpers ────────────────────────────────────────────────────────────

async function createCampaignAndCharacter(
  app: Awaited<ReturnType<typeof getTestApp>>,
  user: TestUser,
  name: string,
) {
  const campaign = await app
    .inject({
      method: 'POST',
      url: '/api/v1/campaigns',
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: { name: `Speed Test ${name}` },
    })
    .then((r) => r.json());

  const character = await app
    .inject({
      method: 'POST',
      url: '/api/v1/characters',
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: { worldId: campaign.worldId, name },
    })
    .then((r) => r.json());

  return { characterId: character.id as string };
}

async function expectOk(label: string, res: { statusCode: number; body: string }) {
  if (res.statusCode !== 200 && res.statusCode !== 201) {
    throw new Error(`${label}: ${res.statusCode} ${res.body}`);
  }
}

async function setStats(
  app: Awaited<ReturnType<typeof getTestApp>>,
  user: TestUser,
  characterId: string,
) {
  // Point-buy 27: str:10(2)+dex:14(7)+con:15(9)+int:10(2)+wis:13(5)+cha:10(2) = 27
  await expectOk(
    'stats',
    await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${characterId}/stats`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        method: 'point-buy',
        scores: { str: 10, dex: 14, con: 15, int: 10, wis: 13, cha: 10 },
      },
    }),
  );
}

async function setHuman(
  app: Awaited<ReturnType<typeof getTestApp>>,
  user: TestUser,
  characterId: string,
) {
  // Human — base walk speed 30 ft (PHB p.29). Standard human requires 1 language choice.
  await expectOk(
    'race',
    await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${characterId}/race`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        race: { slug: 'human', source: 'PHB' },
        subrace: null,
        languageChoices: ['dwarvish'],
      },
    }),
  );
}

async function setBarbarian(
  app: Awaited<ReturnType<typeof getTestApp>>,
  user: TestUser,
  characterId: string,
  level: number,
) {
  // Barbarian unlock subclass at level 3 (Path of the Berserker, PHB p.49).
  // Level >= 3 requires a subclass. Slug pattern: 'barbarian--berserker'.
  const subclass = level >= 3
    ? { slug: 'barbarian--berserker', source: 'PHB' }
    : null;

  await expectOk(
    `barbarian-${level}`,
    await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${characterId}/class`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        class: { slug: 'barbarian', source: 'PHB' },
        level,
        subclass,
        skillChoices: ['athletics', 'intimidation'],
      },
    }),
  );
}

async function getSheet(
  app: Awaited<ReturnType<typeof getTestApp>>,
  user: TestUser,
  characterId: string,
) {
  const res = await app.inject({
    method: 'GET',
    url: `/api/v1/characters/${characterId}/sheet`,
    headers: { authorization: `Bearer ${user.accessToken}` },
  });
  expect(res.statusCode).toBe(200);
  return res.json().sheet;
}

// ── SCENARIO-16 / REQ-SPEED-01 — Barbarian 5, unarmored, base 30 → walk 40 ────

describe('GET /characters/:id/sheet — SCENARIO-16: Barbarian 5, walk speed = 40 (PHB p.49)', () => {
  let user: TestUser;
  let characterId: string;

  beforeAll(async () => {
    const app = await getTestApp();
    user = await createTestUser();
    ({ characterId } = await createCampaignAndCharacter(app, user, 'Grok the Mighty'));
    await setStats(app, user, characterId);
    await setHuman(app, user, characterId);
    await setBarbarian(app, user, characterId, 5);
  });

  afterAll(async () => {
    if (user) await deleteTestUser(user.id);
    await closeTestApp();
  });

  it('sheet.speed.walk = 40 (base 30 + Fast Movement +10, PHB p.49)', async () => {
    // PHB p.49: "Starting at 5th level, your speed increases by 10 feet
    // while you aren't wearing heavy armor." Human base 30 + 10 = 40.
    const app = await getTestApp();
    const sheet = await getSheet(app, user, characterId);
    expect(sheet.speed.walk).toBe(40);
  });
});

// ── REQ-SPEED-10 — Barbarian 4, level gate → walk 30 ─────────────────────────

describe('GET /characters/:id/sheet — REQ-SPEED-10: Barbarian 4, level gate not met → walk 30', () => {
  let user: TestUser;
  let characterId: string;

  beforeAll(async () => {
    const app = await getTestApp();
    user = await createTestUser();
    ({ characterId } = await createCampaignAndCharacter(app, user, 'Grak Junior'));
    await setStats(app, user, characterId);
    await setHuman(app, user, characterId);
    await setBarbarian(app, user, characterId, 4);
  });

  afterAll(async () => {
    if (user) await deleteTestUser(user.id);
    await closeTestApp();
  });

  it('sheet.speed.walk = 30 (barbarian level 4 < 5, PHB p.49)', async () => {
    // PHB p.49: "Starting at 5th level". Level 4 does NOT get the +10.
    const app = await getTestApp();
    const sheet = await getSheet(app, user, characterId);
    expect(sheet.speed.walk).toBe(30);
  });
});

// ── REQ-SPEED-02 — Barbarian 5, heavy armor → walk 30 ────────────────────────

describe('GET /characters/:id/sheet — REQ-SPEED-02: Barbarian 5 + heavy armor → walk 30', () => {
  let user: TestUser;
  let characterId: string;

  beforeAll(async () => {
    const app = await getTestApp();
    user = await createTestUser();
    ({ characterId } = await createCampaignAndCharacter(app, user, 'Ironclad Grok'));
    await setStats(app, user, characterId);
    await setHuman(app, user, characterId);
    await setBarbarian(app, user, characterId, 5);

    // Equip plate armor (HA — heavy). Payload shape per inventory route contract:
    // item: { slug, source } (see character-inventory.test.ts).
    const addRes = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${characterId}/inventory`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        item: { slug: 'plate-armor', source: 'PHB' },
        state: 'equipped',
      },
    });
    expect(addRes.statusCode).toBe(201);
  });

  afterAll(async () => {
    if (user) await deleteTestUser(user.id);
    await closeTestApp();
  });

  it('sheet.speed.walk = 30 when heavy armor is equipped (PHB p.49)', async () => {
    // PHB p.49: "while you aren't wearing heavy armor" — HA disqualifies the +10.
    const app = await getTestApp();
    const sheet = await getSheet(app, user, characterId);
    expect(sheet.speed.walk).toBe(30);
  });
});

// ── REQ-SPEED-09 — Non-barbarian (fighter 5) → walk 30 ───────────────────────

describe('GET /characters/:id/sheet — REQ-SPEED-09: Fighter 5, no Fast Movement → walk 30', () => {
  let user: TestUser;
  let characterId: string;

  beforeAll(async () => {
    const app = await getTestApp();
    user = await createTestUser();
    ({ characterId } = await createCampaignAndCharacter(app, user, 'Sir Aldric Fighter'));
    await setStats(app, user, characterId);
    await setHuman(app, user, characterId);
    // Fighter subclass unlocks at level 3 (Martial Archetype). Champion is simplest.
    await expectOk(
      'fighter',
      await app.inject({
        method: 'PUT',
        url: `/api/v1/characters/${characterId}/class`,
        headers: { authorization: `Bearer ${user.accessToken}` },
        payload: {
          class: { slug: 'fighter', source: 'PHB' },
          level: 5,
          subclass: { slug: 'fighter--champion', source: 'PHB' },
          skillChoices: ['athletics', 'acrobatics'],
        },
      }),
    );
  });

  afterAll(async () => {
    if (user) await deleteTestUser(user.id);
    await closeTestApp();
  });

  it('sheet.speed.walk = 30 (fighter has no Fast Movement, PHB p.49 barbarian only)', async () => {
    // REQ-SPEED-09: non-barbarian characters are unaffected.
    const app = await getTestApp();
    const sheet = await getSheet(app, user, characterId);
    expect(sheet.speed.walk).toBe(30);
  });
});

// ── REQ-SPEED-11 — Legacy row (no race, no class) → resolves without error ────

describe('GET /characters/:id/sheet — REQ-SPEED-11: legacy row (no race) → resolves without error', () => {
  let user: TestUser;
  let characterId: string;

  beforeAll(async () => {
    const app = await getTestApp();
    user = await createTestUser();
    ({ characterId } = await createCampaignAndCharacter(app, user, 'Legacy Placeholder'));
    // No race, no class, no stats — minimal character
  });

  afterAll(async () => {
    if (user) await deleteTestUser(user.id);
    await closeTestApp();
  });

  it('sheet.speed.walk = 30 default (legacy row with no raceData, REQ-SPEED-11)', async () => {
    // REQ-SPEED-11: legacy rows without race data must not error.
    // normalizeSpeed(null) → {walk:30} default.
    const app = await getTestApp();
    const sheet = await getSheet(app, user, characterId);
    expect(sheet.speed.walk).toBe(30);
  });
});
