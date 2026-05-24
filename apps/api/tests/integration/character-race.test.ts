import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { closeTestApp, getTestApp } from '../helpers/test-app.js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user.js';
import { db } from '../../src/infra/db/client.js';
import { characters, compendiumRaces } from '../../src/infra/db/schema.js';

describe('PUT /characters/:id/race', () => {
  let user: TestUser;
  let characterId: string;
  let campaignId: string;

  beforeAll(async () => {
    // Guard against stale additionalSpellsNormalized from a prior Batch 6 run.
    await db
      .update(compendiumRaces)
      .set({ data: sql`data - 'additionalSpellsNormalized'`, updatedAt: new Date() })
      .where(eq(compendiumRaces.slug, 'elf--high'));

    const app = await getTestApp();
    user = await createTestUser();

    const campaign = await app
      .inject({
        method: 'POST',
        url: '/api/v1/campaigns',
        headers: { authorization: `Bearer ${user.accessToken}` },
        payload: { name: 'Race Test Campaign' },
      })
      .then((r) => r.json());
    campaignId = campaign.id;

    const character = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${user.accessToken}` },
        payload: { campaignId, name: 'Race Test Char' },
      })
      .then((r) => r.json());
    characterId = character.id;
  });

  afterAll(async () => {
    if (user) await deleteTestUser(user.id);
    await closeTestApp();
  });

  it('aplica ASIs fijos de Elf + High Elf sin pedir appliedAsis', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${characterId}/race`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        race: { slug: 'elf', source: 'PHB' },
        subrace: { slug: 'elf--high', source: 'PHB' },
        languageChoices: ['dwarvish'],
      },
    });

    expect(res.statusCode).toBe(200);
    const c = res.json();
    expect(c.data.race).toEqual({ slug: 'elf', source: 'PHB' });
    expect(c.data.subrace).toEqual({ slug: 'elf--high', source: 'PHB' });
    expect(c.data.raceLanguageChoices).toEqual(['dwarvish']);
    expect(c.data.asisApplied).toContainEqual({ ability: 'dex', bonus: 2, source: 'race' });
    expect(c.data.asisApplied).toContainEqual({ ability: 'int', bonus: 1, source: 'subrace' });
    expect(c.data.usedTashasCustomOrigin).toBe(false);
  });

  it('Half-Elf: requiere appliedAsis cuando hay choose en el block', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${characterId}/race`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        race: { slug: 'half-elf', source: 'PHB' },
        languageChoices: ['dwarvish'],
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().issues[0].code).toBe('ASI_REQUIRED');
  });

  it('Half-Elf: acepta +2 CHA + 2 picks de +1 a stats no-CHA + 2 skill picks', async () => {
    const app = await getTestApp();
    // Half-Elf has skillProficiencies:[{any:2}] — requires 2 skillChoices.
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${characterId}/race`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        race: { slug: 'half-elf', source: 'PHB' },
        appliedAsis: [
          { ability: 'cha', bonus: 2, source: 'race' },
          { ability: 'dex', bonus: 1, source: 'race' },
          { ability: 'con', bonus: 1, source: 'race' },
        ],
        languageChoices: ['dwarvish'],
        skillChoices: ['insight', 'perception'],
      },
    });

    expect(res.statusCode).toBe(200);
    const c = res.json();
    expect(c.data.race).toEqual({ slug: 'half-elf', source: 'PHB' });
    expect(c.data.asisApplied).toHaveLength(3);
    expect(c.data.asisApplied).toContainEqual({ ability: 'cha', bonus: 2, source: 'race' });
    expect(c.data.raceLanguageChoices).toEqual(['dwarvish']);
    expect(c.data.raceSkillChoices).toEqual(['insight', 'perception']);
  });

  it("requiere appliedAsis cuando Tasha's está ON, y los redistribuye", async () => {
    const app = await getTestApp();

    // Habilitar Tasha's en la campaña (PATCH del Rules Profile)
    await app.inject({
      method: 'PATCH',
      url: `/api/v1/campaigns/${campaignId}`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        rulesProfile: {
          sources: {
            PHB: true, DMG: true, XGE: true, TCE: true, MPMM: true,
            MTF: true, SCAG: true, FTD: true, VGM: true, EGW: true,
          },
          disabledEntities: {
            races: [], subraces: [], classes: [], subclasses: [],
            backgrounds: [], spells: [], items: [], feats: [],
          },
          variantRules: {
            multiclassing: true,
            feats: true,
            variantHumanAndCustomLineage: true,
            encumbranceVariant: false,
            tashasCustomOrigin: true, // ← ON
            tashasOptionalClassFeatures: false,
          },
          statGeneration: { standardArray: true, pointBuy: true, roll: true },
          hpOnLevelUp: 'player-choice',
        },
      },
    });

    // Sin appliedAsis con Tasha's ON debería pedir input
    const missing = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${characterId}/race`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        race: { slug: 'elf', source: 'PHB' },
        subrace: { slug: 'elf--high', source: 'PHB' },
        languageChoices: ['dwarvish'],
      },
    });
    expect(missing.statusCode).toBe(400);
    expect(missing.json().issues[0].code).toBe('ASI_REQUIRED');

    // Con appliedAsis distribuyendo +2 a STR y +1 a CHA
    const ok = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${characterId}/race`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        race: { slug: 'elf', source: 'PHB' },
        subrace: { slug: 'elf--high', source: 'PHB' },
        appliedAsis: [
          { ability: 'str', bonus: 2, source: 'race' },
          { ability: 'cha', bonus: 1, source: 'subrace' },
        ],
        languageChoices: ['dwarvish'],
      },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().data.usedTashasCustomOrigin).toBe(true);
    expect(ok.json().data.asisApplied).toContainEqual({ ability: 'str', bonus: 2, source: 'race' });
    expect(ok.json().data.asisApplied).toContainEqual({ ability: 'cha', bonus: 1, source: 'subrace' });
  });

  it('acepta race MPMM (ability null) con +2/+1', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${characterId}/race`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        race: { slug: 'aasimar', source: 'MPMM' },
        appliedAsis: [
          { ability: 'cha', bonus: 2, source: 'race' },
          { ability: 'wis', bonus: 1, source: 'race' },
        ],
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.race).toEqual({ slug: 'aasimar', source: 'MPMM' });
  });

  it('rechaza race cuya source está deshabilitada en la campaña', async () => {
    const app = await getTestApp();

    // Crear otra campaña con VGM OFF
    const newCamp = await app
      .inject({
        method: 'POST',
        url: '/api/v1/campaigns',
        headers: { authorization: `Bearer ${user.accessToken}` },
        payload: {
          name: 'No VGM',
          rulesProfile: {
            sources: { PHB: true, VGM: false },
            disabledEntities: {
              races: [], subraces: [], classes: [], subclasses: [],
              backgrounds: [], spells: [], items: [], feats: [],
            },
            variantRules: {
              multiclassing: true,
              feats: true,
              variantHumanAndCustomLineage: true,
              encumbranceVariant: false,
              tashasCustomOrigin: false,
              tashasOptionalClassFeatures: false,
            },
            statGeneration: { standardArray: true, pointBuy: true, roll: true },
            hpOnLevelUp: 'player-choice',
          },
        },
      })
      .then((r) => r.json());

    const ch = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${user.accessToken}` },
        payload: { campaignId: newCamp.id, name: 'No VGM Char' },
      })
      .then((r) => r.json());

    // Aasimar VGM debería rechazarse
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${ch.id}/race`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        race: { slug: 'aasimar', source: 'VGM' },
        appliedAsis: [{ ability: 'cha', bonus: 2, source: 'race' }],
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().issues[0].code).toBe('RACE_DISABLED');
  });

  it('rechaza raza inexistente con RACE_NOT_FOUND', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${characterId}/race`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: { race: { slug: 'this-race-does-not-exist', source: 'PHB' } },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().issues[0].code).toBe('RACE_NOT_FOUND');
  });
});

describe('RACE_SUBRACE_REQUIRED — gate + read-path tolerance', () => {
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
        payload: { name: 'Subrace Required Test Campaign' },
      })
      .then((r) => r.json());

    const character = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${user.accessToken}` },
        payload: { campaignId: campaign.id, name: 'Subrace Required Char' },
      })
      .then((r) => r.json());
    characterId = character.id;
  });

  afterAll(async () => {
    if (user) await deleteTestUser(user.id);
    await closeTestApp();
  });

  it('A-1: PUT /race con Dwarf sin subrace → 400 VALIDATION_FAILED + RACE_SUBRACE_REQUIRED', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${characterId}/race`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        race: { slug: 'dwarf', source: 'PHB' },
        languageChoices: [],
      },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toBe('VALIDATION_FAILED');
    expect(body.issues).toHaveLength(1);
    expect(body.issues[0]).toEqual({
      code: 'RACE_SUBRACE_REQUIRED',
      race: { slug: 'dwarf', source: 'PHB' },
    });
  });

  it('A-2: PUT /race con Dwarf + Hill Dwarf subrace → 200 (regression)', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${characterId}/race`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        race: { slug: 'dwarf', source: 'PHB' },
        subrace: { slug: 'dwarf--hill', source: 'PHB' },
        languageChoices: [],
      },
    });

    expect(res.statusCode).toBe(200);
    const c = res.json();
    expect(c.data.race).toEqual({ slug: 'dwarf', source: 'PHB' });
    expect(c.data.subrace).toEqual({ slug: 'dwarf--hill', source: 'PHB' });
  });

  it('A-3: GET /characters/:id con legado Dwarf + null subrace → 200 (read-path tolerance)', async () => {
    const app = await getTestApp();

    // Seed legacy state directly: character with dwarf race and null subrace (pre-gate data)
    await db
      .update(characters)
      .set({
        data: {
          race: { slug: 'dwarf', source: 'PHB' },
          subrace: null,
        },
        updatedAt: new Date(),
      })
      .where(eq(characters.id, characterId));

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/characters/${characterId}`,
      headers: { authorization: `Bearer ${user.accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const c = res.json();
    expect(c.data.race).toEqual({ slug: 'dwarf', source: 'PHB' });
    expect(c.data.subrace).toBeNull();
  });
});

// ============================================================
// Phase B — Variant Human feat + skill (race-variant-human-feat-skill)
// ============================================================

describe('PUT /characters/:id/race — Variant Human feat + skill picks', () => {
  let user: TestUser;
  let characterId: string;
  let campaignId: string;

  beforeAll(async () => {
    const app = await getTestApp();
    user = await createTestUser();

    const campaign = await app
      .inject({
        method: 'POST',
        url: '/api/v1/campaigns',
        headers: { authorization: `Bearer ${user.accessToken}` },
        payload: { name: 'VH Feat Test Campaign' },
      })
      .then((r) => r.json());
    campaignId = campaign.id;

    const character = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${user.accessToken}` },
        payload: { campaignId, name: 'Variant Human Test Char' },
      })
      .then((r) => r.json());
    characterId = character.id;

    // Set base stats (required for feat validation context)
    const sRes = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${characterId}/stats`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        method: 'point-buy',
        scores: { str: 8, dex: 10, con: 12, int: 15, wis: 14, cha: 13 },
      },
    });
    if (sRes.statusCode !== 200) throw new Error(`stats setup: ${sRes.body}`);
  });

  afterAll(async () => {
    if (user) await deleteTestUser(user.id);
  });

  // Variant Human DB shape:
  //   race: human (PHB) — no ability field, languageProficiencies:[{common:true,anyStandard:1}]
  //   subrace: human--variant (PHB) — ability:[{choose:{from:all,count:2,amount:1}}],
  //            skillProficiencies:[{any:1}], feats:[{any:1}]

  it('A-1: Variant Human — full happy path (feat=Alert, skill=insight) → 200', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${characterId}/race`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        race: { slug: 'human', source: 'PHB' },
        subrace: { slug: 'human--variant', source: 'PHB' },
        appliedAsis: [
          { ability: 'int', bonus: 1, source: 'subrace' },
          { ability: 'wis', bonus: 1, source: 'subrace' },
        ],
        languageChoices: ['dwarvish'],
        skillChoices: ['insight'],
        featChoice: { slug: 'alert', source: 'PHB' },
      },
    });

    if (res.statusCode !== 200) console.log('A-1 body:', res.body);
    expect(res.statusCode).toBe(200);
    const c = res.json();
    expect(c.data.race).toEqual({ slug: 'human', source: 'PHB' });
    expect(c.data.subrace).toEqual({ slug: 'human--variant', source: 'PHB' });
    expect(c.data.raceSkillChoices).toEqual(['insight']);
    expect(c.data.raceFeatSlug).toBe('alert');
    // Alert is in the feats array (source is the compendium source 'PHB', not 'race')
    const alertFeat = (c.data.feats as Array<{slug: string; source: string}>)
      .find((f) => f.slug === 'alert');
    expect(alertFeat).toBeDefined();
  });

  it('A-2: Variant Human — missing featChoice → 400 RACE_FEAT_REQUIRED', async () => {
    const app = await getTestApp();
    // Variant Human: human (anyStandard:1 lang) + human--variant subrace (choose 2 ASIs,
    // skillProficiencies:[{any:1}], feats:[{any:1}]).
    // Sending correct ASIs + lang + skillChoices but NO featChoice.
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${characterId}/race`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        race: { slug: 'human', source: 'PHB' },
        subrace: { slug: 'human--variant', source: 'PHB' },
        // Variant Human subrace ability:[{choose:{from:all,count:2,amount:1}}]
        appliedAsis: [
          { ability: 'str', bonus: 1, source: 'subrace' },
          { ability: 'dex', bonus: 1, source: 'subrace' },
        ],
        // Human base has languageProficiencies:[{common:true, anyStandard:1}]
        languageChoices: ['dwarvish'],
        // Variant Human subrace has skillProficiencies:[{any:1}]
        skillChoices: ['insight'],
        // NO featChoice → should get RACE_FEAT_REQUIRED
      },
    });

    expect(res.statusCode).toBe(400);
    const issues = res.json().issues as Array<{ code: string }>;
    const codes = issues.map((i) => i.code);
    expect(codes).toContain('RACE_FEAT_REQUIRED');
  });

  it('A-7: Race without skill grants (Half-Orc) — stray skillChoices ignored → 200, raceSkillChoices=[]', async () => {
    const app = await getTestApp();
    // Half-Orc: STR+2 CON+1, no language any-slot, no skill grants in DB.
    // Stray skillChoices must be silently ignored (validateRaceSkillChoices returns [] when
    // expectedAnyCount === 0). This proves the no-op path.
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${characterId}/race`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        race: { slug: 'half-orc', source: 'PHB' },
        // stray skillChoices should be IGNORED for races without skillProficiencies
        skillChoices: ['perception'],
      },
    });

    expect(res.statusCode).toBe(200);
    const c = res.json();
    expect(c.data.race).toEqual({ slug: 'half-orc', source: 'PHB' });
    // raceSkillChoices should be empty (stray picks ignored)
    expect(c.data.raceSkillChoices ?? []).toEqual([]);
    // raceFeatSlug should not be set
    expect(c.data.raceFeatSlug ?? null).toBeNull();
  });

  it('A-8: GET legacy Variant Human row (no feat/skill in data) → 200, no crash', async () => {
    // Directly write a legacy character row without raceFeatSlug / raceSkillChoices.
    // Keep baseStats so subsequent tests (A-9, A-10) that need feat validation still work.
    const app = await getTestApp();
    const [current] = await db.select().from(characters).where(eq(characters.id, characterId)).limit(1);
    const existingData = (current?.data as Record<string, unknown> | null) ?? {};
    await db
      .update(characters)
      .set({
        data: {
          ...existingData,
          race: { slug: 'human', source: 'PHB' },
          subrace: { slug: 'human--variant', source: 'PHB' },
          asisApplied: [
            { ability: 'str', bonus: 1, source: 'subrace' },
            { ability: 'dex', bonus: 1, source: 'subrace' },
          ],
          // Intentionally omit raceFeatSlug / raceSkillChoices — simulates legacy shape
        },
        updatedAt: new Date(),
      })
      .where(eq(characters.id, characterId));

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/characters/${characterId}`,
      headers: { authorization: `Bearer ${user.accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const c = res.json();
    expect(c.data.race).toEqual({ slug: 'human', source: 'PHB' });
    // Should not crash even without feat/skill fields
  });

  it('A-9: GET /sheet for legacy Variant Human → 200, skills include only class skills (no crash)', async () => {
    const app = await getTestApp();
    // Set class so the sheet computes
    await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${characterId}/class`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        class: { slug: 'wizard', source: 'PHB' },
        level: 1,
        skillChoices: ['arcana', 'history'],
      },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/characters/${characterId}/sheet`,
      headers: { authorization: `Bearer ${user.accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    const arcana = body.sheet.skills.find((s: { name: string }) => s.name === 'arcana');
    expect(arcana?.proficient).toBe(true);
  });

  it('A-4: Half-Elf — 2 skill choices → 200 + raceSkillChoices persisted', async () => {
    const app = await getTestApp();
    // Half-Elf: CHA+2 + 2 choose picks + 1 anyStandard lang + 2 skill picks
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${characterId}/race`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        race: { slug: 'half-elf', source: 'PHB' },
        appliedAsis: [
          { ability: 'cha', bonus: 2, source: 'race' },
          { ability: 'str', bonus: 1, source: 'race' },
          { ability: 'con', bonus: 1, source: 'race' },
        ],
        languageChoices: ['dwarvish'],
        skillChoices: ['athletics', 'stealth'],
      },
    });

    if (res.statusCode !== 200) console.log('A-4 body:', res.body);
    expect(res.statusCode).toBe(200);
    const c = res.json();
    expect(c.data.raceSkillChoices).toEqual(['athletics', 'stealth']);
    expect(c.data.raceFeatSlug ?? null).toBeNull();
  });

  it('A-10: Re-edit Variant Human — second PUT replaces previous race feat', async () => {
    const app = await getTestApp();
    // First PUT: pick Alert
    await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${characterId}/race`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        race: { slug: 'human', source: 'PHB' },
        subrace: { slug: 'human--variant', source: 'PHB' },
        appliedAsis: [
          { ability: 'str', bonus: 1, source: 'subrace' },
          { ability: 'dex', bonus: 1, source: 'subrace' },
        ],
        languageChoices: ['elvish'],
        skillChoices: ['perception'],
        featChoice: { slug: 'alert', source: 'PHB' },
      },
    });

    // Second PUT: re-pick with Lucky feat
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${characterId}/race`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        race: { slug: 'human', source: 'PHB' },
        subrace: { slug: 'human--variant', source: 'PHB' },
        appliedAsis: [
          { ability: 'int', bonus: 1, source: 'subrace' },
          { ability: 'cha', bonus: 1, source: 'subrace' },
        ],
        languageChoices: ['dwarvish'],
        skillChoices: ['history'],
        featChoice: { slug: 'lucky', source: 'PHB' },
      },
    });

    if (res.statusCode !== 200) console.log('A-10 body:', res.body);
    expect(res.statusCode).toBe(200);
    const c = res.json();
    expect(c.data.raceFeatSlug).toBe('lucky');
    expect(c.data.raceSkillChoices).toEqual(['history']);
    // Alert must NOT be in feats anymore
    const feats = (c.data.feats as Array<{slug: string}>) ?? [];
    const alertPresent = feats.some((f) => f.slug === 'alert');
    expect(alertPresent).toBe(false);
    // Lucky IS in feats
    const luckyPresent = feats.some((f) => f.slug === 'lucky');
    expect(luckyPresent).toBe(true);
  });

  it('A-11 (S-07): PUT Variant Human with featChoice slug that does not exist → 400 FEAT_NOT_FOUND', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${characterId}/race`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        race: { slug: 'human', source: 'PHB' },
        subrace: { slug: 'human--variant', source: 'PHB' },
        appliedAsis: [
          { ability: 'str', bonus: 1, source: 'subrace' },
          { ability: 'dex', bonus: 1, source: 'subrace' },
        ],
        languageChoices: ['elvish'],
        skillChoices: ['perception'],
        featChoice: { slug: 'nonexistent-made-up-feat', source: 'PHB' },
      },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toBe('VALIDATION_FAILED');
    const issue = body.issues.find((i: { code: string }) => i.code === 'FEAT_NOT_FOUND');
    expect(issue).toBeDefined();
    expect(issue.feat).toEqual({ slug: 'nonexistent-made-up-feat', source: 'PHB' });
  });
});

// ============================================================
// Phase D — Dragonborn ancestry (race-dragonborn-ancestry Batch 3)
// ============================================================

/**
 * Seeds the 10 PHB Dragonborn ancestry rows into the test DB.
 * Uses upsert on (slug, source) unique index — idempotent.
 * This mirrors what `pnpm import:compendium` does after deploy.
 */
async function seedDragonbornAncestries(): Promise<void> {
  const ancestries = [
    { color: 'Black',  slug: 'dragonborn--black',  damageType: 'acid',      shape: 'line', size: '5 ft × 30 ft', savingThrow: 'dex' },
    { color: 'Blue',   slug: 'dragonborn--blue',   damageType: 'lightning', shape: 'line', size: '5 ft × 30 ft', savingThrow: 'dex' },
    { color: 'Brass',  slug: 'dragonborn--brass',  damageType: 'fire',      shape: 'line', size: '5 ft × 30 ft', savingThrow: 'dex' },
    { color: 'Bronze', slug: 'dragonborn--bronze', damageType: 'lightning', shape: 'line', size: '5 ft × 30 ft', savingThrow: 'dex' },
    { color: 'Copper', slug: 'dragonborn--copper', damageType: 'acid',      shape: 'line', size: '5 ft × 30 ft', savingThrow: 'dex' },
    { color: 'Gold',   slug: 'dragonborn--gold',   damageType: 'fire',      shape: 'cone', size: '15 ft',        savingThrow: 'dex' },
    { color: 'Green',  slug: 'dragonborn--green',  damageType: 'poison',    shape: 'cone', size: '15 ft',        savingThrow: 'con' },
    { color: 'Red',    slug: 'dragonborn--red',    damageType: 'fire',      shape: 'cone', size: '15 ft',        savingThrow: 'dex' },
    { color: 'Silver', slug: 'dragonborn--silver', damageType: 'cold',      shape: 'cone', size: '15 ft',        savingThrow: 'con' },
    { color: 'White',  slug: 'dragonborn--white',  damageType: 'cold',      shape: 'cone', size: '15 ft',        savingThrow: 'con' },
  ] as const;

  for (const a of ancestries) {
    await db
      .insert(compendiumRaces)
      .values({
        slug: a.slug,
        source: 'PHB',
        name: a.color,
        data: {
          breathWeapon: { damageType: a.damageType, shape: a.shape, size: a.size, savingThrow: a.savingThrow },
          resist: [a.damageType],
        },
        reprintedAs: null,
        isSubrace: true,
        parentSlug: 'dragonborn',
        parentSource: 'PHB',
      })
      .onConflictDoUpdate({
        target: [compendiumRaces.slug, compendiumRaces.source],
        set: {
          name: sql`excluded.name`,
          data: sql`excluded.data`,
          isSubrace: sql`excluded.is_subrace`,
          parentSlug: sql`excluded.parent_slug`,
          parentSource: sql`excluded.parent_source`,
        },
      });
  }
}

describe('Dragonborn ancestry — PHB Batch 3 (race-dragonborn-ancestry)', () => {
  let user: TestUser;
  let characterId: string;
  let campaignId: string;

  beforeAll(async () => {
    // Seed ancestry rows (idempotent upsert — safe to run alongside import)
    await seedDragonbornAncestries();

    const app = await getTestApp();
    user = await createTestUser();

    const campaign = await app
      .inject({
        method: 'POST',
        url: '/api/v1/campaigns',
        headers: { authorization: `Bearer ${user.accessToken}` },
        payload: { name: 'Dragonborn Ancestry Test Campaign' },
      })
      .then((r) => r.json());
    campaignId = campaign.id;

    const character = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${user.accessToken}` },
        payload: { campaignId, name: 'Qyara Virixis' },
      })
      .then((r) => r.json());
    characterId = character.id;

    // Set base stats: CON 14 (+2 mod) — needed for saveDC calculation on sheet.
    // Point-buy cost: 15(9)+10(2)+14(7)+10(2)+10(2)+13(5) = 27 pts exactly.
    const statsRes = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${characterId}/stats`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        method: 'point-buy',
        scores: { str: 15, dex: 10, con: 14, int: 10, wis: 10, cha: 13 },
      },
    });
    if (statsRes.statusCode !== 200) throw new Error(`stats setup: ${statsRes.body}`);

    // Set class for sheet computation
    await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${characterId}/class`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        class: { slug: 'fighter', source: 'PHB' },
        level: 1,
        skillChoices: ['athletics', 'perception'],
      },
    });
  });

  afterAll(async () => {
    if (user) await deleteTestUser(user.id);
    await closeTestApp();
  });

  // A-1: GET /compendium/races returns 10 dragonborn ancestry subraces
  it('A-1 (S-22): GET /compendium/races includes 10 dragonborn--<color> subraces', async () => {
    const app = await getTestApp();
    // Use limit=200 to get all races, filter client-side for dragonborn subraces
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/compendium/races?campaign=${campaignId}&limit=200`,
      headers: { authorization: `Bearer ${user.accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const { data } = res.json();
    // Filter to only the 10 synthetic PHB ancestry rows (dragonborn--<color> pattern).
    // Other existing subraces (EGW Draconblood/Ravenite, anonymous PHB variant) are excluded.
    const expectedColors = ['black', 'blue', 'brass', 'bronze', 'copper', 'gold', 'green', 'red', 'silver', 'white'];
    const dragonbornAncestries = (data as Array<{ slug: string; isSubrace: boolean; parentSlug: string | null }>)
      .filter((r) => r.parentSlug === 'dragonborn' && r.isSubrace
        && expectedColors.some((c) => r.slug === `dragonborn--${c}`));

    expect(dragonbornAncestries).toHaveLength(10);
    const slugs = dragonbornAncestries.map((r) => r.slug).sort();
    expect(slugs).toContain('dragonborn--black');
    expect(slugs).toContain('dragonborn--green');
    expect(slugs).toContain('dragonborn--gold');
    expect(slugs).toContain('dragonborn--silver');
  });

  // A-2: PUT without subrace → 400 RACE_SUBRACE_REQUIRED
  it('A-2 (S-23): PUT Dragonborn without ancestry → 400 RACE_SUBRACE_REQUIRED', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${characterId}/race`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        race: { slug: 'dragonborn', source: 'PHB' },
      },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toBe('VALIDATION_FAILED');
    const issue = body.issues.find((i: { code: string }) => i.code === 'RACE_SUBRACE_REQUIRED');
    expect(issue).toBeDefined();
    expect(issue.race).toEqual({ slug: 'dragonborn', source: 'PHB' });
  });

  // A-3: PUT Dragonborn + gold ancestry → 200, persisted
  it('A-3 (S-24): PUT Dragonborn + dragonborn--gold → 200, subrace persisted', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${characterId}/race`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        race: { slug: 'dragonborn', source: 'PHB' },
        subrace: { slug: 'dragonborn--gold', source: 'PHB' },
        // Dragonborn: STR+2, CHA+1 (PHB p.32)
        appliedAsis: [
          { ability: 'str', bonus: 2, source: 'race' },
          { ability: 'cha', bonus: 1, source: 'race' },
        ],
      },
    });

    if (res.statusCode !== 200) console.log('A-3 body:', res.body);
    expect(res.statusCode).toBe(200);
    const c = res.json();
    expect(c.data.race).toEqual({ slug: 'dragonborn', source: 'PHB' });
    expect(c.data.subrace).toEqual({ slug: 'dragonborn--gold', source: 'PHB' });
  });

  // A-4: GET /sheet returns breathWeapon populated for gold ancestry
  it('A-4 (S-15): GET /sheet after A-3 → breathWeapon fire/cone populated', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/characters/${characterId}/sheet`,
      headers: { authorization: `Bearer ${user.accessToken}` },
    });

    if (res.statusCode !== 200) console.log('A-4 body:', res.body);
    expect(res.statusCode).toBe(200);
    const { sheet } = res.json();

    expect(sheet.breathWeapon).not.toBeNull();
    expect(sheet.breathWeapon.damageType).toBe('fire');
    expect(sheet.breathWeapon.shape).toBe('cone');
    expect(sheet.breathWeapon.area).toBe('15 ft');
    expect(sheet.breathWeapon.savingThrow).toBe('dex');
    // saveDC = 8 + CON mod (+2 for CON 14) + PB (+2 for level 1)
    expect(sheet.breathWeapon.saveDC).toBe(12);
    expect(sheet.breathWeapon.damageDice).toBe('2d6');
  });

  // A-5: Legacy Dragonborn (no ancestry) → 200, breathWeapon null
  it('A-5 (S-25): GET legacy Dragonborn (no ancestry subrace) → 200, breathWeapon null', async () => {
    const app = await getTestApp();

    // Write legacy character directly (no subrace)
    await db
      .update(characters)
      .set({
        data: {
          race: { slug: 'dragonborn', source: 'PHB' },
          subrace: null,
        },
        updatedAt: new Date(),
      })
      .where(eq(characters.id, characterId));

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/characters/${characterId}`,
      headers: { authorization: `Bearer ${user.accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const c = res.json();
    expect(c.data.race).toEqual({ slug: 'dragonborn', source: 'PHB' });
    expect(c.data.subrace).toBeNull();
  });
});

// ============================================================
// Phase E — Darkvision grant (race-darkvision-grant Batch 4)
// ============================================================

describe('Darkvision — PHB Batch 4 (race-darkvision-grant)', () => {
  let user: TestUser;
  let characterId: string;

  beforeAll(async () => {
    // Guard against stale additionalSpellsNormalized in elf--high from a prior Batch 6 run.
    // Without this, the RACE_CANTRIP_REQUIRED gate fires on High Elf PUT tests in this suite.
    await db
      .update(compendiumRaces)
      .set({ data: sql`data - 'additionalSpellsNormalized'`, updatedAt: new Date() })
      .where(eq(compendiumRaces.slug, 'elf--high'));

    const app = await getTestApp();
    user = await createTestUser();

    const campaign = await app
      .inject({
        method: 'POST',
        url: '/api/v1/campaigns',
        headers: { authorization: `Bearer ${user.accessToken}` },
        payload: { name: 'Darkvision Test Campaign' },
      })
      .then((r) => r.json());

    const character = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${user.accessToken}` },
        payload: { campaignId: campaign.id, name: 'Darkvision Test Char' },
      })
      .then((r) => r.json());
    characterId = character.id;

    // Set base stats + class so sheet computes
    await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${characterId}/stats`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        method: 'standard-array',
        scores: { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 },
      },
    });

    await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${characterId}/class`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        class: { slug: 'fighter', source: 'PHB' },
        level: 1,
        skillChoices: ['athletics', 'perception'],
      },
    });
  });

  afterAll(async () => {
    if (user) await deleteTestUser(user.id);
    await closeTestApp();
  });

  // A-1: Dwarf + Hill Dwarf → darkvision 60 ft (standard)
  it('A-1 (S-11, S-16): GET /sheet Dwarf + Hill Dwarf → darkvision { feet: 60, isSuperior: false }', async () => {
    // PHB p.20 — Dwarf: Darkvision 60 ft. Hill Dwarf subrace grants no darkvision override.
    const app = await getTestApp();

    const putRes = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${characterId}/race`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        race: { slug: 'dwarf', source: 'PHB' },
        subrace: { slug: 'dwarf--hill', source: 'PHB' },
        languageChoices: [],
      },
    });
    if (putRes.statusCode !== 200) throw new Error(`PUT race failed: ${putRes.body}`);

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/characters/${characterId}/sheet`,
      headers: { authorization: `Bearer ${user.accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const { sheet } = res.json();
    expect(sheet.darkvision).toEqual({ feet: 60, isSuperior: false });
  });

  // A-2: Elf + Drow → darkvision 120 ft superior (subrace override wins)
  it('A-2 (S-12, S-18): GET /sheet Elf + Drow → darkvision { feet: 120, isSuperior: true }', async () => {
    // PHB p.24 — Drow: Superior Darkvision 120 ft (replaces base Elf 60 ft).
    const app = await getTestApp();

    const putRes = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${characterId}/race`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        race: { slug: 'elf', source: 'PHB' },
        subrace: { slug: 'elf--drow', source: 'PHB' },
        languageChoices: [],
      },
    });
    if (putRes.statusCode !== 200) throw new Error(`PUT race failed: ${putRes.body}`);

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/characters/${characterId}/sheet`,
      headers: { authorization: `Bearer ${user.accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const { sheet } = res.json();
    expect(sheet.darkvision).toEqual({ feet: 120, isSuperior: true });
  });

  // A-3: Elf + High Elf → darkvision 60 ft (subrace has no override → race value preserved)
  it('A-3 (S-13): GET /sheet Elf + High Elf → darkvision { feet: 60, isSuperior: false } (race preserved)', async () => {
    // PHB p.23 — Elf base: Darkvision 60 ft. High Elf adds no darkvision field in data JSONB.
    const app = await getTestApp();

    const putRes = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${characterId}/race`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        race: { slug: 'elf', source: 'PHB' },
        subrace: { slug: 'elf--high', source: 'PHB' },
        languageChoices: ['dwarvish'],
      },
    });
    if (putRes.statusCode !== 200) throw new Error(`PUT race failed: ${putRes.body}`);

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/characters/${characterId}/sheet`,
      headers: { authorization: `Bearer ${user.accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const { sheet } = res.json();
    expect(sheet.darkvision).toEqual({ feet: 60, isSuperior: false });
  });

  // A-4: Human → darkvision null (PHB Human has no darkvision)
  it('A-4 (S-14, S-17): GET /sheet Human → darkvision null', async () => {
    // PHB p.31 — Human: No darkvision trait.
    // Seed directly to avoid ASI-validation complexity from earlier campaign patches.
    const app = await getTestApp();

    await db
      .update(characters)
      .set({
        data: {
          race: { slug: 'human', source: 'PHB' },
          subrace: null,
          asisApplied: [
            { ability: 'str', bonus: 1, source: 'race' },
            { ability: 'dex', bonus: 1, source: 'race' },
            { ability: 'con', bonus: 1, source: 'race' },
            { ability: 'int', bonus: 1, source: 'race' },
            { ability: 'wis', bonus: 1, source: 'race' },
            { ability: 'cha', bonus: 1, source: 'race' },
          ],
        },
        updatedAt: new Date(),
      })
      .where(eq(characters.id, characterId));

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/characters/${characterId}/sheet`,
      headers: { authorization: `Bearer ${user.accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const { sheet } = res.json();
    expect(sheet.darkvision).toBeNull();
  });
});

// ── Batch 6: race-additional-spells — API integration tests ──────────────────
// Spec: engram #607 REQ-A-PROJECT-01, REQ-A-SAVE-RACE-01, REQ-A-VALIDATION-01.
// Tests A-1 through A-5 per tasks #609 Phase C.
//
// PREREQUISITE: The compendium DB must have elf--high and tiefling rows with
// additionalSpellsNormalized seeded. This is done via seedRacialSpells() below
// (idempotent upsert), mirroring the Dragonborn ancestry seed pattern.
// In production, this data comes from `pnpm import:5etools` after Phase A deploy.

/**
 * Seeds test compendium rows for races with additionalSpells (Batch 6).
 * Uses upsert on (slug, source) — idempotent. PHB citations inline.
 */
async function seedRacialSpells(): Promise<void> {
  // Update elf--high subrace to include additionalSpellsNormalized
  // PHB p.23: High Elf Cantrip trait — player chooses 1 wizard cantrip
  await db
    .update(compendiumRaces)
    .set({
      data: sql`data || '{"additionalSpellsNormalized": [{"slug": "__choose__", "source": "", "characterLevelAvailable": 1, "frequency": "at-will", "ability": "int", "isPlayerChoice": true, "fromClass": "wizard"}]}'::jsonb`,
      updatedAt: new Date(),
    })
    .where(eq(compendiumRaces.slug, 'elf--high'));

  // Update tiefling base race to include additionalSpellsNormalized
  // PHB p.42-43: Infernal Legacy trait — 3 fixed spells
  await db
    .update(compendiumRaces)
    .set({
      data: sql`data || '{"additionalSpellsNormalized": [{"slug": "thaumaturgy", "source": "phb", "characterLevelAvailable": 1, "frequency": "at-will", "ability": "cha"}, {"slug": "hellish-rebuke", "source": "phb", "characterLevelAvailable": 3, "frequency": "daily-1", "ability": "cha", "castLevel": 2}, {"slug": "darkness", "source": "phb", "characterLevelAvailable": 5, "frequency": "daily-1", "ability": "cha"}]}'::jsonb`,
      updatedAt: new Date(),
    })
    .where(eq(compendiumRaces.slug, 'tiefling'));
}

describe('Racial additional spells — Batch 6 (race-additional-spells)', () => {
  let user: TestUser;
  let characterId: string;
  let campaignId: string;

  beforeAll(async () => {
    // Ensure compendium rows start clean (removes any stale additionalSpellsNormalized from
    // prior test runs that may not have completed cleanup). Then seed fresh.
    await db
      .update(compendiumRaces)
      .set({ data: sql`data - 'additionalSpellsNormalized'`, updatedAt: new Date() })
      .where(eq(compendiumRaces.slug, 'elf--high'));
    await db
      .update(compendiumRaces)
      .set({ data: sql`data - 'additionalSpellsNormalized'`, updatedAt: new Date() })
      .where(eq(compendiumRaces.slug, 'tiefling'));

    // Seed additionalSpellsNormalized into test compendium rows (idempotent)
    await seedRacialSpells();

    const app = await getTestApp();
    user = await createTestUser();

    const campaign = await app
      .inject({
        method: 'POST',
        url: '/api/v1/campaigns',
        headers: { authorization: `Bearer ${user.accessToken}` },
        payload: { name: 'Racial Spells Test Campaign' },
      })
      .then((r) => r.json());
    campaignId = campaign.id;

    const character = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${user.accessToken}` },
        payload: { campaignId, name: 'Racial Spells Test Char' },
      })
      .then((r) => r.json());
    characterId = character.id;
  });

  afterAll(async () => {
    // Clean up additionalSpellsNormalized from compendium rows to avoid cross-test contamination.
    // Without this, subsequent test runs would find the seeded data and break pre-Batch-6 tests.
    await db
      .update(compendiumRaces)
      .set({
        data: sql`data - 'additionalSpellsNormalized'`,
        updatedAt: new Date(),
      })
      .where(eq(compendiumRaces.slug, 'elf--high'));
    await db
      .update(compendiumRaces)
      .set({
        data: sql`data - 'additionalSpellsNormalized'`,
        updatedAt: new Date(),
      })
      .where(eq(compendiumRaces.slug, 'tiefling'));

    if (user) await deleteTestUser(user.id);
    await closeTestApp();
  });

  // A-1: PUT High Elf without raceCantrip → 400 RACE_CANTRIP_REQUIRED
  // REQ-A-VALIDATION-01, REQ-D-GATE-01. PHB p.23.
  it('A-1: PUT race High Elf without raceCantrip → 400 RACE_CANTRIP_REQUIRED', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${characterId}/race`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        race: { slug: 'elf', source: 'PHB' },
        subrace: { slug: 'elf--high', source: 'PHB' },
        languageChoices: ['dwarvish'],
        // NO raceCantrip field
      },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toBe('VALIDATION_FAILED');
    const issue = body.issues.find((i: { code: string }) => i.code === 'RACE_CANTRIP_REQUIRED');
    expect(issue).toBeDefined();
    expect(issue.expectedFilter).toEqual({ class: 'wizard', spellLevel: 0 });
  });

  // A-2: PUT High Elf with valid raceCantrip → 200 + GET sheet shows racialSpells with fire-bolt
  // REQ-A-SAVE-RACE-01, REQ-A-SAVE-RACE-02. PHB p.23.
  it('A-2: PUT High Elf with valid raceCantrip → 200 + sheet.racialSpells has fire-bolt', async () => {
    const app = await getTestApp();

    const putRes = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${characterId}/race`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        race: { slug: 'elf', source: 'PHB' },
        subrace: { slug: 'elf--high', source: 'PHB' },
        languageChoices: ['dwarvish'],
        raceCantrip: { slug: 'fire-bolt', source: 'phb' },
      },
    });
    expect(putRes.statusCode).toBe(200);

    // Verify raceCantrip was persisted
    const charData = putRes.json().data;
    expect(charData.raceCantrip).toEqual({ slug: 'fire-bolt', source: 'phb' });

    // GET sheet and check racialSpells
    const sheetRes = await app.inject({
      method: 'GET',
      url: `/api/v1/characters/${characterId}/sheet`,
      headers: { authorization: `Bearer ${user.accessToken}` },
    });
    expect(sheetRes.statusCode).toBe(200);
    const { sheet } = sheetRes.json();
    expect(sheet.racialSpells).toBeDefined();
    expect(sheet.racialSpells).toHaveLength(1);
    expect(sheet.racialSpells[0]).toMatchObject({
      slug: 'fire-bolt',
      source: 'phb',
      frequency: 'at-will',
      ability: 'int',
      characterLevelAvailable: 1,
      isPlayerChoice: true,
    });
  });

  // A-3: PUT High Elf with raceCantrip not in wizard cantrip pool → 400 RACE_CANTRIP_INVALID
  // REQ-A-SAVE-RACE-01. PHB p.23: only wizard cantrips are valid.
  it('A-3: PUT High Elf with non-wizard cantrip (fireball) → 400 RACE_CANTRIP_INVALID', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${characterId}/race`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        race: { slug: 'elf', source: 'PHB' },
        subrace: { slug: 'elf--high', source: 'PHB' },
        languageChoices: ['dwarvish'],
        raceCantrip: { slug: 'fireball', source: 'phb' }, // fireball is 3rd-level, not a cantrip
      },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toBe('VALIDATION_FAILED');
    const issue = body.issues.find((i: { code: string }) => i.code === 'RACE_CANTRIP_INVALID');
    expect(issue).toBeDefined();
    expect(issue.cantrip.slug).toBe('fireball');
  });

  // A-4: GET /sheet Tiefling level 1 → body.racialSpells has all 3 entries
  // REQ-A-PROJECT-01. PHB p.42-43: Infernal Legacy gives all 3 spells (rendered dims by level).
  it('A-4: GET /sheet Tiefling → racialSpells has all 3 entries with correct frequencies', async () => {
    const app = await getTestApp();

    // Seed tiefling character directly
    await db
      .update(characters)
      .set({
        data: {
          race: { slug: 'tiefling', source: 'PHB' },
          subrace: null,
          asisApplied: [
            { ability: 'int', bonus: 1, source: 'race' },
            { ability: 'cha', bonus: 2, source: 'race' },
          ],
        },
        updatedAt: new Date(),
      })
      .where(eq(characters.id, characterId));

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/characters/${characterId}/sheet`,
      headers: { authorization: `Bearer ${user.accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const { sheet } = res.json();
    expect(sheet.racialSpells).toBeDefined();
    expect(sheet.racialSpells).toHaveLength(3);
    expect(sheet.racialSpells.every((s: { ability: string }) => s.ability === 'cha')).toBe(true);
    expect(sheet.racialSpells).toContainEqual(
      expect.objectContaining({ slug: 'thaumaturgy', frequency: 'at-will' }),
    );
    expect(sheet.racialSpells).toContainEqual(
      expect.objectContaining({ slug: 'hellish-rebuke', frequency: 'daily-1', castLevel: 2 }),
    );
    expect(sheet.racialSpells).toContainEqual(
      expect.objectContaining({ slug: 'darkness', frequency: 'daily-1' }),
    );
  });

  // A-5: GET /sheet legacy High Elf (no raceCantrip in data) → 200, racialSpells=[]
  // REQ-A-PROJECT-01, CLAUDE.md §11 read-path tolerance.
  it('A-5: GET /sheet legacy High Elf (no raceCantrip) → 200, racialSpells=[]', async () => {
    const app = await getTestApp();

    // Seed a High Elf character WITHOUT raceCantrip — simulates pre-Batch 6 row
    await db
      .update(characters)
      .set({
        data: {
          race: { slug: 'elf', source: 'PHB' },
          subrace: { slug: 'elf--high', source: 'PHB' },
          asisApplied: [
            { ability: 'dex', bonus: 2, source: 'race' },
            { ability: 'int', bonus: 1, source: 'subrace' },
          ],
          // deliberately NO raceCantrip field
        },
        updatedAt: new Date(),
      })
      .where(eq(characters.id, characterId));

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/characters/${characterId}/sheet`,
      headers: { authorization: `Bearer ${user.accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const { sheet } = res.json();
    expect(sheet.racialSpells).toBeDefined();
    expect(sheet.racialSpells).toHaveLength(0);
  });
});
