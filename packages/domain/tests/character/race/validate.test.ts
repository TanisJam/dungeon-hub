import { describe, expect, it } from 'vitest';
import { validateRaceSelection } from '../../../src/character/race/validate.js';
import type {
  RaceCompendiumData,
  SubraceCompendiumData,
} from '../../../src/character/race/types.js';
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

  it('acepta appliedAsis explícitos si coinciden con los fijos', () => {
    const res = validateRaceSelection({
      raceData: PHB_ELF,
      rulesProfile: PROFILE_TASHAS_OFF,
      appliedAsis: [{ ability: 'dex', bonus: 2, source: 'race' }],
    });
    expect(res.ok).toBe(true);
  });

  it('rechaza appliedAsis que no coinciden con los fijos', () => {
    const res = validateRaceSelection({
      raceData: PHB_ELF,
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
