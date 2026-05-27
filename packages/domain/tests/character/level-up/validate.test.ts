import { describe, expect, it } from 'vitest';
import { validateLevelUp } from '../../../src/character/level-up/validate.js';
import type { ClassCompendiumData } from '../../../src/character/class/types.js';
import type { CharacterSnapshot } from '../../../src/character/sheet/types.js';
import { DEFAULT_RULES_PROFILE } from '../../../src/rules-profile/default.js';
import type { RulesProfile } from '../../../src/rules-profile/types.js';

// ---- Fixtures ---------------------------------------------------------------

const FIGHTER_DATA: ClassCompendiumData = {
  slug: 'fighter',
  source: 'PHB',
  hd: { number: 1, faces: 10 },
  proficiency: ['str', 'con'],
  startingProficiencies: { armor: ['all'], weapons: ['simple', 'martial'], skills: [] },
  subclassTitle: 'Martial Archetype',
  classFeatures: [
    'Fighting Style|Fighter||1',
    'Martial Archetype|Fighter||3',
    'Ability Score Improvement|Fighter||4',
    'Extra Attack|Fighter||5',
    'Ability Score Improvement|Fighter||6',
    'Ability Score Improvement|Fighter||8',
    'Ability Score Improvement|Fighter||12',
    'Ability Score Improvement|Fighter||14',
  ],
};

const PALADIN_DATA: ClassCompendiumData = {
  slug: 'paladin',
  source: 'PHB',
  hd: { number: 1, faces: 10 },
  proficiency: ['wis', 'cha'],
  startingProficiencies: { armor: ['all'], weapons: ['simple', 'martial'], skills: [] },
  subclassTitle: 'Sacred Oath',
  classFeatures: [
    'Sacred Oath|Paladin||3',
    'Ability Score Improvement|Paladin||4',
    'Ability Score Improvement|Paladin||8',
    'Ability Score Improvement|Paladin||12',
  ],
};

const WIZARD_DATA: ClassCompendiumData = {
  slug: 'wizard',
  source: 'PHB',
  hd: { number: 1, faces: 6 },
  proficiency: ['int', 'wis'],
  startingProficiencies: { armor: null, weapons: ['dagger'], skills: [] },
  subclassTitle: 'Arcane Tradition',
  classFeatures: [
    'Arcane Tradition|Wizard||2',
    'Ability Score Improvement|Wizard||4',
    'Ability Score Improvement|Wizard||8',
    'Ability Score Improvement|Wizard||12',
  ],
};

/** Fighter L1, active, XP=300 (just reached L2 threshold). */
const FIGHTER_L1_ACTIVE: CharacterSnapshot = {
  name: 'Thorin Stormfist',
  baseStats: { str: 16, dex: 12, con: 14, int: 10, wis: 12, cha: 8 },
  asisApplied: [],
  classes: [
    {
      slug: 'fighter',
      source: 'PHB',
      level: 1,
      subclass: null,
      hitDie: 'd10',
      savingThrows: ['str', 'con'],
      armorProficiencies: ['all'],
      weaponProficiencies: ['simple', 'martial'],
      toolProficiencies: [],
      skillChoices: ['athletics', 'perception'],
    },
  ],
  feats: [],
  levelUpAsis: [],
};

/** Fighter L3 with no subclass — ready for L4 (ASI) or L4 with asiFeat. */
const FIGHTER_L3_ACTIVE: CharacterSnapshot = {
  ...FIGHTER_L1_ACTIVE,
  classes: [
    {
      slug: 'fighter',
      source: 'PHB',
      level: 3,
      subclass: { slug: 'fighter--champion', source: 'PHB' },
      hitDie: 'd10',
      savingThrows: ['str', 'con'],
      armorProficiencies: ['all'],
      weaponProficiencies: ['simple', 'martial'],
      toolProficiencies: [],
      skillChoices: ['athletics', 'perception'],
    },
  ],
};

/** Fighter L5 — ready for L6 (another Fighter ASI, per PHB p.72). */
const FIGHTER_L5_ACTIVE: CharacterSnapshot = {
  ...FIGHTER_L1_ACTIVE,
  classes: [
    {
      slug: 'fighter',
      source: 'PHB',
      level: 5,
      subclass: { slug: 'fighter--champion', source: 'PHB' },
      hitDie: 'd10',
      savingThrows: ['str', 'con'],
      armorProficiencies: ['all'],
      weaponProficiencies: ['simple', 'martial'],
      toolProficiencies: [],
      skillChoices: ['athletics', 'perception'],
    },
  ],
};

/** Paladin L2, no subclass, ready for L3 (Sacred Oath required). */
const PALADIN_L2_ACTIVE: CharacterSnapshot = {
  name: 'Seraphina Brightblade',
  baseStats: { str: 16, dex: 10, con: 14, int: 10, wis: 12, cha: 15 },
  asisApplied: [],
  classes: [
    {
      slug: 'paladin',
      source: 'PHB',
      level: 2,
      subclass: null,
      hitDie: 'd10',
      savingThrows: ['wis', 'cha'],
      armorProficiencies: ['all'],
      weaponProficiencies: ['simple', 'martial'],
      toolProficiencies: [],
      skillChoices: ['athletics', 'persuasion'],
    },
  ],
  feats: [],
  levelUpAsis: [],
};

/** Level 14 total — at the cap. */
const FIGHTER_L14_ACTIVE: CharacterSnapshot = {
  ...FIGHTER_L1_ACTIVE,
  classes: [
    {
      slug: 'fighter',
      source: 'PHB',
      level: 14,
      subclass: { slug: 'fighter--champion', source: 'PHB' },
      hitDie: 'd10',
      savingThrows: ['str', 'con'],
      armorProficiencies: ['all'],
      weaponProficiencies: ['simple', 'martial'],
      toolProficiencies: [],
      skillChoices: ['athletics', 'perception'],
    },
  ],
};

const XP_300 = 300;    // just hit L2 threshold
const XP_900 = 900;    // just hit L3 threshold
const XP_2700 = 2700;  // just hit L4 threshold
const XP_14000 = 14000; // just hit L6 threshold
const XP_6500 = 6500;   // just hit L5 threshold

function makeProfile(overrides: Partial<RulesProfile['variantRules']> = {}): RulesProfile {
  return {
    ...DEFAULT_RULES_PROFILE,
    variantRules: { ...DEFAULT_RULES_PROFILE.variantRules, ...overrides },
  };
}

// ---- Tests ------------------------------------------------------------------

describe('validateLevelUp — status gate', () => {
  it('VAL-1: draft status → LEVELUP_STATUS_INVALID', () => {
    const char = { ...FIGHTER_L1_ACTIVE, status: 'draft' as const };
    const result = validateLevelUp({
      rulesProfile: DEFAULT_RULES_PROFILE,
      character: { ...char, xp: XP_300, status: 'draft' },
      body: { kind: 'same-class', class: { slug: 'fighter', source: 'PHB' }, hp: { method: 'average' } },
      classData: FIGHTER_DATA,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((i) => i.code === 'LEVELUP_STATUS_INVALID')).toBe(true);
    }
  });

  it('VAL-2: active status + sufficient XP → ok (status gate passes)', () => {
    const result = validateLevelUp({
      rulesProfile: DEFAULT_RULES_PROFILE,
      character: { ...FIGHTER_L1_ACTIVE, xp: XP_300, status: 'active' },
      body: { kind: 'same-class', class: { slug: 'fighter', source: 'PHB' }, hp: { method: 'average' } },
      classData: FIGHTER_DATA,
    });
    expect(result.ok).toBe(true);
  });
});

describe('validateLevelUp — XP gate', () => {
  it('VAL-3: XP insuficiente → LEVELUP_INSUFFICIENT_XP con current/required/missing', () => {
    // Fighter L1 needs 300 XP for L2; give only 200.
    const result = validateLevelUp({
      rulesProfile: DEFAULT_RULES_PROFILE,
      character: { ...FIGHTER_L1_ACTIVE, xp: 200, status: 'active' },
      body: { kind: 'same-class', class: { slug: 'fighter', source: 'PHB' }, hp: { method: 'average' } },
      classData: FIGHTER_DATA,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const issue = result.issues.find((i) => i.code === 'LEVELUP_INSUFFICIENT_XP');
      expect(issue).toBeDefined();
      if (issue?.code === 'LEVELUP_INSUFFICIENT_XP') {
        expect(issue.current).toBe(200);
        expect(issue.required).toBe(300);
        expect(issue.missing).toBe(100);
        expect(issue.targetLevel).toBe(2);
      }
    }
  });
});

describe('validateLevelUp — total level cap', () => {
  it('VAL-4: total level 14 → LEVELUP_TOTAL_LEVEL_CAP_EXCEEDED', () => {
    // XP 165000 is enough for L15 by the table, so the XP gate passes.
    // The cap (14) fires next and blocks the level-up.
    const result = validateLevelUp({
      rulesProfile: DEFAULT_RULES_PROFILE,
      character: { ...FIGHTER_L14_ACTIVE, xp: 165_000, status: 'active' },
      body: { kind: 'same-class', class: { slug: 'fighter', source: 'PHB' }, hp: { method: 'average' } },
      classData: FIGHTER_DATA,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const issue = result.issues.find((i) => i.code === 'LEVELUP_TOTAL_LEVEL_CAP_EXCEEDED');
      expect(issue).toBeDefined();
      if (issue?.code === 'LEVELUP_TOTAL_LEVEL_CAP_EXCEEDED') {
        expect(issue.cap).toBe(14);
      }
    }
  });
});

describe('validateLevelUp — same-class branch', () => {
  it('VAL-5: same-class con clase no poseída → LEVELUP_CLASS_NOT_OWNED', () => {
    // Fighter char tries to level up Wizard (not owned)
    const result = validateLevelUp({
      rulesProfile: DEFAULT_RULES_PROFILE,
      character: { ...FIGHTER_L1_ACTIVE, xp: XP_300, status: 'active' },
      body: { kind: 'same-class', class: { slug: 'wizard', source: 'PHB' }, hp: { method: 'average' } },
      classData: WIZARD_DATA,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((i) => i.code === 'LEVELUP_CLASS_NOT_OWNED')).toBe(true);
    }
  });

  it('VAL-6: Paladin L2→L3 sin subclass → SUBCLASS_REQUIRED_AT_LEVEL', () => {
    // PHB p.84 — Paladin picks Sacred Oath at L3
    const result = validateLevelUp({
      rulesProfile: DEFAULT_RULES_PROFILE,
      character: { ...PALADIN_L2_ACTIVE, xp: XP_900, status: 'active' },
      body: { kind: 'same-class', class: { slug: 'paladin', source: 'PHB' }, hp: { method: 'average' } },
      classData: PALADIN_DATA,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const issue = result.issues.find((i) => i.code === 'SUBCLASS_REQUIRED_AT_LEVEL');
      expect(issue).toBeDefined();
      if (issue?.code === 'SUBCLASS_REQUIRED_AT_LEVEL') {
        expect(issue.classSlug).toBe('paladin');
        expect(issue.targetLevel).toBe(3);
      }
    }
  });

  it('VAL-7: Fighter L3→L4 sin asiFeat → LEVELUP_ASIFEAT_REQUIRED', () => {
    // PHB p.72 — Fighter ASI at L4
    const result = validateLevelUp({
      rulesProfile: DEFAULT_RULES_PROFILE,
      character: { ...FIGHTER_L3_ACTIVE, xp: XP_2700, status: 'active' },
      body: { kind: 'same-class', class: { slug: 'fighter', source: 'PHB' }, hp: { method: 'average' } },
      classData: FIGHTER_DATA,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const issue = result.issues.find((i) => i.code === 'LEVELUP_ASIFEAT_REQUIRED');
      expect(issue).toBeDefined();
      if (issue?.code === 'LEVELUP_ASIFEAT_REQUIRED') {
        expect(issue.classSlug).toBe('fighter');
        expect(issue.targetLevel).toBe(4);
      }
    }
  });

  it('VAL-8: Fighter L5→L6 con ASI +2 STR → ok (CL-08 path — L6 is Fighter-only ASI)', () => {
    // PHB p.72 — Fighter gets extra ASI at L6 (standard classes don't)
    const result = validateLevelUp({
      rulesProfile: DEFAULT_RULES_PROFILE,
      character: { ...FIGHTER_L5_ACTIVE, xp: XP_14000, status: 'active' },
      body: {
        kind: 'same-class',
        class: { slug: 'fighter', source: 'PHB' },
        hp: { method: 'average' },
        asiFeat: { kind: 'asi', deltas: { str: 2 } },
      },
      classData: FIGHTER_DATA,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.mutations.asiPushed).toBeDefined();
      if (result.mutations.asiPushed) {
        expect(result.mutations.asiPushed.source).toBe('levelup');
      }
      // Fighter class level bumped to 6
      const fighter = result.mutations.classesNext.find((c) => c.slug === 'fighter');
      expect(fighter?.level).toBe(6);
    }
  });

  it('VAL-9: Fighter L1→L2 avg HP → ok; hpDelta = avg(d10) + conMod', () => {
    // CON 14 → conMod +2; avg(d10)=6; delta=max(1, 6+2)=8
    const result = validateLevelUp({
      rulesProfile: DEFAULT_RULES_PROFILE,
      character: { ...FIGHTER_L1_ACTIVE, xp: XP_300, status: 'active' },
      body: { kind: 'same-class', class: { slug: 'fighter', source: 'PHB' }, hp: { method: 'average' } },
      classData: FIGHTER_DATA,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.mutations.hpDelta).toBe(8); // avg(d10)=6 + conMod(+2)
      expect(result.mutations.rollUsed).toBeNull();
      const fighter = result.mutations.classesNext.find((c) => c.slug === 'fighter');
      expect(fighter?.level).toBe(2);
    }
  });

  it('VAL-10: HP roll path com serverRoll=8 → hpDelta=max(1,8+conMod)', () => {
    // CON 14 → conMod +2; roll=8; delta=max(1, 8+2)=10
    const result = validateLevelUp({
      rulesProfile: DEFAULT_RULES_PROFILE,
      character: { ...FIGHTER_L1_ACTIVE, xp: XP_300, status: 'active' },
      body: { kind: 'same-class', class: { slug: 'fighter', source: 'PHB' }, hp: { method: 'roll' } },
      classData: FIGHTER_DATA,
      serverRoll: 8,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.mutations.hpDelta).toBe(10); // 8 + 2
      expect(result.mutations.rollUsed).toBe(8);
      expect(result.mutations.hpRollEntry).toBeDefined();
      if (result.mutations.hpRollEntry) {
        expect(result.mutations.hpRollEntry.classSlug).toBe('fighter');
        expect(result.mutations.hpRollEntry.level).toBe(2);
        expect(result.mutations.hpRollEntry.roll).toBe(8);
      }
    }
  });
});

describe('validateLevelUp — new-class branch', () => {
  it('VAL-11: multiclassing deshabilitado en profile → MULTICLASS_DISABLED_BY_CAMPAIGN', () => {
    const profile = makeProfile({ multiclassing: false });
    const result = validateLevelUp({
      rulesProfile: profile,
      character: { ...FIGHTER_L1_ACTIVE, xp: XP_300, status: 'active' },
      body: { kind: 'new-class', class: { slug: 'wizard', source: 'PHB' }, hp: { method: 'average' } },
      classData: WIZARD_DATA,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((i) => i.code === 'MULTICLASS_DISABLED_BY_CAMPAIGN')).toBe(true);
    }
  });

  it('VAL-12: new-class con prereq no cumplido → PREREQ_NOT_MET (delegado a validateMulticlassAddition)', () => {
    // Fighter with INT 10 tries to multiclass Wizard (needs INT 13)
    const charLowInt = {
      ...FIGHTER_L1_ACTIVE,
      baseStats: { str: 16, dex: 12, con: 14, int: 10, wis: 12, cha: 8 },
      xp: XP_300,
      status: 'active' as const,
    };
    const result = validateLevelUp({
      rulesProfile: DEFAULT_RULES_PROFILE,
      character: charLowInt,
      body: { kind: 'new-class', class: { slug: 'wizard', source: 'PHB' }, hp: { method: 'average' } },
      classData: WIZARD_DATA,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((i) => i.code === 'PREREQ_NOT_MET')).toBe(true);
    }
  });
});

describe('validateLevelUp — feat at ASI level (REQ-CLU-FEAT-VALID)', () => {
  // FEAT-VAL-1: asiFeat.kind='feat' with featData provided → mutations.featPushed is set
  // PHB p.72 — Fighter L4 is an ASI level; when feat is chosen, the feat is recorded.
  it('FEAT-VAL-1: Fighter L3→L4 with asiFeat.kind=feat and featData provided → mutations.featPushed set', () => {
    const featData = {
      slug: 'alert',
      source: 'PHB',
      name: 'Alert',
      prerequisite: null,
      ability: null,
    };
    const result = validateLevelUp({
      rulesProfile: DEFAULT_RULES_PROFILE,
      character: { ...FIGHTER_L3_ACTIVE, xp: XP_2700, status: 'active' },
      body: {
        kind: 'same-class',
        class: { slug: 'fighter', source: 'PHB' },
        hp: { method: 'average' },
        asiFeat: { kind: 'feat', slug: 'alert', source: 'PHB' },
      },
      classData: FIGHTER_DATA,
      featData,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.mutations.featPushed).toBeDefined();
      if (result.mutations.featPushed) {
        expect(result.mutations.featPushed.slug).toBe('alert');
        expect(result.mutations.featPushed.source).toBe('PHB');
        expect(result.mutations.featPushed.asisApplied).toEqual([]);
      }
    }
  });

  // FEAT-VAL-2: asiFeat.kind='feat' but no featData → FEAT_NOT_FOUND issue
  // This fires when the route did not find the feat in the compendium before calling validateLevelUp.
  it('FEAT-VAL-2: Fighter L3→L4 with asiFeat.kind=feat but no featData → FEAT_NOT_FOUND', () => {
    const result = validateLevelUp({
      rulesProfile: DEFAULT_RULES_PROFILE,
      character: { ...FIGHTER_L3_ACTIVE, xp: XP_2700, status: 'active' },
      body: {
        kind: 'same-class',
        class: { slug: 'fighter', source: 'PHB' },
        hp: { method: 'average' },
        asiFeat: { kind: 'feat', slug: 'nonexistent-feat', source: 'PHB' },
      },
      classData: FIGHTER_DATA,
      // featData intentionally omitted → domain must return FEAT_NOT_FOUND
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const issue = result.issues.find((i) => i.code === 'FEAT_NOT_FOUND');
      expect(issue).toBeDefined();
      if (issue?.code === 'FEAT_NOT_FOUND') {
        expect(issue.feat.slug).toBe('nonexistent-feat');
        expect(issue.feat.source).toBe('PHB');
      }
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// featuresUnlocked population (REQ-CLU-FTR-POPULATE-MUTATIONS)
// ──────────────────────────────────────────────────────────────────────────────

/** Fighter with Action Surge at L2 (PHB p.72: Fighter L2 feature = Action Surge). */
const FIGHTER_DATA_WITH_L2: ClassCompendiumData = {
  slug: 'fighter',
  source: 'PHB',
  hd: { number: 1, faces: 10 },
  proficiency: ['str', 'con'],
  startingProficiencies: { armor: ['all'], weapons: ['simple', 'martial'], skills: [] },
  subclassTitle: 'Martial Archetype',
  classFeatures: [
    'Fighting Style|Fighter||1',
    'Second Wind|Fighter||1',
    // PHB p.72: Fighter L2 = Action Surge
    'Action Surge|Fighter||2',
    'Martial Archetype|Fighter||3',
    'Ability Score Improvement|Fighter||4',
  ],
};

/** Cleric with Spellcasting + Divine Domain at L1 (PHB p.58). */
const CLERIC_DATA: ClassCompendiumData = {
  slug: 'cleric',
  source: 'PHB',
  hd: { number: 1, faces: 8 },
  proficiency: ['wis', 'cha'],
  startingProficiencies: { armor: ['light', 'medium', 'shields'], weapons: ['simple'], skills: [] },
  subclassTitle: 'Divine Domain',
  classFeatures: [
    // PHB p.58: Cleric L1 grants both Spellcasting AND Divine Domain
    'Spellcasting|Cleric||1',
    'Divine Domain|Cleric||1',
    'Channel Divinity|Cleric||2',
  ],
};

/** Character with high WIS to meet Cleric multiclass prereq (WIS 13). */
const FIGHTER_L1_ADDING_CLERIC: CharacterSnapshot & { xp: number; status: string } = {
  ...FIGHTER_L1_ACTIVE,
  baseStats: { str: 16, dex: 12, con: 14, int: 10, wis: 14, cha: 8 }, // WIS 14 >= 13 prereq
  xp: XP_300,
  status: 'active' as const,
};

describe('validateLevelUp — featuresUnlocked (REQ-CLU-FTR-POPULATE-MUTATIONS)', () => {
  it('FTR-1: Fighter L1→L2 → featuresUnlocked contains Action Surge', () => {
    // PHB p.72: Fighter L2 feature = Action Surge.
    const result = validateLevelUp({
      rulesProfile: DEFAULT_RULES_PROFILE,
      character: { ...FIGHTER_L1_ACTIVE, xp: XP_300, status: 'active' },
      body: { kind: 'same-class', class: { slug: 'fighter', source: 'PHB' }, hp: { method: 'average' } },
      classData: FIGHTER_DATA_WITH_L2,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const fu = result.mutations.featuresUnlocked;
      expect(fu.length).toBeGreaterThan(0);
      const actionSurge = fu.find((f) => f.featureName === 'Action Surge');
      expect(actionSurge).toBeDefined();
      expect(actionSurge?.featureSlug).toBe('action-surge');
      expect(actionSurge?.classSlug).toBe('fighter');
      expect(actionSurge?.level).toBe(2);
    }
  });

  it('FTR-2: Cleric L0→L1 (new-class) → featuresUnlocked contains Spellcasting and Divine Domain', () => {
    // PHB p.58: Cleric L1 grants Spellcasting and Divine Domain.
    // This exercises the new-class branch of validateLevelUp.
    // Cleric unlock level = 1 (PHB p.58), so multiclass requires subclassData.
    const clericSubclass = {
      slug: 'cleric--life',
      source: 'PHB',
      classSlug: 'cleric',
      classSource: 'PHB',
      name: 'Life Domain',
    };
    const result = validateLevelUp({
      rulesProfile: DEFAULT_RULES_PROFILE,
      character: FIGHTER_L1_ADDING_CLERIC,
      body: {
        kind: 'new-class',
        class: { slug: 'cleric', source: 'PHB' },
        subclass: { slug: 'cleric--life', source: 'PHB' },
        hp: { method: 'average' },
        skillChoices: [],
      },
      classData: CLERIC_DATA,
      subclassData: clericSubclass,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const fu = result.mutations.featuresUnlocked;
      expect(fu.length).toBeGreaterThan(0);
      const names = fu.map((f) => f.featureName);
      expect(names).toContain('Spellcasting');
      expect(names).toContain('Divine Domain');
    }
  });

  it('FTR-3: level with no classFeatures in the data → featuresUnlocked is []', () => {
    // FIGHTER_DATA (original fixture) has no L2 feature entry.
    const result = validateLevelUp({
      rulesProfile: DEFAULT_RULES_PROFILE,
      character: { ...FIGHTER_L1_ACTIVE, xp: XP_300, status: 'active' },
      body: { kind: 'same-class', class: { slug: 'fighter', source: 'PHB' }, hp: { method: 'average' } },
      classData: FIGHTER_DATA, // original fixture — no L2 feature
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.mutations.featuresUnlocked).toEqual([]);
    }
  });
});
