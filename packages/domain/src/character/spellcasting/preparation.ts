import type { AbilityKey } from '../stats/types.js';
import type { AppliedClass } from '../class/types.js';
import { classifyCaster } from './caster-type.js';

/**
 * Ability de spellcasting por clase. PHB.
 * Artificer = INT (TCE p.10).
 */
export const SPELLCASTING_ABILITY: Readonly<Record<string, AbilityKey>> = Object.freeze({
  bard: 'cha',
  cleric: 'wis',
  druid: 'wis',
  sorcerer: 'cha',
  warlock: 'cha',
  wizard: 'int',
  paladin: 'cha',
  ranger: 'wis',
  artificer: 'int',
});

/**
 * Cantrips known por clase × nivel. Devolvemos 0 si la clase no tiene cantrips.
 *
 * Tablas (PHB / TCE):
 *   - Bard: 2/3/4 at L1/4/10
 *   - Cleric: 3/4/5 at L1/4/10
 *   - Druid: 2/3/4 at L1/4/10
 *   - Sorcerer: 4/5/6 at L1/4/10
 *   - Warlock: 2/3/4 at L1/4/10
 *   - Wizard: 3/4/5 at L1/4/10
 *   - Artificer: 2/3/4 at L1/10/14 (TCE)
 *   - Paladin / Ranger: sin cantrips
 *   - Eldritch Knight (Fighter[EK] L3+): 2/3 at L3/10
 *   - Arcane Trickster (Rogue[AT] L3+): 3/4 at L3/10
 */
export function cantripsKnownFor(c: AppliedClass): number {
  const slug = c.slug;
  const level = c.level;
  switch (slug) {
    case 'bard':
    case 'druid':
    case 'warlock':
      if (level >= 10) return 4;
      if (level >= 4) return 3;
      return 2;
    case 'cleric':
      if (level >= 10) return 5;
      if (level >= 4) return 4;
      return 3;
    case 'wizard':
      if (level >= 10) return 5;
      if (level >= 4) return 4;
      return 3;
    case 'sorcerer':
      if (level >= 10) return 6;
      if (level >= 4) return 5;
      return 4;
    case 'artificer':
      if (level >= 14) return 4;
      if (level >= 10) return 3;
      return 2;
    case 'fighter':
      if (c.subclass?.slug !== 'eldritch-knight' || level < 3) return 0;
      return level >= 10 ? 3 : 2;
    case 'rogue':
      if (c.subclass?.slug !== 'arcane-trickster' || level < 3) return 0;
      return level >= 10 ? 4 : 3;
    default:
      return 0;
  }
}

/**
 * "Known" spells fixed por clase × nivel (sólo aplica a non-prep casters).
 *
 * Devuelve null para clases que NO usan known count (Cleric, Druid, Paladin,
 * Artificer — preparan de lista completa). Wizard usa este número para el
 * tamaño del spellbook (ver `wizardSpellbookSize`).
 */
export function spellsKnownFor(c: AppliedClass): number | null {
  const lv = c.level;
  switch (c.slug) {
    case 'bard':
      return bardKnown(lv);
    case 'sorcerer':
      return sorcererKnown(lv);
    case 'warlock':
      return warlockKnown(lv);
    case 'ranger':
      return rangerKnown(lv);
    case 'fighter':
      if (c.subclass?.slug !== 'eldritch-knight' || lv < 3) return 0;
      return thirdCasterKnown(lv);
    case 'rogue':
      if (c.subclass?.slug !== 'arcane-trickster' || lv < 3) return 0;
      return thirdCasterKnown(lv);
    default:
      return null;
  }
}

function bardKnown(level: number): number {
  // PHB p.53
  const t = [4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 15, 16, 18, 19, 19, 20, 22, 22, 22];
  return t[Math.max(0, Math.min(19, level - 1))] ?? 0;
}

function sorcererKnown(level: number): number {
  // PHB p.101
  const t = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 12, 13, 13, 14, 14, 15, 15, 15, 15];
  return t[Math.max(0, Math.min(19, level - 1))] ?? 0;
}

function warlockKnown(level: number): number {
  // PHB p.107
  const t = [2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 11, 11, 12, 12, 13, 13, 14, 14, 15, 15];
  return t[Math.max(0, Math.min(19, level - 1))] ?? 0;
}

function rangerKnown(level: number): number {
  // PHB p.91 — L1 = 0.
  const t = [0, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11];
  return t[Math.max(0, Math.min(19, level - 1))] ?? 0;
}

function thirdCasterKnown(level: number): number {
  // PHB p.74 (EK) y p.98 (AT) — misma tabla. Slots desde L3.
  const t = [0, 0, 3, 4, 4, 4, 5, 6, 6, 7, 8, 8, 9, 10, 10, 11, 11, 11, 12, 13];
  return t[Math.max(0, Math.min(19, level - 1))] ?? 0;
}

/**
 * Para casters que preparan (Wizard, Cleric, Druid, Paladin, Artificer),
 * el número máximo de spells preparados = `abilityMod + factor(level)` (mín 1).
 *
 *   - Wizard:    INT + wizardLevel
 *   - Cleric:    WIS + clericLevel
 *   - Druid:     WIS + druidLevel
 *   - Paladin:   CHA + floor(paladinLevel / 2)  (slots aparecen L2)
 *   - Artificer: INT + ceil(artificerLevel / 2) (TCE p.10)
 *
 * Devuelve null si la clase NO prepara (Bard, Sorc, Warlock, Ranger, EK, AT).
 */
export function preparedLimitFor(c: AppliedClass, abilityMod: number): number | null {
  let factor = 0;
  switch (c.slug) {
    case 'wizard':
    case 'cleric':
    case 'druid':
      factor = c.level;
      break;
    case 'paladin':
      if (c.level < 2) return 0;
      factor = Math.floor(c.level / 2);
      break;
    case 'artificer':
      factor = Math.ceil(c.level / 2);
      break;
    default:
      return null;
  }
  return Math.max(1, abilityMod + factor);
}

/**
 * Tamaño del spellbook del Wizard. Empieza en 6 (L1) y crece +2 por nivel
 * de Wizard (PHB p.114). Los free spells de level up son spells que el
 * Wizard agrega gratis al spellbook (no requieren gold).
 */
export function wizardSpellbookSize(wizardLevel: number): number {
  if (wizardLevel < 1) return 0;
  return 6 + (wizardLevel - 1) * 2;
}

export interface SpellLimitsView {
  /** Cantrips conocidos máximos para esta clase a este nivel. */
  cantripsKnown: number;
  /**
   * Spells known fijos (Bard/Sorc/Warlock/Ranger/EK/AT). Null si la clase
   * prepara desde una lista (Wizard spellbook usa este número como tamaño,
   * exponer aparte via wizardSpellbookSize).
   */
  spellsKnown: number | null;
  /** Spells preparados máximos. Null si la clase no prepara. */
  spellsPrepared: number | null;
  /** Nivel máximo de spell que la clase puede aprender/preparar. */
  maxSpellLevel: number;
  /** Tamaño del spellbook si es Wizard. */
  wizardSpellbookSize?: number;
  /** Caster ability ('int'/'wis'/'cha') si la clase castea. */
  ability: AbilityKey | null;
}

/**
 * Nivel máximo de spell castable por la clase a su nivel actual (single-class).
 * Para Wizard L5 = 3, Paladin L5 = 2, EK L7 = 2, Warlock L5 = 3 (pact = 3), etc.
 *
 * NOTA: en multiclass los slots de mayor nivel pueden estar disponibles aunque
 * la clase individual no haya alcanzado ese nivel todavía — pero RAW solo se
 * pueden preparar spells de nivel ≤ el max de la clase específica. Por eso
 * computamos por clase, no por slot total.
 */
export function maxSpellLevelFor(c: AppliedClass): number {
  const type = classifyCaster(c);
  const lv = c.level;
  switch (type) {
    case 'full':
      // 9th level a L17+, etc.
      if (lv >= 17) return 9;
      if (lv >= 15) return 8;
      if (lv >= 13) return 7;
      if (lv >= 11) return 6;
      if (lv >= 9) return 5;
      if (lv >= 7) return 4;
      if (lv >= 5) return 3;
      if (lv >= 3) return 2;
      if (lv >= 1) return 1;
      return 0;
    case 'half':
      if (lv >= 17) return 5;
      if (lv >= 13) return 4;
      if (lv >= 9) return 3;
      if (lv >= 5) return 2;
      if (lv >= 2) return 1;
      return 0;
    case 'artificer':
      if (lv >= 17) return 5;
      if (lv >= 13) return 4;
      if (lv >= 9) return 3;
      if (lv >= 5) return 2;
      if (lv >= 1) return 1;
      return 0;
    case 'third':
      if (lv >= 19) return 4;
      if (lv >= 13) return 3;
      if (lv >= 7) return 2;
      if (lv >= 3) return 1;
      return 0;
    case 'warlock':
      // Pact slot level
      if (lv >= 9) return 5;
      if (lv >= 7) return 4;
      if (lv >= 5) return 3;
      if (lv >= 3) return 2;
      if (lv >= 1) return 1;
      return 0;
    default:
      return 0;
  }
}

/**
 * Vista de los límites de spells para una clase aplicada + ability mod del personaje.
 */
export function computeSpellLimits(c: AppliedClass, abilityMod: number): SpellLimitsView {
  const ability = SPELLCASTING_ABILITY[c.slug] ?? null;
  const view: SpellLimitsView = {
    cantripsKnown: cantripsKnownFor(c),
    spellsKnown: spellsKnownFor(c),
    spellsPrepared: preparedLimitFor(c, abilityMod),
    maxSpellLevel: maxSpellLevelFor(c),
    ability,
  };
  if (c.slug === 'wizard') view.wizardSpellbookSize = wizardSpellbookSize(c.level);
  return view;
}
