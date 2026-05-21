import { describe, expect, it } from 'vitest';
import { validateMulticlassAddition } from '../../../src/character/multiclass/validate.js';
import { computeEffectiveScores } from '../../../src/character/multiclass/effective-scores.js';
import { checkMulticlassPrereq } from '../../../src/character/multiclass/prereqs.js';
import type { ClassCompendiumData, SubclassCompendiumData } from '../../../src/character/class/types.js';
import { DEFAULT_RULES_PROFILE } from '../../../src/rules-profile/default.js';
import type { AbilityScores } from '../../../src/character/stats/types.js';

// ---- Fixtures -------------------------------------------------------------
const WIZARD: ClassCompendiumData = {
  slug: 'wizard',
  source: 'PHB',
  hd: { number: 1, faces: 6 },
  proficiency: ['int', 'wis'],
  startingProficiencies: { armor: null, weapons: ['dagger'], skills: [] },
  subclassTitle: 'Arcane Tradition',
  classFeatures: ['Arcane Tradition|Wizard||2'],
};

const FIGHTER: ClassCompendiumData = {
  slug: 'fighter',
  source: 'PHB',
  hd: { number: 1, faces: 10 },
  proficiency: ['str', 'con'],
  startingProficiencies: { armor: ['all'], weapons: ['simple', 'martial'], skills: [] },
  subclassTitle: 'Martial Archetype',
  classFeatures: ['Martial Archetype|Fighter||3'],
};

const PALADIN: ClassCompendiumData = {
  slug: 'paladin',
  source: 'PHB',
  hd: { number: 1, faces: 10 },
  proficiency: ['wis', 'cha'],
  startingProficiencies: { armor: ['all'], weapons: ['simple', 'martial'], skills: [] },
  subclassTitle: 'Sacred Oath',
  classFeatures: ['Sacred Oath|Paladin||3'],
};

const CLERIC: ClassCompendiumData = {
  slug: 'cleric',
  source: 'PHB',
  hd: { number: 1, faces: 8 },
  proficiency: ['wis', 'cha'],
  startingProficiencies: { armor: ['light', 'medium', 'shield'], weapons: ['simple'], skills: [] },
  subclassTitle: 'Divine Domain',
  classFeatures: ['Divine Domain|Cleric||1'],
};

const LIFE_DOMAIN: SubclassCompendiumData = {
  slug: 'cleric--life',
  source: 'PHB',
  classSlug: 'cleric',
  classSource: 'PHB',
  name: 'Life Domain',
};

const STATS_STRONG_INT: AbilityScores = { str: 8, dex: 14, con: 14, int: 15, wis: 12, cha: 10 };
const STATS_WEAK: AbilityScores = { str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 };

// ---- Tests ----------------------------------------------------------------
describe('computeEffectiveScores', () => {
  it('suma asisApplied a baseStats', () => {
    const eff = computeEffectiveScores(STATS_STRONG_INT, [
      { ability: 'int', bonus: 2, source: 'race' },
      { ability: 'wis', bonus: 1, source: 'subrace' },
    ]);
    expect(eff.int).toBe(17);
    expect(eff.wis).toBe(13);
  });
});

describe('checkMulticlassPrereq', () => {
  it('Wizard requiere INT 13', () => {
    const ok = checkMulticlassPrereq('wizard', { ...STATS_STRONG_INT });
    expect(ok?.meetsAll).toBe(true);

    const fail = checkMulticlassPrereq('wizard', { ...STATS_WEAK });
    expect(fail?.meetsAll).toBe(false);
    expect(fail?.missing[0]?.ability).toBe('int');
  });

  it("Fighter requiere STR 13 O DEX 13 (uno solo alcanza)", () => {
    const okStr = checkMulticlassPrereq('fighter', { ...STATS_WEAK, str: 13 });
    expect(okStr?.meetsAll).toBe(true);

    const okDex = checkMulticlassPrereq('fighter', { ...STATS_WEAK, dex: 13 });
    expect(okDex?.meetsAll).toBe(true);

    const fail = checkMulticlassPrereq('fighter', STATS_WEAK);
    expect(fail?.meetsAll).toBe(false);
  });

  it('Paladin requiere STR 13 Y CHA 13', () => {
    const onlyStr = checkMulticlassPrereq('paladin', { ...STATS_WEAK, str: 13 });
    expect(onlyStr?.meetsAll).toBe(false);
    expect(onlyStr?.missing.find((m) => m.ability === 'cha')).toBeDefined();

    const both = checkMulticlassPrereq('paladin', { ...STATS_WEAK, str: 13, cha: 13 });
    expect(both?.meetsAll).toBe(true);
  });
});

describe('validateMulticlassAddition — happy path', () => {
  it('Wizard 1 → multiclass Fighter con DEX 14', () => {
    const res = validateMulticlassAddition({
      rulesProfile: DEFAULT_RULES_PROFILE,
      baseStats: STATS_STRONG_INT, // dex 14
      asisApplied: [],
      existingClasses: [{ slug: 'wizard', source: 'PHB' }],
      newClassData: FIGHTER,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.appliedClass.slug).toBe('fighter');
    expect(res.appliedClass.level).toBe(1);
    expect(res.appliedClass.savingThrows).toEqual([]); // ¡NO se ganan saves al multiclassear!
    expect(res.appliedClass.armorProficiencies).toEqual(['light', 'medium', 'shield']);
  });

  it('Multiclass a Cleric requiere Divine Domain a nivel 1 (unlock=1)', () => {
    const res = validateMulticlassAddition({
      rulesProfile: DEFAULT_RULES_PROFILE,
      baseStats: { ...STATS_STRONG_INT, wis: 13 },
      asisApplied: [],
      existingClasses: [{ slug: 'wizard', source: 'PHB' }],
      newClassData: CLERIC,
      newSubclassData: LIFE_DOMAIN,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.appliedClass.subclass).toEqual({ slug: 'cleric--life', source: 'PHB' });
  });
});

describe('validateMulticlassAddition — rejections', () => {
  it('Multiclass disabled by campaign → rechaza', () => {
    const profile = {
      ...DEFAULT_RULES_PROFILE,
      variantRules: { ...DEFAULT_RULES_PROFILE.variantRules, multiclassing: false },
    };
    const res = validateMulticlassAddition({
      rulesProfile: profile,
      baseStats: STATS_STRONG_INT,
      existingClasses: [{ slug: 'wizard', source: 'PHB' }],
      newClassData: FIGHTER,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.issues[0]?.code).toBe('MULTICLASS_DISABLED_BY_CAMPAIGN');
  });

  it('Mismo class ya presente → CLASS_ALREADY_PRESENT', () => {
    const res = validateMulticlassAddition({
      rulesProfile: DEFAULT_RULES_PROFILE,
      baseStats: STATS_STRONG_INT,
      existingClasses: [{ slug: 'wizard', source: 'PHB' }],
      newClassData: WIZARD,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.issues[0]?.code).toBe('CLASS_ALREADY_PRESENT');
  });

  it('Prereq no cumplido → PREREQ_NOT_MET con detalle', () => {
    const res = validateMulticlassAddition({
      rulesProfile: DEFAULT_RULES_PROFILE,
      baseStats: STATS_WEAK, // todo en 8
      existingClasses: [{ slug: 'wizard', source: 'PHB' }],
      newClassData: PALADIN,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    const issue = res.issues.find((i) => i.code === 'PREREQ_NOT_MET');
    expect(issue).toBeDefined();
    if (issue?.code === 'PREREQ_NOT_MET') {
      expect(issue.missing.map((m) => m.ability)).toEqual(expect.arrayContaining(['str', 'cha']));
    }
  });

  it('Prereq de clase EXISTENTE rota tras editar stats → EXISTING_CLASS_PREREQ_BROKEN', () => {
    // Personaje arrancó Wizard pero ahora tiene INT 10 (no llega a 13)
    const res = validateMulticlassAddition({
      rulesProfile: DEFAULT_RULES_PROFILE,
      baseStats: { ...STATS_WEAK, str: 13 }, // STR 13 alcanza para Fighter, pero INT 8 rompe Wizard
      existingClasses: [{ slug: 'wizard', source: 'PHB' }],
      newClassData: FIGHTER,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    const broken = res.issues.find((i) => i.code === 'EXISTING_CLASS_PREREQ_BROKEN');
    expect(broken).toBeDefined();
  });

  it('Sin baseStats → NO_BASE_STATS', () => {
    const res = validateMulticlassAddition({
      rulesProfile: DEFAULT_RULES_PROFILE,
      baseStats: null,
      existingClasses: [{ slug: 'wizard', source: 'PHB' }],
      newClassData: FIGHTER,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.issues[0]?.code).toBe('NO_BASE_STATS');
  });
});

describe('validateMulticlassAddition — skill choices', () => {
  const ROGUE: ClassCompendiumData = {
    slug: 'rogue',
    source: 'PHB',
    hd: { number: 1, faces: 8 },
    proficiency: ['dex', 'int'],
    startingProficiencies: { armor: ['light'], weapons: ['simple'], skills: [] },
    subclassTitle: 'Roguish Archetype',
    classFeatures: ['Roguish Archetype|Rogue||3'],
  };

  it('Rogue multiclass exige 1 skill choice del pool de Rogue', () => {
    const res = validateMulticlassAddition({
      rulesProfile: DEFAULT_RULES_PROFILE,
      baseStats: { ...STATS_STRONG_INT, dex: 14 },
      existingClasses: [{ slug: 'wizard', source: 'PHB' }],
      newClassData: ROGUE,
      skillChoices: [], // se requiere 1
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.issues[0]?.code).toBe('MULTICLASS_SKILL_REQUIRED');
  });

  it('Rogue multiclass acepta una skill válida del pool', () => {
    const res = validateMulticlassAddition({
      rulesProfile: DEFAULT_RULES_PROFILE,
      baseStats: { ...STATS_STRONG_INT, dex: 14 },
      existingClasses: [{ slug: 'wizard', source: 'PHB' }],
      newClassData: ROGUE,
      skillChoices: ['stealth'],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.appliedClass.skillChoices).toEqual(['stealth']);
    expect(res.appliedClass.toolProficiencies).toContain("thieves' tools");
  });

  it('Rogue multiclass rechaza skill fuera del pool', () => {
    const res = validateMulticlassAddition({
      rulesProfile: DEFAULT_RULES_PROFILE,
      baseStats: { ...STATS_STRONG_INT, dex: 14 },
      existingClasses: [{ slug: 'wizard', source: 'PHB' }],
      newClassData: ROGUE,
      skillChoices: ['arcana'], // arcana NO está en la pool de Rogue multiclass
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.issues[0]?.code).toBe('MULTICLASS_SKILL_NOT_ALLOWED');
  });
});
