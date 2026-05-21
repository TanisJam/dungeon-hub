import { ABILITY_KEYS, type AbilityKey, type AbilityScores } from '../stats/types.js';
import {
  abilityModifier,
  computeEffectiveScores,
} from '../multiclass/effective-scores.js';
import type { AppliedAsi } from '../race/types.js';
import {
  ALL_SKILLS,
  SKILL_TO_ABILITY,
  type CharacterSheet,
  type CharacterSnapshot,
  type RaceSheetData,
  type SkillView,
} from './types.js';

/** PB por nivel total — PHB p.15. */
export function proficiencyBonus(totalLevel: number): number {
  if (totalLevel < 1) return 2;
  if (totalLevel <= 4) return 2;
  if (totalLevel <= 8) return 3;
  if (totalLevel <= 12) return 4;
  if (totalLevel <= 16) return 5;
  return 6;
}

/** HP average por hit die (RAW rounded up — PHB convention). */
const HIT_DIE_AVG: Record<string, number> = {
  d6: 4,
  d8: 5,
  d10: 6,
  d12: 7,
};

/** Spellcasting ability por clase (PHB). */
const SPELLCASTING_ABILITY: Record<string, AbilityKey> = {
  bard: 'cha',
  cleric: 'wis',
  druid: 'wis',
  sorcerer: 'cha',
  warlock: 'cha',
  wizard: 'int',
  paladin: 'cha',
  ranger: 'wis',
  artificer: 'int',
};

/** Tamaño default si no podemos resolverlo desde race data. */
const DEFAULT_SIZE = 'M';

/** Normaliza el campo `speed` de 5etools (puede ser number o objeto). */
function normalizeSpeed(s: RaceSheetData['speed']): CharacterSheet['speed'] {
  if (typeof s === 'number') return { walk: s };
  if (s && typeof s === 'object') {
    return {
      walk: typeof s.walk === 'number' ? s.walk : 30,
      ...(typeof s.fly === 'number' ? { fly: s.fly } : {}),
      ...(typeof s.swim === 'number' ? { swim: s.swim } : {}),
      ...(typeof s.climb === 'number' ? { climb: s.climb } : {}),
    };
  }
  return { walk: 30 };
}

/** Extrae el set de idiomas raciales (solo keys con value true). */
function extractRaceLanguages(race: RaceSheetData): string[] {
  const out: string[] = [];
  for (const block of race.languageProficiencies ?? []) {
    for (const [k, v] of Object.entries(block)) {
      if (v === true) out.push(k.toLowerCase());
    }
  }
  return out;
}

interface ComputeInput {
  character: CharacterSnapshot;
  raceData?: RaceSheetData | null;
}

export function computeCharacterSheet(input: ComputeInput): CharacterSheet {
  const { character } = input;
  const raceData = input.raceData ?? null;

  // ---- Effective scores -------------------------------------------------
  const baseStats: AbilityScores = character.baseStats ?? {
    str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10,
  };
  const racialAsis: AppliedAsi[] = character.asisApplied ?? [];
  const featAsis: AppliedAsi[] = (character.feats ?? []).flatMap((f) =>
    f.asisApplied.map((a) => ({ ability: a.ability, bonus: a.bonus, source: 'race' as const })),
  );
  const effective = computeEffectiveScores(baseStats, [...racialAsis, ...featAsis]);

  // ---- Niveles y PB -----------------------------------------------------
  const classes = character.classes ?? [];
  const totalLevel = classes.reduce((s, c) => s + c.level, 0);
  const pb = proficiencyBonus(totalLevel);

  // ---- AC ---------------------------------------------------------------
  const dexMod = abilityModifier(effective.dex);
  const conMod = abilityModifier(effective.con);
  const wisMod = abilityModifier(effective.wis);

  // Default unarmored AC = 10 + DEX. Si tiene Monk o Barbarian (clase principal level 1+),
  // usamos Unarmored Defense.
  let acValue = 10 + dexMod;
  let acFormula = `10 + DEX(${dexMod})`;
  const hasBarb = classes.some((c) => c.slug === 'barbarian');
  const hasMonk = classes.some((c) => c.slug === 'monk');
  if (hasBarb) {
    const v = 10 + dexMod + conMod;
    if (v > acValue) {
      acValue = v;
      acFormula = `10 + DEX(${dexMod}) + CON(${conMod})  [Barbarian Unarmored Defense]`;
    }
  }
  if (hasMonk) {
    const v = 10 + dexMod + wisMod;
    if (v > acValue) {
      acValue = v;
      acFormula = `10 + DEX(${dexMod}) + WIS(${wisMod})  [Monk Unarmored Defense]`;
    }
  }

  // ---- HP ---------------------------------------------------------------
  // L1 de la primera clase: max(hit die) + CON mod.
  // L2+ de cualquier clase: avg(hit die) + CON mod.
  let hpMax = 0;
  const hpParts: string[] = [];
  const hitDiceTotal: Record<string, number> = {};
  let isFirstClass = true;
  for (const c of classes) {
    const dieFaces = Number(c.hitDie.replace(/^d/, ''));
    const avg = HIT_DIE_AVG[c.hitDie] ?? Math.floor(dieFaces / 2) + 1;
    hitDiceTotal[c.hitDie] = (hitDiceTotal[c.hitDie] ?? 0) + c.level;

    if (isFirstClass) {
      hpMax += dieFaces + conMod; // L1 full
      if (c.level > 1) hpMax += (avg + conMod) * (c.level - 1);
      hpParts.push(
        `${c.slug}(L${c.level}): ${dieFaces}+CON(${conMod})` +
          (c.level > 1 ? ` + ${c.level - 1}×(${avg}+CON(${conMod}))` : ''),
      );
      isFirstClass = false;
    } else {
      hpMax += (avg + conMod) * c.level;
      hpParts.push(`${c.slug}(L${c.level}): ${c.level}×(${avg}+CON(${conMod}))`);
    }
  }
  const hpFormula = hpParts.join(' + ') || '0';

  // ---- Saving throws ----------------------------------------------------
  // Solo la primera clase otorga saves; multiclass NO da saves (PHB p.164).
  const primaryClass = classes[0];
  const proficientSaves = new Set<AbilityKey>(primaryClass?.savingThrows ?? []);
  const savingThrows = ABILITY_KEYS.map((a) => {
    const mod = abilityModifier(effective[a]);
    const prof = proficientSaves.has(a);
    return { ability: a, modifier: prof ? mod + pb : mod, proficient: prof };
  });

  // ---- Skills -----------------------------------------------------------
  // Profs vienen de: class.skillChoices + background.skills + race? (race no, salvo features avanzadas).
  // Expertise por ahora no la trackeamos (viene en una iteración futura).
  const proficientSkills = new Set<string>();
  for (const c of classes) for (const s of c.skillChoices ?? []) proficientSkills.add(s);
  for (const s of character.background?.skills ?? []) proficientSkills.add(s);

  const skills: SkillView[] = ALL_SKILLS.map((name) => {
    const ab = SKILL_TO_ABILITY[name]!;
    const mod = abilityModifier(effective[ab]);
    const prof = proficientSkills.has(name);
    return {
      name,
      ability: ab,
      modifier: prof ? mod + pb : mod,
      proficient: prof,
      expertise: false,
    };
  });

  const perception = skills.find((s) => s.name === 'perception')!;
  const passivePerception = 10 + perception.modifier;

  // ---- Spellcasting -----------------------------------------------------
  const spellcasting = classes
    .filter((c) => SPELLCASTING_ABILITY[c.slug] !== undefined)
    .map((c) => {
      const ability = SPELLCASTING_ABILITY[c.slug]!;
      const mod = abilityModifier(effective[ability]);
      return {
        classSlug: c.slug,
        classSource: c.source,
        ability,
        saveDC: 8 + pb + mod,
        attackBonus: pb + mod,
      };
    });

  // ---- Proficiencies consolidadas ---------------------------------------
  const armor = new Set<string>();
  const weapons = new Set<string>();
  const tools = new Set<string>();
  const languages = new Set<string>();
  for (const c of classes) {
    for (const x of c.armorProficiencies) armor.add(x);
    for (const x of c.weaponProficiencies) weapons.add(x);
    for (const x of c.toolProficiencies) tools.add(x);
  }
  for (const x of character.background?.tools ?? []) tools.add(x);
  for (const x of character.background?.languages ?? []) languages.add(x);
  if (raceData) for (const x of extractRaceLanguages(raceData)) languages.add(x);

  // ---- Speed + size desde race ------------------------------------------
  const speed = raceData?.speed ? normalizeSpeed(raceData.speed) : { walk: 30 };
  const size = raceData?.size?.[0] ?? DEFAULT_SIZE;

  return {
    identity: {
      name: character.name,
      totalLevel,
      classes: classes.map((c) => ({
        slug: c.slug,
        source: c.source,
        level: c.level,
        hitDie: c.hitDie,
        subclass: c.subclass,
      })),
      race: character.race ?? null,
      subrace: character.subrace ?? null,
      background: character.background
        ? { slug: character.background.slug, source: character.background.source }
        : null,
    },
    proficiencyBonus: pb,
    abilityScores: Object.fromEntries(
      ABILITY_KEYS.map((a) => [a, { score: effective[a], modifier: abilityModifier(effective[a]) }]),
    ) as CharacterSheet['abilityScores'],
    savingThrows,
    skills,
    passivePerception,
    initiative: dexMod,
    armorClass: { value: acValue, formula: acFormula },
    hitPoints: { max: hpMax, formula: hpFormula },
    hitDice: hitDiceTotal,
    speed,
    size,
    carryingCapacity: effective.str * 15,
    proficiencies: {
      armor: [...armor].sort(),
      weapons: [...weapons].sort(),
      tools: [...tools].sort(),
      languages: [...languages].sort(),
    },
    feats: (character.feats ?? []).map((f) => ({ slug: f.slug, source: f.source })),
    spellcasting,
  };
}
