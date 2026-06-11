/**
 * Integration tests — Monk Unarmored Movement (PHB p.77-78).
 *
 * Verifies that GET /characters/:id/sheet returns the correct sheet.speed.walk
 * for various monk configurations, using real Supabase + Postgres.
 *
 * PHB p.77-78: "Your speed increases by 10 feet while you are not wearing
 * armor or wielding a shield. This bonus increases when you reach certain
 * monk levels, as shown in the Monk table."
 *
 * PHB p.77 Monk table (Unarmored Movement column):
 *   L<2  → +0 (no bonus)
 *   L2-5 → +10
 *   L6+  → +15, +20, +25, +30 (see domain unit tests for boundary coverage)
 *
 * REQ-UM-01 (level gate), REQ-UM-02 (body armor gate), REQ-UM-03 (shield gate),
 * REQ-UM-05 (modifier shape), REQ-UM-06 (stacking with Fast Movement),
 * REQ-HYGIENE-01..04.
 * SCENARIO-UM-API-01..05.
 *
 * Self-contained file: all helpers copied inline (design R7 — no cross-file imports).
 * Mirrors character-speed-fast-movement.test.ts structure.
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
      payload: { name: `UM Speed Test ${name}` },
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

/**
 * Sets monk class on a character.
 *
 * Design R4: monk-2 fixture does NOT require subclass (subclass unlocks at L3).
 * Monk-3+ needs subclass — use 'monk--open-hand' (Way of the Open Hand, PHB p.78).
 */
async function setMonk(
  app: Awaited<ReturnType<typeof getTestApp>>,
  user: TestUser,
  characterId: string,
  level: number,
) {
  const subclass = level >= 3 ? { slug: 'monk--open-hand', source: 'PHB' } : null;

  await expectOk(
    `monk-${level}`,
    await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${characterId}/class`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        class: { slug: 'monk', source: 'PHB' },
        level,
        subclass,
        skillChoices: ['acrobatics', 'stealth'],
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

// ── SCENARIO-UM-API-01 — Monk-2, unarmored, no shield → walk = base + 10 ─────

describe('GET /characters/:id/sheet — SCENARIO-UM-API-01: Monk-2, walk = 40 (PHB p.78)', () => {
  let user: TestUser;
  let characterId: string;

  beforeAll(async () => {
    const app = await getTestApp();
    user = await createTestUser();
    ({ characterId } = await createCampaignAndCharacter(app, user, 'Bao the Monk'));
    await setStats(app, user, characterId);
    await setHuman(app, user, characterId);
    // Monk-2: Unarmored Movement unlocks at L2 (+10 ft). No subclass needed at L2.
    // REQ-HYGIENE-01: setMonk asserts 200/201 internally via expectOk.
    await setMonk(app, user, characterId, 2);
  });

  afterAll(async () => {
    if (user) await deleteTestUser(user.id);
    await closeTestApp();
  });

  it('sheet.speed.walk = 40 (base 30 + Unarmored Movement +10, PHB p.78)', async () => {
    // PHB p.78: "Your speed increases by 10 feet while you are not wearing armor
    // or wielding a shield." PHB p.77 table: L2 → +10. Human base 30 + 10 = 40.
    // REQ-UM-01: monk-2 meets the level gate.
    const app = await getTestApp();
    const sheet = await getSheet(app, user, characterId);
    expect(sheet.speed.walk).toBe(40);
  });
});

// ── SCENARIO-UM-API-02 — Monk-1, level gate not met → walk = base ────────────

describe('GET /characters/:id/sheet — SCENARIO-UM-API-02: Monk-1, level gate not met → walk = 30', () => {
  let user: TestUser;
  let characterId: string;

  beforeAll(async () => {
    const app = await getTestApp();
    user = await createTestUser();
    ({ characterId } = await createCampaignAndCharacter(app, user, 'Novice Bao'));
    await setStats(app, user, characterId);
    await setHuman(app, user, characterId);
    // Monk-1: Unarmored Movement has NO bonus at L1 (PHB p.77 table — L1 column is blank).
    await setMonk(app, user, characterId, 1);
  });

  afterAll(async () => {
    if (user) await deleteTestUser(user.id);
    await closeTestApp();
  });

  it('sheet.speed.walk = 30 (monk level 1 < 2, PHB p.77 — no UM bonus)', async () => {
    // PHB p.77 Monk table: Unarmored Movement column — L1 has no bonus.
    // REQ-UM-01: level gate requires L2+. L1 monk gets no bonus.
    const app = await getTestApp();
    const sheet = await getSheet(app, user, characterId);
    expect(sheet.speed.walk).toBe(30);
  });
});

// ── SCENARIO-UM-API-03 — Monk-2 + equipped body armor → walk = base ──────────

describe('GET /characters/:id/sheet — SCENARIO-UM-API-03: Monk-2 + light armor → walk = 30', () => {
  let user: TestUser;
  let characterId: string;

  beforeAll(async () => {
    const app = await getTestApp();
    user = await createTestUser();
    ({ characterId } = await createCampaignAndCharacter(app, user, 'Armored Bao'));
    await setStats(app, user, characterId);
    await setHuman(app, user, characterId);
    await setMonk(app, user, characterId, 2);

    // Equip leather armor (LA — light body armor). Monk UM gates on ALL body armor.
    // PHB p.78: "while you are not wearing armor" (all body armor, stricter than Barbarian FM).
    // REQ-HYGIENE-01: assert 201 on equip (payload shape: { item: { slug, source }, state }).
    const addRes = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${characterId}/inventory`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        item: { slug: 'leather-armor', source: 'PHB' },
        state: 'equipped',
      },
    });
    expect(addRes.statusCode).toBe(201);
  });

  afterAll(async () => {
    if (user) await deleteTestUser(user.id);
    await closeTestApp();
  });

  it('sheet.speed.walk = 30 when light armor is equipped (PHB p.78 — all body armor disqualifies)', async () => {
    // PHB p.78: "while you are not wearing armor" — LA disqualifies Monk UM.
    // REQ-UM-02: ALL body armor (LA/MA/HA) gates the Unarmored Movement bonus.
    // Unlike Barbarian Fast Movement (heavy armor only), Monk gates on any body armor.
    const app = await getTestApp();
    const sheet = await getSheet(app, user, characterId);
    expect(sheet.speed.walk).toBe(30);
  });
});

// ── SCENARIO-UM-API-04 — Monk-2 + equipped shield → walk = base ──────────────

describe('GET /characters/:id/sheet — SCENARIO-UM-API-04: Monk-2 + shield → walk = 30', () => {
  let user: TestUser;
  let characterId: string;

  beforeAll(async () => {
    const app = await getTestApp();
    user = await createTestUser();
    ({ characterId } = await createCampaignAndCharacter(app, user, 'Shielded Bao'));
    await setStats(app, user, characterId);
    await setHuman(app, user, characterId);
    await setMonk(app, user, characterId, 2);

    // Equip a shield (type 'S'). PHB p.78: "not ... wielding a shield" disqualifies.
    // REQ-HYGIENE-01: assert 201 on equip.
    const addRes = await app.inject({
      method: 'POST',
      url: `/api/v1/characters/${characterId}/inventory`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        item: { slug: 'shield', source: 'PHB' },
        state: 'equipped',
      },
    });
    expect(addRes.statusCode).toBe(201);
  });

  afterAll(async () => {
    if (user) await deleteTestUser(user.id);
    await closeTestApp();
  });

  it('sheet.speed.walk = 30 when shield is equipped (PHB p.78 — shield disqualifies UM)', async () => {
    // PHB p.78: "while you are not wearing armor or wielding a shield"
    // REQ-UM-03: shield gate. Shield equipped → Unarmored Movement bonus suppressed.
    const app = await getTestApp();
    const sheet = await getSheet(app, user, characterId);
    expect(sheet.speed.walk).toBe(30);
  });
});

// SCENARIO-UM-API-05 — Multiclass Barb-5/Monk-2 → walk = 50 (PHB p.49 + p.77-78 [pending physical-book verification by Mauricio])

describe('GET /characters/:id/sheet — SCENARIO-UM-API-05: Barb-5/Monk-2 multiclass → walk = 50', () => {
  let user: TestUser;
  let characterId: string;

  beforeAll(async () => {
    const app = await getTestApp();
    user = await createTestUser();
    ({ characterId } = await createCampaignAndCharacter(app, user, 'Raging Monk'));

    // Own stat block: str:13/dex:13/con:13/int:10/wis:13/cha:13 = 27 pts (point-buy budget).
    // REQUIRED: barb prereq STR>=13 (prereqs.ts:24) + monk prereq DEX>=13 AND WIS>=13 (prereqs.ts:29).
    // Do NOT reuse setStats() — it uses str:10 which fails barb STR>=13 silently.
    await expectOk(
      'stats',
      await app.inject({
        method: 'PUT',
        url: `/api/v1/characters/${characterId}/stats`,
        headers: { authorization: `Bearer ${user.accessToken}` },
        payload: {
          method: 'point-buy',
          scores: { str: 13, dex: 13, con: 13, int: 10, wis: 13, cha: 13 },
        },
      }),
    );

    // Human base walk 30 ft (PHB p.29).
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

    // Set barbarian L5 via PUT /class (replace-semantics — sets primary class directly).
    // Barbarian L5: Fast Movement unlocked (PHB p.49 — feature at L5). Subclass required at L3+.
    await expectOk(
      'barbarian-5',
      await app.inject({
        method: 'PUT',
        url: `/api/v1/characters/${characterId}/class`,
        headers: { authorization: `Bearer ${user.accessToken}` },
        payload: {
          class: { slug: 'barbarian', source: 'PHB' },
          level: 5,
          subclass: { slug: 'barbarian--berserker', source: 'PHB' },
          skillChoices: ['athletics', 'intimidation'],
        },
      }),
    );

    // Add monk at L1 via POST /classes (adds secondary class; always lands at L1 per characters.ts:2567).
    // Monk skill choices: acrobatics + stealth (PHB p.76 — Monk proficiencies).
    await expectOk(
      'post-classes-monk',
      await app.inject({
        method: 'POST',
        url: `/api/v1/characters/${characterId}/classes`,
        headers: { authorization: `Bearer ${user.accessToken}` },
        payload: {
          class: { slug: 'monk', source: 'PHB' },
          skillChoices: ['acrobatics', 'stealth'],
        },
      }),
    );

    // Grant XP to reach total level 7 (barb5 + monk2 = 7).
    // XP_THRESHOLDS[6] = 23_000 (xp-table.ts, index 0 = L1). Campaign creator is world GM.
    await expectOk(
      'award-xp',
      await app.inject({
        method: 'POST',
        url: `/api/v1/characters/${characterId}/xp`,
        headers: { authorization: `Bearer ${user.accessToken}` },
        payload: { award: 23000 },
      }),
    );

    // Level monk from L1 → L2 using per-class level-up route (edit-time path, XP-gated).
    // Monk L2: Unarmored Movement unlocks (+10 ft while unarmored/no shield, PHB p.77-78).
    // hpMethod:'average' is deterministic — no RNG needed (REQ-UMAPI-06).
    await expectOk(
      'monk-level-up',
      await app.inject({
        method: 'POST',
        url: `/api/v1/characters/${characterId}/classes/monk/level-up`,
        headers: { authorization: `Bearer ${user.accessToken}` },
        payload: { hpMethod: 'average' },
      }),
    );
  });

  afterAll(async () => {
    if (user) await deleteTestUser(user.id);
    await closeTestApp();
  });

  it('sheet.speed.walk = 50 (barb5 FM +10 + monk2 UM +10, PHB p.49 + p.77-78)', async () => {
    // PHB p.49: Barbarian L5 Fast Movement → +10 ft (unarmored/light/medium).
    // PHB p.77-78: Monk L2 Unarmored Movement → +10 ft (no armor, no shield). [pending physical-book verification by Mauricio]
    // Base 30 + 10 + 10 = 50 (additive — no anti-stack rule for speed bonuses).
    // REQ-UMAPI-06: speed is deterministic, no RNG retry loop needed.
    const app = await getTestApp();
    const sheet = await getSheet(app, user, characterId);
    expect(sheet.speed.walk).toBe(50);
  });
});
