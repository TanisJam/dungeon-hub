import { describe, expect, it } from 'vitest';
import { validateBackgroundSelection } from '../../../src/character/background/validate.js';
import type { BackgroundCompendiumData } from '../../../src/character/background/types.js';
import { DEFAULT_RULES_PROFILE } from '../../../src/rules-profile/default.js';

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
