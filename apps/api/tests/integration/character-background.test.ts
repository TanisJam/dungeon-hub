import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';

// Slug for "Custom Background" (PHB p.126) — derived via slugify("Custom Background")
const CUSTOM_BG = { slug: 'custom-background', source: 'PHB' } as const;

describe('PUT /characters/:id/background', () => {
  let user: TestUser;
  let characterId: string;

  beforeAll(async () => {
    const app = await getTestApp();
    user = await createTestUser();

    const campaign = await app
      .inject({
        method: 'POST',
        url: '/api/v1/campaigns',
        headers: { authorization: `Bearer ${user.accessToken}` },
        payload: { name: 'Background Test Campaign' },
      })
      .then((r) => r.json());

    const character = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${user.accessToken}` },
        payload: { campaignId: campaign.id, name: 'BG Test Char' },
      })
      .then((r) => r.json());
    characterId = character.id;
  });

  afterAll(async () => {
    if (user) await deleteTestUser(user.id);
    await closeTestApp();
  });

  it('aplica Sage con 2 idiomas standard elegidos', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${characterId}/background`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        background: { slug: 'sage', source: 'PHB' },
        languageChoices: ['draconic', 'elvish'],
      },
    });

    expect(res.statusCode).toBe(200);
    const bg = res.json().data.background;
    expect(bg.slug).toBe('sage');
    expect(bg.skills).toEqual(['arcana', 'history']);
    expect(bg.languages).toEqual(['draconic', 'elvish']);
  });

  it('rechaza Sage sin idiomas elegidos (faltan 2)', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${characterId}/background`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: { background: { slug: 'sage', source: 'PHB' } },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().issues[0].code).toBe('BACKGROUND_LANGUAGE_COUNT_MISMATCH');
  });

  it('aplica Criminal con un gaming set elegido', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${characterId}/background`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        background: { slug: 'criminal', source: 'PHB' },
        toolChoices: { anyGamingSet: ['dice set'] },
      },
    });

    expect(res.statusCode).toBe(200);
    const bg = res.json().data.background;
    expect(bg.tools).toContain("thieves' tools");
    expect(bg.tools).toContain('dice set');
  });

  it('rechaza background inexistente', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${characterId}/background`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: { background: { slug: 'fake-bg', source: 'PHB' } },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().issues[0].code).toBe('BACKGROUND_NOT_FOUND');
  });
});

// ---------------------------------------------------------------------------
// C.1 — Custom Background (any:2) integration tests
// PHB p.126: skillProficiencies: [{ any: 2 }] — player picks 2 from ALL_SKILLS
// ---------------------------------------------------------------------------
describe('PUT /characters/:id/background — Custom Background skill picker', () => {
  let user: TestUser;
  /** Character with no class set — used for most cases */
  let characterId: string;
  /** Character with Wizard class (arcana + history) — used for class-overlap test */
  let charWithClassId: string;

  beforeAll(async () => {
    const app = await getTestApp();
    user = await createTestUser();

    const campaign = await app
      .inject({
        method: 'POST',
        url: '/api/v1/campaigns',
        headers: { authorization: `Bearer ${user.accessToken}` },
        payload: { name: 'Custom BG Test Campaign' },
      })
      .then((r) => r.json());

    // Bare character (no class) for happy-path / validation tests
    const bare = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${user.accessToken}` },
        payload: { campaignId: campaign.id, name: 'Custom BG Bare Char' },
      })
      .then((r) => r.json());
    characterId = bare.id;

    // Character with Wizard class (skillChoices: arcana, history) — for cross-step overlap
    const withClass = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${user.accessToken}` },
        payload: { campaignId: campaign.id, name: 'Custom BG Class Char' },
      })
      .then((r) => r.json());
    charWithClassId = withClass.id;

    await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${charWithClassId}/class`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        class: { slug: 'wizard', source: 'PHB' },
        level: 1,
        skillChoices: ['arcana', 'history'],
      },
    });
  });

  afterAll(async () => {
    if (user) await deleteTestUser(user.id);
    await closeTestApp();
  });

  it('happy path: 2 distinct valid skills → 200 with appliedBackground.skills', async () => {
    const app = await getTestApp();
    // Custom Background (PHB p.126) also requires 2 language choices (anyStandard:2)
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${characterId}/background`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        background: CUSTOM_BG,
        skillChoices: ['perception', 'stealth'],
        languageChoices: ['draconic', 'elvish'],
      },
    });

    expect(res.statusCode).toBe(200);
    const bg = res.json().data.background;
    expect(bg.slug).toBe('custom-background');
    expect(bg.skills).toHaveLength(2);
    expect(bg.skills).toContain('perception');
    expect(bg.skills).toContain('stealth');
  });

  it('rejects empty skillChoices → 400 BACKGROUND_SKILL_CHOICES_REQUIRED', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${characterId}/background`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        background: CUSTOM_BG,
        skillChoices: [],
      },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.issues[0].code).toBe('BACKGROUND_SKILL_CHOICES_REQUIRED');
  });

  it('rejects duplicate skill pick → 400 BACKGROUND_SKILL_DUPLICATE', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${characterId}/background`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        background: CUSTOM_BG,
        skillChoices: ['perception', 'perception'],
      },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.issues[0].code).toBe('BACKGROUND_SKILL_DUPLICATE');
  });

  it('rejects skill not in ALL_SKILLS → 400 BACKGROUND_SKILL_NOT_ALLOWED', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${characterId}/background`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        background: CUSTOM_BG,
        skillChoices: ['perception', 'notaskill'],
      },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.issues[0].code).toBe('BACKGROUND_SKILL_NOT_ALLOWED');
  });

  it('rejects skill that overlaps class grant → 400 SKILL_DUPLICATE_WITH_CLASS', async () => {
    const app = await getTestApp();
    // Wizard already granted 'arcana' and 'history'; trying to pick 'arcana' in BG
    // Must also include languageChoices so validator passes and cross-step check fires
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${charWithClassId}/background`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        background: CUSTOM_BG,
        skillChoices: ['arcana', 'stealth'],
        languageChoices: ['draconic', 'elvish'],
      },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.issues[0].code).toBe('SKILL_DUPLICATE_WITH_CLASS');
    expect(body.issues[0].skills).toContain('arcana');
  });
});
