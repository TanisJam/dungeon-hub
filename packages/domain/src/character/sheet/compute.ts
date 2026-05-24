import { ABILITY_KEYS, type AbilityKey, type AbilityScores } from '../stats/types.js';
import {
  abilityModifier,
  computeEffectiveScores,
} from '../multiclass/effective-scores.js';
import type { AppliedAsi } from '../race/types.js';
import {
  ALL_SKILLS,
  EMPTY_CURRENCY,
  SKILL_TO_ABILITY,
  type CharacterSheet,
  type CharacterSnapshot,
  type RaceSheetData,
  type SkillView,
  type BreathWeaponView,
  type BreathWeaponData,
  type DarkvisionView,
} from './types.js';
import {
  buildWeightLookup,
  carryingCapacity,
  evaluateEncumbrance,
  totalWeight,
  ATTUNEMENT_MAX,
  type EncumbranceView,
} from '../inventory/index.js';
import type { ItemCompendiumLite } from '../inventory/types.js';
import {
  computeSpellSlots,
  computeSpellLimits,
  SPELLCASTING_ABILITY,
} from '../spellcasting/index.js';
import type { ClassSpellSummary, ExhaustionEffect, ExhaustionView, SpellSlotsView } from './types.js';

/**
 * Calcula los efectos activos para un nivel de exhaustion (acumulativos).
 * PHB p.291.
 */
function exhaustionEffectsFor(level: number): ExhaustionEffect[] {
  const out: ExhaustionEffect[] = [];
  if (level >= 1) out.push('disadvantage-ability-checks');
  if (level >= 2) out.push('speed-halved');
  if (level >= 3) out.push('disadvantage-attacks-and-saves');
  if (level >= 4) out.push('hp-max-halved');
  if (level >= 5) out.push('speed-zero');
  if (level >= 6) out.push('dead');
  return out;
}

/**
 * Resta `penalty` pies a cada componente de speed, sin bajar de 0.
 * Usado para encumbrance variant (encumbered -10, heavily -20).
 */
function applySpeedPenalty(
  speed: { walk: number; fly?: number; swim?: number; climb?: number },
  penalty: number,
): { walk: number; fly?: number; swim?: number; climb?: number } {
  if (penalty <= 0) return speed;
  const sub = (v: number) => Math.max(0, v - penalty);
  const out: { walk: number; fly?: number; swim?: number; climb?: number } = { walk: sub(speed.walk) };
  if (speed.fly !== undefined) out.fly = sub(speed.fly);
  if (speed.swim !== undefined) out.swim = sub(speed.swim);
  if (speed.climb !== undefined) out.climb = sub(speed.climb);
  return out;
}

/** Aplica los efectos de exhaustion que mutan números (speed + HP max). */
function applyExhaustionToSpeed(
  speed: { walk: number; fly?: number; swim?: number; climb?: number },
  effects: ExhaustionEffect[],
): { walk: number; fly?: number; swim?: number; climb?: number } {
  if (effects.includes('speed-zero')) {
    const out: { walk: number; fly?: number; swim?: number; climb?: number } = { walk: 0 };
    if (speed.fly !== undefined) out.fly = 0;
    if (speed.swim !== undefined) out.swim = 0;
    if (speed.climb !== undefined) out.climb = 0;
    return out;
  }
  if (effects.includes('speed-halved')) {
    const half = (v: number) => Math.floor(v / 2);
    const out: { walk: number; fly?: number; swim?: number; climb?: number } = { walk: half(speed.walk) };
    if (speed.fly !== undefined) out.fly = half(speed.fly);
    if (speed.swim !== undefined) out.swim = half(speed.swim);
    if (speed.climb !== undefined) out.climb = half(speed.climb);
    return out;
  }
  return speed;
}

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

/** Tamaño default si no podemos resolverlo desde race data. */
const DEFAULT_SIZE = 'M';

/** Normaliza el campo `speed` de 5etools (puede ser number o objeto). */
function normalizeSpeed(s: RaceSheetData['speed']): CharacterSheet['speed'] {
  if (typeof s === 'number') return { walk: s };
  if (s && typeof s === 'object') {
    return {
      walk: typeof s['walk'] === 'number' ? s['walk'] : 30,
      ...(typeof s['fly'] === 'number' ? { fly: s['fly'] } : {}),
      ...(typeof s['swim'] === 'number' ? { swim: s['swim'] } : {}),
      ...(typeof s['climb'] === 'number' ? { climb: s['climb'] } : {}),
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

/**
 * Normaliza una entry de proficiency a string limpia.
 *
 * 5etools usa formato mixto:
 *   - `"light"` (string)
 *   - `{ proficiency: "light", full: "light armor" }` (object)
 *   - `"{@item club|phb|clubs}"` (string con inline tag)
 *
 * Devolvemos una sola string display-ready (sin tags 5etools).
 */
function normalizeProf(x: unknown): string {
  if (typeof x === 'string') return stripInlineTag(x);
  if (x && typeof x === 'object') {
    const obj = x as { full?: unknown; proficiency?: unknown };
    if (typeof obj.full === 'string') return stripInlineTag(obj.full);
    if (typeof obj.proficiency === 'string') return stripInlineTag(obj.proficiency);
  }
  return '—';
}

/**
 * Strippea inline tags 5etools del estilo `{@item club|phb|clubs}` quedándose
 * con el display text (último segment después del pipe, fallback al primero).
 */
function stripInlineTag(s: string): string {
  return s.replace(/\{@\w+\s+([^|}]+)(?:\|[^}]*?\|([^}]+))?(?:\|[^}]*)?\}/g, (_, first, last) => {
    return (last ?? first).trim();
  });
}

/**
 * Computes BreathWeaponView from subrace breathWeapon data + character stats.
 * PHB p.34 formulas:
 *   - saveDC = 8 + CON modifier + proficiency bonus
 *   - damageDice by total level: 2d6 (1-5), 3d6 (6-10), 4d6 (11-15), 5d6 (16+)
 *   - area mirrors the size field from BreathWeaponData (display-ready string)
 *
 * Returns null when data is absent/null (non-Dragonborn or legacy character).
 */
function computeBreathWeapon(
  data: BreathWeaponData | null | undefined,
  conMod: number,
  pb: number,
  totalLevel: number,
): BreathWeaponView | null {
  if (!data) return null;
  let damageDice: string;
  if (totalLevel >= 16) damageDice = '5d6';
  else if (totalLevel >= 11) damageDice = '4d6';
  else if (totalLevel >= 6) damageDice = '3d6';
  else damageDice = '2d6';
  return {
    damageType: data.damageType,
    shape: data.shape,
    area: data.size,
    savingThrow: data.savingThrow,
    saveDC: 8 + conMod + pb,
    damageDice,
  };
}

/**
 * Computes DarkvisionView from the effective darkvision feet value.
 * The race+subrace merge has already been applied at the projection layer
 * (loadRaceSheetData) per decision #577. PHB p.17, 24.
 *
 * Returns null when feet is null, undefined, or <= 0 (defensive against zero-as-falsey).
 * isSuperior = feet >= 120 per spec REQ-7 (>= accommodates homebrew above 120).
 */
function computeDarkvision(feet: number | null | undefined): DarkvisionView | null {
  if (feet === null || feet === undefined || feet <= 0) return null;
  return { feet, isSuperior: feet >= 120 };
}

interface ComputeInput {
  character: CharacterSnapshot;
  raceData?: RaceSheetData | null;
  /**
   * Lite del compendio para cada ítem del inventory. El caller arma este array
   * con loadItemDataMany. Si falta un slug, su peso cuenta como 0.
   */
  itemWeights?: ReadonlyArray<ItemCompendiumLite>;
  /** Si el Rules Profile tiene encumbranceVariant ON, los 3 umbrales aplican. */
  encumbranceVariant?: boolean;
}

export function computeCharacterSheet(input: ComputeInput): CharacterSheet {
  const { character } = input;
  const raceData = input.raceData ?? null;

  // ---- Effective scores -------------------------------------------------
  const baseStats: AbilityScores = character.baseStats ?? {
    str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10,
  };
  const racialAsis: AppliedAsi[] = character.asisApplied ?? [];
  const levelUpAsis: AppliedAsi[] = character.levelUpAsis ?? [];
  const featAsis: AppliedAsi[] = (character.feats ?? []).flatMap((f) =>
    f.asisApplied.map((a) => ({ ability: a.ability, bonus: a.bonus, source: 'race' as const })),
  );
  const effective = computeEffectiveScores(baseStats, [...racialAsis, ...levelUpAsis, ...featAsis]);

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
  // Profs vienen de: class.skillChoices + background.skills + race.raceSkillChoices
  // (Variant Human / Half-Elf / Custom Lineage). Expertise: futura iteración.
  // TODO(race-skill-prof-grant, Batch 6): add cross-step dedup gate in validateCharacterFinal.
  const proficientSkills = new Set<string>();
  for (const c of classes) for (const s of c.skillChoices ?? []) proficientSkills.add(s.toLowerCase());
  for (const s of character.background?.skills ?? []) proficientSkills.add(s.toLowerCase());
  for (const s of character.raceSkillChoices ?? []) proficientSkills.add(s.toLowerCase());

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
  // 5etools serializa proficiency entries como `string | { proficiency, full }`.
  // El AppliedClass copia tal cual del compendium, así que acá normalizamos para
  // que el shape final del sheet sea siempre string[]. También strippeamos los
  // inline tags 5etools (`{@item club|phb|clubs}` → `clubs`) que aparecen en
  // weaponProficiencies en particular.
  const armor = new Set<string>();
  const weapons = new Set<string>();
  const tools = new Set<string>();
  const languages = new Set<string>();
  for (const c of classes) {
    for (const x of c.armorProficiencies) armor.add(normalizeProf(x));
    for (const x of c.weaponProficiencies) weapons.add(normalizeProf(x));
    for (const x of c.toolProficiencies) tools.add(normalizeProf(x));
  }
  for (const x of character.background?.tools ?? []) tools.add(normalizeProf(x));
  for (const x of character.background?.languages ?? []) languages.add(normalizeProf(x));
  if (raceData) for (const x of extractRaceLanguages(raceData)) languages.add(normalizeProf(x));
  for (const x of character.raceLanguageChoices ?? []) languages.add(normalizeProf(x));

  // ---- Speed + size desde race ------------------------------------------
  const speed = raceData?.speed ? normalizeSpeed(raceData.speed) : { walk: 30 };
  const size = raceData?.size?.[0] ?? DEFAULT_SIZE;

  // ---- Breath weapon (Dragonborn ancestries — PHB p.34) -----------------
  const breathWeapon = computeBreathWeapon(raceData?.breathWeapon, conMod, pb, totalLevel);

  // ---- Darkvision (race + subrace already merged in loadRaceSheetData — PHB p.17, 24) ---
  const darkvision = computeDarkvision(raceData?.darkvision);

  // ---- Encumbrance (con o sin variant) ----------------------------------
  const totalCarryWeight = totalWeight(
    character.inventory ?? [],
    buildWeightLookup(input.itemWeights ?? []),
  );
  const encumbranceView: EncumbranceView = evaluateEncumbrance(
    totalCarryWeight,
    effective.str,
    input.encumbranceVariant === true,
  );

  // ---- Speed final: aplicar penalty de encumbrance, después exhaustion ---
  const speedAfterEncumbrance = applySpeedPenalty(speed, encumbranceView.speedPenalty);
  const speedFinal = applyExhaustionToSpeed(
    speedAfterEncumbrance,
    exhaustionEffectsFor(character.exhaustion ?? 0),
  );

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
    hitPoints: ((): { max: number; formula: string } => {
      const effects = exhaustionEffectsFor(character.exhaustion ?? 0);
      if (effects.includes('hp-max-halved')) {
        return { max: Math.floor(hpMax / 2), formula: `${hpFormula}  [/2 by exhaustion ≥4]` };
      }
      return { max: hpMax, formula: hpFormula };
    })(),
    hitDice: hitDiceTotal,
    speed: speedFinal,
    size,
    carryingCapacity: effective.str * 15,
    proficiencies: {
      armor: [...armor].sort(),
      weapons: [...weapons].sort(),
      tools: [...tools].sort(),
      languages: [...languages].sort(),
    },
    feats: (character.feats ?? []).map((f) => ({ slug: f.slug, source: f.source })),
    breathWeapon,
    darkvision,
    spellcasting,
    currency: character.currency ?? { ...EMPTY_CURRENCY },
    encumbrance: encumbranceView,
    attunement: {
      used: (character.inventory ?? []).reduce((acc, it) => acc + (it.attuned ? 1 : 0), 0),
      max: ATTUNEMENT_MAX,
    },
    exhaustion: ((): ExhaustionView => {
      const level = Math.max(0, Math.min(6, character.exhaustion ?? 0));
      return { level, effects: exhaustionEffectsFor(level) };
    })(),
    classFeatures: character.classFeatures ?? {},
    spellSlots: ((): SpellSlotsView => {
      const r = computeSpellSlots(classes);
      return { slots: r.slots, pactMagic: r.pactMagic };
    })(),
    spellsByClass: classes.flatMap((c): ClassSpellSummary[] => {
      const ability = SPELLCASTING_ABILITY[c.slug];
      if (!ability) return [];
      const mod = abilityModifier(effective[ability]);
      const lim = computeSpellLimits(c, mod);
      const spellsForClass = character.spells?.[c.slug];
      const cantripsCount = spellsForClass?.cantrips.length ?? 0;
      const knownCount = spellsForClass?.known.length ?? 0;
      const preparedCount = spellsForClass?.prepared.length ?? 0;
      const view: ClassSpellSummary = {
        classSlug: c.slug,
        classSource: c.source,
        cantripsKnown: { count: cantripsCount, max: lim.cantripsKnown },
        spellsKnown:
          lim.spellsKnown !== null
            ? { count: knownCount, max: lim.spellsKnown }
            : null,
        spellsPrepared:
          lim.spellsPrepared !== null
            ? { count: preparedCount, max: lim.spellsPrepared }
            : null,
      };
      if (lim.wizardSpellbookSize !== undefined) view.wizardSpellbookSize = lim.wizardSpellbookSize;
      return [view];
    }),
  };
}
