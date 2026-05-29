import { ABILITY_KEYS, type AbilityKey, type AbilityScores } from '../stats/types.js';
import {
  abilityModifier,
  computeEffectiveScores,
} from '../multiclass/effective-scores.js';
import type { AppliedAsi } from '../race/types.js';
import {
  EMPTY_CURRENCY,
  type CharacterSheet,
  type CharacterSnapshot,
  type RaceSheetData,
  type BreathWeaponView,
  type BreathWeaponData,
  type DarkvisionView,
  type RacialSpellView,
} from './types.js';
import type { RaceInnateSpell } from '../race/types.js';
import {
  buildWeightLookup,
  carryingCapacity,
  coinWeight,
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
import type { ClassSpellSummary, ExhaustionEffect, ExhaustionView, SpellSheetRef, SpellSlotsView } from './types.js';
import { deriveClassResources } from '../class-resources/derive.js';
import { computeArmorClass, type ArmorClassWarningCode } from './armor-class.js';

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
 * Strips the 5etools source suffix from a weapon/armor proficiency KEY.
 * 5etools weapon proficiency blocks use the key as the slug+source:
 *   "battleaxe|phb" → "battleaxe"
 *   "hand crossbow|phb" → "hand crossbow"
 *   "light" → "light"  (armor keys have no suffix)
 * This is NOT the same as stripInlineTag (which handles {@tag ...} values).
 */
function stripSourceSuffix(key: string): string {
  const pipeIdx = key.indexOf('|');
  return pipeIdx === -1 ? key : key.slice(0, pipeIdx);
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

/**
 * Builds RacialSpellView[] from race+subrace merged additionalSpellsNormalized + raceCantrip.
 * Decisions: #602 (sentinel), #603 (level field), #605 (flag-based), #606 (picker in race step).
 * Read-path tolerance per CLAUDE.md §11: returns [] when raceData absent.
 * High Elf isPlayerChoice entries are SKIPPED when raceCantrip is null/absent (legacy rows
 * predating Batch 6 still load cleanly). REQ-D-COMPUTE-01, REQ-D-COMPUTE-02.
 *
 * Level-gating policy: ALL entries are returned regardless of character total level.
 * The renderer is responsible for showing/dimming entries whose characterLevelAvailable
 * exceeds the character's totalLevel — letting the sheet preview future-unlock entries.
 * Spec S-5 / design #608 §5 rationale.
 *
 * De-dup policy (spec S-10): compute helper does NOT merge racialSpells into spellsByClass.
 * The two surfaces are intentionally separate (REQ-D-COMPUTE-03).
 */
function computeRacialSpells(
  raceData: RaceSheetData | null,
  raceCantrip: { slug: string; source: string } | null | undefined,
): RacialSpellView[] {
  const entries: RaceInnateSpell[] = (raceData as RaceSheetData & { additionalSpellsNormalized?: RaceInnateSpell[] | null } | null)?.additionalSpellsNormalized ?? [];
  const out: RacialSpellView[] = [];
  for (const e of entries) {
    if (e.isPlayerChoice) {
      // Resolve from character.raceCantrip — skip silently when not yet chosen (legacy tolerance).
      if (!raceCantrip) continue;
      out.push({
        slug: raceCantrip.slug,
        source: raceCantrip.source,
        characterLevelAvailable: e.characterLevelAvailable,
        frequency: e.frequency,
        ability: e.ability,
        castLevel: e.castLevel ?? null,
        isPlayerChoice: true,
      });
    } else {
      out.push({
        slug: e.slug,
        source: e.source,
        characterLevelAvailable: e.characterLevelAvailable,
        frequency: e.frequency,
        ability: e.ability,
        castLevel: e.castLevel ?? null,
        isPlayerChoice: false,
      });
    }
  }
  return out;
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
  /**
   * Compendium spell data indexed by composite key `"slug|source"`.
   * Populated by the API caller; domain never performs IO.
   * Absent → all ClassSpellSummary.spells default to empty arrays.
   */
  spellRefsBySlug?: ReadonlyMap<string, SpellSheetRef>;
}

// REQ-LEGACY-01: computeCharacterSheet no longer emits savingThrows.
// The route assembles sheet.savingThrows natively via deriveSavingThrowProficiencies
// + resolveStat('saving-throw.<a>'). Omit<CharacterSheet,'savingThrows'> makes the
// contract honest: compute.ts is NOT the source of truth for saves anymore.
// REQ-LEGACY-02: computeCharacterSheet no longer emits initiative.
// The route assembles sheet.initiative natively via resolveStat('initiative', nativeDexMod).
// Omit<CharacterSheet,'savingThrows'|'initiative'> makes the contract honest.
// PHB p.177 — initiative = DEX modifier. Resolved by engine in characters.ts.
// REQ-LEGACY-03: computeCharacterSheet no longer emits skills.
// The route assembles sheet.skills natively via deriveSkillProficiencies + ALL_SKILLS.map(resolveStat).
// REQ-LEGACY-04: computeCharacterSheet no longer emits passivePerception.
// The route assembles sheet.passivePerception = 10 + engineSkills.perception.modifier (PHB p.177).
export function computeCharacterSheet(input: ComputeInput): Omit<CharacterSheet, 'savingThrows' | 'initiative' | 'skills' | 'passivePerception'> {
  const { character } = input;
  const raceData = input.raceData ?? null;

  // ---- Effective scores -------------------------------------------------
  const baseStats: AbilityScores = character.baseStats ?? {
    str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10,
  };
  const racialAsis: AppliedAsi[] = character.asisApplied ?? [];
  const levelUpAsis: AppliedAsi[] = character.levelUpAsis ?? [];
  const featAsis: AppliedAsi[] = (character.feats ?? []).flatMap((f) =>
    f.asisApplied.map((a) => ({ ability: a.ability, bonus: a.bonus, source: 'feat' as const })),
  );
  const effective = computeEffectiveScores(baseStats, [...racialAsis, ...levelUpAsis, ...featAsis]);

  // ---- Niveles y PB -----------------------------------------------------
  const classes = character.classes ?? [];
  const totalLevel = classes.reduce((s, c) => s + c.level, 0);
  const pb = proficiencyBonus(totalLevel);

  // ---- AC ---------------------------------------------------------------
  // Delegated to the pure helper `computeArmorClass` (REQ-CSD-AC-DELEGATION).
  // PHB p.144 (Armor) + p.149 (Shield). All branching logic lives in the helper;
  // here we only assemble the lookup, call it, and capture warnings.
  const dexMod = abilityModifier(effective.dex);
  const conMod = abilityModifier(effective.con);
  const itemLitesById: Record<string, ItemCompendiumLite> = {};
  for (const lite of input.itemWeights ?? []) {
    itemLitesById[`${lite.slug}|${lite.source}`] = lite;
  }
  const acResult = computeArmorClass({
    inventory: character.inventory ?? [],
    itemLites: itemLitesById,
    classes: classes.map((c) => ({ classSlug: c.slug, level: c.level })),
    abilities: {
      str: effective.str,
      dex: effective.dex,
      con: effective.con,
      wis: effective.wis,
    },
  });
  const acValue = acResult.ac;
  const acFormula = acResult.formula;
  const acWarnings: ArmorClassWarningCode[] = acResult.warnings;

  // ---- HP ---------------------------------------------------------------
  // L1 de la primera clase: max(hit die) + CON mod.
  // L2+ de cualquier clase: avg(hit die) + CON mod, OR stored roll from
  // levelUpHpRolls when present (SDD multiclass-class-step).
  //
  // levelUpHpRolls: Array<{ classSlug, level, roll }> — keyed by (classSlug, level).
  // Back-compat: absent/undefined → use average for all levels (pre-SDD characters).
  const rollLookup = new Map<string, number>();
  for (const entry of character.levelUpHpRolls ?? []) {
    rollLookup.set(`${entry.classSlug}|${entry.level}`, entry.roll);
  }

  let hpMax = 0;
  const hpParts: string[] = [];
  const hitDiceTotal: Record<string, number> = {};
  let isFirstClass = true;
  for (const c of classes) {
    const dieFaces = Number(c.hitDie.replace(/^d/, ''));
    const avg = HIT_DIE_AVG[c.hitDie] ?? Math.floor(dieFaces / 2) + 1;
    hitDiceTotal[c.hitDie] = (hitDiceTotal[c.hitDie] ?? 0) + c.level;

    if (isFirstClass) {
      hpMax += dieFaces + conMod; // L1 full (always max, never rolled)
      // L2+ for the first class: per-level with roll substitution
      for (let lv = 2; lv <= c.level; lv++) {
        const storedRoll = rollLookup.get(`${c.slug}|${lv}`);
        const delta = Math.max(1, (storedRoll ?? avg) + conMod);
        hpMax += delta;
      }
      hpParts.push(
        `${c.slug}(L${c.level}): ${dieFaces}+CON(${conMod})` +
          (c.level > 1 ? ` + ${c.level - 1}×(avg/roll+CON(${conMod}))` : ''),
      );
      isFirstClass = false;
    } else {
      // Multiclass levels: all per-level, no L1 max rule
      for (let lv = 1; lv <= c.level; lv++) {
        const storedRoll = rollLookup.get(`${c.slug}|${lv}`);
        const delta = Math.max(1, (storedRoll ?? avg) + conMod);
        hpMax += delta;
      }
      hpParts.push(`${c.slug}(L${c.level}): ${c.level}×(avg/roll+CON(${conMod}))`);
    }
  }
  const hpFormula = hpParts.join(' + ') || '0';

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
  // Race + subrace weapon/armor proficiencies (Batch 5 — race-weapon-armor-profs).
  // Decision #589: merge already applied by loadRaceSheetData (subrace overrides race per category).
  // 5etools weapon proficiency KEYS carry the source suffix: "battleaxe|phb" → strip to "battleaxe".
  // This is different from inline-tag values ({@item ...}) handled by normalizeProf/stripInlineTag.
  // choose/fromFilter entries have val !== true — skip silently (Decision #590, VGM Hobgoblin only).
  if (raceData?.weaponProficiencies) {
    for (const block of raceData.weaponProficiencies) {
      for (const [key, val] of Object.entries(block)) {
        if (val === true) weapons.add(stripSourceSuffix(key));
        // val is object (choose/fromFilter) — skip silently per Decision #590
      }
    }
  }
  if (raceData?.armorProficiencies) {
    for (const block of raceData.armorProficiencies) {
      for (const [key, val] of Object.entries(block)) {
        if (val === true) armor.add(stripSourceSuffix(key));
      }
    }
  }

  // ---- Speed + size desde race ------------------------------------------
  const speed = raceData?.speed ? normalizeSpeed(raceData.speed) : { walk: 30 };
  const size = raceData?.size?.[0] ?? DEFAULT_SIZE;

  // ---- Breath weapon (Dragonborn ancestries — PHB p.34) -----------------
  const breathWeapon = computeBreathWeapon(raceData?.breathWeapon, conMod, pb, totalLevel);

  // ---- Darkvision (race + subrace already merged in loadRaceSheetData — PHB p.17, 24) ---
  const darkvision = computeDarkvision(raceData?.darkvision);

  // ---- Racial innate/known spells (Batch 6 — race-additional-spells) --------
  // PHB p.23 (High Elf), p.24 (Drow), p.37 (Forest Gnome), p.42-43 (Tiefling).
  // ALL entries returned; renderer dims by characterLevelAvailable (design #608 §5).
  const racialSpells = computeRacialSpells(raceData, character.raceCantrip ?? null);

  // ---- Racial descriptive traits (Batch 8 — race-traits-on-sheet) ----------
  // Pass-through from RaceSheetData.racialTraits (pre-computed by loadRaceSheetData).
  // ?? [] guard: backward compat for legacy snapshots predating Batch 8 (SCEN-RT-12,
  // REQ-RT-COMPAT-01). Mirrors darkvision / racialSpells pass-through pattern.
  const racialTraits = raceData?.racialTraits ?? [];

  // ---- Encumbrance (con o sin variant) ----------------------------------
  // PHB p.143: coins also contribute weight (50 coins = 1 lb, all denominations equal).
  // Design decision sdd/inventory-d4-d6/design #890: aggregate at call site, keep evaluateEncumbrance pure.
  const itemWeight = totalWeight(
    character.inventory ?? [],
    buildWeightLookup(input.itemWeights ?? []),
  );
  const coinWeightLb = coinWeight(character.currency ?? null);
  const totalCarryWeight = itemWeight + coinWeightLb;
  const encumbranceView: EncumbranceView = evaluateEncumbrance(
    totalCarryWeight,
    effective.str,
    input.encumbranceVariant === true,
    coinWeightLb,
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
    racialSpells,
    racialTraits,
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
    classResources: deriveClassResources(
      classes,
      character.classResourcesUsed ?? {},
      Object.fromEntries(
        ABILITY_KEYS.map((a) => [a, abilityModifier(effective[a])]),
      ) as Record<AbilityKey, number>,
    ),
    warnings: acWarnings,
    spellSlots: ((): SpellSlotsView => {
      const r = computeSpellSlots(classes);
      // SP-05: thread persisted usage counts from CharacterSnapshot.
      // Read-path tolerance: default to zeros for pre-SP-05 characters.
      const rawUsed = character.spellSlotsUsed;
      const slotsUsed: [number, number, number, number, number, number, number, number, number] = [
        rawUsed?.[0] ?? 0,
        rawUsed?.[1] ?? 0,
        rawUsed?.[2] ?? 0,
        rawUsed?.[3] ?? 0,
        rawUsed?.[4] ?? 0,
        rawUsed?.[5] ?? 0,
        rawUsed?.[6] ?? 0,
        rawUsed?.[7] ?? 0,
        rawUsed?.[8] ?? 0,
      ];
      const pactSlotsUsed = character.warlockSlotsUsed ?? 0;
      return { slots: r.slots, pactMagic: r.pactMagic, slotsUsed, pactSlotsUsed };
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

      // ---- Spell projection (SP-04) ----------------------------------------
      const refMap = input.spellRefsBySlug;
      const resolveRef = (entry: { slug: string; source: string }): SpellSheetRef | undefined =>
        refMap?.get(`${entry.slug}|${entry.source}`);

      // Cantrips: always from cantrips bucket, resolved by composite key.
      const cantrips: SpellSheetRef[] = (spellsForClass?.cantrips ?? [])
        .map(resolveRef)
        .filter((r): r is SpellSheetRef => r !== undefined)
        .sort((a, b) => a.name.localeCompare(b.name));

      // Leveled: prepared casters use prepared bucket; known casters use known bucket.
      // Prepared: Cleric, Druid, Paladin, Wizard (lim.spellsPrepared !== null).
      // Known: Bard, Ranger, Sorcerer, Warlock, EK, AT (lim.spellsKnown !== null).
      const leveledSource: Array<{ slug: string; source: string }> =
        lim.spellsPrepared !== null
          ? (spellsForClass?.prepared ?? [])
          : (spellsForClass?.known ?? []);

      const leveled: SpellSheetRef[] = leveledSource
        .map(resolveRef)
        .filter((r): r is SpellSheetRef => r !== undefined)
        .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));

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
        spells: { cantrips, leveled },
      };
      if (lim.wizardSpellbookSize !== undefined) view.wizardSpellbookSize = lim.wizardSpellbookSize;
      return [view];
    }),
  };
}
