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
// C.1 — Tool choose-block: parameterized integration tests
// 7 backgrounds that have toolProficiencies[*].choose (choose-from-pool).
// Slugs verified via slugify(name) + data/5etools/data/backgrounds.json.
//
// Background      | slug                                  | src  | pool | count | needs lang?
// Far Traveler    | far-traveler                          | SCAG | 14   | 1     | yes (anyStandard:1)
// Inheritor       | inheritor                             | SCAG | 14   | 1     | yes
// Knight of Order | knight-of-the-order                  | SCAG | 14   | 1     | yes
// Urban BH        | urban-bounty-hunter                   | SCAG | 15   | 2     | no
// Uthgardt        | uthgardt-tribe-member                 | SCAG | 27   | 1     | yes
// Waterdhavian N. | waterdhavian-noble                    | SCAG | 14   | 1     | yes
// VGM             | variant-guild-artisan-guild-merchant  | PHB  | 18   | 1     | no
//
// Pool slugs are expanded by expandToolFrom() in domain — e.g. "lute" ∈ MUSICAL_INSTRUMENTS.
// "alchemists-supplies" is NOT in any pool that contains only musical+gaming (Far Traveler etc).
// ---------------------------------------------------------------------------

type BgFixture = {
  name: string;
  slug: string;
  source: string;
  /** Number of tool picks required */
  count: number;
  /** A valid pick that is in the expanded pool */
  validPick: string;
  /** A second valid pick (only needed when count=2) */
  validPick2?: string;
  /** A slug that is NOT in the expanded pool — used for BACKGROUND_TOOL_NOT_ALLOWED test */
  invalidPick: string;
  /** Optional language choices — required for backgrounds with anyStandard:1 */
  languageChoices?: string[];
  /**
   * Optional skill choices — some backgrounds have a skill choose block too.
   * Must be provided for: Inheritor (choose 1 of arcana/history/religion),
   * Knight of the Order (choose 1 of arcana/history/nature/religion),
   * Urban Bounty Hunter (choose 2 of deception/insight/persuasion/stealth).
   */
  skillChoices?: string[];
};

const TOOL_CHOOSE_BACKGROUNDS: BgFixture[] = [
  // musical instrument (10) + gaming set (4) = 14; needs 1 language
  {
    name: 'Far Traveler',
    slug: 'far-traveler',
    source: 'SCAG',
    count: 1,
    validPick: 'lute',
    invalidPick: 'alchemists-supplies',
    languageChoices: ['draconic'],
  },
  // Inheritor: survival fixed + choose 1 of arcana/history/religion; also needs 1 language
  {
    name: 'Inheritor',
    slug: 'inheritor',
    source: 'SCAG',
    count: 1,
    validPick: 'drum',
    invalidPick: 'alchemists-supplies',
    languageChoices: ['elvish'],
    skillChoices: ['arcana'], // choose 1 of arcana/history/religion
  },
  // Knight of the Order: persuasion fixed + choose 1 of arcana/history/nature/religion; needs 1 lang
  {
    name: 'Knight of the Order',
    slug: 'knight-of-the-order',
    source: 'SCAG',
    count: 1,
    validPick: 'flute',
    invalidPick: 'alchemists-supplies',
    languageChoices: ['dwarvish'],
    skillChoices: ['history'], // choose 1 of arcana/history/nature/religion
  },
  // Urban Bounty Hunter: choose 2 of deception/insight/persuasion/stealth; count=2 tools; no lang
  {
    name: 'Urban Bounty Hunter',
    slug: 'urban-bounty-hunter',
    source: 'SCAG',
    count: 2,
    validPick: 'dice-set',
    validPick2: 'lute',
    invalidPick: 'alchemists-supplies',
    languageChoices: undefined,
    skillChoices: ['deception', 'stealth'], // choose 2 of deception/insight/persuasion/stealth
  },
  // musical instrument (10) + anyArtisansTool (17) = 27; needs 1 language
  {
    name: 'Uthgardt Tribe Member',
    slug: 'uthgardt-tribe-member',
    source: 'SCAG',
    count: 1,
    validPick: 'drum',
    invalidPick: 'dice-set', // gaming set NOT in Uthgardt pool
    languageChoices: ['goblin'],
  },
  // gaming set (4) + musical instrument (10) = 14; needs 1 language
  {
    name: 'Waterdhavian Noble',
    slug: 'waterdhavian-noble',
    source: 'SCAG',
    count: 1,
    validPick: 'viol',
    invalidPick: 'alchemists-supplies',
    languageChoices: ['halfling'],
  },
  // anyArtisansTool (17) + literal "navigator's tools" (1) = 18; no language
  {
    name: 'Variant Guild Artisan (Guild Merchant)',
    slug: 'variant-guild-artisan-guild-merchant',
    source: 'PHB',
    count: 1,
    validPick: 'alchemists-supplies',
    invalidPick: 'lute', // musical instrument NOT in VGM pool
    languageChoices: undefined,
  },
];

describe('PUT /characters/:id/background — Tool choose-block (7 backgrounds)', () => {
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
        payload: { name: 'Tool Choose Campaign' },
      })
      .then((r) => r.json());

    const character = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${user.accessToken}` },
        payload: { campaignId: campaign.id, name: 'Tool Choose Char' },
      })
      .then((r) => r.json());
    characterId = character.id;
  });

  afterAll(async () => {
    if (user) await deleteTestUser(user.id);
    await closeTestApp();
  });

  for (const bg of TOOL_CHOOSE_BACKGROUNDS) {
    const picks = bg.count === 2 ? [bg.validPick, bg.validPick2!] : [bg.validPick];

    it(`[${bg.name}] happy path: ${bg.count} valid pick(s) → 200 with tools in appliedBackground`, async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'PUT',
        url: `/api/v1/characters/${characterId}/background`,
        headers: { authorization: `Bearer ${user.accessToken}` },
        payload: {
          background: { slug: bg.slug, source: bg.source },
          toolChoices: { choose: picks },
          ...(bg.languageChoices ? { languageChoices: bg.languageChoices } : {}),
          ...(bg.skillChoices ? { skillChoices: bg.skillChoices } : {}),
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      const tools: string[] = body.data.background.tools ?? [];
      for (const pick of picks) {
        expect(tools).toContain(pick);
      }
    });

    it(`[${bg.name}] empty picks → 400 BACKGROUND_TOOL_COUNT_MISMATCH`, async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: 'PUT',
        url: `/api/v1/characters/${characterId}/background`,
        headers: { authorization: `Bearer ${user.accessToken}` },
        payload: {
          background: { slug: bg.slug, source: bg.source },
          toolChoices: { choose: [] },
          // Include valid skill/language choices so those validators pass — tool error fires at step 4
          ...(bg.languageChoices ? { languageChoices: bg.languageChoices } : {}),
          ...(bg.skillChoices ? { skillChoices: bg.skillChoices } : {}),
        },
      });

      expect(res.statusCode).toBe(400);
      const issues = res.json().issues as Array<{ code: string; kind?: string }>;
      const toolIssue = issues.find((i) => i.code === 'BACKGROUND_TOOL_COUNT_MISMATCH');
      expect(toolIssue).toBeDefined();
      expect(toolIssue?.kind).toBe('choose');
    });

    it(`[${bg.name}] pick not in pool → 400 BACKGROUND_TOOL_NOT_ALLOWED`, async () => {
      const app = await getTestApp();
      // For count=2 backgrounds, send 2 picks (one valid, one invalid) to avoid count mismatch
      const pickPayload =
        bg.count === 2 ? [bg.validPick, bg.invalidPick] : [bg.invalidPick];
      const res = await app.inject({
        method: 'PUT',
        url: `/api/v1/characters/${characterId}/background`,
        headers: { authorization: `Bearer ${user.accessToken}` },
        payload: {
          background: { slug: bg.slug, source: bg.source },
          toolChoices: { choose: pickPayload },
          ...(bg.languageChoices ? { languageChoices: bg.languageChoices } : {}),
          ...(bg.skillChoices ? { skillChoices: bg.skillChoices } : {}),
        },
      });

      expect(res.statusCode).toBe(400);
      const issues = res.json().issues as Array<{ code: string; tool?: string }>;
      const notAllowedIssue = issues.find((i) => i.code === 'BACKGROUND_TOOL_NOT_ALLOWED');
      expect(notAllowedIssue).toBeDefined();
      expect(notAllowedIssue?.tool).toBe(bg.invalidPick);
    });

    it(`[${bg.name}] duplicate pick → 400 BACKGROUND_TOOL_DUPLICATE`, async () => {
      const app = await getTestApp();
      // Send the same valid pick twice — for count=1 bgs this triggers both COUNT_MISMATCH and
      // DUPLICATE; for count=2 bgs it triggers only DUPLICATE. Both cases must have DUPLICATE issue.
      const dupPayload = [bg.validPick, bg.validPick];
      const res = await app.inject({
        method: 'PUT',
        url: `/api/v1/characters/${characterId}/background`,
        headers: { authorization: `Bearer ${user.accessToken}` },
        payload: {
          background: { slug: bg.slug, source: bg.source },
          toolChoices: { choose: dupPayload },
          ...(bg.languageChoices ? { languageChoices: bg.languageChoices } : {}),
          ...(bg.skillChoices ? { skillChoices: bg.skillChoices } : {}),
        },
      });

      expect(res.statusCode).toBe(400);
      const issues = res.json().issues as Array<{ code: string; tool?: string }>;
      const dupIssue = issues.find((i) => i.code === 'BACKGROUND_TOOL_DUPLICATE');
      expect(dupIssue).toBeDefined();
    });
  }
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
    // Custom Background (PHB p.125-126) requires skills + mixed-pool + equipment + feature.
    // languageChoices are no longer validated via languageProficiencies block (F-01 fix);
    // mixed-pool block handles language/tool grants for Custom Background.
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${characterId}/background`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        background: CUSTOM_BG,
        skillChoices: ['perception', 'stealth'],
        languageChoices: [],
        customization: {
          mixedPool: { shape: 'lang2', langs: ['draconic', 'elvish'], tools: [] },
          equipment: { kind: 'coin' },
          feature: { slug: 'acolyte-shelter-of-the-faithful' },
        },
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
    // Wizard already granted 'arcana' and 'history'; trying to pick 'arcana' in BG.
    // Custom Background requires full customization — include it so the cross-step check fires.
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${charWithClassId}/background`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        background: CUSTOM_BG,
        skillChoices: ['arcana', 'stealth'],
        languageChoices: [],
        customization: {
          mixedPool: { shape: 'lang2', langs: ['draconic', 'elvish'], tools: [] },
          equipment: { kind: 'coin' },
          feature: { slug: 'acolyte-shelter-of-the-faithful' },
        },
      },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.issues[0].code).toBe('SKILL_DUPLICATE_WITH_CLASS');
    expect(body.issues[0].skills).toContain('arcana');
  });
});

// ---------------------------------------------------------------------------
// C.1 — Custom Background customization (mixed-pool + equipment + feature)
// PHB p.125–126: Custom Background lets player pick:
//   - 1 of 3 mixed-pool shapes (lang2 | lang1tool1 | tool2)
//   - equipment package from any background OR take coin instead
//   - any feature from any standard background
//
// Integration test scenarios:
//   Happy path: 3 mixed-pool shapes (lang2, lang1tool1, tool2) — 200 + customization persisted
//   Error: BACKGROUND_MIXED_POOL_SHAPE_REQUIRED — no customization sent
//   Error: BACKGROUND_MIXED_POOL_COUNT_MISMATCH — shape says 2 langs but user sends 1
//   Error: BACKGROUND_EQUIPMENT_REQUIRED — no equipment choice
//   Error: BACKGROUND_FEATURE_REQUIRED — no feature choice
//   Regression: NON-Custom backgrounds still validate languageProficiencies normally
//   Legacy round-trip: AppliedBackground without customization reads back normalized (no error)
// ---------------------------------------------------------------------------

// Minimal valid customization payloads per mixed-pool shape
const BASE_SKILL_CHOICES = ['perception', 'stealth'];
// lang2: 2 languages, 0 tools
const CUSTOMIZATION_LANG2 = {
  mixedPool: { shape: 'lang2', langs: ['draconic', 'elvish'], tools: [] },
  equipment: { kind: 'coin' },
  feature: { slug: 'acolyte-shelter-of-the-faithful' },
};
// lang1tool1: 1 language + 1 tool (PHB 125 "Choose one language and one tool")
// patchAnyToolCount does NOT apply here — the data-bug fix is only for the pure
// {anyTool:1} alt ("Choose two tools"), not the legitimate {anyLanguage:1, anyTool:1} alt.
const CUSTOMIZATION_LANG1TOOL1 = {
  mixedPool: { shape: 'lang1tool1', langs: ['dwarvish'], tools: ['lute'] },
  equipment: { kind: 'coin' },
  feature: { slug: 'acolyte-shelter-of-the-faithful' },
};
// tool2: 0 languages, 2 tools
const CUSTOMIZATION_TOOL2 = {
  mixedPool: { shape: 'tool2', langs: [], tools: ['lute', 'drum'] },
  equipment: { kind: 'coin' },
  feature: { slug: 'acolyte-shelter-of-the-faithful' },
};

describe('PUT /characters/:id/background — Custom Background customization', () => {
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
        payload: { name: 'Custom BG Customization Campaign' },
      })
      .then((r) => r.json());

    const character = await app
      .inject({
        method: 'POST',
        url: '/api/v1/characters',
        headers: { authorization: `Bearer ${user.accessToken}` },
        payload: { campaignId: campaign.id, name: 'Custom BG Customization Char' },
      })
      .then((r) => r.json());
    characterId = character.id;
  });

  afterAll(async () => {
    if (user) await deleteTestUser(user.id);
    await closeTestApp();
  });

  // ── Happy paths: all 3 mixed-pool shapes ──────────────────────────────────

  it('shape lang2: 2 langs, 0 tools + coin equipment + feature → 200 + customization persisted', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${characterId}/background`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        background: CUSTOM_BG,
        skillChoices: BASE_SKILL_CHOICES,
        languageChoices: [],
        customization: CUSTOMIZATION_LANG2,
      },
    });

    expect(res.statusCode).toBe(200);
    const bg = res.json().data.background;
    expect(bg.slug).toBe('custom-background');
    expect(bg.skills).toContain('perception');
    expect(bg.customization.mixedPool.shape).toBe('lang2');
    expect(bg.customization.mixedPool.langs).toEqual(['draconic', 'elvish']);
    expect(bg.customization.equipment.kind).toBe('coin');
    expect(bg.customization.feature.slug).toBe('acolyte-shelter-of-the-faithful');
  });

  it('shape lang1tool1: 1 lang + 1 tool + coin equipment + feature → 200 + customization persisted', async () => {
    const app = await getTestApp();
    // PHB 125: "Choose one language and one tool" — patchAnyToolCount does NOT
    // apply to this alt (only to the pure {anyTool:1} alt which means "two tools").
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${characterId}/background`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        background: CUSTOM_BG,
        skillChoices: BASE_SKILL_CHOICES,
        languageChoices: [],
        customization: CUSTOMIZATION_LANG1TOOL1,
      },
    });

    expect(res.statusCode).toBe(200);
    const bg = res.json().data.background;
    expect(bg.customization.mixedPool.shape).toBe('lang1tool1');
    expect(bg.customization.mixedPool.langs).toEqual(['dwarvish']);
    expect(bg.customization.mixedPool.tools).toEqual(['lute']);
  });

  it('shape tool2: 0 langs + 2 tools + coin equipment + feature → 200 + customization persisted', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${characterId}/background`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        background: CUSTOM_BG,
        skillChoices: BASE_SKILL_CHOICES,
        languageChoices: [],
        customization: CUSTOMIZATION_TOOL2,
      },
    });

    expect(res.statusCode).toBe(200);
    const bg = res.json().data.background;
    expect(bg.customization.mixedPool.shape).toBe('tool2');
    expect(bg.customization.mixedPool.tools).toEqual(['lute', 'drum']);
  });

  // ── W-02 happy path: equipment kind='package' end-to-end ──────────────────

  it('equipment kind=package (acolyte): persists + GET round-trips with backgroundSlug/Source', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${characterId}/background`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        background: CUSTOM_BG,
        skillChoices: BASE_SKILL_CHOICES,
        languageChoices: [],
        customization: {
          mixedPool: { shape: 'lang2', langs: ['draconic', 'elvish'], tools: [] },
          equipment: { kind: 'package', backgroundSlug: 'acolyte', backgroundSource: 'PHB' },
          feature: { slug: 'acolyte-shelter-of-the-faithful' },
        },
      },
    });

    expect(res.statusCode).toBe(200);
    const putBg = res.json().data.background;
    expect(putBg.customization.equipment.kind).toBe('package');
    expect(putBg.customization.equipment.backgroundSlug).toBe('acolyte');
    expect(putBg.customization.equipment.backgroundSource).toBe('PHB');

    // Round-trip via GET — must include normalized customization with equipment package intact
    const getRes = await app.inject({
      method: 'GET',
      url: `/api/v1/characters/${characterId}`,
      headers: { authorization: `Bearer ${user.accessToken}` },
    });
    expect(getRes.statusCode).toBe(200);
    const getBg = getRes.json().data.background;
    expect(getBg.customization.equipment.kind).toBe('package');
    expect(getBg.customization.equipment.backgroundSlug).toBe('acolyte');
    expect(getBg.customization.equipment.backgroundSource).toBe('PHB');
    expect(getBg.customization.feature.slug).toBe('acolyte-shelter-of-the-faithful');
  });

  // ── Error: missing customization entirely ─────────────────────────────────

  it('no customization sent → 400 BACKGROUND_MIXED_POOL_SHAPE_REQUIRED', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${characterId}/background`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        background: CUSTOM_BG,
        skillChoices: BASE_SKILL_CHOICES,
        languageChoices: [],
        // no customization
      },
    });

    expect(res.statusCode).toBe(400);
    const issues = res.json().issues as Array<{ code: string }>;
    expect(issues.some((i) => i.code === 'BACKGROUND_MIXED_POOL_SHAPE_REQUIRED')).toBe(true);
  });

  // ── Error: wrong lang count for chosen shape ──────────────────────────────

  it('shape lang2 but sends 1 lang → 400 BACKGROUND_MIXED_POOL_COUNT_MISMATCH', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${characterId}/background`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        background: CUSTOM_BG,
        skillChoices: BASE_SKILL_CHOICES,
        languageChoices: [],
        customization: {
          mixedPool: { shape: 'lang2', langs: ['elvish'], tools: [] }, // only 1 lang, needs 2
          equipment: { kind: 'coin' },
          feature: { slug: 'acolyte-shelter-of-the-faithful' },
        },
      },
    });

    expect(res.statusCode).toBe(400);
    const issues = res.json().issues as Array<{ code: string; axis?: string }>;
    const mismatch = issues.find((i) => i.code === 'BACKGROUND_MIXED_POOL_COUNT_MISMATCH');
    expect(mismatch).toBeDefined();
    expect(mismatch?.axis).toBe('langs');
  });

  // ── Error: missing equipment ──────────────────────────────────────────────

  it('no equipment in customization → 400 BACKGROUND_EQUIPMENT_REQUIRED', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${characterId}/background`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        background: CUSTOM_BG,
        skillChoices: BASE_SKILL_CHOICES,
        languageChoices: [],
        customization: {
          mixedPool: CUSTOMIZATION_LANG2.mixedPool,
          // no equipment
          feature: { slug: 'acolyte-shelter-of-the-faithful' },
        },
      },
    });

    expect(res.statusCode).toBe(400);
    const issues = res.json().issues as Array<{ code: string }>;
    expect(issues.some((i) => i.code === 'BACKGROUND_EQUIPMENT_REQUIRED')).toBe(true);
  });

  // ── Error: missing feature ────────────────────────────────────────────────

  it('no feature in customization → 400 BACKGROUND_FEATURE_REQUIRED', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${characterId}/background`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        background: CUSTOM_BG,
        skillChoices: BASE_SKILL_CHOICES,
        languageChoices: [],
        customization: {
          mixedPool: CUSTOMIZATION_LANG2.mixedPool,
          equipment: { kind: 'coin' },
          // no feature
        },
      },
    });

    expect(res.statusCode).toBe(400);
    const issues = res.json().issues as Array<{ code: string }>;
    expect(issues.some((i) => i.code === 'BACKGROUND_FEATURE_REQUIRED')).toBe(true);
  });

  // ── Error: unknown equipment package background ───────────────────────────

  it('package with unknown backgroundSlug → 400 BACKGROUND_EQUIPMENT_BACKGROUND_UNKNOWN', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${characterId}/background`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        background: CUSTOM_BG,
        skillChoices: BASE_SKILL_CHOICES,
        languageChoices: [],
        customization: {
          mixedPool: CUSTOMIZATION_LANG2.mixedPool,
          equipment: { kind: 'package', backgroundSlug: 'nonexistent-bg', backgroundSource: 'PHB' },
          feature: { slug: 'acolyte-shelter-of-the-faithful' },
        },
      },
    });

    expect(res.statusCode).toBe(400);
    const issues = res.json().issues as Array<{ code: string }>;
    expect(issues.some((i) => i.code === 'BACKGROUND_EQUIPMENT_BACKGROUND_UNKNOWN')).toBe(true);
  });

  // ── Error: unknown feature slug ───────────────────────────────────────────

  it('feature slug not in splitFeatureBlock → 400 BACKGROUND_FEATURE_UNKNOWN', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${characterId}/background`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        background: CUSTOM_BG,
        skillChoices: BASE_SKILL_CHOICES,
        languageChoices: [],
        customization: {
          mixedPool: CUSTOMIZATION_LANG2.mixedPool,
          equipment: { kind: 'coin' },
          feature: { slug: 'nonexistent-feature-that-does-not-exist' },
        },
      },
    });

    expect(res.statusCode).toBe(400);
    const issues = res.json().issues as Array<{ code: string }>;
    expect(issues.some((i) => i.code === 'BACKGROUND_FEATURE_UNKNOWN')).toBe(true);
  });

  // ── Regression: non-Custom backgrounds still validate languageProficiencies ──

  it('Sage without language choices still returns BACKGROUND_LANGUAGE_COUNT_MISMATCH (regression)', async () => {
    const app = await getTestApp();
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${characterId}/background`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: { background: { slug: 'sage', source: 'PHB' } },
    });

    expect(res.statusCode).toBe(400);
    const issues = res.json().issues as Array<{ code: string }>;
    expect(issues.some((i) => i.code === 'BACKGROUND_LANGUAGE_COUNT_MISMATCH')).toBe(true);
  });

  // ── Legacy round-trip: no customization field in DB → normalized cleanly ──

  it('GET character after save returns normalizeAppliedBackground applied (legacy-safe round-trip)', async () => {
    const app = await getTestApp();
    // First, save with full customization to verify the route persists it
    const putRes = await app.inject({
      method: 'PUT',
      url: `/api/v1/characters/${characterId}/background`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: {
        background: CUSTOM_BG,
        skillChoices: BASE_SKILL_CHOICES,
        languageChoices: [],
        customization: CUSTOMIZATION_LANG2,
      },
    });
    expect(putRes.statusCode).toBe(200);

    // Then GET the character and verify customization round-trips
    const getRes = await app.inject({
      method: 'GET',
      url: `/api/v1/characters/${characterId}`,
      headers: { authorization: `Bearer ${user.accessToken}` },
    });
    expect(getRes.statusCode).toBe(200);
    const bg = getRes.json().data.background;
    // normalizeAppliedBackground must preserve customization
    expect(bg.customization).toBeDefined();
    expect(bg.customization.mixedPool.shape).toBe('lang2');
  });
});
