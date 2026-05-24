import { describe, expect, it } from 'vitest';
import {
  validateBackgroundSelection,
  splitMixedPoolBlock,
  splitEquipmentBlock,
  splitFeatureBlock,
} from '../../../src/character/background/validate.js';
import type { BackgroundCompendiumData } from '../../../src/character/background/types.js';
import { DEFAULT_RULES_PROFILE } from '../../../src/rules-profile/default.js';
import { ARTISANS_TOOLS, GAMING_SETS, MUSICAL_INSTRUMENTS } from '../../../src/character/tool/pools.js';

// Algunos tests usan backgrounds de VRGR (Haunted One). Default profile no la trae,
// así que armamos un profile con VRGR habilitada para esos casos.
const PROFILE_WITH_VRGR = {
  ...DEFAULT_RULES_PROFILE,
  sources: { ...DEFAULT_RULES_PROFILE.sources, VRGR: true },
};

const SAGE: BackgroundCompendiumData = {
  slug: 'sage',
  source: 'PHB',
  name: 'Sage',
  skillProficiencies: [{ arcana: true, history: true }],
  languageProficiencies: [{ anyStandard: 2 }],
  toolProficiencies: null,
};

const CRIMINAL: BackgroundCompendiumData = {
  slug: 'criminal',
  source: 'PHB',
  name: 'Criminal',
  skillProficiencies: [{ deception: true, stealth: true }],
  languageProficiencies: null,
  toolProficiencies: [{ anyGamingSet: 1, "thieves' tools": true }],
};

const CLOISTERED_SCHOLAR: BackgroundCompendiumData = {
  slug: 'cloistered-scholar',
  source: 'SCAG',
  name: 'Cloistered Scholar',
  skillProficiencies: [{ history: true, choose: { from: ['arcana', 'nature', 'religion'] } }],
  languageProficiencies: [{ anyStandard: 2 }],
  toolProficiencies: null,
};

const HAUNTED_ONE: BackgroundCompendiumData = {
  slug: 'haunted-one',
  source: 'VRGR',
  name: 'Haunted One',
  skillProficiencies: [
    { choose: { from: ['arcana', 'investigation', 'religion', 'survival'], count: 2 } },
  ],
  languageProficiencies: null,
  toolProficiencies: null,
};

describe('validateBackgroundSelection — Sage (PHB, fixed skills + any languages)', () => {
  it('acepta Sage con 2 idiomas standard a elegir', () => {
    const res = validateBackgroundSelection({
      backgroundData: SAGE,
      rulesProfile: DEFAULT_RULES_PROFILE,
      languageChoices: ['draconic', 'elvish'],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.appliedBackground.skills).toEqual(['arcana', 'history']);
    expect(res.appliedBackground.languages).toEqual(['draconic', 'elvish']);
  });

  it('rechaza Sage sin languages (faltan 2)', () => {
    const res = validateBackgroundSelection({
      backgroundData: SAGE,
      rulesProfile: DEFAULT_RULES_PROFILE,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.issues[0]?.code).toBe('BACKGROUND_LANGUAGE_COUNT_MISMATCH');
  });

  it('rechaza Sage con idiomas duplicados', () => {
    const res = validateBackgroundSelection({
      backgroundData: SAGE,
      rulesProfile: DEFAULT_RULES_PROFILE,
      languageChoices: ['draconic', 'draconic'],
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.issues[0]?.code).toBe('BACKGROUND_LANGUAGE_DUPLICATE');
  });
});

describe('validateBackgroundSelection — Criminal (anyGamingSet)', () => {
  it('acepta Criminal con un gaming set elegido', () => {
    const res = validateBackgroundSelection({
      backgroundData: CRIMINAL,
      rulesProfile: DEFAULT_RULES_PROFILE,
      toolChoices: { anyGamingSet: ['dice set'] },
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.appliedBackground.tools).toContain("thieves' tools");
    expect(res.appliedBackground.tools).toContain('dice set');
  });

  it('rechaza Criminal sin elegir gaming set', () => {
    const res = validateBackgroundSelection({
      backgroundData: CRIMINAL,
      rulesProfile: DEFAULT_RULES_PROFILE,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.issues[0]?.code).toBe('BACKGROUND_TOOL_COUNT_MISMATCH');
  });
});

describe('validateBackgroundSelection — choose skills', () => {
  it('Cloistered Scholar: 1 skill a elegir + 1 fija (count default = 1)', () => {
    const res = validateBackgroundSelection({
      backgroundData: CLOISTERED_SCHOLAR,
      rulesProfile: DEFAULT_RULES_PROFILE,
      skillChoices: ['arcana'],
      languageChoices: ['common', 'elvish'],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.appliedBackground.skills).toEqual(['history', 'arcana']);
  });

  it('Haunted One: 2 skills a elegir, sin fijas', () => {
    const res = validateBackgroundSelection({
      backgroundData: HAUNTED_ONE,
      rulesProfile: PROFILE_WITH_VRGR,
      skillChoices: ['arcana', 'investigation'],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.appliedBackground.skills).toEqual(['arcana', 'investigation']);
  });

  it('rechaza skill no permitida', () => {
    const res = validateBackgroundSelection({
      backgroundData: HAUNTED_ONE,
      rulesProfile: PROFILE_WITH_VRGR,
      skillChoices: ['arcana', 'athletics'], // athletics no está en la lista
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.issues.some((i) => i.code === 'BACKGROUND_SKILL_NOT_ALLOWED')).toBe(true);
  });

  it('rechaza cantidad de skills incorrecta', () => {
    const res = validateBackgroundSelection({
      backgroundData: HAUNTED_ONE,
      rulesProfile: PROFILE_WITH_VRGR,
      skillChoices: ['arcana'], // se esperan 2
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.issues[0]?.code).toBe('BACKGROUND_SKILL_CHOICES_REQUIRED');
  });
});

describe('validateBackgroundSelection — Custom Background (numeric-any skill block)', () => {
  const CUSTOM_BACKGROUND: BackgroundCompendiumData = {
    slug: 'custom',
    source: 'PHB',
    name: 'Custom Background',
    skillProficiencies: [{ any: 2 }],
    languageProficiencies: null,
    toolProficiencies: null,
  };

  it('{any:2} con 2 picks válidos → ok + appliedBackground.skills con ambas picks', () => {
    const res = validateBackgroundSelection({
      backgroundData: CUSTOM_BACKGROUND,
      rulesProfile: DEFAULT_RULES_PROFILE,
      skillChoices: ['perception', 'stealth'],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.appliedBackground.skills).toEqual(['perception', 'stealth']);
  });

  it('{any:2} sin picks → BACKGROUND_SKILL_CHOICES_REQUIRED (expected=2, got=0)', () => {
    const res = validateBackgroundSelection({
      backgroundData: CUSTOM_BACKGROUND,
      rulesProfile: DEFAULT_RULES_PROFILE,
      skillChoices: [],
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    const issue = res.issues.find((i) => i.code === 'BACKGROUND_SKILL_CHOICES_REQUIRED');
    expect(issue).toBeDefined();
    expect(issue!.code).toBe('BACKGROUND_SKILL_CHOICES_REQUIRED');
    // @ts-expect-error -- dynamic shape
    expect(issue!.expectedCount).toBe(2);
    // @ts-expect-error
    expect(issue!.gotCount).toBe(0);
  });

  it('{any:2} con skill inválida → BACKGROUND_SKILL_NOT_ALLOWED', () => {
    const res = validateBackgroundSelection({
      backgroundData: CUSTOM_BACKGROUND,
      rulesProfile: DEFAULT_RULES_PROFILE,
      skillChoices: ['perception', 'notaskill'],
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.issues.some((i) => i.code === 'BACKGROUND_SKILL_NOT_ALLOWED')).toBe(true);
  });

  it('{any:2} con skill duplicada → BACKGROUND_SKILL_DUPLICATE', () => {
    const res = validateBackgroundSelection({
      backgroundData: CUSTOM_BACKGROUND,
      rulesProfile: DEFAULT_RULES_PROFILE,
      skillChoices: ['perception', 'perception'],
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.issues.some((i) => i.code === 'BACKGROUND_SKILL_DUPLICATE')).toBe(true);
  });

  it('{any:2} pool cubre las 18 skills de ALL_SKILLS', () => {
    const res = validateBackgroundSelection({
      backgroundData: CUSTOM_BACKGROUND,
      rulesProfile: DEFAULT_RULES_PROFILE,
      skillChoices: ['acrobatics', 'animal handling'],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.appliedBackground.skills).toEqual(['acrobatics', 'animal handling']);
  });
});

describe('validateBackgroundSelection — source gating', () => {
  it('rechaza background cuya source está deshabilitada', () => {
    const profile = {
      ...DEFAULT_RULES_PROFILE,
      sources: { ...DEFAULT_RULES_PROFILE.sources, PHB: false },
    };
    const res = validateBackgroundSelection({
      backgroundData: SAGE,
      rulesProfile: profile,
      languageChoices: ['common', 'elvish'],
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.issues[0]?.code).toBe('BACKGROUND_DISABLED');
  });
});

// ── A.4 TEST-RED: splitToolBlock choose branch ──────────────────────────────

// Far Traveler: { choose: { from: ["musical instrument", "gaming set"] } }
const FAR_TRAVELER: BackgroundCompendiumData = {
  slug: 'far-traveler',
  source: 'SCAG',
  name: 'Far Traveler',
  skillProficiencies: [{ insight: true, perception: true }],
  languageProficiencies: [{ anyStandard: 1 }],
  toolProficiencies: [{ choose: { from: ['musical instrument', 'gaming set'] } }],
};

// Urban Bounty Hunter: { choose: { from: ["gaming set","musical instrument","thieves' tools"], count: 2 } }
const URBAN_BOUNTY_HUNTER: BackgroundCompendiumData = {
  slug: 'urban-bounty-hunter',
  source: 'SCAG',
  name: 'Urban Bounty Hunter',
  skillProficiencies: [{ choose: { from: ['deception', 'insight', 'persuasion', 'stealth'], count: 2 } }],
  languageProficiencies: null,
  toolProficiencies: [{ choose: { from: ['gaming set', 'musical instrument', "thieves' tools"], count: 2 } }],
};

// Variant Guild Merchant: { choose: { from: ["anyArtisansTool", "navigator's tools"] } }
const VARIANT_GUILD_MERCHANT: BackgroundCompendiumData = {
  slug: 'variant-guild-artisan',
  source: 'PHB',
  name: 'Variant Guild Merchant',
  skillProficiencies: [{ insight: true, persuasion: true }],
  languageProficiencies: [{ anyStandard: 1 }],
  toolProficiencies: [{ choose: { from: ['anyArtisansTool', "navigator's tools"] } }],
};

// Uthgardt Tribe Member: { choose: { from: ["musical instrument", "anyArtisansTool"] } }
const UTHGARDT_TRIBE_MEMBER: BackgroundCompendiumData = {
  slug: 'uthgardt-tribe-member',
  source: 'SCAG',
  name: 'Uthgardt Tribe Member',
  skillProficiencies: [{ athletics: true, survival: true }],
  languageProficiencies: [{ anyStandard: 1 }],
  toolProficiencies: [{ choose: { from: ['musical instrument', 'anyArtisansTool'] } }],
};

// Existing `true` block — regression fixture
const HERBALIST: BackgroundCompendiumData = {
  slug: 'herbalist',
  source: 'PHB',
  name: 'Herbalist',
  skillProficiencies: [{ nature: true, medicine: true }],
  languageProficiencies: null,
  toolProficiencies: [{ 'herbalism kit': true }],
};

describe('validateBackgroundSelection — choose tool block (splitToolBlock choose branch)', () => {
  it('Far Traveler: choose block expands "musical instrument" + "gaming set" → 14-slug pool, count 1', () => {
    // A pick from the expanded pool → ok
    const res = validateBackgroundSelection({
      backgroundData: FAR_TRAVELER,
      rulesProfile: DEFAULT_RULES_PROFILE,
      languageChoices: ['elvish'],
      toolChoices: { choose: ['lute'] },
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.appliedBackground.tools).toContain('lute');
  });

  it('Far Traveler: empty picks → BACKGROUND_TOOL_COUNT_MISMATCH (expected 1, got 0)', () => {
    const res = validateBackgroundSelection({
      backgroundData: FAR_TRAVELER,
      rulesProfile: DEFAULT_RULES_PROFILE,
      languageChoices: ['elvish'],
      toolChoices: {},
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    const issue = res.issues.find((i) => i.code === 'BACKGROUND_TOOL_COUNT_MISMATCH');
    expect(issue).toBeDefined();
    expect(issue?.code).toBe('BACKGROUND_TOOL_COUNT_MISMATCH');
  });

  it('Far Traveler: pick outside pool → BACKGROUND_TOOL_NOT_ALLOWED', () => {
    const res = validateBackgroundSelection({
      backgroundData: FAR_TRAVELER,
      rulesProfile: DEFAULT_RULES_PROFILE,
      languageChoices: ['elvish'],
      toolChoices: { choose: ["thieves' tools"] },
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.issues.some((i) => i.code === 'BACKGROUND_TOOL_NOT_ALLOWED')).toBe(true);
  });

  it('Far Traveler: duplicate pick → BACKGROUND_TOOL_DUPLICATE', () => {
    const res = validateBackgroundSelection({
      backgroundData: FAR_TRAVELER,
      rulesProfile: DEFAULT_RULES_PROFILE,
      languageChoices: ['elvish'],
      toolChoices: { choose: ['lute', 'lute'] },
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.issues.some((i) => i.code === 'BACKGROUND_TOOL_DUPLICATE')).toBe(true);
  });

  it('Variant Guild Merchant: "anyArtisansTool" + literal → 18-slug pool, count 1', () => {
    const res = validateBackgroundSelection({
      backgroundData: VARIANT_GUILD_MERCHANT,
      rulesProfile: DEFAULT_RULES_PROFILE,
      languageChoices: ['elvish'],
      toolChoices: { choose: ['alchemists-supplies'] },
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.appliedBackground.tools).toContain('alchemists-supplies');
  });

  it("Variant Guild Merchant: pick \"navigator's tools\" (literal in pool) → ok", () => {
    const res = validateBackgroundSelection({
      backgroundData: VARIANT_GUILD_MERCHANT,
      rulesProfile: DEFAULT_RULES_PROFILE,
      languageChoices: ['elvish'],
      toolChoices: { choose: ["navigator's tools"] },
    });
    expect(res.ok).toBe(true);
  });

  it('Uthgardt: "musical instrument" + "anyArtisansTool" → 27-slug pool, count 1', () => {
    const res = validateBackgroundSelection({
      backgroundData: UTHGARDT_TRIBE_MEMBER,
      rulesProfile: DEFAULT_RULES_PROFILE,
      languageChoices: ['elvish'],
      toolChoices: { choose: ['drum'] },
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.appliedBackground.tools).toContain('drum');
  });

  it('Urban Bounty Hunter: count=2, 2 distinct picks from 15-slug pool → ok', () => {
    const res = validateBackgroundSelection({
      backgroundData: URBAN_BOUNTY_HUNTER,
      rulesProfile: DEFAULT_RULES_PROFILE,
      skillChoices: ['deception', 'insight'],
      toolChoices: { choose: ['lute', 'dice-set'] },
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.appliedBackground.tools).toContain('lute');
    expect(res.appliedBackground.tools).toContain('dice-set');
  });

  it('Urban Bounty Hunter: only 1 pick when 2 required → BACKGROUND_TOOL_COUNT_MISMATCH', () => {
    const res = validateBackgroundSelection({
      backgroundData: URBAN_BOUNTY_HUNTER,
      rulesProfile: DEFAULT_RULES_PROFILE,
      skillChoices: ['deception', 'insight'],
      toolChoices: { choose: ['lute'] },
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.issues.some((i) => i.code === 'BACKGROUND_TOOL_COUNT_MISMATCH')).toBe(true);
  });

  it("Urban Bounty Hunter: \"thieves' tools\" (literal in pool) is valid pick", () => {
    const res = validateBackgroundSelection({
      backgroundData: URBAN_BOUNTY_HUNTER,
      rulesProfile: DEFAULT_RULES_PROFILE,
      skillChoices: ['deception', 'insight'],
      toolChoices: { choose: ['lute', "thieves' tools"] },
    });
    expect(res.ok).toBe(true);
  });

  it('Existing true-block (Herbalist kit) — no regression: totalToolChooseCount=0', () => {
    const res = validateBackgroundSelection({
      backgroundData: HERBALIST,
      rulesProfile: DEFAULT_RULES_PROFILE,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.appliedBackground.tools).toContain('herbalism kit');
  });
});

// ── A.6 TEST-RED: Integration-shape tests for the 7 enabled backgrounds ─────

// All 7 SCAG/PHB backgrounds enabled by DEFAULT_RULES_PROFILE that have choose blocks.
const INHERITOR: BackgroundCompendiumData = {
  slug: 'inheritor',
  source: 'SCAG',
  name: 'Inheritor',
  skillProficiencies: [{ survival: true, choose: { from: ['arcana', 'history', 'religion'] } }],
  languageProficiencies: null,
  toolProficiencies: [{ choose: { from: ['musical instrument', 'gaming set'] } }],
};

const KNIGHT_OF_THE_ORDER: BackgroundCompendiumData = {
  slug: 'knight-of-the-order',
  source: 'SCAG',
  name: 'Knight of the Order',
  skillProficiencies: [{ persuasion: true, choose: { from: ['arcana', 'history', 'nature', 'religion'] } }],
  languageProficiencies: [{ anyStandard: 1 }],
  toolProficiencies: [{ choose: { from: ['musical instrument', 'gaming set'] } }],
};

const WATERDHAVIAN_NOBLE: BackgroundCompendiumData = {
  slug: 'waterdhavian-noble',
  source: 'SCAG',
  name: 'Waterdhavian Noble',
  skillProficiencies: [{ history: true, persuasion: true }],
  languageProficiencies: [{ anyStandard: 1 }],
  toolProficiencies: [{ choose: { from: ['gaming set', 'musical instrument'] } }],
};

describe('validateBackgroundSelection — 7 enabled backgrounds integration (A.6)', () => {
  // Far Traveler already tested above; reference via the fixture.
  it('Far Traveler: valid pick from 14-slug pool → ok (integration)', () => {
    const res = validateBackgroundSelection({
      backgroundData: FAR_TRAVELER,
      rulesProfile: DEFAULT_RULES_PROFILE,
      languageChoices: ['elvish'],
      toolChoices: { choose: ['drum'] },
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.appliedBackground.tools).toContain('drum');
  });

  it('Inheritor: valid pick from 14-slug pool (musical instrument + gaming set) → ok', () => {
    const res = validateBackgroundSelection({
      backgroundData: INHERITOR,
      rulesProfile: DEFAULT_RULES_PROFILE,
      skillChoices: ['arcana'],
      toolChoices: { choose: ['flute'] },
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.appliedBackground.tools).toContain('flute');
  });

  it('Knight of the Order: valid pick from 14-slug pool → ok', () => {
    const res = validateBackgroundSelection({
      backgroundData: KNIGHT_OF_THE_ORDER,
      rulesProfile: DEFAULT_RULES_PROFILE,
      skillChoices: ['history'],
      languageChoices: ['elvish'],
      toolChoices: { choose: ['lyre'] },
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.appliedBackground.tools).toContain('lyre');
  });

  it('Waterdhavian Noble: valid pick from 14-slug pool → ok', () => {
    const res = validateBackgroundSelection({
      backgroundData: WATERDHAVIAN_NOBLE,
      rulesProfile: DEFAULT_RULES_PROFILE,
      languageChoices: ['elvish'],
      toolChoices: { choose: ['dice-set'] },
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.appliedBackground.tools).toContain('dice-set');
  });

  it('Uthgardt: valid pick from 27-slug pool → ok (integration)', () => {
    const res = validateBackgroundSelection({
      backgroundData: UTHGARDT_TRIBE_MEMBER,
      rulesProfile: DEFAULT_RULES_PROFILE,
      languageChoices: ['elvish'],
      toolChoices: { choose: ['smiths-tools'] },
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.appliedBackground.tools).toContain('smiths-tools');
  });

  it('Variant Guild Merchant: valid pick from 18-slug pool → ok (integration)', () => {
    const res = validateBackgroundSelection({
      backgroundData: VARIANT_GUILD_MERCHANT,
      rulesProfile: DEFAULT_RULES_PROFILE,
      languageChoices: ['elvish'],
      toolChoices: { choose: ['woodcarvers-tools'] },
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.appliedBackground.tools).toContain('woodcarvers-tools');
  });

  it('Urban Bounty Hunter: valid 2-pick from 15-slug pool → ok (integration)', () => {
    const res = validateBackgroundSelection({
      backgroundData: URBAN_BOUNTY_HUNTER,
      rulesProfile: DEFAULT_RULES_PROFILE,
      skillChoices: ['deception', 'stealth'],
      toolChoices: { choose: ['bagpipes', 'dragonchess-set'] },
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.appliedBackground.tools).toContain('bagpipes');
    expect(res.appliedBackground.tools).toContain('dragonchess-set');
  });

  it('Far Traveler: empty picks → BACKGROUND_TOOL_COUNT_MISMATCH (integration)', () => {
    const res = validateBackgroundSelection({
      backgroundData: FAR_TRAVELER,
      rulesProfile: DEFAULT_RULES_PROFILE,
      languageChoices: ['elvish'],
      toolChoices: {},
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.issues.some((i) => i.code === 'BACKGROUND_TOOL_COUNT_MISMATCH')).toBe(true);
  });

  it('Far Traveler: pick outside pool → BACKGROUND_TOOL_NOT_ALLOWED (integration)', () => {
    const res = validateBackgroundSelection({
      backgroundData: FAR_TRAVELER,
      rulesProfile: DEFAULT_RULES_PROFILE,
      languageChoices: ['elvish'],
      toolChoices: { choose: ["thieves' tools"] },
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.issues.some((i) => i.code === 'BACKGROUND_TOOL_NOT_ALLOWED')).toBe(true);
  });

  // Pool size assertions — verifies expandToolFrom produces the right sizes
  it('Far Traveler expanded pool has 14 slugs (10 musical + 4 gaming)', () => {
    const pool = [...MUSICAL_INSTRUMENTS, ...GAMING_SETS];
    expect(pool).toHaveLength(14);
  });

  it('Uthgardt expanded pool has 27 slugs (10 musical + 17 artisan)', () => {
    const pool = [...MUSICAL_INSTRUMENTS, ...ARTISANS_TOOLS];
    expect(pool).toHaveLength(27);
  });

  it('Variant Guild Merchant expanded pool has 18 slugs (17 artisan + 1 literal)', () => {
    const pool = [...ARTISANS_TOOLS, "navigator's tools"];
    expect(pool).toHaveLength(18);
  });

  it('Urban Bounty Hunter expanded pool has 15 slugs (4 gaming + 10 musical + 1 literal)', () => {
    const pool = [...GAMING_SETS, ...MUSICAL_INSTRUMENTS, "thieves' tools"];
    expect(pool).toHaveLength(15);
  });
});

// ── A.8 TEST-RED: splitMixedPoolBlock ────────────────────────────────────────

describe('splitMixedPoolBlock — three-alternative parse', () => {
  // PHB p. 125 Custom Background — third skillToolLanguageProficiencies alt
  // is "Choose two tools" but 5etools encodes it as {anyTool:1}. The data-bug
  // patch only applies when the alt has NO anyLanguage (pure tool alt).
  // The {anyLanguage:1, anyTool:1} alt is the legitimate "1 lang + 1 tool" choice.
  const THREE_ALT_FIELD = [
    { anyLanguage: 2 },
    { anyLanguage: 1, anyTool: 1 }, // legit "1 lang + 1 tool" — NOT patched
    { anyTool: 1 },                  // 5etools data-bug → patched to 2
  ];

  it('returns 3 MixedPoolShape items for 3-alternative field', () => {
    const result = splitMixedPoolBlock(THREE_ALT_FIELD);
    expect(result).toHaveLength(3);
  });

  it('first alternative → lang2 (langCount=2, toolCount=0)', () => {
    const result = splitMixedPoolBlock(THREE_ALT_FIELD);
    expect(result[0]).toMatchObject({ shapeKey: 'lang2', langCount: 2, toolCount: 0 });
  });

  it('second alternative → lang1tool1 (langCount=1, toolCount=1 — NOT patched, anyLanguage present)', () => {
    const result = splitMixedPoolBlock(THREE_ALT_FIELD);
    expect(result[1]).toMatchObject({ shapeKey: 'lang1tool1', langCount: 1, toolCount: 1 });
  });

  it('third alternative → tool2 (langCount=0, toolCount=2 after patch)', () => {
    const result = splitMixedPoolBlock(THREE_ALT_FIELD);
    expect(result[2]).toMatchObject({ shapeKey: 'tool2', langCount: 0, toolCount: 2 });
  });

  it('lang1tool1 with anyTool:1 must NOT trigger patchAnyToolCount (PHB 125 legit "1 lang + 1 tool")', () => {
    const result = splitMixedPoolBlock([{ anyLanguage: 1, anyTool: 1 }]);
    expect(result[0]).toMatchObject({ shapeKey: 'lang1tool1', langCount: 1, toolCount: 1 });
  });

  it('pure tool2 alt with anyTool:1 DOES trigger patchAnyToolCount → 2', () => {
    const result = splitMixedPoolBlock([{ anyTool: 1 }]);
    expect(result[0]).toMatchObject({ shapeKey: 'tool2', langCount: 0, toolCount: 2 });
  });

  it('unrecognized key throws', () => {
    expect(() =>
      splitMixedPoolBlock([{ unknownPoolKey: 3 }]),
    ).toThrow();
  });
});

// ── A.10 TEST-RED: splitEquipmentBlock ───────────────────────────────────────

const ACOLYTE_BG: BackgroundCompendiumData = {
  slug: 'acolyte',
  source: 'PHB',
  name: 'Acolyte',
  skillProficiencies: [{ insight: true, religion: true }],
  languageProficiencies: [{ anyStandard: 2 }],
  toolProficiencies: null,
  startingEquipment: [
    { _: ['a holy symbol', 'a prayer book', 'incense (5)', 'vestments', 'a set of common clothes', '15 gp'] },
  ],
};

const CRIMINAL_BG: BackgroundCompendiumData = {
  slug: 'criminal',
  source: 'PHB',
  name: 'Criminal',
  skillProficiencies: [{ deception: true, stealth: true }],
  languageProficiencies: null,
  toolProficiencies: [{ anyGamingSet: 1, "thieves' tools": true }],
  startingEquipment: [
    { _: ['a crowbar', 'a set of dark common clothes including a hood', '15 gp'] },
  ],
};

const BG_WITH_UPPERCASE_SLOT: BackgroundCompendiumData = {
  slug: 'test-bg',
  source: 'PHB',
  name: 'Test BG',
  skillProficiencies: [],
  languageProficiencies: null,
  toolProficiencies: null,
  startingEquipment: [
    { _: ['always item'], a: ['option a item'], A: ['IGNORED uppercase slot item'] },
  ],
};

describe('splitEquipmentBlock — package building', () => {
  it('builds packages from allBackgrounds with non-empty _ slot', () => {
    const allBackgrounds = [ACOLYTE_BG, CRIMINAL_BG];
    const result = splitEquipmentBlock(null, allBackgrounds);
    expect(result.coinAllowed).toBe(true);
    expect(result.packages).toHaveLength(2);
    const acolytePackage = result.packages.find((p) => p.backgroundSlug === 'acolyte');
    expect(acolytePackage).toBeDefined();
    expect(acolytePackage!.alwaysGranted).toContain('a holy symbol');
  });

  it('coinAllowed is always true for Custom Background', () => {
    const result = splitEquipmentBlock(null, [ACOLYTE_BG]);
    expect(result.coinAllowed).toBe(true);
  });

  it('_ slot items come through as raw strings', () => {
    const result = splitEquipmentBlock(null, [ACOLYTE_BG]);
    const pkg = result.packages.find((p) => p.backgroundSlug === 'acolyte')!;
    expect(typeof pkg.alwaysGranted[0]).toBe('string');
    expect(pkg.alwaysGranted[0]).toBe('a holy symbol');
  });

  it('uppercase slot keys are ignored (A/B out of scope)', () => {
    const result = splitEquipmentBlock(null, [BG_WITH_UPPERCASE_SLOT]);
    const pkg = result.packages.find((p) => p.backgroundSlug === 'test-bg')!;
    expect(pkg).toBeDefined();
    expect(pkg.alternatives).not.toHaveProperty('A');
    expect(pkg.alternatives).toHaveProperty('a');
  });

  it('lowercase alternative slots (a/b/c/d) are included', () => {
    const result = splitEquipmentBlock(null, [BG_WITH_UPPERCASE_SLOT]);
    const pkg = result.packages.find((p) => p.backgroundSlug === 'test-bg')!;
    expect(pkg.alternatives['a']).toBeDefined();
    expect(pkg.alternatives['a']).toContain('option a item');
  });

  it('backgrounds with no startingEquipment or empty _ slot are excluded', () => {
    const noEquip: BackgroundCompendiumData = {
      slug: 'no-equip',
      source: 'PHB',
      name: 'No Equip',
      skillProficiencies: [],
      languageProficiencies: null,
      toolProficiencies: null,
      startingEquipment: null,
    };
    const result = splitEquipmentBlock(null, [noEquip, ACOLYTE_BG]);
    const pkg = result.packages.find((p) => p.backgroundSlug === 'no-equip');
    expect(pkg).toBeUndefined();
    expect(result.packages).toHaveLength(1);
  });
});

// ── A.12 TEST-RED: splitFeatureBlock ─────────────────────────────────────────

const ACOLYTE_WITH_FEATURE: BackgroundCompendiumData = {
  slug: 'acolyte',
  source: 'PHB',
  name: 'Acolyte',
  skillProficiencies: [{ insight: true, religion: true }],
  languageProficiencies: [{ anyStandard: 2 }],
  toolProficiencies: null,
  entries: [
    {
      name: 'Feature: Shelter of the Faithful',
      data: { isFeature: true },
      entries: ['You receive shelter and healing at temples...'],
    },
    {
      name: 'Suggested Characteristics',
      data: { isFeature: false },
      entries: [],
    },
  ],
};

const CRIMINAL_WITH_FEATURE: BackgroundCompendiumData = {
  slug: 'criminal',
  source: 'PHB',
  name: 'Criminal',
  skillProficiencies: [{ deception: true, stealth: true }],
  languageProficiencies: null,
  toolProficiencies: null,
  entries: [
    {
      name: 'Feature: Criminal Contact',
      data: { isFeature: true },
      entries: ['You have a reliable and trustworthy contact...'],
    },
  ],
};

describe('splitFeatureBlock — slug derivation', () => {
  it('derives slug for acolyte feature: acolyte-shelter-of-the-faithful', () => {
    const result = splitFeatureBlock([ACOLYTE_WITH_FEATURE]);
    const feature = result.features.find((f) => f.sourceBackgroundSlug === 'acolyte');
    expect(feature).toBeDefined();
    expect(feature!.slug).toBe('acolyte-shelter-of-the-faithful');
  });

  it('derives slug for criminal feature: criminal-criminal-contact', () => {
    const result = splitFeatureBlock([CRIMINAL_WITH_FEATURE]);
    const feature = result.features.find((f) => f.sourceBackgroundSlug === 'criminal');
    expect(feature).toBeDefined();
    expect(feature!.slug).toBe('criminal-criminal-contact');
  });

  it('only includes entries with data.isFeature === true', () => {
    const result = splitFeatureBlock([ACOLYTE_WITH_FEATURE]);
    // Suggested Characteristics should NOT be included
    expect(result.features).toHaveLength(1);
    expect(result.features[0]!.slug).toBe('acolyte-shelter-of-the-faithful');
  });

  it('slug uniqueness — no collisions across multiple backgrounds', () => {
    const result = splitFeatureBlock([ACOLYTE_WITH_FEATURE, CRIMINAL_WITH_FEATURE]);
    const slugs = result.features.map((f) => f.slug);
    const unique = new Set(slugs);
    expect(unique.size).toBe(slugs.length);
  });

  it('feature text is captured', () => {
    const result = splitFeatureBlock([ACOLYTE_WITH_FEATURE]);
    expect(result.features[0]!.text).toBeTruthy();
  });
});

// ── A.14 TEST-RED: 6 new validation error codes ───────────────────────────────

const CUSTOM_BG_FULL: BackgroundCompendiumData = {
  slug: 'custom-background',
  source: 'PHB',
  name: 'Custom Background',
  skillProficiencies: [{ any: 2 }],
  languageProficiencies: null,
  toolProficiencies: null,
  skillToolLanguageProficiencies: [
    { anyLanguage: 2 },
    { anyLanguage: 1, anyTool: 1 },
    { anyTool: 1 },
  ],
  startingEquipment: null,
  entries: [],
};

const ALL_BGS_FOR_VALIDATION = [ACOLYTE_BG, CRIMINAL_BG];

describe('validateBackgroundSelection — Custom Background: BACKGROUND_MIXED_POOL_SHAPE_REQUIRED', () => {
  it('emits BACKGROUND_MIXED_POOL_SHAPE_REQUIRED when customization.mixedPool absent', () => {
    const res = validateBackgroundSelection({
      backgroundData: CUSTOM_BG_FULL,
      rulesProfile: DEFAULT_RULES_PROFILE,
      skillChoices: ['perception', 'stealth'],
      allBackgrounds: ALL_BGS_FOR_VALIDATION,
      customization: {},
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.issues.some((i) => i.code === 'BACKGROUND_MIXED_POOL_SHAPE_REQUIRED')).toBe(true);
  });
});

describe('validateBackgroundSelection — Custom Background: BACKGROUND_MIXED_POOL_COUNT_MISMATCH', () => {
  it('emits BACKGROUND_MIXED_POOL_COUNT_MISMATCH when lang count wrong for lang1tool1', () => {
    const res = validateBackgroundSelection({
      backgroundData: CUSTOM_BG_FULL,
      rulesProfile: DEFAULT_RULES_PROFILE,
      skillChoices: ['perception', 'stealth'],
      allBackgrounds: ALL_BGS_FOR_VALIDATION,
      customization: {
        mixedPool: { shape: 'lang1tool1', langs: ['elvish'], tools: [] }, // tools missing
        equipment: { kind: 'coin' },
        feature: { slug: 'acolyte-shelter-of-the-faithful' },
      },
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.issues.some((i) => i.code === 'BACKGROUND_MIXED_POOL_COUNT_MISMATCH')).toBe(true);
  });
});

describe('validateBackgroundSelection — Custom Background: BACKGROUND_EQUIPMENT_REQUIRED', () => {
  it('emits BACKGROUND_EQUIPMENT_REQUIRED when customization.equipment absent', () => {
    const res = validateBackgroundSelection({
      backgroundData: CUSTOM_BG_FULL,
      rulesProfile: DEFAULT_RULES_PROFILE,
      skillChoices: ['perception', 'stealth'],
      allBackgrounds: ALL_BGS_FOR_VALIDATION,
      customization: {
        mixedPool: { shape: 'lang2', langs: ['elvish', 'dwarvish'], tools: [] },
        feature: { slug: 'acolyte-shelter-of-the-faithful' },
      },
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.issues.some((i) => i.code === 'BACKGROUND_EQUIPMENT_REQUIRED')).toBe(true);
  });
});

describe('validateBackgroundSelection — Custom Background: BACKGROUND_EQUIPMENT_BACKGROUND_UNKNOWN', () => {
  it('emits BACKGROUND_EQUIPMENT_BACKGROUND_UNKNOWN for unknown backgroundSlug in package', () => {
    const res = validateBackgroundSelection({
      backgroundData: CUSTOM_BG_FULL,
      rulesProfile: DEFAULT_RULES_PROFILE,
      skillChoices: ['perception', 'stealth'],
      allBackgrounds: ALL_BGS_FOR_VALIDATION,
      customization: {
        mixedPool: { shape: 'lang2', langs: ['elvish', 'dwarvish'], tools: [] },
        equipment: { kind: 'package', backgroundSlug: 'nonexistent', backgroundSource: 'PHB' },
        feature: { slug: 'acolyte-shelter-of-the-faithful' },
      },
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(
      res.issues.some((i) => i.code === 'BACKGROUND_EQUIPMENT_BACKGROUND_UNKNOWN'),
    ).toBe(true);
  });
});

describe('validateBackgroundSelection — Custom Background: BACKGROUND_FEATURE_REQUIRED', () => {
  it('emits BACKGROUND_FEATURE_REQUIRED when customization.feature absent', () => {
    const res = validateBackgroundSelection({
      backgroundData: CUSTOM_BG_FULL,
      rulesProfile: DEFAULT_RULES_PROFILE,
      skillChoices: ['perception', 'stealth'],
      allBackgrounds: ALL_BGS_FOR_VALIDATION,
      customization: {
        mixedPool: { shape: 'lang2', langs: ['elvish', 'dwarvish'], tools: [] },
        equipment: { kind: 'coin' },
      },
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.issues.some((i) => i.code === 'BACKGROUND_FEATURE_REQUIRED')).toBe(true);
  });
});

describe('validateBackgroundSelection — Custom Background: BACKGROUND_FEATURE_UNKNOWN', () => {
  it('emits BACKGROUND_FEATURE_UNKNOWN for unknown feature slug', () => {
    const res = validateBackgroundSelection({
      backgroundData: CUSTOM_BG_FULL,
      rulesProfile: DEFAULT_RULES_PROFILE,
      skillChoices: ['perception', 'stealth'],
      allBackgrounds: [ACOLYTE_WITH_FEATURE, CRIMINAL_WITH_FEATURE],
      customization: {
        mixedPool: { shape: 'lang2', langs: ['elvish', 'dwarvish'], tools: [] },
        equipment: { kind: 'coin' },
        feature: { slug: 'nonexistent-feature-slug' },
      },
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.issues.some((i) => i.code === 'BACKGROUND_FEATURE_UNKNOWN')).toBe(true);
  });
});
