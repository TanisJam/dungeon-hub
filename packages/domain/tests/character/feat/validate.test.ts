import { describe, expect, it } from 'vitest';
import { validateFeatSelection } from '../../../src/character/feat/validate.js';
import type {
  CharacterFeatContext,
  FeatCompendiumData,
} from '../../../src/character/feat/types.js';
import { DEFAULT_RULES_PROFILE } from '../../../src/rules-profile/default.js';

const PROFILE_FEATS_OFF = {
  ...DEFAULT_RULES_PROFILE,
  variantRules: { ...DEFAULT_RULES_PROFILE.variantRules, feats: false },
};

// ---- Feat fixtures --------------------------------------------------------
const HEAVY_ARMOR_MASTER: FeatCompendiumData = {
  slug: 'heavy-armor-master',
  source: 'PHB',
  name: 'Heavy Armor Master',
  prerequisite: [{ proficiency: [{ armor: 'heavy' }] }],
  ability: [{ str: 1 }],
};

const WAR_CASTER: FeatCompendiumData = {
  slug: 'war-caster',
  source: 'PHB',
  name: 'War Caster',
  prerequisite: [{ spellcasting: true }],
  ability: null,
};

const GRAPPLER: FeatCompendiumData = {
  slug: 'grappler',
  source: 'PHB',
  name: 'Grappler',
  prerequisite: [{ ability: [{ str: 13 }] }],
};

const RITUAL_CASTER: FeatCompendiumData = {
  slug: 'ritual-caster',
  source: 'PHB',
  name: 'Ritual Caster',
  prerequisite: [{ ability: [{ int: 13 }, { wis: 13 }] }], // INT 13 OR WIS 13
};

const ATHLETE: FeatCompendiumData = {
  slug: 'athlete',
  source: 'PHB',
  name: 'Athlete',
  ability: [{ choose: { from: ['str', 'dex'], amount: 1 } }],
};

const SQUAT_NIMBLENESS: FeatCompendiumData = {
  slug: 'squat-nimbleness',
  source: 'XGE',
  name: 'Squat Nimbleness',
  prerequisite: [
    { race: [{ name: 'dwarf' }, { name: 'gnome' }, { name: 'halfling' }] },
  ],
  ability: [{ choose: { from: ['str', 'dex'], amount: 1 } }],
};

// ---- Helper to build context ---------------------------------------------
function makeCtx(overrides: Partial<CharacterFeatContext> = {}): CharacterFeatContext {
  return {
    effectiveScores: { str: 14, dex: 12, con: 13, int: 10, wis: 10, cha: 8 },
    race: { slug: 'human', name: 'Human' },
    armorProficiencies: [],
    weaponProficiencies: [],
    hasSpellcasting: false,
    existingFeats: [],
    ...overrides,
  };
}

// ---- Tests ----------------------------------------------------------------
describe('validateFeatSelection — variant rule gate', () => {
  it('rechaza si la campaña deshabilitó feats', () => {
    const res = validateFeatSelection({
      featData: HEAVY_ARMOR_MASTER,
      rulesProfile: PROFILE_FEATS_OFF,
      ctx: makeCtx({ armorProficiencies: ['heavy'] }),
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.issues[0]?.code).toBe('FEATS_DISABLED_BY_CAMPAIGN');
  });
});

describe('validateFeatSelection — proficiency prereq', () => {
  it('Heavy Armor Master OK si el personaje tiene heavy armor', () => {
    const res = validateFeatSelection({
      featData: HEAVY_ARMOR_MASTER,
      rulesProfile: DEFAULT_RULES_PROFILE,
      ctx: makeCtx({ armorProficiencies: ['light', 'medium', 'heavy', 'shield'] }),
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.appliedFeat.asisApplied).toEqual([{ ability: 'str', bonus: 1 }]);
  });

  it('Heavy Armor Master falla si solo tiene medium', () => {
    const res = validateFeatSelection({
      featData: HEAVY_ARMOR_MASTER,
      rulesProfile: DEFAULT_RULES_PROFILE,
      ctx: makeCtx({ armorProficiencies: ['light', 'medium', 'shield'] }),
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.issues[0]?.code).toBe('PREREQ_PROFICIENCY_NOT_MET');
  });
});

describe('validateFeatSelection — ability prereq', () => {
  it('Grappler OK con STR 14', () => {
    const res = validateFeatSelection({
      featData: GRAPPLER,
      rulesProfile: DEFAULT_RULES_PROFILE,
      ctx: makeCtx(), // str 14
    });
    expect(res.ok).toBe(true);
  });

  it('Grappler falla con STR 12', () => {
    const res = validateFeatSelection({
      featData: GRAPPLER,
      rulesProfile: DEFAULT_RULES_PROFILE,
      ctx: makeCtx({ effectiveScores: { str: 12, dex: 12, con: 12, int: 12, wis: 12, cha: 12 } }),
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.issues[0]?.code).toBe('PREREQ_ABILITY_NOT_MET');
  });

  it('Ritual Caster: INT 13 OR WIS 13 — basta con uno', () => {
    const onlyInt = validateFeatSelection({
      featData: RITUAL_CASTER,
      rulesProfile: DEFAULT_RULES_PROFILE,
      ctx: makeCtx({ effectiveScores: { str: 10, dex: 10, con: 10, int: 13, wis: 10, cha: 10 } }),
    });
    expect(onlyInt.ok).toBe(true);

    const onlyWis = validateFeatSelection({
      featData: RITUAL_CASTER,
      rulesProfile: DEFAULT_RULES_PROFILE,
      ctx: makeCtx({ effectiveScores: { str: 10, dex: 10, con: 10, int: 10, wis: 13, cha: 10 } }),
    });
    expect(onlyWis.ok).toBe(true);

    const neither = validateFeatSelection({
      featData: RITUAL_CASTER,
      rulesProfile: DEFAULT_RULES_PROFILE,
      ctx: makeCtx({ effectiveScores: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 } }),
    });
    expect(neither.ok).toBe(false);
  });
});

describe('validateFeatSelection — spellcasting prereq', () => {
  it('War Caster OK si tiene spellcasting', () => {
    const res = validateFeatSelection({
      featData: WAR_CASTER,
      rulesProfile: DEFAULT_RULES_PROFILE,
      ctx: makeCtx({ hasSpellcasting: true }),
    });
    expect(res.ok).toBe(true);
  });

  it('War Caster falla sin spellcasting', () => {
    const res = validateFeatSelection({
      featData: WAR_CASTER,
      rulesProfile: DEFAULT_RULES_PROFILE,
      ctx: makeCtx({ hasSpellcasting: false }),
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.issues[0]?.code).toBe('PREREQ_SPELLCASTING_NOT_MET');
  });
});

describe('validateFeatSelection — race prereq', () => {
  it('Squat Nimbleness OK si el personaje es dwarf', () => {
    const res = validateFeatSelection({
      featData: SQUAT_NIMBLENESS,
      rulesProfile: DEFAULT_RULES_PROFILE,
      ctx: makeCtx({ race: { slug: 'dwarf', name: 'Dwarf' } }),
      asiChoice: [{ ability: 'str', bonus: 1 }],
    });
    expect(res.ok).toBe(true);
  });

  it('Squat Nimbleness falla si el personaje es human', () => {
    const res = validateFeatSelection({
      featData: SQUAT_NIMBLENESS,
      rulesProfile: DEFAULT_RULES_PROFILE,
      ctx: makeCtx({ race: { slug: 'human', name: 'Human' } }),
      asiChoice: [{ ability: 'str', bonus: 1 }],
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.issues[0]?.code).toBe('PREREQ_RACE_NOT_MET');
  });
});

describe('validateFeatSelection — ASI choices', () => {
  it('Athlete: exige elección + aplica el +1 a la stat elegida', () => {
    const missing = validateFeatSelection({
      featData: ATHLETE,
      rulesProfile: DEFAULT_RULES_PROFILE,
      ctx: makeCtx(),
    });
    expect(missing.ok).toBe(false);
    if (missing.ok) return;
    expect(missing.issues[0]?.code).toBe('FEAT_ASI_REQUIRED');

    const ok = validateFeatSelection({
      featData: ATHLETE,
      rulesProfile: DEFAULT_RULES_PROFILE,
      ctx: makeCtx(),
      asiChoice: [{ ability: 'dex', bonus: 1 }],
    });
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(ok.appliedFeat.asisApplied).toEqual([{ ability: 'dex', bonus: 1 }]);
  });

  it('Athlete: rechaza elección fuera del pool', () => {
    const res = validateFeatSelection({
      featData: ATHLETE,
      rulesProfile: DEFAULT_RULES_PROFILE,
      ctx: makeCtx(),
      asiChoice: [{ ability: 'cha', bonus: 1 }], // cha NO está en [str, dex]
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.issues[0]?.code).toBe('FEAT_ASI_INVALID');
  });
});

describe('validateFeatSelection — duplicates and source gating', () => {
  it('rechaza tomar el mismo feat dos veces', () => {
    const res = validateFeatSelection({
      featData: GRAPPLER,
      rulesProfile: DEFAULT_RULES_PROFILE,
      ctx: makeCtx({
        existingFeats: [{ slug: 'grappler', source: 'PHB' }],
      }),
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.issues[0]?.code).toBe('FEAT_ALREADY_TAKEN');
  });

  it('rechaza feat cuya source está deshabilitada', () => {
    const profile = {
      ...DEFAULT_RULES_PROFILE,
      sources: { ...DEFAULT_RULES_PROFILE.sources, PHB: false },
    };
    const res = validateFeatSelection({
      featData: GRAPPLER,
      rulesProfile: profile,
      ctx: makeCtx(),
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.issues[0]?.code).toBe('FEAT_DISABLED');
  });
});
