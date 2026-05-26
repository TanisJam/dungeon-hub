import { describe, expect, it } from 'vitest';
import { validateRaceSelection } from '../../../src/character/race/validate.js';
import type {
  RaceCompendiumData,
  SubraceCompendiumData,
} from '../../../src/character/race/types.js';
import type { FeatCompendiumData } from '../../../src/character/feat/types.js';
import type { CharacterFeatContext } from '../../../src/character/feat/types.js';
import { DEFAULT_RULES_PROFILE } from '../../../src/rules-profile/default.js';
import type { RulesProfile } from '../../../src/rules-profile/types.js';

const PROFILE_TASHAS_OFF: RulesProfile = {
  ...DEFAULT_RULES_PROFILE,
  variantRules: { ...DEFAULT_RULES_PROFILE.variantRules, tashasCustomOrigin: false },
};
const PROFILE_TASHAS_ON: RulesProfile = {
  ...DEFAULT_RULES_PROFILE,
  variantRules: { ...DEFAULT_RULES_PROFILE.variantRules, tashasCustomOrigin: true },
};

// ---- Race data mocks ------------------------------------------------------
const PHB_ELF: RaceCompendiumData = {
  slug: 'elf',
  source: 'PHB',
  ability: [{ dex: 2 }],
};
const PHB_HIGH_ELF: SubraceCompendiumData = {
  slug: 'elf--high',
  source: 'PHB',
  parentSlug: 'elf',
  parentSource: 'PHB',
  ability: [{ int: 1 }],
};
const MPMM_AASIMAR: RaceCompendiumData = {
  slug: 'aasimar',
  source: 'MPMM',
  ability: null, // MPMM convention
};
const VGM_AASIMAR: RaceCompendiumData = {
  slug: 'aasimar',
  source: 'VGM',
  ability: [{ cha: 2 }],
};
const PHB_HALF_ELF: RaceCompendiumData = {
  slug: 'half-elf',
  source: 'PHB',
  ability: [{ cha: 2, choose: { from: ['str', 'dex', 'con', 'int', 'wis'], count: 2 } }],
};

describe('validateRaceSelection — fixed ASIs (Tasha\'s OFF)', () => {
  it('aplica los ASIs fijos sin pedir input', () => {
    const res = validateRaceSelection({
      raceData: PHB_ELF,
      subraceData: PHB_HIGH_ELF,
      rulesProfile: PROFILE_TASHAS_OFF,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.appliedAsis).toHaveLength(2);
    expect(res.appliedAsis).toContainEqual({ ability: 'dex', bonus: 2, source: 'race' });
    expect(res.appliedAsis).toContainEqual({ ability: 'int', bonus: 1, source: 'subrace' });
    expect(res.usedTashasCustomOrigin).toBe(false);
  });

  it('acepta appliedAsis explícitos si coinciden con los fijos (Elf + High Elf subrace)', () => {
    const res = validateRaceSelection({
      raceData: PHB_ELF,
      subraceData: PHB_HIGH_ELF,
      rulesProfile: PROFILE_TASHAS_OFF,
      appliedAsis: [
        { ability: 'dex', bonus: 2, source: 'race' },
        { ability: 'int', bonus: 1, source: 'subrace' },
      ],
    });
    expect(res.ok).toBe(true);
  });

  it('rechaza appliedAsis que no coinciden con los fijos (Elf + High Elf subrace)', () => {
    const res = validateRaceSelection({
      raceData: PHB_ELF,
      subraceData: PHB_HIGH_ELF,
      rulesProfile: PROFILE_TASHAS_OFF,
      appliedAsis: [{ ability: 'str', bonus: 2, source: 'race' }],
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.issues[0]?.code).toBe('ASI_MISMATCH');
  });
});

describe("validateRaceSelection — Tasha's Custom Origin ON", () => {
  it('exige appliedAsis cuando Tasha\'s está on', () => {
    const res = validateRaceSelection({
      raceData: PHB_ELF,
      subraceData: PHB_HIGH_ELF,
      rulesProfile: PROFILE_TASHAS_ON,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.issues[0]?.code).toBe('ASI_REQUIRED');
  });

  it('redistribuye el bag a stats arbitrarios distintos', () => {
    // PHB Elf (+2 DEX) + High Elf (+1 INT) → bag = [2, 1]
    // Bajo Tasha's puedo poner el +2 en STR y el +1 en CHA
    const res = validateRaceSelection({
      raceData: PHB_ELF,
      subraceData: PHB_HIGH_ELF,
      rulesProfile: PROFILE_TASHAS_ON,
      appliedAsis: [
        { ability: 'str', bonus: 2, source: 'race' },
        { ability: 'cha', bonus: 1, source: 'subrace' },
      ],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.usedTashasCustomOrigin).toBe(true);
  });

  it('rechaza si el bag no coincide (bonuses cambiados)', () => {
    const res = validateRaceSelection({
      raceData: PHB_ELF,
      subraceData: PHB_HIGH_ELF,
      rulesProfile: PROFILE_TASHAS_ON,
      appliedAsis: [
        { ability: 'str', bonus: 2, source: 'race' },
        { ability: 'cha', bonus: 2, source: 'subrace' }, // debería ser +1
      ],
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.issues[0]?.code).toBe('ASI_MISMATCH');
  });

  it('rechaza dos bonuses al mismo stat', () => {
    const res = validateRaceSelection({
      raceData: PHB_ELF,
      subraceData: PHB_HIGH_ELF,
      rulesProfile: PROFILE_TASHAS_ON,
      appliedAsis: [
        { ability: 'str', bonus: 2, source: 'race' },
        { ability: 'str', bonus: 1, source: 'subrace' }, // duplicado
      ],
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.issues[0]?.code).toBe('ASI_DUPLICATE_ABILITY');
  });
});

describe('validateRaceSelection — MPMM convention (ability: null)', () => {
  it('exige appliedAsis +2/+1 a stats distintos', () => {
    const res = validateRaceSelection({
      raceData: MPMM_AASIMAR,
      rulesProfile: PROFILE_TASHAS_OFF,
      appliedAsis: [
        { ability: 'cha', bonus: 2, source: 'race' },
        { ability: 'wis', bonus: 1, source: 'race' },
      ],
    });
    expect(res.ok).toBe(true);
  });

  it('rechaza si falta el +2 o +1', () => {
    const res = validateRaceSelection({
      raceData: MPMM_AASIMAR,
      rulesProfile: PROFILE_TASHAS_OFF,
      appliedAsis: [{ ability: 'cha', bonus: 1, source: 'race' }],
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.issues[0]?.code).toBe('ASI_MISMATCH');
  });

  it('rechaza si no se provee appliedAsis', () => {
    const res = validateRaceSelection({
      raceData: MPMM_AASIMAR,
      rulesProfile: PROFILE_TASHAS_OFF,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.issues[0]?.code).toBe('ASI_REQUIRED');
  });
});

describe('validateRaceSelection — choose blocks (1.4b.2)', () => {
  // ---- Half-Elf: +2 CHA fixed + choose 2 stats no-CHA (+1 c/u) ----------
  it('Half-Elf: pide appliedAsis cuando hay choose', () => {
    const res = validateRaceSelection({
      raceData: PHB_HALF_ELF,
      rulesProfile: PROFILE_TASHAS_OFF,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.issues[0]?.code).toBe('ASI_REQUIRED');
  });

  it('Half-Elf: acepta +2 CHA + 2 picks de +1 a stats distintos no-CHA', () => {
    const res = validateRaceSelection({
      raceData: PHB_HALF_ELF,
      rulesProfile: PROFILE_TASHAS_OFF,
      appliedAsis: [
        { ability: 'cha', bonus: 2, source: 'race' },
        { ability: 'str', bonus: 1, source: 'race' },
        { ability: 'dex', bonus: 1, source: 'race' },
      ],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.appliedAsis).toHaveLength(3);
  });

  it('Half-Elf: rechaza pick a CHA (ya tiene fixed → OVERLAP_WITH_FIXED)', () => {
    const res = validateRaceSelection({
      raceData: PHB_HALF_ELF,
      rulesProfile: PROFILE_TASHAS_OFF,
      appliedAsis: [
        { ability: 'cha', bonus: 2, source: 'race' },
        { ability: 'cha', bonus: 1, source: 'race' },
        { ability: 'str', bonus: 1, source: 'race' },
      ],
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    // Detecta el duplicate o el overlap; ambos son válidos para fallar acá.
    const codes = res.issues.map((i) => i.code);
    expect(
      codes.includes('ASI_DUPLICATE_ABILITY') || codes.includes('RACE_ASI_OVERLAP_WITH_FIXED'),
    ).toBe(true);
  });

  it('Half-Elf: rechaza bonus distinto al esperado (count=2 amount default=1)', () => {
    const res = validateRaceSelection({
      raceData: PHB_HALF_ELF,
      rulesProfile: PROFILE_TASHAS_OFF,
      appliedAsis: [
        { ability: 'cha', bonus: 2, source: 'race' },
        { ability: 'str', bonus: 2, source: 'race' }, // debe ser +1
        { ability: 'dex', bonus: 1, source: 'race' },
      ],
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.issues.some((i) => i.code === 'RACE_ASI_CHOOSE_WRONG_BONUS')).toBe(true);
  });

  // ---- Tiefling variant: +1 INT fixed + choose 1 stat (+2) -----------
  it('Tiefling variant: count=1 amount=2 acepta el pick correcto', () => {
    const TIEFLING_VARIANT: RaceCompendiumData = {
      slug: 'tiefling',
      source: 'PHB',
      ability: [{ int: 1, choose: { from: ['dex', 'cha'], count: 1, amount: 2 } }],
    };
    const res = validateRaceSelection({
      raceData: TIEFLING_VARIANT,
      rulesProfile: PROFILE_TASHAS_OFF,
      appliedAsis: [
        { ability: 'int', bonus: 1, source: 'race' },
        { ability: 'dex', bonus: 2, source: 'race' },
      ],
    });
    expect(res.ok).toBe(true);
  });

  it('Tiefling variant: rechaza pick fuera de `from`', () => {
    const TIEFLING_VARIANT: RaceCompendiumData = {
      slug: 'tiefling',
      source: 'PHB',
      ability: [{ int: 1, choose: { from: ['dex', 'cha'], count: 1, amount: 2 } }],
    };
    const res = validateRaceSelection({
      raceData: TIEFLING_VARIANT,
      rulesProfile: PROFILE_TASHAS_OFF,
      appliedAsis: [
        { ability: 'int', bonus: 1, source: 'race' },
        { ability: 'str', bonus: 2, source: 'race' }, // str no está en from
      ],
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.issues.some((i) => i.code === 'RACE_ASI_CHOOSE_INVALID_ABILITY')).toBe(true);
  });

  // ---- Custom Lineage: amount alone (distribuir 2 puntos) ------------
  it('Custom Lineage: amount=2 alone, acepta +2 a una ability', () => {
    const CUSTOM_LINEAGE: RaceCompendiumData = {
      slug: 'custom-lineage',
      source: 'TCE',
      ability: [{ choose: { from: ['str', 'dex', 'con', 'int', 'wis', 'cha'], amount: 2 } }],
    };
    const res = validateRaceSelection({
      raceData: CUSTOM_LINEAGE,
      rulesProfile: { ...PROFILE_TASHAS_OFF, sources: { ...PROFILE_TASHAS_OFF.sources, TCE: true } },
      appliedAsis: [{ ability: 'cha', bonus: 2, source: 'race' }],
    });
    expect(res.ok).toBe(true);
  });

  it('Custom Lineage: acepta +1 + +1 a dos abilities distintas', () => {
    const CUSTOM_LINEAGE: RaceCompendiumData = {
      slug: 'custom-lineage',
      source: 'TCE',
      ability: [{ choose: { from: ['str', 'dex', 'con', 'int', 'wis', 'cha'], amount: 2 } }],
    };
    const res = validateRaceSelection({
      raceData: CUSTOM_LINEAGE,
      rulesProfile: { ...PROFILE_TASHAS_OFF, sources: { ...PROFILE_TASHAS_OFF.sources, TCE: true } },
      appliedAsis: [
        { ability: 'dex', bonus: 1, source: 'race' },
        { ability: 'con', bonus: 1, source: 'race' },
      ],
    });
    expect(res.ok).toBe(true);
  });

  it('Custom Lineage: rechaza si los puntos no suman 2', () => {
    const CUSTOM_LINEAGE: RaceCompendiumData = {
      slug: 'custom-lineage',
      source: 'TCE',
      ability: [{ choose: { from: ['str', 'dex', 'con', 'int', 'wis', 'cha'], amount: 2 } }],
    };
    const res = validateRaceSelection({
      raceData: CUSTOM_LINEAGE,
      rulesProfile: { ...PROFILE_TASHAS_OFF, sources: { ...PROFILE_TASHAS_OFF.sources, TCE: true } },
      appliedAsis: [{ ability: 'cha', bonus: 1, source: 'race' }], // total 1, esperaba 2
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.issues.some((i) => i.code === 'RACE_ASI_CHOOSE_WRONG_TOTAL')).toBe(true);
  });

  // ---- Half-Elf bajo Tasha's ON: redistribuye el bag {+2, +1, +1} ----
  it("Half-Elf con Tasha's ON: redistribuye {+2, +1, +1} a stats arbitrarios", () => {
    const res = validateRaceSelection({
      raceData: PHB_HALF_ELF,
      rulesProfile: PROFILE_TASHAS_ON,
      appliedAsis: [
        { ability: 'str', bonus: 2, source: 'race' },
        { ability: 'con', bonus: 1, source: 'race' },
        { ability: 'wis', bonus: 1, source: 'race' },
      ],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.usedTashasCustomOrigin).toBe(true);
  });
});

describe('validateRaceSelection — source + entity gating', () => {
  it('rechaza raza cuya source no está habilitada', () => {
    const profile: RulesProfile = {
      ...PROFILE_TASHAS_OFF,
      sources: { ...PROFILE_TASHAS_OFF.sources, VGM: false },
    };
    const res = validateRaceSelection({ raceData: VGM_AASIMAR, rulesProfile: profile });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.issues[0]?.code).toBe('RACE_DISABLED');
  });

  it('rechaza raza específicamente deshabilitada via disabledEntities', () => {
    const profile: RulesProfile = {
      ...PROFILE_TASHAS_OFF,
      disabledEntities: {
        ...PROFILE_TASHAS_OFF.disabledEntities,
        races: ['aasimar|VGM'],
      },
    };
    const res = validateRaceSelection({ raceData: VGM_AASIMAR, rulesProfile: profile });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.issues[0]?.code).toBe('RACE_DISABLED');
  });

  it('rechaza subrace que no pertenece a la raza elegida', () => {
    const wrongSubrace: SubraceCompendiumData = {
      slug: 'elf--high',
      source: 'PHB',
      parentSlug: 'human', // ¡no pertenece a Elf!
      parentSource: 'PHB',
      ability: [{ int: 1 }],
    };
    const res = validateRaceSelection({
      raceData: PHB_ELF,
      subraceData: wrongSubrace,
      rulesProfile: PROFILE_TASHAS_OFF,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.issues[0]?.code).toBe('SUBRACE_DOES_NOT_BELONG_TO_RACE');
  });
});

// ---- Fixtures for subrace-required tests ----------------------------------
const PHB_DWARF: RaceCompendiumData = {
  slug: 'dwarf',
  source: 'PHB',
  ability: [{ con: 2 }],
};
const PHB_HILL_DWARF: SubraceCompendiumData = {
  slug: 'dwarf--hill',
  source: 'PHB',
  parentSlug: 'dwarf',
  parentSource: 'PHB',
  ability: [{ wis: 1 }],
};
const PHB_GNOME: RaceCompendiumData = {
  slug: 'gnome',
  source: 'PHB',
  ability: [{ int: 2 }],
};
const PHB_HALFLING: RaceCompendiumData = {
  slug: 'halfling',
  source: 'PHB',
  ability: [{ dex: 2 }],
};
const PHB_HUMAN: RaceCompendiumData = {
  slug: 'human',
  source: 'PHB',
  ability: [{ str: 1, dex: 1, con: 1, int: 1, wis: 1, cha: 1 }],
};
const PHB_HALF_ORC: RaceCompendiumData = {
  slug: 'half-orc',
  source: 'PHB',
  ability: [{ str: 2, con: 1 }],
};
const PHB_DRAGONBORN: RaceCompendiumData = {
  slug: 'dragonborn',
  source: 'PHB',
  ability: [{ str: 2, cha: 1 }],
};
const TCE_CUSTOM_LINEAGE: RaceCompendiumData = {
  slug: 'custom-lineage',
  source: 'TCE',
  ability: [{ choose: { from: ['str', 'dex', 'con', 'int', 'wis', 'cha'], amount: 2 } }],
};

describe('validateRaceSelection — subrace required (PHB gate)', () => {
  it('V-1: Dwarf without subrace → RACE_SUBRACE_REQUIRED', () => {
    const res = validateRaceSelection({
      raceData: PHB_DWARF,
      subraceData: null,
      rulesProfile: PROFILE_TASHAS_OFF,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.issues).toHaveLength(1);
    expect(res.issues[0]).toEqual({
      code: 'RACE_SUBRACE_REQUIRED',
      race: { slug: 'dwarf', source: 'PHB' },
    });
  });

  it('V-2: Elf without subrace → RACE_SUBRACE_REQUIRED', () => {
    const res = validateRaceSelection({
      raceData: PHB_ELF,
      subraceData: null,
      rulesProfile: PROFILE_TASHAS_OFF,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.issues[0]).toEqual({
      code: 'RACE_SUBRACE_REQUIRED',
      race: { slug: 'elf', source: 'PHB' },
    });
  });

  it('V-3: Gnome without subrace → RACE_SUBRACE_REQUIRED', () => {
    const res = validateRaceSelection({
      raceData: PHB_GNOME,
      subraceData: null,
      rulesProfile: PROFILE_TASHAS_OFF,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.issues[0]).toEqual({
      code: 'RACE_SUBRACE_REQUIRED',
      race: { slug: 'gnome', source: 'PHB' },
    });
  });

  it('V-4: Halfling without subrace → RACE_SUBRACE_REQUIRED', () => {
    const res = validateRaceSelection({
      raceData: PHB_HALFLING,
      subraceData: null,
      rulesProfile: PROFILE_TASHAS_OFF,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.issues[0]).toEqual({
      code: 'RACE_SUBRACE_REQUIRED',
      race: { slug: 'halfling', source: 'PHB' },
    });
  });

  it('V-5: Dwarf + Hill Dwarf subrace → gate does NOT fire, ok: true', () => {
    const res = validateRaceSelection({
      raceData: PHB_DWARF,
      subraceData: PHB_HILL_DWARF,
      rulesProfile: PROFILE_TASHAS_OFF,
    });
    expect(res.ok).toBe(true);
  });

  it('V-6: Human without subrace → not in required set, ok: true', () => {
    const res = validateRaceSelection({
      raceData: PHB_HUMAN,
      subraceData: null,
      rulesProfile: PROFILE_TASHAS_OFF,
    });
    expect(res.ok).toBe(true);
  });

  it('V-7: Half-Elf without subrace → not in required set, ok: true (choose race)', () => {
    const res = validateRaceSelection({
      raceData: PHB_HALF_ELF,
      subraceData: null,
      rulesProfile: PROFILE_TASHAS_OFF,
      appliedAsis: [
        { ability: 'cha', bonus: 2, source: 'race' },
        { ability: 'dex', bonus: 1, source: 'race' },
        { ability: 'con', bonus: 1, source: 'race' },
      ],
      // No languageChoices: PHB_HALF_ELF mock has no languageProficiencies defined
    });
    expect(res.ok).toBe(true);
  });

  // Batch 3 (race-dragonborn-ancestry): dragonborn|PHB now in gate (PHB p.32-34 RAW).
  it('V-8 (D-5): Dragonborn without subrace → RACE_SUBRACE_REQUIRED', () => {
    const res = validateRaceSelection({
      raceData: PHB_DRAGONBORN,
      subraceData: null,
      rulesProfile: PROFILE_TASHAS_OFF,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.issues[0]).toEqual({
      code: 'RACE_SUBRACE_REQUIRED',
      race: { slug: 'dragonborn', source: 'PHB' },
    });
  });

  it('V-8b (D-6): Dragonborn + valid ancestry dragonborn--red → ok: true', () => {
    const dragonbornRed: SubraceCompendiumData = {
      slug: 'dragonborn--red',
      source: 'PHB',
      parentSlug: 'dragonborn',
      parentSource: 'PHB',
    };
    const res = validateRaceSelection({
      raceData: PHB_DRAGONBORN,
      subraceData: dragonbornRed,
      rulesProfile: PROFILE_TASHAS_OFF,
      // Dragonborn: STR+2, CHA+1 — fixed, no choose
      appliedAsis: [
        { ability: 'str', bonus: 2, source: 'race' },
        { ability: 'cha', bonus: 1, source: 'race' },
      ],
    });
    expect(res.ok).toBe(true);
  });

  it('V-9: Custom Lineage (TCE) without subrace → NOT in required set (regression guard)', () => {
    const res = validateRaceSelection({
      raceData: TCE_CUSTOM_LINEAGE,
      subraceData: null,
      rulesProfile: {
        ...PROFILE_TASHAS_OFF,
        sources: { ...DEFAULT_RULES_PROFILE.sources, TCE: true },
      },
      appliedAsis: [
        { ability: 'str', bonus: 1, source: 'race' },
        { ability: 'dex', bonus: 1, source: 'race' },
      ],
    });
    expect(res.ok).toBe(true);
  });

  it('V-10: Dwarf no subrace AND wrong language count → only RACE_SUBRACE_REQUIRED (short-circuit)', () => {
    const dwarfWithLang: RaceCompendiumData = {
      slug: 'dwarf',
      source: 'PHB',
      ability: [{ con: 2 }],
      languageProficiencies: [{ anyStandard: 1 }],
    };
    const res = validateRaceSelection({
      raceData: dwarfWithLang,
      subraceData: null,
      rulesProfile: PROFILE_TASHAS_OFF,
      languageChoices: [], // wrong count but should not reach language check
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    // Only RACE_SUBRACE_REQUIRED, no RACE_LANGUAGE_COUNT_MISMATCH
    expect(res.issues).toHaveLength(1);
    expect(res.issues[0]!.code).toBe('RACE_SUBRACE_REQUIRED');
  });

  it('V-11: Dwarf disabled in rulesProfile AND no subrace → only RACE_DISABLED (disabled check runs first)', () => {
    const profileWithDisabledDwarf: RulesProfile = {
      ...PROFILE_TASHAS_OFF,
      disabledEntities: {
        ...PROFILE_TASHAS_OFF.disabledEntities,
        races: ['dwarf|PHB'],
      },
    };
    const res = validateRaceSelection({
      raceData: PHB_DWARF,
      subraceData: null,
      rulesProfile: profileWithDisabledDwarf,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.issues[0]!.code).toBe('RACE_DISABLED');
  });
});

// ============================================================
// FASE A: feat + skill picks (race-variant-human-feat-skill)
// ============================================================

// ---- Fixtures ---------------------------------------------------------------

/** Actor: sin prereqs, sin ASI choose (+1 CHA fixed) */
const ACTOR_FEAT: FeatCompendiumData = {
  slug: 'actor',
  source: 'PHB',
  name: 'Actor',
  prerequisite: null,
  ability: [{ cha: 1 }],
};

/** Resilient: sin prereqs, con `choose` block (elige 1 ability +1) */
const RESILIENT_FEAT: FeatCompendiumData = {
  slug: 'resilient',
  source: 'PHB',
  name: 'Resilient',
  prerequisite: null,
  ability: [{ choose: { from: ['str', 'dex', 'con', 'int', 'wis', 'cha'], amount: 1 } }],
};

/** Heavy Armor Master: requiere proficiency heavy armor */
const HEAVY_ARMOR_MASTER_FEAT: FeatCompendiumData = {
  slug: 'heavy-armor-master',
  source: 'PHB',
  name: 'Heavy Armor Master',
  prerequisite: [{ proficiency: [{ armor: 'heavy' }] }],
  ability: [{ str: 1 }],
};

/** Variant Human como subrace (shape 5etools: feats + skillProficiencies en subrace) */
const PHB_VARIANT_HUMAN_SUBRACE: SubraceCompendiumData = {
  slug: 'variant-human',
  source: 'PHB',
  parentSlug: 'human',
  parentSource: 'PHB',
  feats: [{ any: 1 }],
  skillProficiencies: [{ any: 1 }],
};

/** Human base para el Variant Human */
const PHB_HUMAN_BASE: RaceCompendiumData = {
  slug: 'human',
  source: 'PHB',
  // Variant Human: el subrace lleva los ASIs como choose también
  // Para simplificar los tests de feat/skill usamos un human con ASIs fijos mínimos
  ability: [{ str: 1, dex: 1, con: 1, int: 1, wis: 1, cha: 1 }],
};

/** Human para Variant Human SIN ability (el subrace puede tener choose) */
const PHB_HUMAN_NO_ABILITY: RaceCompendiumData = {
  slug: 'human',
  source: 'PHB',
  ability: null,
};

/** Variant Human subrace sin ASI fijo (MPMM mode para simplificar test) */
const PHB_VARIANT_HUMAN_MPMM: SubraceCompendiumData = {
  slug: 'variant-human',
  source: 'PHB',
  parentSlug: 'human',
  parentSource: 'PHB',
  feats: [{ any: 1 }],
  skillProficiencies: [{ any: 1 }],
};

/** Half-Elf con skillProficiencies: [{any:2}] */
const PHB_HALF_ELF_WITH_SKILLS: RaceCompendiumData = {
  slug: 'half-elf',
  source: 'PHB',
  ability: [{ cha: 2, choose: { from: ['str', 'dex', 'con', 'int', 'wis'], count: 2 } }],
  skillProficiencies: [{ any: 2 }],
};

/** Custom Lineage (TCE): feats + skillProficiencies en la raza */
const TCE_CUSTOM_LINEAGE_WITH_FEAT: RaceCompendiumData = {
  slug: 'custom-lineage',
  source: 'TCE',
  ability: [{ choose: { from: ['str', 'dex', 'con', 'int', 'wis', 'cha'], amount: 2 } }],
  feats: [{ any: 1 }],
  skillProficiencies: [{ any: 1 }],
};

/** Context for feat validation at race step (no class yet) */
function makeFeatCtx(overrides?: Partial<CharacterFeatContext>): CharacterFeatContext {
  return {
    effectiveScores: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    race: { slug: 'human' },
    armorProficiencies: [],
    weaponProficiencies: [],
    hasSpellcasting: false,
    existingFeats: [],
    ...overrides,
  };
}

/** Profile with feats:true (default) */
const PROFILE_FEATS_ON: RulesProfile = {
  ...DEFAULT_RULES_PROFILE,
  variantRules: { ...DEFAULT_RULES_PROFILE.variantRules, tashasCustomOrigin: false, feats: true },
};

/** Profile with feats:false (campaign toggle off) */
const PROFILE_FEATS_OFF: RulesProfile = {
  ...DEFAULT_RULES_PROFILE,
  variantRules: { ...DEFAULT_RULES_PROFILE.variantRules, tashasCustomOrigin: false, feats: false },
};

const PROFILE_TCE: RulesProfile = {
  ...PROFILE_FEATS_ON,
  sources: { ...PROFILE_FEATS_ON.sources, TCE: true },
};

// ---- D-1: Variant Human, sin skillChoices ni featChoice → RACE_SKILL_COUNT_MISMATCH primero ---
describe('validateRaceSelection — race skill choices (Variant Human / Half-Elf)', () => {
  it('D-1: Variant Human, no skillChoices, no featChoice → RACE_SKILL_COUNT_MISMATCH (skill check runs first)', () => {
    const res = validateRaceSelection({
      raceData: PHB_HUMAN_BASE,
      subraceData: PHB_VARIANT_HUMAN_SUBRACE,
      rulesProfile: PROFILE_FEATS_ON,
      appliedAsis: [
        { ability: 'str', bonus: 1, source: 'race' },
        { ability: 'dex', bonus: 1, source: 'race' },
        { ability: 'con', bonus: 1, source: 'race' },
        { ability: 'int', bonus: 1, source: 'race' },
        { ability: 'wis', bonus: 1, source: 'race' },
        { ability: 'cha', bonus: 1, source: 'race' },
      ],
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.issues[0]!.code).toBe('RACE_SKILL_COUNT_MISMATCH');
  });

  it('D-2: Variant Human, skillChoices=[perception], no featChoice → RACE_FEAT_REQUIRED', () => {
    const res = validateRaceSelection({
      raceData: PHB_HUMAN_BASE,
      subraceData: PHB_VARIANT_HUMAN_SUBRACE,
      rulesProfile: PROFILE_FEATS_ON,
      appliedAsis: [
        { ability: 'str', bonus: 1, source: 'race' },
        { ability: 'dex', bonus: 1, source: 'race' },
        { ability: 'con', bonus: 1, source: 'race' },
        { ability: 'int', bonus: 1, source: 'race' },
        { ability: 'wis', bonus: 1, source: 'race' },
        { ability: 'cha', bonus: 1, source: 'race' },
      ],
      skillChoices: ['perception'],
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.issues[0]!.code).toBe('RACE_FEAT_REQUIRED');
  });

  it('D-2b (S-03): Custom Lineage (TCE), no featChoice → RACE_FEAT_REQUIRED', () => {
    // Custom Lineage per TCE shares the same `feats: [{any:1}]` shape as Variant
    // Human but is a distinct base race (slug 'custom-lineage', source 'TCE') —
    // NOT a subrace. Spec #545 S-03 + SUG-2 of verify #553. The `_versions`
    // darkvision/extra-skill toggle of Custom Lineage is OUT of scope (Batch 3).
    const CUSTOM_LINEAGE_WITH_GRANTS: RaceCompendiumData = {
      slug: 'custom-lineage',
      source: 'TCE',
      ability: [{ str: 2, dex: 1 }],
      feats: [{ any: 1 }],
      skillProficiencies: [{ any: 1 }],
    };
    const res = validateRaceSelection({
      raceData: CUSTOM_LINEAGE_WITH_GRANTS,
      subraceData: null,
      rulesProfile: PROFILE_FEATS_ON,
      skillChoices: ['perception'],
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.issues[0]!.code).toBe('RACE_FEAT_REQUIRED');
    if (res.issues[0]!.code !== 'RACE_FEAT_REQUIRED') return;
    expect(res.issues[0]!.race).toEqual({ slug: 'custom-lineage', source: 'TCE' });
  });

  it('D-3: Variant Human, no skillChoices, featChoice valid → RACE_SKILL_COUNT_MISMATCH (skill runs first)', () => {
    const res = validateRaceSelection({
      raceData: PHB_HUMAN_BASE,
      subraceData: PHB_VARIANT_HUMAN_SUBRACE,
      rulesProfile: PROFILE_FEATS_ON,
      appliedAsis: [
        { ability: 'str', bonus: 1, source: 'race' },
        { ability: 'dex', bonus: 1, source: 'race' },
        { ability: 'con', bonus: 1, source: 'race' },
        { ability: 'int', bonus: 1, source: 'race' },
        { ability: 'wis', bonus: 1, source: 'race' },
        { ability: 'cha', bonus: 1, source: 'race' },
      ],
      skillChoices: [],
      featChoice: { featData: ACTOR_FEAT },
      featContext: makeFeatCtx(),
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.issues[0]!.code).toBe('RACE_SKILL_COUNT_MISMATCH');
  });

  it('D-4: Variant Human, 2 skillChoices (needs 1) → RACE_SKILL_COUNT_MISMATCH expected=1 got=2', () => {
    const res = validateRaceSelection({
      raceData: PHB_HUMAN_BASE,
      subraceData: PHB_VARIANT_HUMAN_SUBRACE,
      rulesProfile: PROFILE_FEATS_ON,
      appliedAsis: [
        { ability: 'str', bonus: 1, source: 'race' },
        { ability: 'dex', bonus: 1, source: 'race' },
        { ability: 'con', bonus: 1, source: 'race' },
        { ability: 'int', bonus: 1, source: 'race' },
        { ability: 'wis', bonus: 1, source: 'race' },
        { ability: 'cha', bonus: 1, source: 'race' },
      ],
      skillChoices: ['perception', 'stealth'],
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    const issue = res.issues[0]!;
    expect(issue.code).toBe('RACE_SKILL_COUNT_MISMATCH');
    if (issue.code !== 'RACE_SKILL_COUNT_MISMATCH') return;
    expect(issue.expectedCount).toBe(1);
    expect(issue.gotCount).toBe(2);
  });

  it('D-5: Half-Elf, duplicate skills → RACE_SKILL_DUPLICATE', () => {
    const res = validateRaceSelection({
      raceData: PHB_HALF_ELF_WITH_SKILLS,
      rulesProfile: PROFILE_FEATS_ON,
      appliedAsis: [
        { ability: 'cha', bonus: 2, source: 'race' },
        { ability: 'dex', bonus: 1, source: 'race' },
        { ability: 'con', bonus: 1, source: 'race' },
      ],
      skillChoices: ['perception', 'perception'],
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    const issue = res.issues[0]!;
    expect(issue.code).toBe('RACE_SKILL_DUPLICATE');
    if (issue.code !== 'RACE_SKILL_DUPLICATE') return;
    expect(issue.skill).toBe('perception');
  });

  it('D-6: Variant Human, unknown skill → RACE_SKILL_UNKNOWN', () => {
    const res = validateRaceSelection({
      raceData: PHB_HUMAN_BASE,
      subraceData: PHB_VARIANT_HUMAN_SUBRACE,
      rulesProfile: PROFILE_FEATS_ON,
      appliedAsis: [
        { ability: 'str', bonus: 1, source: 'race' },
        { ability: 'dex', bonus: 1, source: 'race' },
        { ability: 'con', bonus: 1, source: 'race' },
        { ability: 'int', bonus: 1, source: 'race' },
        { ability: 'wis', bonus: 1, source: 'race' },
        { ability: 'cha', bonus: 1, source: 'race' },
      ],
      skillChoices: ['not-a-real-skill'],
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    const issue = res.issues[0]!;
    expect(issue.code).toBe('RACE_SKILL_UNKNOWN');
    if (issue.code !== 'RACE_SKILL_UNKNOWN') return;
    expect(issue.skill).toBe('not-a-real-skill');
  });

  it('D-7: Half-Elf, 2 valid distinct skills → ok:true, appliedSkillChoices correct', () => {
    const res = validateRaceSelection({
      raceData: PHB_HALF_ELF_WITH_SKILLS,
      rulesProfile: PROFILE_FEATS_ON,
      appliedAsis: [
        { ability: 'cha', bonus: 2, source: 'race' },
        { ability: 'dex', bonus: 1, source: 'race' },
        { ability: 'con', bonus: 1, source: 'race' },
      ],
      skillChoices: ['perception', 'stealth'],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.appliedSkillChoices).toEqual(['perception', 'stealth']);
    expect(res.appliedFeat).toBeFalsy();
  });

  it('D-8: Half-Elf, 1 skill (needs 2) → RACE_SKILL_COUNT_MISMATCH expected=2 got=1', () => {
    const res = validateRaceSelection({
      raceData: PHB_HALF_ELF_WITH_SKILLS,
      rulesProfile: PROFILE_FEATS_ON,
      appliedAsis: [
        { ability: 'cha', bonus: 2, source: 'race' },
        { ability: 'dex', bonus: 1, source: 'race' },
        { ability: 'con', bonus: 1, source: 'race' },
      ],
      skillChoices: ['perception'],
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    const issue = res.issues[0]!;
    expect(issue.code).toBe('RACE_SKILL_COUNT_MISMATCH');
    if (issue.code !== 'RACE_SKILL_COUNT_MISMATCH') return;
    expect(issue.expectedCount).toBe(2);
    expect(issue.gotCount).toBe(1);
  });

  it('D-9: Dwarf (no skillProficiencies) with stray skillChoices → ok:true, appliedSkillChoices=[]', () => {
    const res = validateRaceSelection({
      raceData: PHB_DWARF,
      subraceData: PHB_HILL_DWARF,
      rulesProfile: PROFILE_FEATS_ON,
      skillChoices: ['perception'], // stray
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.appliedSkillChoices).toEqual([]);
  });

  it('D-10: Plain Human (no feat/skill blocks) → ok:true, appliedSkillChoices=[], appliedFeat=null (regression)', () => {
    const res = validateRaceSelection({
      raceData: PHB_HUMAN,
      rulesProfile: PROFILE_FEATS_ON,
      skillChoices: ['perception'], // stray
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.appliedSkillChoices).toEqual([]);
    expect(res.appliedFeat).toBeFalsy();
  });
});

describe('validateRaceSelection — race feat grant (Variant Human)', () => {
  it('D-11: Variant Human + valid feat (Actor, no prereqs, fixed ASI) → ok:true, appliedFeat set', () => {
    const res = validateRaceSelection({
      raceData: PHB_HUMAN_BASE,
      subraceData: PHB_VARIANT_HUMAN_SUBRACE,
      rulesProfile: PROFILE_FEATS_ON,
      appliedAsis: [
        { ability: 'str', bonus: 1, source: 'race' },
        { ability: 'dex', bonus: 1, source: 'race' },
        { ability: 'con', bonus: 1, source: 'race' },
        { ability: 'int', bonus: 1, source: 'race' },
        { ability: 'wis', bonus: 1, source: 'race' },
        { ability: 'cha', bonus: 1, source: 'race' },
      ],
      skillChoices: ['insight'],
      featChoice: { featData: ACTOR_FEAT },
      featContext: makeFeatCtx(),
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.appliedFeat).toBeDefined();
    expect(res.appliedFeat!.slug).toBe('actor');
    expect(res.appliedSkillChoices).toEqual(['insight']);
  });

  it('D-12: Variant Human + Resilient feat (choose ASI) without asiChoice → RACE_FEAT_INVALID wrapping FEAT_ASI_REQUIRED', () => {
    const res = validateRaceSelection({
      raceData: PHB_HUMAN_BASE,
      subraceData: PHB_VARIANT_HUMAN_SUBRACE,
      rulesProfile: PROFILE_FEATS_ON,
      appliedAsis: [
        { ability: 'str', bonus: 1, source: 'race' },
        { ability: 'dex', bonus: 1, source: 'race' },
        { ability: 'con', bonus: 1, source: 'race' },
        { ability: 'int', bonus: 1, source: 'race' },
        { ability: 'wis', bonus: 1, source: 'race' },
        { ability: 'cha', bonus: 1, source: 'race' },
      ],
      skillChoices: ['insight'],
      featChoice: { featData: RESILIENT_FEAT /* no asiChoice */ },
      featContext: makeFeatCtx(),
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    const issue = res.issues[0]!;
    expect(issue.code).toBe('RACE_FEAT_INVALID');
    if (issue.code !== 'RACE_FEAT_INVALID') return;
    expect(issue.wrapped[0]!.code).toBe('FEAT_ASI_REQUIRED');
  });

  it('D-13: Variant Human + Heavy Armor Master (prereq unmet) → RACE_FEAT_INVALID wrapping PREREQ_PROFICIENCY_NOT_MET', () => {
    const res = validateRaceSelection({
      raceData: PHB_HUMAN_BASE,
      subraceData: PHB_VARIANT_HUMAN_SUBRACE,
      rulesProfile: PROFILE_FEATS_ON,
      appliedAsis: [
        { ability: 'str', bonus: 1, source: 'race' },
        { ability: 'dex', bonus: 1, source: 'race' },
        { ability: 'con', bonus: 1, source: 'race' },
        { ability: 'int', bonus: 1, source: 'race' },
        { ability: 'wis', bonus: 1, source: 'race' },
        { ability: 'cha', bonus: 1, source: 'race' },
      ],
      skillChoices: ['insight'],
      featChoice: { featData: HEAVY_ARMOR_MASTER_FEAT },
      featContext: makeFeatCtx({ armorProficiencies: [] }), // no heavy armor at race step
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    const issue = res.issues[0]!;
    expect(issue.code).toBe('RACE_FEAT_INVALID');
    if (issue.code !== 'RACE_FEAT_INVALID') return;
    expect(issue.wrapped[0]!.code).toBe('PREREQ_PROFICIENCY_NOT_MET');
  });

  it('D-14: Variant Human + Resilient feat with valid asiChoice → ok:true', () => {
    const res = validateRaceSelection({
      raceData: PHB_HUMAN_BASE,
      subraceData: PHB_VARIANT_HUMAN_SUBRACE,
      rulesProfile: PROFILE_FEATS_ON,
      appliedAsis: [
        { ability: 'str', bonus: 1, source: 'race' },
        { ability: 'dex', bonus: 1, source: 'race' },
        { ability: 'con', bonus: 1, source: 'race' },
        { ability: 'int', bonus: 1, source: 'race' },
        { ability: 'wis', bonus: 1, source: 'race' },
        { ability: 'cha', bonus: 1, source: 'race' },
      ],
      skillChoices: ['insight'],
      featChoice: {
        featData: RESILIENT_FEAT,
        asiChoice: [{ ability: 'con', bonus: 1 }],
      },
      featContext: makeFeatCtx(),
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.appliedFeat!.slug).toBe('resilient');
    expect(res.appliedFeat!.asisApplied).toEqual([{ ability: 'con', bonus: 1 }]);
  });

  it('D-15: Variant Human + feat but feats disabled by campaign → bypass works (RACE_FEAT is NOT blocked)', () => {
    // Per decision #547: race feat MUST bypass variantRules.feats=false
    const res = validateRaceSelection({
      raceData: PHB_HUMAN_BASE,
      subraceData: PHB_VARIANT_HUMAN_SUBRACE,
      rulesProfile: PROFILE_FEATS_OFF,
      appliedAsis: [
        { ability: 'str', bonus: 1, source: 'race' },
        { ability: 'dex', bonus: 1, source: 'race' },
        { ability: 'con', bonus: 1, source: 'race' },
        { ability: 'int', bonus: 1, source: 'race' },
        { ability: 'wis', bonus: 1, source: 'race' },
        { ability: 'cha', bonus: 1, source: 'race' },
      ],
      skillChoices: ['insight'],
      featChoice: { featData: ACTOR_FEAT },
      featContext: makeFeatCtx(),
    });
    // Should succeed — race feat bypasses the feats toggle
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.appliedFeat!.slug).toBe('actor');
  });

  it('D-16: Variant Human, no featChoice, no featContext → RACE_FEAT_REQUIRED', () => {
    const res = validateRaceSelection({
      raceData: PHB_HUMAN_BASE,
      subraceData: PHB_VARIANT_HUMAN_SUBRACE,
      rulesProfile: PROFILE_FEATS_ON,
      appliedAsis: [
        { ability: 'str', bonus: 1, source: 'race' },
        { ability: 'dex', bonus: 1, source: 'race' },
        { ability: 'con', bonus: 1, source: 'race' },
        { ability: 'int', bonus: 1, source: 'race' },
        { ability: 'wis', bonus: 1, source: 'race' },
        { ability: 'cha', bonus: 1, source: 'race' },
      ],
      skillChoices: ['insight'],
      // NO featChoice, NO featContext
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.issues[0]!.code).toBe('RACE_FEAT_REQUIRED');
  });

  it('D-17: Custom Lineage (TCE) + skill + feat → ok:true (same shape as Variant Human)', () => {
    const res = validateRaceSelection({
      raceData: TCE_CUSTOM_LINEAGE_WITH_FEAT,
      rulesProfile: PROFILE_TCE,
      appliedAsis: [
        { ability: 'str', bonus: 1, source: 'race' },
        { ability: 'dex', bonus: 1, source: 'race' },
      ],
      skillChoices: ['arcana'],
      featChoice: { featData: ACTOR_FEAT },
      featContext: makeFeatCtx(),
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.appliedFeat!.slug).toBe('actor');
    expect(res.appliedSkillChoices).toEqual(['arcana']);
  });
});

// ── Batch 6: RACE_CANTRIP_REQUIRED + RACE_CANTRIP_INVALID gates ──────────────
// Spec: engram #607 REQ-D-GATE-01, REQ-D-GATE-02.
// PHB p.23 — High Elf "Cantrip" trait: player-chosen wizard cantrip.
// Decision #605: isPlayerChoice flag in additionalSpellsNormalized triggers this gate.
// Decision #602: gate fires when ANY entry has isPlayerChoice:true AND raceCantrip is absent.

const PHB_ELF_BASE: RaceCompendiumData = {
  slug: 'elf',
  source: 'PHB',
  ability: [{ dex: 2 }],
};

const PHB_HIGH_ELF_SUBRACE_WITH_CANTRIP: SubraceCompendiumData = {
  slug: 'elf--high',
  source: 'PHB',
  parentSlug: 'elf',
  parentSource: 'PHB',
  ability: [{ int: 1 }],
  additionalSpellsNormalized: [
    {
      slug: '__choose__',
      source: '',
      characterLevelAvailable: 1,
      frequency: 'at-will',
      ability: 'int',
      isPlayerChoice: true,
      fromClass: 'wizard',
    },
  ],
};

const PHB_TIEFLING_NO_PLAYER_CHOICE: RaceCompendiumData = {
  slug: 'tiefling',
  source: 'PHB',
  ability: [{ int: 1, cha: 2 }],
  additionalSpellsNormalized: [
    // Fixed spells — isPlayerChoice is NOT set
    { slug: 'thaumaturgy', source: 'phb', characterLevelAvailable: 1, frequency: 'at-will', ability: 'cha' },
    { slug: 'hellish-rebuke', source: 'phb', characterLevelAvailable: 3, frequency: 'daily-1', ability: 'cha', castLevel: 2 },
    { slug: 'darkness', source: 'phb', characterLevelAvailable: 5, frequency: 'daily-1', ability: 'cha' },
  ],
};

/** Pool of valid wizard cantrips for testing (subset of PHB). */
const WIZARD_CANTRIP_POOL: Array<{ slug: string; source: string }> = [
  { slug: 'fire-bolt', source: 'phb' },
  { slug: 'chill-touch', source: 'phb' },
  { slug: 'minor-illusion', source: 'phb' },
  { slug: 'prestidigitation', source: 'phb' },
];

describe('validateRaceSelection — Batch 6 RACE_CANTRIP_REQUIRED / RACE_CANTRIP_INVALID gates', () => {
  // V-1: High Elf write + raceCantrip=null → emits RACE_CANTRIP_REQUIRED
  // REQ-D-GATE-01: write-time gate fires when isPlayerChoice:true entry exists and raceCantrip absent
  it('V-1: High Elf write + raceCantrip=null → RACE_CANTRIP_REQUIRED issue', () => {
    const res = validateRaceSelection({
      raceData: PHB_ELF_BASE,
      subraceData: PHB_HIGH_ELF_SUBRACE_WITH_CANTRIP,
      rulesProfile: PROFILE_TASHAS_OFF,
      raceCantrip: null,
      wizardCantripPool: WIZARD_CANTRIP_POOL,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    const issue = res.issues.find((i) => i.code === 'RACE_CANTRIP_REQUIRED');
    expect(issue).toBeDefined();
    expect(issue).toMatchObject({
      code: 'RACE_CANTRIP_REQUIRED',
      race: { slug: 'elf', source: 'PHB' },
      subrace: { slug: 'elf--high', source: 'PHB' },
      expectedFilter: { class: 'wizard', spellLevel: 0 },
    });
  });

  // V-2: High Elf write + valid raceCantrip slug in wizardCantripPool → ok:true
  // REQ-D-GATE-01: gate does NOT fire when a valid slug is provided
  it('V-2: High Elf write + valid raceCantrip in pool → ok:true', () => {
    const res = validateRaceSelection({
      raceData: PHB_ELF_BASE,
      subraceData: PHB_HIGH_ELF_SUBRACE_WITH_CANTRIP,
      rulesProfile: PROFILE_TASHAS_OFF,
      raceCantrip: { slug: 'fire-bolt', source: 'phb' },
      wizardCantripPool: WIZARD_CANTRIP_POOL,
    });
    expect(res.ok).toBe(true);
  });

  // V-3: High Elf write + raceCantrip NOT in wizardCantripPool → RACE_CANTRIP_INVALID
  // REQ-D-GATE-02: fireball is a 3rd-level spell, not a wizard cantrip
  it('V-3: High Elf write + raceCantrip slug not in pool (fireball) → RACE_CANTRIP_INVALID', () => {
    const res = validateRaceSelection({
      raceData: PHB_ELF_BASE,
      subraceData: PHB_HIGH_ELF_SUBRACE_WITH_CANTRIP,
      rulesProfile: PROFILE_TASHAS_OFF,
      raceCantrip: { slug: 'fireball', source: 'phb' },
      wizardCantripPool: WIZARD_CANTRIP_POOL,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    const issue = res.issues.find((i) => i.code === 'RACE_CANTRIP_INVALID');
    expect(issue).toBeDefined();
    expect(issue).toMatchObject({
      code: 'RACE_CANTRIP_INVALID',
      cantrip: { slug: 'fireball', source: 'phb' },
    });
  });

  // V-4: Tiefling write (fixed spells, no isPlayerChoice) + raceCantrip=null → ok:true
  // REQ-D-GATE-01: gate does NOT fire for races without isPlayerChoice entries
  it('V-4: Tiefling write (fixed spells, no isPlayerChoice) + raceCantrip=null → ok:true', () => {
    const res = validateRaceSelection({
      raceData: PHB_TIEFLING_NO_PLAYER_CHOICE,
      rulesProfile: PROFILE_TASHAS_OFF,
      raceCantrip: null,
      wizardCantripPool: WIZARD_CANTRIP_POOL,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const hasCantrip = res.issues?.some?.((i: { code: string }) => i.code === 'RACE_CANTRIP_REQUIRED');
    expect(hasCantrip).toBeFalsy();
  });
});

// ---------------------------------------------------------------------------
// REQ-DRD-VALIDATOR-CONTRACT (engram #806)
// Validator must consume the injected worldRefData instead of hardcoded
// `RACES_REQUIRING_SUBRACE` / `SUBRACES_REPLACING_PARENT_ABILITY`.
// ---------------------------------------------------------------------------
describe('validateRaceSelection — injected worldRefData (DI contract)', () => {
  it('REQ-DRD-CONTRACT-1: empty subraceRequiredSet → PHB Dwarf without subrace is OK', () => {
    // PHB Dwarf is in the HARDCODED RACES_REQUIRING_SUBRACE set. If the
    // validator reads the injected pool, an empty set means Dwarf no longer
    // requires a subrace and the validator should pass.
    const res = validateRaceSelection({
      raceData: PHB_DWARF,
      subraceData: null,
      rulesProfile: PROFILE_TASHAS_OFF,
      worldRefData: {
        languagePool: { standard: [], exotic: [] },
        subraceRequiredSet: new Set(),
        subraceReplacingAbilitySet: new Set(),
      },
    });
    expect(res.ok).toBe(true);
  });

  it('REQ-DRD-CONTRACT-2: non-default subraceRequiredSet → custom race triggers RACE_SUBRACE_REQUIRED', () => {
    // PHB Half-Elf is NOT in the hardcoded set. Injecting a custom set that
    // INCLUDES it must trigger RACE_SUBRACE_REQUIRED.
    const res = validateRaceSelection({
      raceData: PHB_HALF_ELF,
      subraceData: null,
      rulesProfile: PROFILE_TASHAS_OFF,
      worldRefData: {
        languagePool: { standard: [], exotic: [] },
        subraceRequiredSet: new Set(['half-elf|PHB']),
        subraceReplacingAbilitySet: new Set(),
      },
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.issues).toContainEqual({
      code: 'RACE_SUBRACE_REQUIRED',
      race: { slug: 'half-elf', source: 'PHB' },
    });
  });
});
